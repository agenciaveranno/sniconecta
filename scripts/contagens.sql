-- Contagens no MySQL de origem que decidem o esquema de `pessoas`.
-- Rode e devolva os números; não há dado pessoal na saída.

SELECT COUNT(*) AS total,
  SUM(cpf IS NULL OR TRIM(cpf) = '') AS sem_cpf,
  SUM(LENGTH(REGEXP_REPLACE(cpf,'[^0-9]','')) <> 11) AS cpf_fora_do_formato,
  SUM(REGEXP_REPLACE(cpf,'[^0-9]','') REGEXP '^(.)\\1{10}$') AS cpf_placeholder,
  SUM(codSNI IS NULL OR TRIM(codSNI) = '') AS sem_codsni,
  SUM(email IS NULL OR TRIM(email) = '') AS sem_email,
  SUM(dataNascimento > DATE_SUB(CURDATE(), INTERVAL 18 YEAR)) AS menores
FROM Participant;

SELECT COUNT(*) AS cpf_duplicado FROM (
  SELECT REGEXP_REPLACE(cpf,'[^0-9]','') c FROM Participant WHERE cpf IS NOT NULL
  GROUP BY c HAVING COUNT(*) > 1) d;

SELECT COUNT(*) AS codsni_duplicado FROM (
  SELECT codSNI FROM Participant WHERE codSNI IS NOT NULL AND codSNI <> ''
  GROUP BY codSNI HAVING COUNT(*) > 1) d;

SELECT COUNT(*) AS email_duplicado FROM (
  SELECT LOWER(TRIM(email)) e FROM Participant WHERE email IS NOT NULL AND email <> ''
  GROUP BY e HAVING COUNT(*) > 1) d;

SELECT COUNT(*) AS inscricoes FROM Inscricao;
SELECT COUNT(*) AS pedidos FROM PedidoPendente;
SELECT COUNT(*) AS eventos FROM Evento;
SELECT COUNT(DISTINCT regional) AS regionais_distintas, COUNT(DISTINCT organizacao) AS organizacoes_distintas FROM Participant;
