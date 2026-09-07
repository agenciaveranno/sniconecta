-- O Presidente de UAP alcança uma FATIA, não uma subárvore
--
-- A matriz dava `pessoa.gerir` ao Presidente de UAP, e o RLS não o deixava
-- tocar em ninguém: `tipos_papel.administra_unidade` era `false` para ele, e
-- `app.unidades_administradas()` só devolve linha para quem administra. O menu
-- oferecia o que o banco sempre recusaria — e sem erro nenhum, porque a RLS
-- não recusa: ela reduz a zero.
--
-- Era regressão de porte. No sistema do Ciclo que está no ar, o Presidente de
-- UAP entra em `app.admin_localidade_ids()` ao lado do coordenador e do
-- orientador (`0010_funcoes_autorizacao.sql:42`). Trouxemos a metade da matriz
-- e não a metade do banco.
--
-- ⚠️ MAS marcar `administra_unidade` não bastava, e teria dado alcance DEMAIS.
-- A Sede explicou o cargo: ele responde pela Associação da Prosperidade
-- naquela Regional e pelas Associações Locais dela — não pela Regional inteira.
-- Isso é `Regional ∩ Organização`, uma FATIA. `papeis.unidade_id` sozinho só
-- sabe dizer subárvore: com `unidade_id = <Regional>`, ele passaria a
-- administrar também as ALs de Fraternidade, Pomba Branca e Jovens daquela
-- Regional, sem ninguém ter decidido isso.
--
-- ⚠️ E não há corpo intermediário para virar degrau da árvore: "Associação da
-- Prosperidade da Regional Sul" não é entidade cadastrável, é o CONJUNTO das
-- ALs de Prosperidade dali (confirmado pela Sede). Inventar o degrau seria
-- inventar uma pessoa jurídica que não existe, e toda tela que percorre a
-- árvore passaria a tropeçar num nível que às vezes tem e às vezes não.
--
-- Então o recorte vira o que ele é: uma segunda dimensão do PAPEL.

-- ── 1. A dimensão nova ─────────────────────────────────────────────────────
alter table papeis
  add column organizacao_id uuid references organizacoes(id) on delete restrict;

comment on column papeis.organizacao_id is
  'Recorte por Organização, quando o tipo do papel o exige. Com ele, o alcance '
  'deixa de ser a subárvore inteira e passa a ser só as unidades daquela '
  'Organização dentro dela.';

create index idx_papeis_organizacao on papeis(organizacao_id);

-- ── 2. O catálogo passa a declarar a forma nova ───────────────────────────
-- ⚠️ Terceiro valor no `escopo`, e não uma coluna booleana à parte: `escopo`
-- JÁ É a pergunta "que forma este tipo de papel aceita?", e a decisão 0009 diz
-- que ela é dado, não código. Um booleano separado permitiria a combinação
-- sem sentido "nacional e com recorte de organização".
alter table tipos_papel drop constraint if exists tipos_papel_escopo_check;
alter table tipos_papel add constraint tipos_papel_escopo_check
  check (escopo in ('nacional', 'unidade', 'unidade_organizacao'));

create or replace function app.validar_escopo_papel()
returns trigger language plpgsql as $$
declare esperado text;
begin
  select escopo into esperado from tipos_papel where codigo = new.tipo;

  if esperado = 'nacional' and new.unidade_id is not null then
    raise exception 'O papel % é nacional e não se concede a uma unidade.', new.tipo;
  end if;
  if esperado in ('unidade', 'unidade_organizacao') and new.unidade_id is null then
    raise exception 'O papel % precisa de uma unidade.', new.tipo;
  end if;

  -- ⚠️ Sem a Organização, o papel com recorte viraria papel de subárvore
  -- inteira em silêncio: `unidades_administradas()` trata "sem recorte" como
  -- "tudo abaixo". Conceder sem escolher a Organização daria à pessoa as
  -- Associações Locais das outras três.
  if esperado = 'unidade_organizacao' and new.organizacao_id is null then
    raise exception 'O papel % precisa da Organização, além da unidade.', new.tipo;
  end if;
  if esperado <> 'unidade_organizacao' and new.organizacao_id is not null then
    raise exception 'O papel % não tem recorte por Organização.', new.tipo;
  end if;

  return new;
end $$;

drop trigger if exists trg_papeis_valida_escopo on papeis;
create trigger trg_papeis_valida_escopo
  before insert or update of tipo, unidade_id, organizacao_id on papeis
  for each row execute function app.validar_escopo_papel();

-- ── 3. O alcance passa a respeitar o recorte ──────────────────────────────
-- ⚠️ A recursão NÃO filtra; só o `select` final filtra. Para chegar às
-- Associações Locais de Prosperidade é preciso descer PELA Regional e pelos
-- Núcleos, que não são dele: filtrar durante a descida cortaria o caminho e o
-- alcance sairia vazio.
--
-- ⚠️ A unidade-raiz do papel entra na conta como qualquer outra. Com recorte,
-- a Regional tem `organizacao_id` nulo e cai fora sozinha — que é o certo: ele
-- responde pelas Associações Locais, não pela Regional. O Núcleo também sai,
-- e pelo mesmo motivo de sempre: ele é a união de ALs de organizações
-- diferentes no mesmo endereço, então não é de nenhuma delas.
create or replace function app.unidades_administradas()
returns table (unidade_id uuid)
language sql stable security definer set search_path = public as $$
  with recursive raiz as (
    select p.unidade_id as id, p.organizacao_id as recorte
      from papeis p
      join tipos_papel t on t.codigo = p.tipo
     where p.pessoa_id = app.pessoa_atual()
       and p.ativo
       and t.administra_unidade
       and p.unidade_id is not null
  ),
  descendentes as (
    select r.id, r.recorte from raiz r
    union
    select u.id, d.recorte
      from unidades u
      join descendentes d on u.pai_id = d.id
  )
  select distinct d.id
    from descendentes d
    join unidades u on u.id = d.id
   where d.recorte is null or u.organizacao_id = d.recorte
$$;

-- ── 4. O cargo passa a ser o que sempre foi ───────────────────────────────
update tipos_papel
   set escopo = 'unidade_organizacao',
       administra_unidade = true
 where codigo = 'presidente_uap';

comment on table papeis is
  'Quem faz o quê. `unidade_id` nulo = nacional; preenchido = vale nela e nas '
  'descendentes. `organizacao_id` recorta esse alcance quando o tipo o exige — '
  'é o caso do Presidente de UAP, que responde pelas Associações Locais de UMA '
  'Organização dentro da Regional dele.';
