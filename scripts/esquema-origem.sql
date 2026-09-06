-- Retrato do esquema do MySQL de origem (Railway), para escrever as fases da
-- migração contra os nomes de coluna REAIS em vez de adivinhar.
--
-- ⚠️ ONDE RODAR: aba **Console** do serviço MySQL, não a aba Data.
--
-- A aba Data → Query serve para espiar dados, não para extrair esquema:
-- acrescenta `LIMIT 100` ao que você cola, roda uma instrução por vez e
-- pagina de cinco em cinco linhas. Um resultado de 31 tabelas vira sete telas
-- e nenhum botão de exportar.
--
-- O Console é um terminal dentro do container: sem paginação, sem LIMIT, e
-- aceita `SET SESSION` — que é o que permite juntar todas as colunas de uma
-- tabela numa linha só sem o servidor cortar em 1024 caracteres.
--
-- Cada bloco abaixo é UM comando: cole inteiro, aperte enter, selecione a
-- saída e me mande. Nada aqui devolve dado pessoal — só nomes e tipos.
--
-- Se o Console abrir direto no prompt do MySQL (`mysql>`) em vez de um shell,
-- pule o `mysql -u... -e "…"` e cole só o SQL de dentro das aspas.


-- ═══ 1. Colunas de todas as tabelas ════════════════════════════════════════
-- A consulta que mais importa: sem ela, cada fase da migração seria escrita no
-- chute e só quebraria na hora de rodar, com o banco pela metade.
--
-- Uma linha por tabela, no formato:
--   Participant :: id int !PK AI | cpf varchar(14) | email varchar(255)
-- onde `!` marca NOT NULL. É denso de propósito: cabe numa tela e num
-- copiar-colar.

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -N -B -e "
SET SESSION group_concat_max_len = 1000000;
SELECT CONCAT(c.table_name, ' :: ', GROUP_CONCAT(
         CONCAT(c.column_name, ' ', c.column_type,
                IF(c.is_nullable = 'NO', ' !', ''),
                IF(c.column_key <> '', CONCAT(' ', c.column_key), ''),
                IF(c.extra <> '', CONCAT(' ', c.extra), ''))
         ORDER BY c.ordinal_position SEPARATOR ' | '))
  FROM information_schema.columns c
 WHERE c.table_schema = DATABASE()
 GROUP BY c.table_name
 ORDER BY c.table_name;"


-- ═══ 2. Chaves estrangeiras ════════════════════════════════════════════════
-- Definem a ORDEM das fases: não dá para gravar inscrição antes do evento a
-- que ela pertence.

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -N -B -e "
SELECT CONCAT(k.table_name, '.', k.column_name, ' -> ',
              k.referenced_table_name, '.', k.referenced_column_name)
  FROM information_schema.key_column_usage k
 WHERE k.table_schema = DATABASE()
   AND k.referenced_table_name IS NOT NULL
 ORDER BY k.table_name, k.column_name;"


-- ═══ 3. Índices únicos e tamanho das tabelas ═══════════════════════════════
-- Os únicos revelam o que a origem já tratava como identificador — e o que vai
-- colidir quando a mesma regra virar `unique` no Postgres. `table_rows` é
-- estimativa do InnoDB: serve para saber o tamanho da encrenca, não para
-- conferir a migração (quem confere é scripts/contagens.sql).

mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -N -B -e "
SET SESSION group_concat_max_len = 1000000;
SELECT CONCAT(s.table_name, ' [', s.index_name, '] ',
              GROUP_CONCAT(s.column_name ORDER BY s.seq_in_index SEPARATOR ', '))
  FROM information_schema.statistics s
 WHERE s.table_schema = DATABASE() AND s.non_unique = 0
 GROUP BY s.table_name, s.index_name
 ORDER BY s.table_name, s.index_name;
SELECT CONCAT(t.table_name, ' ~', t.table_rows, ' linhas')
  FROM information_schema.tables t
 WHERE t.table_schema = DATABASE() AND t.table_type = 'BASE TABLE'
 ORDER BY t.table_name;"


-- ═══ Se a senha não estiver no ambiente ════════════════════════════════════
-- O container costuma trazer MYSQL_ROOT_PASSWORD e MYSQL_DATABASE prontos.
-- Se algum comando reclamar de acesso negado, veja o que existe com:
--
--   env | grep -i mysql
--
-- e troque os nomes das variáveis nos comandos acima pelos que aparecerem.
