# 0021 — O código do ingresso é sorteado, e quem o sorteia é o banco

*2026-09-21 · aceita*

## Contexto

`eventos.inscricoes.qr_code` existe desde a fundação do módulo e estava VAZIA
para tudo que esta plataforma vendeu: a coluna veio preenchida só para os
ingressos importados do sistema antigo. A porta, por isso, sabia procurar
apenas por documento ou nome, e o balcão entregava um ingresso sem nada que se
lesse.

Três perguntas estavam em aberto: o que vai dentro do código, quem o gera, e o
que fazer com os códigos que a carga trouxe.

## Decisão

**O código é sorteado e não diz nada sobre quem o carrega.**
`SNI-XXXX-XXXX-XXXX-XXXX`, hexadecimal em caixa alta, 64 bits de sorteio.

- **Não é o `id`.** Identificador sequencial deixa qualquer pessoa imprimir um
  ingresso plausível somando um ao que recebeu.
- **Não é o CPF, nem deriva dele.** A imagem do QR acaba fotografada e
  repassada em grupo de família e de WhatsApp; o que estiver dentro dela vai
  junto.
- **Hexadecimal, e não base32 ou base64.** Na porta o código é DITADO quando a
  câmera falha, e `0-9A-F` não tem par ambíguo — não existe O contra 0 nem I
  contra 1. Os quatro grupos de quatro existem para que quem dita e quem digita
  se achem no meio da sequência.

**Quem gera é o BANCO, por `default`, e não a aplicação.** Gerado em
TypeScript, o formato existiria em tantos lugares quantos criassem inscrição —
a venda balcão, a transferência entre eventos, o checkout público — e a
primeira cópia que divergisse produziria ingresso que a porta não lê. Com o
default, toda linha nova nasce com código sem ninguém precisar lembrar, e o
harness de RLS reprova antes do merge se o default sumir.

**Os códigos da carga ficam como estão.** Reescrevê-los invalidaria ingressos
já emitidos que circularam: a pessoa chega na porta com o papel na mão e o
código não existe mais em lugar nenhum. A porta aceita os dois formatos porque
compara o texto, não o formato.

**Não há índice único.** Os códigos antigos vêm de fora e não há como conferir
daqui se algum se repete; um `create unique index` que encontrasse repetição
derrubaria a migração DEPOIS do merge, com o deploy já publicado. O índice é
comum, a busca da porta trata o caso de dois resultados, e o harness afirma a
ausência de repetição a cada execução — que é onde a garantia cabe.

## Consequências

- A porta procura por código, documento, nome ou número do convite **no mesmo
  campo**. O leitor de QR é um teclado: ele digita no campo com foco e aperta
  enter. Dois campos obrigariam um clique por leitura, com a fila andando.
- O código aparece na linha da porta para conferência a olho — duas inscrições
  da mesma pessoa no mesmo evento são o caso comum, não o raro.
- Quem emitir comprovante imprime este código. O comprovante é fatia própria.
- Se um dia for preciso invalidar um ingresso específico sem cancelar a
  inscrição, basta sortear outro código: é uma coluna, não uma identidade.
