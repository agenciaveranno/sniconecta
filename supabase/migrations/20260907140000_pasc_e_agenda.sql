-- ───────────────────────────────────────────────────────────────────────────
-- PASC — PROGRAMAÇÃO DE ATIVIDADES DA SEDE CENTRAL
--
-- O PASC é o conjunto dos eventos OFICIAIS da Sede Central, e eles acontecem em
-- qualquer lugar: numa Regional, numa Academia, na própria Sede, num hotel.
--
-- ⚠️ PASC NÃO É UMA TABELA. É uma qualidade do evento: promovido pela Sede
-- Central. Uma tabela `pasc` ao lado de `eventos` duplicaria nome, data, local,
-- ingresso e comissão, e obrigaria toda tela a perguntar em qual das duas
-- procurar — e a esquecer de uma. Aqui o PASC é o recorte
-- `ambito = 'sede'`, e a agenda inteira é uma consulta só.
--
-- É o mesmo motivo pelo qual as Regionais e as Associações Locais entram aqui e
-- não num módulo à parte: a agenda pública que a Sede quer publicar um dia
-- mostra os três juntos, e três tabelas dariam três agendas.
-- ───────────────────────────────────────────────────────────────────────────

alter table eventos.eventos add column ambito text not null default 'sede'
  check (ambito in ('sede', 'regional', 'associacao_local'));

comment on column eventos.eventos.ambito is
  'Quem promove o evento. `sede` é o PASC; os outros dois são a agenda das '
  'Regionais e das Associações Locais.';

-- ── Horário ─────────────────────────────────────────────────────────────────
--
-- A origem só tinha data. Evento tem hora: é o que o participante lê no
-- convite, e "sábado" sem hora manda todo mundo perguntar.
alter table eventos.eventos add column hora_inicio time;
alter table eventos.eventos add column hora_fim    time;

-- ── Gratuito ou pago ────────────────────────────────────────────────────────
--
-- ⚠️ Coluna própria, e não "gratuito é o que não tem tipo de ingresso". O
-- evento gratuito PODE ter ingresso — com valor zero, para controlar vaga e
-- emitir credencial. Deduzir a gratuidade da ausência de ingresso faria o
-- evento com vaga controlada e sem cobrança parecer pago.
alter table eventos.eventos add column gratuito boolean not null default false;

-- Parcelamento máximo do evento. `1` é à vista.
alter table eventos.eventos add column max_parcelas smallint not null default 1
  check (max_parcelas >= 1 and max_parcelas <= 12);

alter table eventos.eventos add column descricao text;
alter table eventos.eventos add column publico_alvo text;
alter table eventos.eventos add column vagas integer check (vagas is null or vagas > 0);

-- ⚠️ Gratuito e parcelado não convivem: não há o que parcelar.
alter table eventos.eventos add constraint gratuito_nao_parcela
  check (not gratuito or max_parcelas = 1);

-- ── Orientadores do evento ──────────────────────────────────────────────────
--
-- `eventos.evento_orientadores` já existe, vinda da carga. O que faltava era
-- dizer que a FOTO da pessoa é usada no material — e isso já mora em
-- `pessoas.foto_url`, sem precisar de coluna nova aqui.

-- ───────────────────────────────────────────────────────────────────────────
-- LOCAIS DE EVENTO
--
-- `public.locais` já existe com Academia, hotel e salão. Falta o que torna o
-- cadastro FLEXÍVEL de verdade: o local que não é da instituição.
-- ───────────────────────────────────────────────────────────────────────────

-- ⚠️ Próprio da SNI ou de terceiro. Muda o que a tela pede: local próprio tem
-- CNPJ de filial e conta para receber; salão alugado tem contrato, contato e
-- diária. Sem a marca, a tela pediria CNPJ de filial ao hotel — e o gatilho de
-- CNPJ recusaria, porque a raiz não bate com a da Sede.
alter table locais add column proprio boolean not null default true;

alter table locais add column capacidade integer check (capacidade is null or capacidade > 0);
alter table locais add column contato_nome text;
alter table locais add column contato_telefone text;
alter table locais add column diaria_centavos integer check (diaria_centavos is null or diaria_centavos >= 0);

comment on column locais.proprio is
  'Da SEICHO-NO-IE DO BRASIL (Academia, Sede, salão da Regional) ou de '
  'terceiro (hotel, salão alugado). Muda o que o cadastro pede.';

-- ⚠️ O gatilho de CNPJ exige a raiz da Sede, e isso vale só para o que é
-- NOSSO. Um hotel tem CNPJ próprio, de outra empresa — e recusá-lo impediria
-- cadastrar o local onde o evento vai acontecer.
create or replace function app.validar_cnpj_local()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare raiz_sede text;
begin
  if new.cnpj is null or not new.proprio then return new; end if;

  select left(u.cnpj, 8) into raiz_sede
    from unidades u
   where u.tipo = 'sede_central' and u.cnpj is not null
   limit 1;
  if raiz_sede is null then return new; end if;

  if left(new.cnpj, 8) <> raiz_sede then
    raise exception
      'CNPJ % não é filial da SEICHO-NO-IE DO BRASIL (raiz %). Se o local é de terceiro, desmarque "próprio da instituição".',
      new.cnpj, raiz_sede;
  end if;
  return new;
end $$;

-- ⚠️ SUBSTITUI o gatilho da fundação, que se chama `trg_locais_cnpj` e dispara
-- só `of cnpj`. Criar um segundo com outro nome deixaria os DOIS ativos, e o
-- antigo continuaria recusando o hotel — o harness pegou exatamente isso.
--
-- E o novo dispara em qualquer UPDATE, não só quando o CNPJ muda: desmarcar
-- "próprio" numa linha que já tem CNPJ de terceiro precisa ser reavaliado, e
-- `of cnpj` não veria essa mudança.
drop trigger if exists trg_locais_cnpj on locais;
drop trigger if exists trg_local_cnpj on locais;
create trigger trg_locais_cnpj before insert or update on locais
  for each row execute function app.validar_cnpj_local();

-- ───────────────────────────────────────────────────────────────────────────
-- LIVROS E ARTIGOS RELIGIOSOS
--
-- ⚠️ O rateio é POR CATEGORIA, como na Missão Sagrada — mas com uma diferença
-- que muda tudo: aqui todo mundo COMPRA. A Associação Local compra da Regional,
-- que compra da Sede. Não há remessa de valor: os percentuais servem de base
-- para o cálculo do preço de cada degrau, não para repartir arrecadação.
-- ───────────────────────────────────────────────────────────────────────────

create table produto_categorias (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null unique,
  pai_id       uuid references produto_categorias(id) on delete restrict,
  pct_sede     numeric(5,2) not null default 100 check (pct_sede between 0 and 100),
  pct_regional numeric(5,2) not null default 0 check (pct_regional between 0 and 100),
  pct_local    numeric(5,2) not null default 0 check (pct_local between 0 and 100),
  ordem        smallint not null default 0,
  ativo        boolean not null default true,

  constraint categoria_fecha_em_cem check (pct_sede + pct_regional + pct_local = 100)
);

insert into produto_categorias (nome, ordem) values
  ('Livros', 1), ('Artigos Religiosos', 2)
on conflict (nome) do nothing;

create table produtos (
  id             uuid primary key default gen_random_uuid(),
  categoria_id   uuid not null references produto_categorias(id) on delete restrict,

  nome           text not null,
  -- Código interno da instituição. Único quando presente.
  codigo         text unique,
  -- ⚠️ EAN em texto: treze dígitos não cabem em `integer`, e em `bigint`
  -- perderiam o zero à esquerda que muitos têm.
  codigo_barras  text unique check (codigo_barras is null or codigo_barras ~ '^[0-9]{8,14}$'),

  descricao_curta text,
  descricao_longa text,
  idioma         text not null default 'pt-BR',
  preco_capa_centavos integer not null default 0 check (preco_capa_centavos >= 0),

  -- De onde veio, quando veio de importação. É o que permite repetir a carga
  -- da livraria sem duplicar.
  origem_url     text unique,
  imagens        jsonb not null default '[]'::jsonb,

  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index idx_produtos_categoria on produtos(categoria_id);
create index idx_produtos_nome on produtos(app.sem_acento(nome));

comment on table produtos is
  'Livros e Artigos Religiosos. Categoria decide o rateio de base do preço em '
  'cada degrau — mas aqui todo mundo compra, não há remessa de valor.';

alter table produto_categorias enable row level security;
alter table produtos           enable row level security;

-- Catálogo de produto é público para quem entra: é o que se vende, e esconder
-- só produz tela vazia. Escrever, só a Sede.
create policy categorias_leitura on produto_categorias for select to authenticated using (true);
create policy produtos_leitura   on produtos           for select to authenticated using (true);
create policy categorias_escrita on produto_categorias for all to authenticated
  using (app.e_sede()) with check (app.e_sede());
create policy produtos_escrita   on produtos for all to authenticated
  using (app.e_sede()) with check (app.e_sede());

grant select, insert, update, delete on produto_categorias, produtos to authenticated;
