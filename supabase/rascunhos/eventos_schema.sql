-- RASCUNHO — schema `eventos`. Não é migração ainda: vira uma quando o schema
-- comum (`pessoas`, `regionais`, `auditoria`, `notificacoes`) estiver na main.
--
-- Por quê: o módulo de eventos migra do MySQL com 31 tabelas em camelCase,
-- dinheiro em DECIMAL e sem chave estrangeira. Aqui: snake_case, centavos em
-- inteiro, FK de verdade, timestamptz. Os IDs inteiros das tabelas de
-- eventos são PRESERVADOS (número de pedido, voucher e links em e-mails já
-- enviados dependem deles); só a pessoa muda para uuid, com `legado_id`
-- guardando o inteiro antigo para rastrear a migração.
--
-- O que aconteceria sem isto: 449 consultas reescritas contra um esquema
-- improvisado, e uma migração de dados sem para onde apontar.
--
-- Acesso: o módulo fala Postgres direto pelo pooler com um papel próprio.
-- RLS fica LIGADA em toda tabela e não há GRANT para anon/authenticated:
-- o navegador nunca alcança estas tabelas. Ver docs/decisoes/0003.

create schema if not exists eventos;

-- ─── Estrutura ────────────────────────────────────────────────────────────

create table eventos.locais (
  id            integer primary key,
  legado_id     integer unique,
  nome          text not null,
  endereco      text,
  bairro        text,
  cidade        text,
  estado        char(2),
  telefone      text,
  email         text,
  criado_em     timestamptz not null default now()
);

create table eventos.promotores (
  id            integer primary key,
  legado_id     integer unique,
  nome          text not null,
  telefone      text,
  email         text,
  logo_url      text,               -- Supabase Storage; era base64 no MySQL
  criado_em     timestamptz not null default now()
);

create table eventos.orientadores (
  id            integer primary key,
  legado_id     integer unique,
  nome          text not null,
  foto_url      text,
  bio           text,
  criado_em     timestamptz not null default now()
);

create table eventos.contas_cielo (
  id            integer primary key,
  legado_id     integer unique,
  nome          text not null,
  merchant_id   text not null,
  merchant_key_cifrada text not null,   -- src/lib/cripto.ts; sem GRANT a ninguém além do papel do módulo
  ambiente      text not null default 'producao' check (ambiente in ('producao','sandbox')),
  criado_em     timestamptz not null default now()
);

-- ─── Evento e convites ────────────────────────────────────────────────────

create table eventos.eventos (
  id            integer primary key,
  legado_id     integer unique,
  nome          text not null,
  slug          text unique,
  data_inicial  date not null,
  data_final    date not null,
  local_id      integer references eventos.locais(id),
  promotor_id   integer references eventos.promotores(id),
  conta_cielo_id integer references eventos.contas_cielo(id),
  ativo         boolean not null default true,
  -- voucher: personalização por evento
  voucher_banner_url        text,
  voucher_logo_url          text,
  voucher_cor_primaria      text not null default '#132460',
  voucher_cor_secundaria    text not null default '#B45309',
  voucher_boas_vindas       text,
  voucher_instrucoes        text,
  voucher_rodape            text,
  voucher_mostrar           jsonb not null default '{"participante":true,"evento":true,"ingresso":true,"qrcode":true,"pagamento":true}',
  -- landing pública e textos de e-mail (eram colunas soltas; aqui um jsonb versionável)
  landing       jsonb not null default '{}',
  criado_em     timestamptz not null default now()
);

create table eventos.evento_orientadores (
  evento_id     integer not null references eventos.eventos(id) on delete cascade,
  orientador_id integer not null references eventos.orientadores(id) on delete cascade,
  ordem         smallint not null default 0,
  primary key (evento_id, orientador_id)
);

create table eventos.ingresso_tipos (
  id            integer primary key,
  legado_id     integer unique,
  evento_id     integer not null references eventos.eventos(id) on delete cascade,
  nome          text not null,
  descricao     text,
  valor_centavos integer not null default 0 check (valor_centavos >= 0),
  max_parcelas  smallint not null default 1 check (max_parcelas >= 1),
  quantidade    integer,                       -- null = informativo/ilimitado (a plataforma não controla estoque por tipo)
  venda_inicio  timestamptz,
  venda_fim     timestamptz,
  idade_min     smallint,
  idade_max     smallint,
  unico_por_cpf boolean not null default false,
  papel         text not null default 'adicional' check (papel in ('principal','adicional')),
  exige_principal boolean not null default false,
  exibir_venda_publica boolean not null default true,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- Campos personalizados perguntados na compra de um tipo de convite
create table eventos.ingresso_campos (
  id            integer primary key,
  legado_id     integer unique,
  ingresso_tipo_id integer not null references eventos.ingresso_tipos(id) on delete cascade,
  rotulo        text not null,
  tipo          text not null default 'texto',
  obrigatorio   boolean not null default false,
  opcoes        jsonb,
  ordem         smallint not null default 0
);

create table eventos.combos (
  id            integer primary key,
  legado_id     integer unique,
  evento_id     integer not null references eventos.eventos(id) on delete cascade,
  nome          text not null,
  descricao     text,
  valor_centavos integer not null default 0 check (valor_centavos >= 0),
  quantidade    integer,
  venda_inicio  timestamptz,
  venda_fim     timestamptz,
  ativo         boolean not null default true,
  limite_por_cpf smallint,
  max_parcelas  smallint not null default 1,
  criado_em     timestamptz not null default now()
);

create table eventos.combo_itens (
  id            integer primary key,
  combo_id      integer not null references eventos.combos(id) on delete cascade,
  ingresso_tipo_id integer not null references eventos.ingresso_tipos(id),
  quantidade    smallint not null default 1 check (quantidade >= 1)
);

create table eventos.cupons (
  id            integer primary key,
  legado_id     integer unique,
  evento_id     integer not null references eventos.eventos(id) on delete cascade,
  codigo        text not null,
  tipo          text not null check (tipo in ('percentual','valor')),
  valor         integer not null,             -- percentual (0..100) ou centavos, conforme `tipo`
  ingresso_tipo_id integer references eventos.ingresso_tipos(id),
  combo_id      integer references eventos.combos(id),
  max_usos_total integer,
  max_usos_por_cpf integer,
  vigencia_inicio timestamptz,
  vigencia_fim  timestamptz,
  ativo         boolean not null default true,
  unique (evento_id, codigo)
);

-- ─── Compra ───────────────────────────────────────────────────────────────

create table eventos.pedidos (
  id            integer primary key,            -- era PedidoPendente
  legado_id     integer unique,
  comprador_id  uuid not null references public.pessoas(id),
  evento_id     integer not null references eventos.eventos(id),
  ingresso_tipo_id integer not null references eventos.ingresso_tipos(id),  -- âncora; no combo é o 1º item
  combo_id      integer references eventos.combos(id),
  quantidade    smallint not null default 1,
  cupom_id      integer references eventos.cupons(id),
  valor_original_centavos integer not null default 0,
  desconto_centavos       integer not null default 0,
  participantes jsonb not null,                 -- snapshot dos participantes e respostas
  status        text not null default 'pendente' check (status in ('pendente','confirmado','cancelado','expirado')),
  cielo         jsonb not null default '{}',   -- order_id, payment_id, method, tid, auth_code, brand, pix, return_code/message
  inscricao_ids integer[],
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table eventos.inscricoes (
  id            integer primary key,
  legado_id     integer unique,
  pessoa_id     uuid not null references public.pessoas(id),
  evento_id     integer not null references eventos.eventos(id),
  ingresso_tipo_id integer references eventos.ingresso_tipos(id),
  combo_id      integer references eventos.combos(id),
  pedido_id     integer references eventos.pedidos(id),
  compra_grupo_id uuid,                         -- linhas da mesma compra, para cancelar combo inteiro
  comprador_id  uuid references public.pessoas(id),
  numero_convite text,
  forma_pagamento text,                         -- dinheiro, cartao, cielo, cielo-pix, cielo-credito, credenciamento, pix, cortesia, gratuito
  tipo_venda    text not null default 'online' check (tipo_venda in ('online','balcao','importado')),
  status        text not null default 'pendente' check (status in ('pendente','pago','cancelado','expirado','transferido')),
  valor_original_centavos integer not null default 0,
  desconto_centavos       integer not null default 0,
  cupom_id      integer references eventos.cupons(id),
  data_compra   timestamptz,
  checkin_em    timestamptz,
  -- rastro de conferência do balcão
  credenciamento_pedido text,
  pix_data      date,
  pix_recibo    text,
  cortesia_motivo text,
  cielo_order_id text,
  -- cancelamento e estorno
  cancelado_em  timestamptz,
  cancelado_por uuid references public.pessoas(id),
  cancelamento_motivo text,
  estorno_status text,                          -- null | pendente | feito | recusado
  estorno       jsonb,
  -- transferência entre eventos e troca de titular
  transferido_para_id integer,
  transferido_de_id   integer,
  titular_anterior_id uuid references public.pessoas(id),
  titular_trocado_em  timestamptz,
  criado_em     timestamptz not null default now()
);
create index on eventos.inscricoes (pessoa_id, evento_id);
create index on eventos.inscricoes (evento_id, status);
create index on eventos.inscricoes (compra_grupo_id);
create index on eventos.inscricoes (cielo_order_id);

create table eventos.inscricao_respostas (
  id            integer primary key,
  inscricao_id  integer not null references eventos.inscricoes(id) on delete cascade,
  campo_id      integer references eventos.ingresso_campos(id),
  rotulo        text not null,                  -- snapshot: o rótulo do campo na hora da compra
  valor         text
);

-- Magic link do comprador: autentica SEM conta no Auth.
create table eventos.magic_links (
  id            integer primary key,
  pessoa_id     uuid not null references public.pessoas(id),
  token_hash    text not null unique,
  expira_em     timestamptz not null,
  usado_em      timestamptz,
  criado_em     timestamptz not null default now()
);

create table eventos.carrinhos_abandonados (
  id            integer primary key,
  evento_id     integer not null references eventos.eventos(id),
  cpf           text not null,
  email         text,
  etapa         text,
  convertido    boolean not null default false,
  criado_em     timestamptz not null default now()
);

-- ─── Comissão organizadora ────────────────────────────────────────────────

create table eventos.comissao_setores_padrao (id integer primary key, nome text not null unique, ordem smallint not null default 0);
create table eventos.comissao_funcoes_padrao (id integer primary key, setor_id integer references eventos.comissao_setores_padrao(id), nome text not null, ordem smallint not null default 0);

create table eventos.comissao_membros (
  id            integer primary key,
  legado_id     integer unique,
  evento_id     integer not null references eventos.eventos(id) on delete cascade,
  pessoa_id     uuid references public.pessoas(id),
  nome          text not null,                  -- membro pode não ser pessoa cadastrada
  setor         text,
  funcao        text,
  telefone      text,
  email         text
);

-- ─── Sequências: continuam depois do maior id importado ───────────────────
-- (o script de migração faz `setval` por tabela ao final)

-- ─── RLS: ligada, sem GRANT para anon/authenticated ───────────────────────
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'eventos' loop
    execute format('alter table eventos.%I enable row level security', t);
    execute format('revoke all on eventos.%I from anon, authenticated', t);
  end loop;
end $$;
-- O papel de conexão do módulo (definido na migração de infraestrutura)
-- recebe usage no schema e select/insert/update/delete nas tabelas.

-- ─── Ainda não traduzidas (vêm na próxima rodada) ─────────────────────────
-- AuditLog        → public.auditoria (comum)
-- Configuracao    → public.configuracoes + eventos.configuracao_segredos (cifrada)
-- EmailAgendado, EmailEnvio → public.notificacoes (comum)
-- RateLimit       → eventos.rate_limits (ou Upstash; decidir)
-- RegionalPromotorEmail → eventos.regional_avisos (e-mail da regional que recebe aviso de compra)
-- UserPreferencia → public.preferencias (comum)
-- Regional, Organizacao → public.regionais / public.organizacoes (comum) — hoje texto livre no participante
