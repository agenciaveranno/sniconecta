-- ───────────────────────────────────────────────────────────────────────────
-- A UNIDADE CRIADA PELA CARGA PRECISA SE ANUNCIAR
--
-- A carga do Credenciamento cria Regionais e Associações Locais a partir de
-- TEXTO LIVRE: "PR-PARANÁ 2", "Assoc. da Prosperidade". O casamento é por nome
-- normalizado, e é aí que uma carga inventa estrutura duplicada — "REGIONAL
-- SÃO PAULO" e "São Paulo" são a mesma coisa para uma pessoa e duas para um
-- `=`. Duplicata não derruba nada na hora: faz os relatórios somarem metade em
-- cada uma, e só aparece quando alguém estranha um total, meses depois.
--
-- `pessoas` já tinha esta coluna desde a fundação; `unidades` não. A fase que
-- cria unidade escrevia nela mesmo assim, e o banco recusava — a carga parava
-- na segunda fase.
--
-- Guarda o nome BRUTO da origem e `conferir: true`. É o que a tela de
-- reconciliação lista, e o que permite dizer, olhando uma unidade suspeita, de
-- que texto ela nasceu.
-- ───────────────────────────────────────────────────────────────────────────

alter table unidades add column migracao_extras jsonb;

comment on column unidades.migracao_extras is
  'De onde a unidade veio quando nasceu de uma carga: nome bruto da origem e '
  'se ainda precisa de conferência humana. Nulo em unidade cadastrada na tela.';

-- Índice parcial: a esmagadora maioria das unidades tem NULL aqui, e a
-- consulta que importa é uma só — "o que falta conferir".
create index idx_unidades_conferir on unidades ((migracao_extras->>'conferir'))
  where migracao_extras is not null;
