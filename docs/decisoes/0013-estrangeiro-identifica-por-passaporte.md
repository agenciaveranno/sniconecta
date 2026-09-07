# 0013 — Quem não tem CPF identifica por passaporte

**Data:** 2026-09-07
**Situação:** aceita
**Decide:** Sede (SEICHO-NO-IE DO BRASIL)

## Problema

A decisão de fundação diz que **CPF identifica**. Para 16.672 das 16.676
pessoas da base do Credenciamento isso é verdade. As outras quatro são
estrangeiras: não têm CPF e nunca vão ter.

Do jeito anterior o cadastro as recusava. Na prática isso quer dizer que a
pessoa esteve no evento, pagou a inscrição, recebeu o certificado — e o
sistema afirma que ela não existe. Quatro pessoas hoje; a instituição recebe
visitantes de outros países todo ano, e o número só cresce.

## Decisão

A pessoa é identificada por **CPF ou por passaporte, exatamente um dos dois**.

- `pessoas.cpf` deixa de ser obrigatório e continua único.
- `pessoas.passaporte` nasce único quando presente.
- `check ((cpf is null) <> (passaporte is null))` — nem nenhum, nem os dois.

## Por que exatamente um, e não "pelo menos um"

**Com nenhum documento**, não há como reconciliar a segunda inscrição da mesma
pessoa com a primeira. É exatamente o que o cadastro único existe para
impedir: sem chave, cada evento cria uma pessoa nova, e o histórico de quem
frequenta há vinte anos vira vinte pessoas diferentes.

**Com os dois preenchidos**, a mesma pessoa cabe duas vezes na tabela — uma
linha pelo CPF, outra pelo passaporte — e nenhum índice reclama. O `or` que
parecia generoso é o que abre a porta para a duplicata.

## Por que NÃO existe uma coluna `estrangeiro`

Ela seria derivável de `passaporte is not null`, e por ser derivável poderia
**discordar**: uma pessoa marcada como estrangeira com CPF preenchido, e nada
no banco percebendo. É o mesmo erro que a decisão 0008 evita ao guardar a
organização só na Associação Local.

Na tela existe um botão de duas posições — é a pergunta que a pessoa do balcão
faz. Ele escolhe qual campo aparece; o que fica gravado é o documento.

## Por que o formato do passaporte é solto

`^[A-Z0-9]{5,20}$`. Passaporte não tem forma única no mundo — cada país emite
o seu, com letras e dígitos em ordens diferentes. Apertar a regra recusaria
documento legítimo na recepção do evento, com a pessoa parada na frente do
balcão. O que o banco garante é que não é lixo e não é ambíguo: sem espaço,
sem pontuação, caixa alta sempre.

O CPF continua com dígito verificador conferido na entrada. A diferença não é
descuido: CPF **tem** um verificador matemático, passaporte não tem.

## Consequência para a carga do Credenciamento

As quatro pessoas continuam de fora da carga automática: **o sistema de origem
não tem campo de passaporte**, então não há o que migrar. Elas entram pela
tela, uma a uma, com o documento na mão. Quatro cadastros manuais é trabalho
de minutos; inventar documento para elas seria dado falso para sempre.

## Como se reverte

Se a Sede decidir que estrangeiro não se cadastra, some `documento_unico`,
volta o `not null` do CPF e apaga a coluna. Nenhuma tabela aponta para
`passaporte` — é atributo, não chave estrangeira.
