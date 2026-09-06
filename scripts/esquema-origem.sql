-- Retrato do esquema do MySQL de origem (Railway), para escrever as fases da
-- migração contra os nomes de coluna REAIS em vez de adivinhar.
--
-- ⚠️ COMO O PAINEL DO RAILWAY SE COMPORTA (aba Data → Query):
--
--   1. Roda UMA instrução por vez. Colar o arquivo inteiro dá erro de
--      sintaxe na segunda.
--   2. Acrescenta `LIMIT 100` no fim do que você colou. Por isso nenhuma
--      consulta aqui tem LIMIT próprio (viraria `LIMIT 100 LIMIT 100`), e
--      todas foram escritas para caber em MENOS de 100 linhas — uma que
--      devolvesse 400 seria cortada em silêncio, e a migração nasceria
--      cega justamente nas tabelas do fim do alfabeto.
--   3. Não aceita DDL: `CREATE USER`, `GRANT` e `FLUSH PRIVILEGES` quebram
--      no `LIMIT` acrescentado. Criar o usuário de leitura exige um cliente
--      de verdade — ver `docs/migracao.md`.
--
-- Nada aqui devolve dado pessoal: só nomes de tabela, de coluna e tipos.

-- ── 1. Inventário: uma linha por tabela ────────────────────────────────────
-- Cole SÓ esta consulta e me mande o resultado. Ela diz o tamanho de cada
-- tabela e quantas colunas tem — é o que me permite montar as próximas
-- consultas já sabendo que cabem no limite de 100 linhas.
--
-- `table_rows` é estimativa do InnoDB, não contagem exata. Serve para saber o
-- tamanho da encrenca; quem confere a migração é scripts/contagens.sql.
SELECT t.table_name,
       t.table_rows AS linhas_estimadas,
       (SELECT COUNT(*) FROM information_schema.columns c
         WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS colunas
  FROM information_schema.tables t
 WHERE t.table_schema NOT IN ('information_schema','mysql','performance_schema','sys')
   AND t.table_type = 'BASE TABLE'
 ORDER BY t.table_name;


-- ── 2. As colunas, agrupadas por tabela ────────────────────────────────────
-- Uma linha por TABELA (e não por coluna), justamente para caber em 100.
-- É esta a consulta que mais importa: sem ela, cada fase da migração seria
-- escrita no chute e só quebraria na hora de rodar, com o banco pela metade.
--
-- ⚠️ `JSON_ARRAYAGG` pode ser truncado pelo servidor quando a tabela tem
-- muitas colunas. Se algum valor de `colunas` vier cortado no meio — JSON que
-- não fecha o colchete — me avise: eu devolvo uma versão que lê essas tabelas
-- uma a uma.
SELECT c.table_name,
       JSON_ARRAYAGG(JSON_OBJECT(
         'n',     c.ordinal_position,
         'nome',  c.column_name,
         'tipo',  c.column_type,
         'nulo',  c.is_nullable,
         'chave', c.column_key,
         'extra', c.extra)) AS colunas
  FROM information_schema.columns c
 WHERE c.table_schema NOT IN ('information_schema','mysql','performance_schema','sys')
 GROUP BY c.table_name
 ORDER BY c.table_name;


-- ── 3. Chaves estrangeiras ─────────────────────────────────────────────────
-- Definem a ORDEM das fases: não dá para gravar inscrição antes do evento a
-- que ela pertence. Agrupadas por tabela pelo mesmo motivo da anterior.
SELECT k.table_name,
       JSON_ARRAYAGG(JSON_OBJECT(
         'coluna',  k.column_name,
         'aponta',  k.referenced_table_name,
         'para',    k.referenced_column_name)) AS referencias
  FROM information_schema.key_column_usage k
 WHERE k.table_schema NOT IN ('information_schema','mysql','performance_schema','sys')
   AND k.referenced_table_name IS NOT NULL
 GROUP BY k.table_name
 ORDER BY k.table_name;


-- ── 4. Índices únicos ──────────────────────────────────────────────────────
-- Revelam o que a origem já tratava como identificador — e o que vai colidir
-- quando a mesma regra virar `unique` no Postgres. É aqui que se descobre,
-- por exemplo, se CPF já era único lá ou se a base tem repetidos.
SELECT s.table_name,
       JSON_ARRAYAGG(JSON_OBJECT(
         'indice', s.index_name,
         'ordem',  s.seq_in_index,
         'coluna', s.column_name)) AS unicos
  FROM information_schema.statistics s
 WHERE s.table_schema NOT IN ('information_schema','mysql','performance_schema','sys')
   AND s.non_unique = 0
 GROUP BY s.table_name
 ORDER BY s.table_name;
