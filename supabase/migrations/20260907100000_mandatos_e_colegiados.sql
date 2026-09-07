-- ───────────────────────────────────────────────────────────────────────────
-- MANDATOS E COLEGIADOS (decisão 0016)
--
-- Cargo é MANDATO DATADO, não coluna na pessoa nem na unidade.
--
-- ⚠️ `unidades.supervisor_id` responderia quem é o Supervisor hoje e APAGARIA
-- quem era antes. A ata de 2024 foi assinada por alguém, e o relatório de 2023
-- é dele: com coluna, a troca de gestão reescreve o passado, e "quem assinou
-- isto?" perde a resposta no dia seguinte à posse.
--
-- ⚠️ E não se reusa `papeis`. Aquilo é AUTORIZAÇÃO — decide o que a pessoa faz
-- no sistema. Isto é FATO INSTITUCIONAL, e existe para quem nunca vai abrir o
-- sistema: a maioria dos titulares nunca vai. Juntar os dois faria toda posse
-- conceder acesso, e toda concessão de acesso parecer posse.
-- ───────────────────────────────────────────────────────────────────────────

-- ── Colegiados ──────────────────────────────────────────────────────────────
--
-- Catálogo, não enum: a Sede cria colegiado por decisão de assembleia, não por
-- implantação de sistema.

create table colegiados (
  codigo    text primary key,
  nome      text not null,
  sigla     text,

  -- Onde ele existe. `nacional` = um só, na Sede. `regional` = um por
  -- Regional. `academia` = um por Academia. `departamento` = um por
  -- Departamento. `associacao_local` = um por AL.
  ambito    text not null check (ambito in
              ('nacional', 'regional', 'academia', 'departamento', 'associacao_local')),

  -- ⚠️ Duração e mês de início em DADO. Cada colegiado tem os seus — DAC
  -- começa em março, CDOC em janeiro, CDOR em setembro, Supervisor em outubro,
  -- Presidente de AL em junho — e essas datas mudam por assembleia. Em `if`,
  -- cada mudança viraria implantação.
  duracao_anos  smallint not null default 3 check (duracao_anos between 1 and 10),
  mes_inicio    smallint check (mes_inicio between 1 and 12),
  dia_inicio    smallint not null default 1 check (dia_inicio between 1 and 31),

  ordem     smallint not null default 0,
  ativo     boolean not null default true
);

comment on table colegiados is
  'Diretorias e conselhos da instituição. Duração e início de gestão são dado, '
  'não código — a Sede muda por assembleia.';

-- ── Cargos ──────────────────────────────────────────────────────────────────

create table cargos (
  codigo        text primary key,
  colegiado     text not null references colegiados(codigo) on delete cascade,
  nome          text not null,

  /**
   * Quantos cabem. NULL = sem teto.
   *
   * ⚠️ É o que impede dois Diretores-Presidentes ao mesmo tempo — o gatilho
   * abaixo confere contra os mandatos ABERTOS no mesmo âmbito. Sem isso, uma
   * posse lançada antes de encerrar a anterior criaria duas verdades, e toda
   * tela que pergunta "quem é o presidente?" escolheria uma sem critério.
   */
  vagas         smallint check (vagas is null or vagas > 0),

  /**
   * A função doutrinária mínima. É `ordem` de `funcoes_doutrinarias`, não
   * nome: "Preletor em grau Sênior ou acima" é uma comparação, e comparar
   * nomes exigiria conhecer a hierarquia deles em código.
   *
   * NULL = qualquer função serve.
   */
  funcao_minima smallint,

  -- Vota, nunca vota, ou só desempata. O Supervisor preside o CDOR e só
  -- desempata: é regra de assembleia, e por isso é dado.
  vota          text not null default 'sempre' check (vota in ('sempre', 'nunca', 'desempate')),

  -- Quem secretaria pode vir de FORA do colegiado. Por isso é cargo como os
  -- outros, e não `secretario_id` numa coluna: sem mandato próprio, a ata de
  -- 2025 não saberia quem a lavrou.
  e_secretario  boolean not null default false,
  e_gestor      boolean not null default false,

  ordem         smallint not null default 0,
  ativo         boolean not null default true
);

create index idx_cargos_colegiado on cargos(colegiado);

-- ── Mandatos ────────────────────────────────────────────────────────────────

create table mandatos (
  id            uuid primary key default gen_random_uuid(),
  pessoa_id     uuid not null references pessoas(id) on delete restrict,
  cargo         text not null references cargos(codigo) on delete restrict,

  /**
   * Onde este mandato vale. Nulo no âmbito nacional (DAC, CDOC).
   *
   * ⚠️ Três colunas e não uma, porque são três tabelas diferentes: Regional e
   * AL são `unidades`, Academia é `locais`, Departamento é `organizacoes`. Uma
   * coluna genérica com o nome da tabela ao lado não teria chave estrangeira —
   * e sem ela, apagar uma Regional deixaria mandatos apontando para o nada.
   */
  unidade_id     uuid references unidades(id) on delete restrict,
  local_id       uuid references locais(id) on delete restrict,
  organizacao_id uuid references organizacoes(id) on delete restrict,

  -- Efetivo vota, ouvinte não. É atributo do MANDATO: a mesma pessoa pode ser
  -- efetiva num colegiado e ouvinte noutro.
  condicao      text not null default 'efetivo' check (condicao in ('efetivo', 'ouvinte')),

  data_inicio   date not null,
  -- Aberto = em exercício. Encerrar é pôr data, nunca apagar a linha: apagar
  -- levaria junto a resposta de quem assinou a ata daquele ano.
  data_fim      date,
  motivo_fim    text,

  observacoes   text,
  criado_em     timestamptz not null default now(),
  criado_por    uuid references pessoas(id) on delete set null,

  constraint mandato_termina_depois check (data_fim is null or data_fim >= data_inicio)
);

create index idx_mandatos_pessoa on mandatos(pessoa_id);
create index idx_mandatos_cargo  on mandatos(cargo);
create index idx_mandatos_abertos on mandatos(cargo, unidade_id) where data_fim is null;

comment on table mandatos is
  'Quem ocupa (ou ocupou) cada cargo, com início e fim. Encerrar é pôr data — '
  'apagar levaria junto quem assinou a ata daquele ano.';

-- ── Um mandato por pessoa por cargo por âmbito, enquanto aberto ──────────────
--
-- ⚠️ Índice PARCIAL: a mesma pessoa pode ser Presidente da mesma AL duas vezes
-- em gestões diferentes — o que não pode é ter dois mandatos abertos do mesmo
-- cargo no mesmo lugar. `coalesce` porque NULL não colide com NULL em índice
-- único, e sem ele dois mandatos nacionais da mesma pessoa no mesmo cargo
-- passariam.
create unique index uq_mandato_aberto on mandatos (
  pessoa_id, cargo,
  coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(local_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(organizacao_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where data_fim is null;

-- ── O que o banco confere ───────────────────────────────────────────────────

create or replace function app.validar_mandato()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare
  c            cargos%rowtype;
  col          colegiados%rowtype;
  abertos      integer;
  funcao_ordem smallint;
begin
  select * into c from cargos where codigo = new.cargo;
  if not found then
    raise exception 'Cargo desconhecido: %.', new.cargo;
  end if;
  select * into col from colegiados where codigo = c.colegiado;

  -- 1. O âmbito tem de estar preenchido, e só ele.
  if col.ambito = 'nacional' then
    if new.unidade_id is not null or new.local_id is not null or new.organizacao_id is not null then
      raise exception '% é cargo nacional: não se prende a uma unidade, academia ou departamento.', c.nome;
    end if;
  elsif col.ambito in ('regional', 'associacao_local') then
    if new.unidade_id is null then
      raise exception '% precisa dizer em qual unidade.', c.nome;
    end if;
  elsif col.ambito = 'academia' then
    if new.local_id is null then
      raise exception '% precisa dizer em qual Academia.', c.nome;
    end if;
  elsif col.ambito = 'departamento' then
    if new.organizacao_id is null then
      raise exception '% precisa dizer em qual Departamento.', c.nome;
    end if;
  end if;

  -- 2. Vagas. Só entre os ABERTOS, e só no mesmo lugar.
  if c.vagas is not null and new.data_fim is null then
    select count(*) into abertos from mandatos m
     where m.cargo = new.cargo
       and m.data_fim is null
       and m.id is distinct from new.id
       and m.unidade_id is not distinct from new.unidade_id
       and m.local_id is not distinct from new.local_id
       and m.organizacao_id is not distinct from new.organizacao_id;
    if abertos >= c.vagas then
      raise exception
        'Já há % em exercício para %. Encerre o mandato anterior antes de dar posse ao próximo.',
        abertos, c.nome;
    end if;
  end if;

  -- 3. A função doutrinária exigida, NA DATA DA POSSE.
  --
  -- ⚠️ Contra o HISTÓRICO, não contra a função de hoje. Quem foi nomeado
  -- Diretor sendo Sênior e depois virou Máster não pode fazer a nomeação de
  -- 2024 parecer irregular — nem o contrário, alguém promovido depois não
  -- valida uma posse que era irregular quando aconteceu.
  if c.funcao_minima is not null then
    -- ⚠️ O registro mais recente ATÉ a data da posse, e não o maior grau que a
    -- pessoa já teve. `max(ordem)` mentiria em dois sentidos: validaria uma
    -- posse irregular com uma promoção posterior, e — se um dia houver
    -- rebaixamento — usaria um grau que já não valia. `pessoa_funcao_hist`
    -- guarda só o início de cada vigência: a que vale numa data é a última que
    -- começou antes dela.
    select f.ordem into funcao_ordem
      from pessoa_funcao_hist h
      join funcoes_doutrinarias f on f.id = h.funcao_id
     where h.pessoa_id = new.pessoa_id
       and h.vigencia_inicio <= new.data_inicio
     order by h.vigencia_inicio desc
     limit 1;

    if funcao_ordem is null or funcao_ordem < c.funcao_minima then
      raise exception
        '% exige função doutrinária a partir de "%". Na data da posse esta pessoa não a tinha.',
        c.nome, (select nome from funcoes_doutrinarias where ordem = c.funcao_minima);
    end if;
  end if;

  return new;
end $$;

create trigger trg_mandato_valido
  before insert or update on mandatos
  for each row execute function app.validar_mandato();

-- ── Quem está em exercício ──────────────────────────────────────────────────

create view mandato_atual as
  select m.id, m.pessoa_id, p.nome as pessoa_nome, m.cargo, c.nome as cargo_nome,
         c.colegiado, col.nome as colegiado_nome, col.sigla as colegiado_sigla,
         col.ambito, c.e_gestor, c.e_secretario, c.vota,
         m.condicao, m.unidade_id, m.local_id, m.organizacao_id, m.data_inicio
    from mandatos m
    join cargos c      on c.codigo = m.cargo
    join colegiados col on col.codigo = c.colegiado
    join pessoas p     on p.id = m.pessoa_id
   where m.data_fim is null;

comment on view mandato_atual is
  'Quem ocupa cada cargo AGORA. O histórico inteiro está em `mandatos`.';

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table colegiados enable row level security;
alter table cargos     enable row level security;
alter table mandatos   enable row level security;

-- Catálogo: todo mundo que entra lê. Esconder catálogo só produz tela vazia
-- sem explicação.
create policy colegiados_leitura on colegiados for select to authenticated using (true);
create policy cargos_leitura     on cargos     for select to authenticated using (true);

-- Quem ocupa cargo não é segredo: consta em ata, em crachá e no site. Quem
-- pode ler a PESSOA já é limitado pelo RLS de `pessoas`.
create policy mandatos_leitura on mandatos for select to authenticated using (true);

-- Escreve a Sede. Dar posse é ato da Sede Central, inclusive nos cargos
-- eleitos: a eleição acontece na Regional, o registro é nacional.
create policy colegiados_escrita on colegiados for all to authenticated
  using (app.e_sede()) with check (app.e_sede());
create policy cargos_escrita on cargos for all to authenticated
  using (app.e_sede()) with check (app.e_sede());
create policy mandatos_escrita on mandatos for all to authenticated
  using (app.e_sede()) with check (app.e_sede());

grant select on colegiados, cargos to authenticated;
grant insert, update, delete on colegiados, cargos to authenticated;
grant select, insert, update, delete on mandatos to authenticated;
grant select on mandato_atual to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- OS COLEGIADOS DE HOJE
--
-- `funcao_minima` é a `ordem` de `funcoes_doutrinarias`:
--   3 Divulgador · 6 Preletor Aspirante · 8 Preletor Sênior · 9 Preletor Máster
-- ───────────────────────────────────────────────────────────────────────────

insert into colegiados (codigo, nome, sigla, ambito, duracao_anos, mes_inicio, ordem) values
  ('dac',  'Diretoria da Administração Central',      'DAC',  'nacional', 3,  3, 1),
  ('cdoc', 'Conselho Doutrinário Organizacional Central', 'CDOC', 'nacional', 3,  1, 2),
  ('cdor', 'Conselho Doutrinário Organizacional Regional', 'CDOR', 'regional', 3,  9, 3),
  ('supervisao', 'Supervisão Administrativa Doutrinária Regional', null, 'regional', 3, 10, 4),
  ('academia', 'Diretoria da Academia de Treinamento Espiritual', null, 'academia', 3, 3, 5),
  ('departamento', 'Gestão de Departamento',           null,   'departamento', 3, 3, 6),
  ('cec',  'Comissão Executiva Central',               'CEC',  'departamento', 3, 3, 7),
  ('cer',  'Comissão Executiva Regional',              'CER',  'regional', 3, 9, 8),
  ('al',   'Diretoria da Associação Local',            null,   'associacao_local', 3, 6, 9),
  ('representacao', 'Representação Regional',          null,   'regional', 1, null, 10)
on conflict (codigo) do nothing;

insert into cargos (codigo, colegiado, nome, vagas, funcao_minima, vota, e_gestor, e_secretario, ordem) values
  -- ⚠️ DAC: Presidente e Vices exigem grau Máster para cima (9); os demais
  -- Diretores, Sênior para cima (8). São requisitos diferentes no mesmo
  -- colegiado, e é por isso que a exigência mora no CARGO e não no colegiado.
  ('dac.presidente',      'dac', 'Diretor-Presidente',        1,  9, 'sempre', true,  false, 1),
  ('dac.vice',            'dac', 'Diretor Vice-Presidente',   2,  9, 'sempre', false, false, 2),
  ('dac.diretor',         'dac', 'Diretor',                  16,  8, 'sempre', false, false, 3),
  ('dac.secretario',      'dac', 'Secretário da DAC',         1,  null, 'nunca', false, true, 4),

  -- CDOC. O Presidente Doutrinário para a América Latina é o emissário da Sede
  -- Internacional: uma pessoa do cadastro, ocupando um cargo.
  ('cdoc.presidente_doutrinario', 'cdoc', 'Presidente Doutrinário para a América Latina', 1, 6, 'sempre', true, false, 1),
  ('cdoc.diretor_presidente',     'cdoc', 'Diretor-Presidente (nato)', 1, 9, 'sempre', false, false, 2),
  ('cdoc.membro',                 'cdoc', 'Membro do CDOC',         null, 6, 'sempre', false, false, 3),
  ('cdoc.secretario',             'cdoc', 'Secretário do CDOC',        1, null, 'nunca', false, true, 4),

  -- Supervisor: representante legal e procurador da instituição na Regional.
  ('supervisao.supervisor', 'supervisao', 'Supervisor Administrativo Doutrinário Regional', 1, 6, 'sempre', true, false, 1),
  ('supervisao.funcionario', 'supervisao', 'Funcionário da Regional', null, null, 'nunca', false, false, 2),

  -- ⚠️ CDOR: o Supervisor PRESIDE e não vota, exceto para desempatar. Fica em
  -- dado pela mesma razão do requisito de função: é regra de assembleia.
  ('cdor.presidente',     'cdor', 'Presidente do CDOR (Supervisor)', 1, 6, 'desempate', true, false, 1),
  ('cdor.federacao_pomba_branca', 'cdor', 'Presidente da Federação das Associações Pomba Branca', 1, 3, 'sempre', false, false, 2),
  ('cdor.federacao_fraternidade', 'cdor', 'Presidente da Federação das Associações Fraternidade', 1, 3, 'sempre', false, false, 3),
  ('cdor.jovens',         'cdor', 'Presidente da Associação dos Jovens da Regional', 1, 3, 'sempre', false, false, 4),
  ('cdor.prosperidade',   'cdor', 'Presidente da União das Associações da Prosperidade', 1, 3, 'sempre', false, false, 5),
  ('cdor.preletores',     'cdor', 'Presidente da Associação dos Preletores Regionais', 1, 6, 'sempre', false, false, 6),
  -- Facultativo em algumas Regionais: existe o cargo, nem toda Regional o
  -- preenche. Vaga sem mandato aberto é simplesmente vaga sem mandato aberto.
  ('cdor.educadores',     'cdor', 'Presidente da Associação dos Educadores Regionais', 1, 3, 'sempre', false, false, 7),
  ('cdor.secretario',     'cdor', 'Secretário do CDOR', 1, null, 'nunca', false, true, 8),

  -- Representante Regional: eleito entre os Presidentes Regionais, gestão de
  -- UM ano, e é quem elege o Diretor-Presidente na Assembleia Geral.
  ('representacao.representante', 'representacao', 'Representante Regional', 1, 6, 'sempre', true, false, 1),

  -- Academia: o Preposto é um membro da DAC designado responsável.
  ('academia.preposto',   'academia', 'Preposto do Diretor-Presidente', 1, 8, 'sempre', true, false, 1),
  ('academia.gerente',    'academia', 'Gerente Operacional',            1, null, 'sempre', false, false, 2),
  ('academia.diretor',    'academia', 'Diretor da Academia',         null, 3, 'sempre', false, false, 3),
  ('academia.secretario', 'academia', 'Secretário da Academia',         1, null, 'nunca', false, true, 4),

  -- Departamento: um gestor principal e até três secundários.
  ('departamento.gestor',      'departamento', 'Gestor do Departamento',   1, null, 'sempre', true, false, 1),
  ('departamento.gestor_adjunto', 'departamento', 'Gestor adjunto',        3, null, 'sempre', false, false, 2),
  ('departamento.gestor_secao',   'departamento', 'Gestor de Seção',    null, null, 'sempre', false, false, 3),

  -- CEC e CER: Presidente, Vices e Membros, nomeados pelo respectivo Presidente.
  ('cec.presidente',      'cec', 'Presidente da CEC',      1, 3, 'sempre', true, false, 1),
  ('cec.vice',            'cec', 'Vice-Presidente da CEC', null, 3, 'sempre', false, false, 2),
  ('cec.membro',          'cec', 'Membro da CEC',          null, 3, 'sempre', false, false, 3),
  ('cec.secretario',      'cec', 'Secretário da CEC',      1, null, 'nunca', false, true, 4),

  ('cer.presidente',      'cer', 'Presidente da CER',      1, 3, 'sempre', true, false, 1),
  ('cer.vice',            'cer', 'Vice-Presidente da CER', null, 3, 'sempre', false, false, 2),
  ('cer.membro',          'cer', 'Membro da CER',          null, 3, 'sempre', false, false, 3),
  ('cer.secretario',      'cer', 'Secretário da CER',      1, null, 'nunca', false, true, 4),

  -- Associação Local: eleito pelos Associados.
  ('al.presidente',       'al', 'Presidente da Associação Local', 1, 3, 'sempre', true, false, 1),
  ('al.vice',             'al', 'Vice-Presidente da Associação Local', 1, 3, 'sempre', false, false, 2),
  ('al.coordenador_revistas', 'al', 'Coordenador Local de Revistas', 1, null, 'sempre', false, false, 3),
  ('al.secretario',       'al', 'Secretário da Associação Local', 1, null, 'nunca', false, true, 4)
on conflict (codigo) do nothing;
