-- ───────────────────────────────────────────────────────────────────────────
-- CNPJ ALFANUMÉRICO (Receita Federal, 2026)
--
-- Os doze primeiros caracteres passam a poder ser letra OU dígito; só os dois
-- verificadores continuam numéricos. O `check` antigo — `^[0-9]{14}$` —
-- recusaria um CNPJ legítimo de fornecedor, de hotel que sedia evento, de
-- qualquer pessoa jurídica emitida a partir de agora.
--
-- ⚠️ Caixa alta no banco, não só na tela. "12abc..." e "12ABC..." são o mesmo
-- CNPJ para a Receita e dois textos diferentes para um índice: sem normalizar
-- na entrada, a mesma empresa entraria duas vezes e nada perceberia.
--
-- O cálculo do verificador não muda: o valor de cada posição passa a ser o
-- ASCII do caractere menos 48, o que para '0'–'9' devolve 0–9. Todo CNPJ
-- numérico que valia antes continua valendo — a regra generaliza, não
-- substitui. Quem confere o DV é `src/lib/dominio/cnpj.ts`, na entrada.
-- ───────────────────────────────────────────────────────────────────────────

alter table unidades drop constraint cnpj_14_digitos;
alter table unidades add constraint cnpj_14_caracteres
  check (cnpj is null or cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$');

alter table locais drop constraint local_cnpj_14_digitos;
alter table locais add constraint local_cnpj_14_caracteres
  check (cnpj is null or cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$');

comment on column unidades.cnpj is
  'Sem pontuação e em CAIXA ALTA. Doze alfanuméricos + dois dígitos '
  'verificadores — aceita o formato novo da Receita e o numérico de sempre.';
comment on column locais.cnpj is
  'Sem pontuação e em CAIXA ALTA. Aceita CNPJ alfanumérico.';
