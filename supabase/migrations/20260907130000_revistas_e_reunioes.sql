-- ───────────────────────────────────────────────────────────────────────────
-- COTAS DE REVISTA
--
-- Três títulos mensais: Fonte de Luz, Mulher Feliz e Mundo Ideal. Cada Associado
-- retira uma cota para divulgar, e a quantidade MÍNIMA depende da função
-- doutrinária dele — de 10 exemplares para o Divulgador a 60 para o Preletor da
-- Sede Internacional.
--
-- ⚠️ O mínimo é do TOTAL, não de cada título: um Divulgador pode levar 3 Fonte
-- de Luz, 3 Mulher Feliz e 4 Mundo Ideal, e um Preletor Júnior pode levar 40
-- Mundo Ideal e nada mais. Modelar um mínimo por título recusaria as duas
-- composições, que são as normais.
--
-- ⚠️ E não há máximo. Quem quer levar mais leva.
-- ───────────────────────────────────────────────────────────────────────────

create table revistas (
  codigo    text primary key,
  nome      text not null,
  ordem     smallint not null default 0,
  ativo     boolean not null default true
);

insert into revistas (codigo, nome, ordem) values
  ('fonte_de_luz', 'Fonte de Luz', 1),
  ('mulher_feliz', 'Mulher Feliz', 2),
  ('mundo_ideal',  'Mundo Ideal',  3)
on conflict (codigo) do nothing;

-- ── O mínimo por função ─────────────────────────────────────────────────────
--
-- Em tabela, e datado: a Sede revisa esses números, e a revisão não pode
-- reescrever o que era exigido no ano passado.

create table revista_minimos (
  id              uuid primary key default gen_random_uuid(),
  funcao_id       uuid not null references funcoes_doutrinarias(id) on delete cascade,
  minimo          smallint not null check (minimo >= 0),
  vigencia_inicio date not null default current_date,

  constraint minimo_por_funcao_e_vigencia unique (funcao_id, vigencia_inicio)
);

insert into revista_minimos (funcao_id, minimo, vigencia_inicio)
select f.id,
       case f.nome
         when 'Divulgador' then 10
         when 'Divulgador Autorizado' then 10
         when 'Preletor em grau Aspirante' then 30
         when 'Líder da Iluminação' then 30
         when 'Preletor em grau Júnior' then 40
         when 'Preletor em grau Sênior' then 50
         else 60
       end,
       '2026-01-01'
  from funcoes_doutrinarias f
 where f.nome in (
   'Divulgador', 'Divulgador Autorizado', 'Líder da Iluminação',
   'Preletor em grau Aspirante', 'Preletor em grau Júnior', 'Preletor em grau Sênior',
   'Preletor em grau Máster', 'Aspirante a Preletor da Sede Internacional',
   'Preletor da Sede Internacional'
 )
on conflict do nothing;

-- ── Os valores ──────────────────────────────────────────────────────────────
--
-- Capa R$ 2,00; o cotista paga R$ 1,70. Configuráveis, com vigência — o preço
-- muda, e a remessa do mês passado foi cobrada pelo preço daquele mês.

create table revista_precos (
  id                 uuid primary key default gen_random_uuid(),
  vigencia_inicio    date not null unique,
  capa_centavos      integer not null check (capa_centavos > 0),
  cotista_centavos   integer not null check (cotista_centavos > 0),

  -- O cotista paga MENOS que a capa. O contrário é erro de digitação, e só
  -- apareceria no fechamento do mês.
  constraint cotista_nao_paga_mais check (cotista_centavos <= capa_centavos)
);

insert into revista_precos (vigencia_inicio, capa_centavos, cotista_centavos)
values ('2026-01-01', 200, 170);

-- ── A cota de cada pessoa ───────────────────────────────────────────────────
--
-- Vinculada ao PEDIDO DA ASSOCIAÇÃO LOCAL, que é como a remessa acontece: a
-- Sede não manda revista para dezesseis mil endereços, manda para as ALs.

create table revista_pedidos (
  id           uuid primary key default gen_random_uuid(),
  unidade_id   uuid not null references unidades(id) on delete restrict,
  competencia  date not null,
  fechado_em   timestamptz,
  fechado_por  uuid references pessoas(id) on delete set null,
  observacoes  text,
  criado_em    timestamptz not null default now(),

  constraint competencia_no_dia_1 check (extract(day from competencia) = 1),
  -- Um pedido por AL por mês. Dois seriam duas remessas para o mesmo lugar.
  constraint pedido_unico_no_mes unique (unidade_id, competencia)
);

create table revista_cotas (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references revista_pedidos(id) on delete cascade,
  pessoa_id    uuid not null references pessoas(id) on delete restrict,
  revista      text not null references revistas(codigo) on delete restrict,
  quantidade   smallint not null check (quantidade >= 0),

  -- Uma linha por pessoa por título dentro do pedido. Duas seriam duas
  -- quantidades para a mesma coisa, e a soma contaria as duas.
  constraint cota_unica unique (pedido_id, pessoa_id, revista)
);

create index idx_cotas_pessoa on revista_cotas(pessoa_id);

comment on table revista_cotas is
  'Quantos exemplares de cada título a pessoa retira no mês. O mínimo da '
  'função é do TOTAL, não de cada título — a composição é livre.';

alter table revistas        enable row level security;
alter table revista_minimos enable row level security;
alter table revista_precos  enable row level security;
alter table revista_pedidos enable row level security;
alter table revista_cotas   enable row level security;

-- Catálogo e preço: todo mundo lê. Esconder catálogo só produz tela vazia.
create policy revistas_leitura  on revistas        for select to authenticated using (true);
create policy minimos_leitura   on revista_minimos for select to authenticated using (true);
create policy precos_leitura    on revista_precos  for select to authenticated using (true);
grant select on revistas, revista_minimos, revista_precos to authenticated;

-- Pedido e cota: quem alcança a unidade. É a mesma herança da árvore que vale
-- para pessoas — o Presidente da AL enxerga a AL dele, o Supervisor a Regional
-- inteira, a Sede tudo.
-- ⚠️ `app.administra()` e não `unidades_administradas()` direto: a segunda só
-- devolve unidades onde a pessoa tem papel COM unidade, e o papel da Sede é
-- NACIONAL — sem unidade nenhuma. Usando só ela, quem administra o sistema
-- inteiro não conseguiria lançar um pedido. `administra()` junta os dois casos,
-- e é a função que o resto do sistema já usa.
create policy pedidos_por_unidade on revista_pedidos for all to authenticated
  using (app.administra(unidade_id))
  with check (app.administra(unidade_id));

create policy cotas_por_unidade on revista_cotas for all to authenticated
  using (exists (select 1 from revista_pedidos p where p.id = pedido_id and app.administra(p.unidade_id)))
  with check (exists (select 1 from revista_pedidos p where p.id = pedido_id and app.administra(p.unidade_id)));

grant select, insert, update, delete on revista_pedidos, revista_cotas to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- REUNIÕES PERIÓDICAS DA ASSOCIAÇÃO LOCAL
--
-- Semanais, quinzenais ou mensais, com hora de início e de término, e um
-- Orientador — Preletor ou Divulgador — que é o palestrante do dia.
--
-- ⚠️ Aqui mora a REGRA da reunião ("toda terça, 20h"), não cada ocorrência.
-- Gerar uma linha por semana até o fim dos tempos encheria a tabela de dado que
-- ninguém pediu, e mudar o horário obrigaria a reescrever o futuro inteiro. A
-- ocorrência só vira linha quando tiver algo próprio a dizer — presença,
-- orientador substituto — e isso é outro problema.
-- ───────────────────────────────────────────────────────────────────────────

create table reunioes (
  id            uuid primary key default gen_random_uuid(),
  unidade_id    uuid not null references unidades(id) on delete cascade,
  nome          text,

  frequencia    text not null default 'semanal'
                  check (frequencia in ('semanal', 'quinzenal', 'mensal')),
  -- 0 = domingo, como em `extract(dow)`. Nulo na mensal por dia do mês.
  dia_semana    smallint check (dia_semana between 0 and 6),
  -- Usado pela mensal: "todo dia 10".
  dia_mes       smallint check (dia_mes between 1 and 31),

  hora_inicio   time not null,
  hora_fim      time,

  -- O palestrante do dia. Anulável: a reunião existe mesmo antes de a AL
  -- definir quem orienta, e exigir orientador impediria cadastrar a agenda.
  orientador_id uuid references pessoas(id) on delete set null,

  local_texto   text,
  observacoes   text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),

  -- Semanal e quinzenal precisam do dia da semana; mensal, do dia do mês.
  constraint reuniao_tem_quando check (
    (frequencia in ('semanal', 'quinzenal') and dia_semana is not null)
    or (frequencia = 'mensal' and (dia_mes is not null or dia_semana is not null))
  ),
  constraint reuniao_termina_depois check (hora_fim is null or hora_fim > hora_inicio)
);

create index idx_reunioes_unidade on reunioes(unidade_id);

alter table reunioes enable row level security;

-- Reunião é AGENDA: quem entra no sistema pode ver onde e quando há reunião —
-- é justamente o que o adepto procura. Escrever, só quem administra a unidade.
create policy reunioes_leitura on reunioes for select to authenticated using (true);
create policy reunioes_escrita on reunioes for all to authenticated
  using (app.administra(unidade_id))
  with check (app.administra(unidade_id));

grant select, insert, update, delete on reunioes to authenticated;
