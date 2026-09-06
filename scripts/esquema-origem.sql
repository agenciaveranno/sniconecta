-- Retrato do esquema do MySQL de origem (Railway), para escrever as fases da
-- migração contra os nomes de coluna REAIS em vez de adivinhar.
--
-- Roda inteiro no painel do Railway (aba Data → Query), sem instalar nada e
-- sem baixar dado nenhum: só nomes de tabela, de coluna e tipos. Nenhum CPF,
-- nenhum e-mail, nenhuma linha de dado pessoal sai daqui.
--
-- Rode uma consulta por vez e guarde cada resultado. Se o painel aceitar
-- exportar CSV, exporte; senão, copiar e colar serve.

-- ── 1. Tabelas e quantas linhas cada uma tem ───────────────────────────────
-- `table_rows` é estimativa do InnoDB, não contagem exata. Serve para saber o
-- tamanho da encrenca, não para conferir a migração — quem confere é
-- scripts/contagens.sql.
SELECT table_name, table_rows, engine, table_collation
  FROM information_schema.tables
 WHERE table_schema NOT IN ('information_schema','mysql','performance_schema','sys')
   AND table_type = 'BASE TABLE'
 ORDER BY table_name;

-- ── 2. Todas as colunas, com tipo, nulidade e chave ────────────────────────
-- É esta a consulta que mais importa: sem ela, cada fase da migração seria
-- escrita no chute e só quebraria na hora de rodar, com o banco pela metade.
SELECT table_name, ordinal_position, column_name, column_type,
       is_nullable, column_key, column_default, extra
  FROM information_schema.columns
 WHERE table_schema NOT IN ('information_schema','mysql','performance_schema','sys')
 ORDER BY table_name, ordinal_position;

-- ── 3. Chaves estrangeiras ─────────────────────────────────────────────────
-- Definem a ORDEM das fases: não dá para gravar inscrição antes do evento a
-- que ela pertence.
SELECT table_name, constraint_name, column_name,
       referenced_table_name, referenced_column_name
  FROM information_schema.key_column_usage
 WHERE table_schema NOT IN ('information_schema','mysql','performance_schema','sys')
   AND referenced_table_name IS NOT NULL
 ORDER BY table_name, constraint_name, ordinal_position;

-- ── 4. Índices únicos ──────────────────────────────────────────────────────
-- Revelam o que a origem já tratava como identificador — e o que vai colidir
-- quando a mesma regra virar `unique` no Postgres.
SELECT table_name, index_name, seq_in_index, column_name, non_unique
  FROM information_schema.statistics
 WHERE table_schema NOT IN ('information_schema','mysql','performance_schema','sys')
   AND non_unique = 0
 ORDER BY table_name, index_name, seq_in_index;
