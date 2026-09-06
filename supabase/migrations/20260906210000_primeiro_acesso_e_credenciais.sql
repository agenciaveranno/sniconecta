-- ───────────────────────────────────────────────────────────────────────────
-- PRIMEIRO ACESSO E CREDENCIAIS
--
-- Duas lacunas que impedem o sistema de sair do papel:
--
-- 1. Ninguém consegue entrar. O RLS só reconhece quem tem linha em `pessoas`
--    ligada a uma conta do Auth, e a única tela que cria pessoas exige estar
--    dentro. É o ovo e a galinha: alguém precisa nascer com acesso, por
--    migração, e daí em diante o cadastro é feito em tela.
--
-- 2. Não há onde guardar credencial. Cada Organização, cada Regional e cada
--    Academia tem CONTA PRÓPRIA na Cielo — o dinheiro do ingresso cai na
--    conta de quem promove o evento, não numa conta central. E o SMTP, que é
--    da instituição inteira, precisa de um lugar editável em tela, porque a
--    senha muda sem aviso e ninguém vai abrir um deploy por causa disso.
-- ───────────────────────────────────────────────────────────────────────────

-- ── 1. A conta do Auth encontra a pessoa pelo e-mail ───────────────────────
--
-- Operador não se cadastra: a pessoa já existe no sistema e alguém a convida.
-- Quando o Supabase Auth cria a conta (convite ou magic link), este gatilho
-- amarra as duas pontas pelo e-mail.
--
-- ⚠️ Sem isto, quem entra pela primeira vez chega ao painel sem pessoa, sem
-- papel e sem nada — e a mensagem falaria de sessão, quando o problema é
-- cadastro. Quem entra com e-mail que não está em `pessoas` continua sem
-- acesso: é o comportamento certo, e é por isso que a criação de conta pública
-- fica DESLIGADA no painel do Supabase.
create or replace function app.ligar_conta_a_pessoa()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  update pessoas
     set auth_user_id = new.id,
         atualizado_em = now()
   where email = new.email
     and auth_user_id is null;
  return new;
end
$$;

create trigger trg_auth_user_liga_pessoa
  after insert on auth.users
  for each row execute function app.ligar_conta_a_pessoa();

-- O caminho inverso: a conta já existe e a pessoa acabou de ganhar o e-mail.
-- Acontece toda vez que alguém é promovido a operador depois de anos só com
-- histórico.
create or replace function app.ligar_pessoa_a_conta()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.email is not null and new.auth_user_id is null then
    select u.id into new.auth_user_id
      from auth.users u
     where u.email = new.email::text
       and not exists (select 1 from pessoas p where p.auth_user_id = u.id)
     limit 1;
  end if;
  return new;
end
$$;

create trigger trg_pessoa_liga_conta
  before insert or update of email on pessoas
  for each row execute function app.ligar_pessoa_a_conta();

-- ── 2. A primeira pessoa ───────────────────────────────────────────────────
--
-- Nasce sem `auth_user_id`: a conta é criada pelo convite no painel do
-- Supabase, e o gatilho acima amarra as duas no momento em que ela chega. Se
-- fosse inserida em `auth.users` aqui, a senha e os metadados que o Auth
-- espera ficariam pela metade — e o convite é justamente o fluxo que o
-- sistema vai usar para todos os outros operadores.
insert into pessoas (cpf, cod_sni, nome, email)
values ('84038152049', '1792123', 'Vinícius da Rocha Carvalho', 'vinirocha@outlook.com')
on conflict (cpf) do nothing;

-- Papel nacional: enquanto não houver mais ninguém, é quem cadastra a
-- estrutura, concede papéis e configura o sistema.
insert into papeis (pessoa_id, tipo)
select p.id, 'sede' from pessoas p where p.cpf = '84038152049'
on conflict do nothing;

-- ── 3. Credenciais de serviço externo ──────────────────────────────────────
create table credenciais (
  id       uuid primary key default gen_random_uuid(),
  -- 'cielo' | 'smtp'. Lista fechada de propósito: serviço novo entra por
  -- migração, junto com o código que sabe ler os campos dele.
  servico  text not null check (servico in ('cielo', 'smtp')),
  ambiente text not null default 'producao' check (ambiente in ('producao', 'sandbox')),

  -- Dono da conta. Exatamente um dos três para a Cielo; nenhum para o SMTP,
  -- que é da instituição inteira. O check abaixo cobra isso.
  organizacao_id uuid references organizacoes(id) on delete cascade,
  unidade_id     uuid references unidades(id)     on delete cascade,
  local_id       uuid references locais(id)       on delete cascade,

  -- A parte que pode aparecer em tela para conferência: merchant id da Cielo,
  -- host e porta do SMTP, remetente. `jsonb` porque os campos mudam de um
  -- serviço para o outro e quem valida é o zod do lado do aplicativo — uma
  -- coluna por campo de cada serviço faria a tabela crescer a cada integração
  -- e ficar quase toda nula.
  publico  jsonb not null default '{}'::jsonb,

  -- A parte secreta: merchant key, senha do SMTP. Cifrada em AES-256-GCM pelo
  -- aplicativo (src/lib/cripto.ts) — o banco nunca vê em claro, e um dump não
  -- entrega a conta de ninguém.
  segredo  text,

  ativo    boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references pessoas(id) on delete set null,

  constraint dono_unico check (
    (case when organizacao_id is not null then 1 else 0 end
   + case when unidade_id     is not null then 1 else 0 end
   + case when local_id       is not null then 1 else 0 end)
    = case when servico = 'smtp' then 0 else 1 end
  ),
  -- ⚠️ O segredo é gravado cifrado, sempre. O prefixo é a assinatura do
  -- formato de src/lib/cripto.ts: barra o dia em que alguém, depurando, gravar
  -- a senha em claro "só para testar" e ela ficar lá.
  constraint segredo_cifrado check (segredo is null or segredo like 'v1.%')
);

-- Uma conta por dono, por serviço, por ambiente. Sem isto, duas contas Cielo
-- na mesma Regional fariam a venda cair ora numa, ora noutra, dependendo da
-- ordem que o banco devolvesse.
create unique index uq_credencial_organizacao on credenciais(servico, organizacao_id, ambiente)
  where organizacao_id is not null;
create unique index uq_credencial_unidade on credenciais(servico, unidade_id, ambiente)
  where unidade_id is not null;
create unique index uq_credencial_local on credenciais(servico, local_id, ambiente)
  where local_id is not null;
create unique index uq_credencial_instituicao on credenciais(servico, ambiente)
  where organizacao_id is null and unidade_id is null and local_id is null;

-- RLS ligada e NENHUM grant: nem `anon`, nem `authenticated`. Credencial não
-- passa pelo navegador em hipótese alguma — quem lê é o servidor, com
-- `service_role`, e devolve à tela só a parte pública. É a mesma regra da fila
-- de notificações.
alter table credenciais enable row level security;

comment on table credenciais is
  'Credencial de serviço externo. Segredo cifrado pelo aplicativo; sem GRANT: só o servidor alcança.';

-- ── 4. Quem pode ter conta Cielo é catálogo, não `if` na tela ──────────────
--
-- Hoje recebem por conta própria a Organização, a Regional e a Academia. Não
-- é lei da natureza: no dia em que um Núcleo passar a vender, isto vira uma
-- linha de UPDATE, e a tela já se ajusta sozinha. Um `if tipo = 'regional'`
-- no formulário exigiria deploy para a mesma decisão.
alter table tipos_unidade add column aceita_conta_cielo boolean not null default false;
alter table tipos_local   add column aceita_conta_cielo boolean not null default false;

update tipos_unidade set aceita_conta_cielo = true where codigo = 'regional';
update tipos_local   set aceita_conta_cielo = true where codigo = 'academia';

-- ── 5. A Sede cadastra Organização em tela ─────────────────────────────────
--
-- A fundação só concedeu leitura: as quatro que existem hoje nasceram no seed.
-- Mas a lista não é fechada — a instituição cria organização nova sem esperar
-- um deploy, e sem isto o botão existiria e o banco recusaria.
grant insert, update on organizacoes to authenticated;
create policy estrutura_escreve_organizacoes on organizacoes for all to authenticated
  using (app.e_sede()) with check (app.e_sede());
