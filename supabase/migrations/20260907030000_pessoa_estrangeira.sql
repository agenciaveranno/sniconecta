-- ───────────────────────────────────────────────────────────────────────────
-- QUEM NÃO TEM CPF TAMBÉM É PESSOA (decisão 0013)
--
-- A fundação disse "CPF identifica", e para 16.672 das 16.676 pessoas da base
-- isso é verdade. As outras quatro são estrangeiras: não têm CPF, e nunca vão
-- ter. Do jeito anterior o cadastro as recusava — o que na prática significa
-- que a pessoa esteve no evento, pagou a inscrição, recebeu o certificado, e
-- o sistema diz que ela não existe.
--
-- A regra não muda, só deixa de supor UM documento: a pessoa é identificada
-- por CPF **ou** por passaporte, exatamente um dos dois. Com os dois, dois
-- cadastros da mesma pessoa poderiam existir sem colidir em nada; com nenhum,
-- não há como reconciliar uma segunda inscrição com a primeira, e é
-- justamente isso que o cadastro único existe para impedir.
--
-- Não há coluna `estrangeiro`. Ela seria derivável de `passaporte is not null`
-- e, por ser derivável, poderia discordar: uma pessoa marcada estrangeira com
-- CPF preenchido, e nada no banco percebendo. Quem pergunta "é estrangeira?"
-- pergunta ao passaporte.
-- ───────────────────────────────────────────────────────────────────────────

alter table pessoas add column passaporte text;

comment on column pessoas.passaporte is
  'Identifica quem não tem CPF. Maiúsculas e dígitos; único quando presente.';

-- CPF deixa de ser obrigatório, e continua único: NULL não colide com NULL em
-- índice único, então quem não tem CPF não disputa a vaga de ninguém.
alter table pessoas alter column cpf drop not null;

alter table pessoas drop constraint cpf_11_digitos;
alter table pessoas add constraint cpf_11_digitos
  check (cpf is null or cpf ~ '^[0-9]{11}$');

-- ⚠️ Formato solto de propósito: passaporte não tem forma única no mundo, e
-- cada país emite o seu. Apertar aqui recusaria documento legítimo na
-- recepção do evento, com a pessoa na frente do balcão. O que o banco garante
-- é que não é lixo e não é ambíguo — sem espaço, sem pontuação, caixa alta.
alter table pessoas add constraint passaporte_formato
  check (passaporte is null or passaporte ~ '^[A-Z0-9]{5,20}$');

-- Exatamente um documento. O `or` faria os dois preenchidos passarem, e aí a
-- mesma pessoa caberia duas vezes na tabela: uma pelo CPF, outra pelo
-- passaporte, sem colidir em nada.
alter table pessoas add constraint documento_unico
  check ((cpf is null) <> (passaporte is null));

-- Único quando presente, como o CPF. Índice parcial porque a esmagadora
-- maioria das linhas tem NULL aqui, e um índice cheio de NULL só ocupa espaço.
create unique index uq_pessoa_passaporte on pessoas (passaporte)
  where passaporte is not null;

comment on table pessoas is
  'Cadastro único. CPF identifica quem tem, passaporte identifica quem não '
  'tem, id referencia. Importar não significa criar conta: conta nasce '
  'quando alguém precisa entrar.';
