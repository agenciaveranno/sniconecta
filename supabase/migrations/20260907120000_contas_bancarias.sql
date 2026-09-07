-- ───────────────────────────────────────────────────────────────────────────
-- CONTAS BANCÁRIAS, CHAVES PIX E MAQUININHAS
--
-- A Sede tem várias contas. Cada Regional, cada Academia e cada Associação
-- Local também. Todas precisam estar no sistema porque é para elas que a Missão
-- Sagrada reparte e é por elas que o evento recebe.
--
-- ⚠️ Três colunas de dono, e não uma genérica: Regional e AL são `unidades`,
-- Academia é `locais`, Departamento é `organizacoes`. Uma coluna com o nome da
-- tabela ao lado não teria chave estrangeira — e sem ela, apagar uma Regional
-- deixaria contas apontando para o nada, com dinheiro associado.
--
-- ⚠️ CONCILIAÇÃO POR OFX vem depois. O modelo já a prevê — cada conta tem
-- identidade estável, e o extrato terá onde se prender — mas nada dela é
-- implementado agora. Construir a metade que ninguém vai usar é como não
-- construir, com o custo de manter.
-- ───────────────────────────────────────────────────────────────────────────

create table contas_bancarias (
  id             uuid primary key default gen_random_uuid(),

  unidade_id     uuid references unidades(id) on delete restrict,
  local_id       uuid references locais(id) on delete restrict,
  organizacao_id uuid references organizacoes(id) on delete restrict,

  apelido        text not null,

  -- ⚠️ Código do banco em TEXTO, com zeros à esquerda: o Banco do Brasil é
  -- "001", e em coluna numérica vira 1. Todo arquivo bancário do país espera
  -- três dígitos.
  banco_codigo   text check (banco_codigo is null or banco_codigo ~ '^[0-9]{3}$'),
  banco_nome     text,

  agencia        text,
  agencia_dv     text,
  conta          text,
  conta_dv       text,
  tipo           text not null default 'corrente' check (tipo in ('corrente', 'poupanca', 'pagamento')),

  titular        text,
  -- Sem pontuação e em caixa alta, aceitando o CNPJ alfanumérico da Receita.
  titular_documento text check (titular_documento is null or titular_documento ~ '^[0-9A-Z]{11,14}$'),

  ativo          boolean not null default true,
  observacoes    text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  -- Exatamente um dono. Nenhum deixaria a conta órfã; dois fariam o mesmo
  -- dinheiro pertencer a duas entidades.
  constraint conta_tem_um_dono check (
    (unidade_id is not null)::int + (local_id is not null)::int + (organizacao_id is not null)::int = 1
  )
);

create index idx_contas_unidade on contas_bancarias(unidade_id);
create index idx_contas_local on contas_bancarias(local_id);

comment on table contas_bancarias is
  'Contas da Sede, das Regionais, das Academias e das Associações Locais. '
  'Conciliação por OFX está no radar e ainda não implementada.';

-- ── Chaves Pix ──────────────────────────────────────────────────────────────
--
-- Tabela à parte porque são VÁRIAS por conta e de tipos diferentes. Como
-- colunas na conta, cada tipo novo do Banco Central viraria migração.

create table chaves_pix (
  id         uuid primary key default gen_random_uuid(),
  conta_id   uuid not null references contas_bancarias(id) on delete cascade,
  tipo       text not null check (tipo in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  chave      text not null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),

  -- A mesma chave em duas contas é erro de digitação: no Banco Central ela
  -- pertence a uma conta só.
  constraint chave_pix_unica unique (chave)
);

create index idx_pix_conta on chaves_pix(conta_id);

-- ── Maquininhas ─────────────────────────────────────────────────────────────
--
-- ⚠️ Aqui mora só a IDENTIFICAÇÃO do terminal — número de série, apelido, a
-- conta em que o dinheiro cai. As CREDENCIAIS da Cielo continuam em
-- `credenciais`, cifradas e sem GRANT: número de série não abre nada, chave de
-- API abre tudo, e misturar os dois na mesma tabela rebaixaria a proteção da
-- segunda ao nível da primeira.

create table maquininhas (
  id           uuid primary key default gen_random_uuid(),
  conta_id     uuid not null references contas_bancarias(id) on delete restrict,
  apelido      text not null,
  operadora    text not null default 'cielo',
  numero_serie text,
  numero_logico text,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),

  constraint serie_unica unique (operadora, numero_serie)
);

create index idx_maquininhas_conta on maquininhas(conta_id);

comment on table maquininhas is
  'Identificação do terminal e em qual conta ele credita. As credenciais da '
  'operadora ficam em `credenciais`, cifradas — número de série não abre nada.';

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table contas_bancarias enable row level security;
alter table chaves_pix       enable row level security;
alter table maquininhas      enable row level security;

-- ⚠️ SEM GRANT para o navegador. Dado bancário não se protege por policy de
-- leitura: quem alcança a tabela alcança agência, conta e chave Pix. Quem lê e
-- escreve é o servidor, depois de conferir a capacidade.
