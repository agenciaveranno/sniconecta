-- ───────────────────────────────────────────────────────────────────────────
-- DEPARTAMENTOS DA SEDE CENTRAL
--
-- As unidades administrativas que dão suporte aos trabalhos. Alguns deles SÃO
-- as Organizações doutrinárias — Fraternidade, Pomba Branca, Jovens,
-- Prosperidade — e outros não: Jurídico, Controladoria, Editoração.
--
-- ⚠️ UM cadastro, não dois. A alternativa seria uma tabela de Organizações ao
-- lado de outra de Departamentos, com as quatro linhas repetidas nas duas — e
-- duas verdades sobre a Associação da Prosperidade que ninguém garante iguais.
-- Aqui a Organização é um DEPARTAMENTO MARCADO como tal, e a marca é a única
-- fonte da resposta.
--
-- ⚠️ O NOME muda com o lugar, o cadastro não: chama-se Departamento na Sede
-- Central e Organização em toda outra instância. É vocabulário da instituição,
-- não estrutura de dado — duplicar a tabela para duplicar a palavra seria
-- deixar o vocabulário decidir o modelo.
--
-- A tabela continua sendo `organizacoes` porque é ela que `unidades.
-- organizacao_id` já referencia, e renomear tabela com chave estrangeira viva
-- é migração de risco por causa de uma palavra.
-- ───────────────────────────────────────────────────────────────────────────

-- É Organização doutrinária, e não só Departamento administrativo? É esta
-- coluna que responde — e é ela que a tela de Associação Local consulta para
-- montar a lista de escolha.
alter table organizacoes add column e_organizacao boolean not null default true;

comment on column organizacoes.e_organizacao is
  'Marcado: é Organização doutrinária e aparece na escolha da Associação '
  'Local. Desmarcado: é só Departamento administrativo da Sede Central.';

-- ── Gestão ──
--
-- Três anos, acompanhando a DAC. Não é campo de data solta: quem é gestor HOJE
-- e quem era em 2023 são perguntas diferentes, e a segunda é a que explica uma
-- decisão tomada naquele ano.
alter table organizacoes add column descricao text;

-- ───────────────────────────────────────────────────────────────────────────
-- SEÇÕES
--
-- Subdivisão do Departamento, com gestor próprio. Tabela à parte, e não
-- `pai_id` em `organizacoes`: Seção não é Organização e nunca aparece na
-- escolha da Associação Local. Misturar as duas na mesma tabela obrigaria toda
-- consulta de Organização a lembrar de filtrar — e a que esquecesse ofereceria
-- "Seção de Almoxarifado" como opção de Associação Local.
-- ───────────────────────────────────────────────────────────────────────────

create table secoes (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references organizacoes(id) on delete cascade,
  nome           text not null,
  descricao      text,
  ordem          smallint not null default 0,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),

  -- Duas seções com o mesmo nome no mesmo Departamento são erro de digitação,
  -- não duas seções.
  constraint secao_unica_no_departamento unique (organizacao_id, nome)
);

create index idx_secoes_departamento on secoes(organizacao_id);

comment on table secoes is
  'Subdivisões de um Departamento da Sede Central, cada uma com seu gestor.';

alter table secoes enable row level security;

-- Todo mundo que entra no sistema LÊ: a lista de seções é catálogo, aparece em
-- tela de escolha, e esconder catálogo só produz tela vazia sem explicação.
create policy secoes_leitura on secoes for select to authenticated using (true);

-- Escreve só a Sede: seção é estrutura da Sede Central, e quem administra uma
-- Regional não tem o que dizer sobre a organização interna dela.
create policy secoes_escrita on secoes for all to authenticated
  using (app.e_sede()) with check (app.e_sede());

grant select, insert, update, delete on secoes to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- OS DEPARTAMENTOS DE HOJE
--
-- `on conflict (nome) do update` e não `do nothing`: as quatro Organizações
-- já existem (vieram da carga do Credenciamento e da estrutura publicada), e
-- precisam ganhar a marca sem virar linha nova.
--
-- ⚠️ A ordem é a da lista da Sede, e não alfabética: ela reflete precedência
-- institucional, e ordenar por nome na tela faria "Administração" aparecer
-- antes de "Atividades dos Preletores".
-- ───────────────────────────────────────────────────────────────────────────

insert into organizacoes (nome, ordem, e_organizacao) values
  ('Departamento das Atividades dos Preletores e Divulgadores',  1, false),
  ('Departamento de Coordenação das Regionais Doutrinárias',     2, false),
  ('Departamento Jurídico e Gestão de Pessoas',                  3, false),
  ('Departamento de Controladoria',                              4, false),
  ('Departamento de Ofícios Religiosos',                         5, false),
  ('Departamento das Atividades dos Educadores',                10, false),
  ('Departamento de Editoração',                                11, false),
  ('Departamento de Marketing',                                 12, false),
  ('Departamento da Diretoria e CDOC',                           13, false),
  ('Departamento da Missão Sagrada e Forma Humana',              14, false),
  ('Departamento de Divulgação de Livros e Logística',           15, false),
  ('Departamento da América Latina',                             16, false),
  ('Departamento de Tecnologia e Informática',                   17, false),
  ('Departamento da Administração',                              18, false)
on conflict (nome) do update set
  ordem = excluded.ordem,
  e_organizacao = excluded.e_organizacao;

-- ⚠️ Os quatro que SÃO Organização entram por `nome_curto`, não por nome
-- inteiro: elas já existem no banco como "Associação Fraternidade", "Assoc. da
-- Prosperidade" e variações que a carga trouxe da origem. Inserir pelo nome de
-- Departamento criaria uma quinta linha ao lado de cada uma, e as Associações
-- Locais continuariam apontando para a antiga.
update organizacoes set e_organizacao = true, ordem = 6
  where nome ilike '%fraternidade%';
update organizacoes set e_organizacao = true, ordem = 7
  where nome ilike '%pomba branca%';
update organizacoes set e_organizacao = true, ordem = 8
  where nome ilike '%jovens%';
update organizacoes set e_organizacao = true, ordem = 9
  where nome ilike '%prosperidade%';

-- A "Indefinida" que a carga cria para as Associações Locais sem Organização
-- na origem NÃO é Organização doutrinária: ela é uma dívida a revisar, e não
-- pode aparecer como opção para quem está cadastrando.
update organizacoes set e_organizacao = false where nome = 'Indefinida';
