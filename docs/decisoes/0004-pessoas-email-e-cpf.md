# 0004 — `pessoas.email` anulável; CPF obrigatório e validado

**Situação.** O esquema do Ciclo tem `email citext not null unique` porque o
e-mail é o identificador de login do Supabase Auth. Mas a base de eventos tem
milhares de pessoas sem e-mail ou com e-mail compartilhado em família, e a
maioria nunca fará login.

**Decisão.**
- `email` passa a ser **anulável**, único quando presente (`unique` ignora
  nulos). Obrigatório apenas quando `auth_user_id` existe, garantido por
  `check (auth_user_id is null or email is not null)`.
- E-mail em branco na migração vira `NULL`, **nunca string vazia** (a string
  vazia passa no `not null` e derruba o `unique` na segunda pessoa).
- `cpf` continua `not null unique`, só dígitos, e a migração valida o dígito
  verificador ANTES de gravar: CPF inválido é rejeitado com motivo, não
  corrigido nem inventado. Placeholder (`00000000000`) nunca.
- `cod_sni` fica **anulável** até as contagens da base real dizerem o
  contrário. Se todos tiverem, vira `not null` numa migração posterior.

**Pendente (decisão da Sede).** Pessoa sem CPF (menor, estrangeiro, compra
de balcão sem documento): registro sem pessoa, reconciliável depois, ou
`cpf` anulável com estado explícito. Placeholder está fora de cogitação.
Os números de `scripts/contagens.sql` dizem quantas linhas isso afeta.
