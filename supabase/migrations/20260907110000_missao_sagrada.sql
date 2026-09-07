-- ───────────────────────────────────────────────────────────────────────────
-- MISSÃO SAGRADA
--
-- A contribuição voluntária e mensal do adepto — a Retribuição. Vence todo dia
-- 15, e ATRASO NÃO GERA JUROS NEM MULTA: é contribuição religiosa, não dívida.
-- Cobrar encargo aqui seria transformar em obrigação o que a doutrina define
-- como voluntário, e o sistema não tem coluna para isso de propósito.
--
-- ⚠️ Quem faleceu CONTINUA no cadastro, na categoria Santo Espiritual. Sumir
-- com o falecido é o que não pode acontecer.
-- ───────────────────────────────────────────────────────────────────────────

create schema if not exists missao;
comment on schema missao is
  'Missão Sagrada: categorias, adesões e contribuições. Fala Postgres direto '
  'pelo pooler, como o módulo eventos (decisão 0003) — o navegador não alcança.';

-- ── Categorias ──────────────────────────────────────────────────────────────
--
-- ⚠️ Valor único OU faixa, e a diferença importa: "Santo Espiritual" é R$ 4,00
-- fixo, e "Dizimista" é qualquer valor entre R$ 23,20 e R$ 122,00. Modelar só
-- como valor fixo obrigaria a criar cem categorias; só como faixa, obrigaria a
-- repetir o mesmo número nos dois extremos e perderia a informação de que ali
-- não há escolha.
--
-- ⚠️ E "Benemérito Dízimo" não tem valor nenhum: é 10% da renda, declarado pela
-- pessoa. Por isso os dois limites são anuláveis.

create table missao.categorias (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null unique,
  descricao      text,

  valor_min_centavos integer check (valor_min_centavos is null or valor_min_centavos >= 0),
  valor_max_centavos integer check (valor_max_centavos is null or valor_max_centavos >= 0),
  -- Autodeclaração: o valor é percentual da renda, informado pela pessoa.
  percentual_renda numeric(5,2) check (percentual_renda is null or (percentual_renda > 0 and percentual_renda <= 100)),

  ordem          smallint not null default 0,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  constraint faixa_coerente check (
    valor_min_centavos is null or valor_max_centavos is null
    or valor_max_centavos >= valor_min_centavos
  ),
  -- Ou tem valor, ou tem percentual. Ter os dois seria duas regras de cálculo
  -- para a mesma linha, e nada dizendo qual vale.
  constraint valor_ou_percentual check (
    (percentual_renda is null) or (valor_min_centavos is null and valor_max_centavos is null)
  )
);

-- ── Adesão ──────────────────────────────────────────────────────────────────
--
-- Quem é Apóstolo da Missão Sagrada, em que categoria, por quanto, e como paga.
-- Datado como tudo o mais: quem trocou de categoria em 2024 tem histórico, e o
-- relatório daquele ano não muda quando ele troca de novo.

create table missao.adesoes (
  id            uuid primary key default gen_random_uuid(),
  pessoa_id     uuid not null references public.pessoas(id) on delete restrict,
  categoria_id  uuid not null references missao.categorias(id) on delete restrict,

  -- O valor ESCOLHIDO dentro da faixa. Guardado na adesão, e não derivado da
  -- categoria: a faixa muda com o tempo, e a contribuição de 2024 foi a que
  -- foi. Sem isto, atualizar a tabela de valores reescreveria o passado.
  valor_centavos integer not null check (valor_centavos >= 0),

  forma         text not null default 'boleto' check (forma in
                  ('especie', 'boleto', 'debito_conta', 'pix', 'cartao', 'cartao_recorrente')),

  -- Onde a pessoa estava quando aderiu. Guardado aqui porque o RATEIO segue
  -- esta Associação Local, e a pessoa pode se mudar: o repasse do mês passado
  -- não muda quando ela troca de AL.
  unidade_id    uuid references public.unidades(id) on delete restrict,

  data_inicio   date not null default current_date,
  data_fim      date,
  motivo_fim    text,
  criado_em     timestamptz not null default now(),

  constraint adesao_termina_depois check (data_fim is null or data_fim >= data_inicio)
);

-- Uma adesão ativa por pessoa. Duas seriam duas contribuições mensais
-- simultâneas, e o boleto sairia dobrado.
create unique index uq_adesao_ativa on missao.adesoes (pessoa_id) where data_fim is null;
create index idx_adesoes_unidade on missao.adesoes(unidade_id);

-- ── Contribuições ───────────────────────────────────────────────────────────

create table missao.contribuicoes (
  id            uuid primary key default gen_random_uuid(),
  pessoa_id     uuid not null references public.pessoas(id) on delete restrict,
  adesao_id     uuid references missao.adesoes(id) on delete set null,

  -- Mês de competência, sempre no dia 1. A data de PAGAMENTO é outra coisa: a
  -- contribuição de janeiro paga em março continua sendo de janeiro, e é assim
  -- que o rateio e o relatório a contam.
  competencia   date not null,
  valor_centavos integer not null check (valor_centavos > 0),

  forma         text not null check (forma in
                  ('especie', 'boleto', 'debito_conta', 'pix', 'cartao', 'cartao_recorrente')),
  status        text not null default 'aberta' check (status in
                  ('aberta', 'paga', 'cancelada')),

  -- ⚠️ Vence dia 15, e o atraso NÃO gera juros nem multa. Não existe coluna de
  -- encargo, e a ausência é a regra: contribuição religiosa é voluntária, e
  -- cobrar encargo a transformaria em dívida.
  vencimento    date not null,
  pago_em       date,

  -- Onde ela foi feita e por qual estrutura ela ratea.
  unidade_id    uuid references public.unidades(id) on delete restrict,
  -- Recibo em espécie: o número do talão que a Associação Local remete à Sede.
  recibo        text,
  observacoes   text,

  criado_em     timestamptz not null default now(),

  constraint competencia_no_dia_1 check (extract(day from competencia) = 1),
  constraint paga_tem_data check (status <> 'paga' or pago_em is not null)
);

-- Uma contribuição por pessoa por mês. Duas do mesmo mês são lançamento
-- duplicado, e o rateio contaria os dois.
create unique index uq_contribuicao_mes on missao.contribuicoes (pessoa_id, competencia)
  where status <> 'cancelada';
create index idx_contribuicoes_competencia on missao.contribuicoes(competencia);
create index idx_contribuicoes_unidade on missao.contribuicoes(unidade_id, competencia);

-- ── Rateio ──────────────────────────────────────────────────────────────────
--
-- 50% Sede, 25% Regional, 25% Associação Local. A Sede arrecada tudo e repassa
-- à Regional, que repassa às Associações Locais.
--
-- ⚠️ Os percentuais ficam em TABELA, não em constante: a divisão muda por
-- decisão de assembleia, e uma mudança não pode reescrever o rateio dos meses
-- já fechados. Por isso cada faixa tem vigência.

create table missao.rateio (
  id             uuid primary key default gen_random_uuid(),
  vigencia_inicio date not null,
  pct_sede       numeric(5,2) not null check (pct_sede >= 0 and pct_sede <= 100),
  pct_regional   numeric(5,2) not null check (pct_regional >= 0 and pct_regional <= 100),
  pct_local      numeric(5,2) not null check (pct_local >= 0 and pct_local <= 100),

  -- ⚠️ Cem por cento exatos. Sem isto, uma digitação de 50/25/20 faria 5% do
  -- dinheiro simplesmente sumir do rateio, e a conta só não fecharia meses
  -- depois, quando alguém somasse.
  constraint rateio_fecha_em_cem check (pct_sede + pct_regional + pct_local = 100),
  constraint uma_vigencia unique (vigencia_inicio)
);

insert into missao.rateio (vigencia_inicio, pct_sede, pct_regional, pct_local)
values ('2026-01-01', 50, 25, 25);

-- ── As categorias de hoje ───────────────────────────────────────────────────
--
-- Editáveis em tela: a Sede atualiza os valores de tempos em tempos, e isso não
-- pode exigir implantação de sistema.

insert into missao.categorias (nome, ordem, valor_min_centavos, valor_max_centavos, percentual_renda, descricao) values
  ('Santo Espiritual',    1,    400,    400, null, 'Falecidos. Continuam no cadastro e continuam contribuindo.'),
  ('Mantenedor',          2,   1570,   2310, null, null),
  ('Dizimista',           3,   2320,  12200, null, null),
  ('Dizimista Especial',  4,  12300,  24200, null, null),
  ('Benemérito',          5,  24300,  48700, null, null),
  ('Benemérito Especial', 6,  48800, 110000, null, null),
  ('Benemérito Dízimo',   7,   null,   null, 10.00, 'Dez por cento da renda, por autodeclaração.')
on conflict (nome) do nothing;

-- ⚠️ RLS ligada e NENHUM grant, como o módulo eventos: quanto cada pessoa
-- contribui é dado sensível, e o navegador nunca fala com estas tabelas. A
-- autorização acontece por capacidade, no servidor.
alter table missao.categorias    enable row level security;
alter table missao.adesoes       enable row level security;
alter table missao.contribuicoes enable row level security;
alter table missao.rateio        enable row level security;

revoke all on all tables in schema missao from anon, authenticated;
revoke usage on schema missao from anon, authenticated;
