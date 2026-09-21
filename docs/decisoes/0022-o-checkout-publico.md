# 0022 — O checkout público: o desenho, e por que ele não foi construído sozinho

*2026-09-21 · proposta — falta a decisão de quem responde pelo dinheiro*

## Contexto

O módulo `eventos` está operacionalmente completo: cadastro, venda balcão,
combo, cupom, check-in com código, comprovante impresso, transferência,
cancelamento com estorno, perguntas da compra, relatórios e a página pública
do evento. Tudo isso roda contra um Postgres de verdade no CI (#67, #68, #69).

Falta uma coisa: **comprar pelo site**. A fundação já reservou o lugar dela —
`/e/`, `/comprar`, `/r/` e `/descadastro` estão na lista de rotas públicas do
proxy desde o primeiro dia; `eventos.pedidos`, `eventos.magic_links` e
`eventos.carrinhos_abandonados` existem no esquema; e a decisão 0010 já diz que
a conta Cielo é do **promotor**, não da instituição.

## Por que esta decisão não foi tomada sozinha

Esta é a única parte do sistema que **move dinheiro de terceiros através de um
serviço que não dá para exercitar daqui**. As outras coisas que mexem em
dinheiro — a venda balcão, o rateio do cupom, o estorno — são aritmética e SQL,
e hoje rodam contra um banco real a cada PR. A chamada à Cielo não é: ela
depende de credencial de produção, de um cartão de teste, e de um comportamento
(3DS, antifraude, ciclo do PIX, assinatura do webhook) que só o gateway
responde.

Código de pagamento escrito de memória, publicado sem nunca ter feito uma
chamada, é pior que código ausente: ele **parece pronto**. Alguém liga, e a
primeira pessoa que compra é o teste.

⚠️ E há um segundo motivo, menor mas real: um checkout público que **reserva
estoque antes de pagar** é uma porta para esgotar o ingresso de um evento sem
gastar um centavo. Isso precisa de expiração de pedido e de um teto por
sessão — decisões de operação que não se inventam de madrugada.

## O desenho proposto

### 1. Quem compra não tem conta

Já está escrito no `AGENTS.md`: *"Comprador do checkout público não tem conta:
autentica por magic link próprio do módulo `eventos`"*. A tabela
`eventos.magic_links` existe para isso.

⚠️ O link é **do pedido**, não da pessoa. Um link que autentica a pessoa vira
uma sessão sem senha que circula por e-mail; um link que abre **um pedido**
expira com ele e não serve para mais nada. É a mesma lógica do código do
ingresso (decisão 0021): identificador opaco, curto, sem significado.

### 2. O pedido nasce antes do pagamento, e expira

`eventos.pedidos` guarda a intenção com `participantes` em `jsonb`, porque eles
ainda não são inscrição. O comentário da fundação já explica: *"sem esta
tabela, uma queda no meio do pagamento perderia o que a pessoa digitou — e o
PIX, que confirma minutos depois, não teria onde esperar"*.

⚠️ **O pedido pendente NÃO segura estoque.** Segurar abre a porta acima; não
segurar cria a corrida em que duas pessoas pagam a última vaga. A resposta é a
mesma da venda balcão: quem decide é o `select … for update` **no momento de
virar inscrição**, e quem perder a corrida recebe estorno automático com uma
frase que explica. Isso é mais honesto que uma reserva que expira sem aviso.

### 3. O pagamento é do promotor, não da instituição

Decisão 0010. A credencial sai de `credenciais` pelo dono do evento, e é aberta
no ponto de uso (`abrirSegredo`), como o SMTP do #66.

⚠️ Um evento sem promotor **não vende** — `porQueNaoVende` já diz isso, e a
página pública já recusa. Não há caminho em que o dinheiro caia numa conta que
ninguém escolheu.

### 4. Quem confirma é o webhook, não o navegador

O retorno do navegador é uma **dica**, não um fato: ele pode não voltar (o
aplicativo do banco engoliu a aba), voltar duas vezes, ou ser forjado. Quem
transforma pedido em inscrição é o webhook da Cielo, fora do proxy de sessão,
com 401/503 próprios — como o cron de notificações (`AGENTS.md`).

⚠️ E **idempotente por `order_id`**: a Cielo reenvia. Duas confirmações do
mesmo pedido não podem virar duas inscrições, e a garantia tem de estar na
gravação (`where status = 'pendente'`), não no código que lê antes.

### 5. As perguntas da compra são respondidas aqui

É o lugar certo delas (#62): no balcão, perguntar cinco coisas por ingresso é o
que faz a fila parar; no site, não custa fila a ninguém.

## O que falta decidir — e é de quem responde pelo dinheiro

1. **Métodos.** Cartão, PIX, ou os dois? Parcelamento até quantas vezes, e com
   juros de quem? `ingresso_tipos.max_parcelas` já existe e ninguém preencheu.
2. **Antifraude.** A Cielo oferece; custa por transação. Liga?
3. **O que acontece com quem perde a corrida da última vaga:** estorno
   automático, ou fila de espera?
4. **Prazo do pedido pendente** — o PIX expira em quanto tempo?
5. **Ambiente de teste.** Credencial de sandbox e um cartão de teste, para a
   primeira compra de verdade não ser a de um membro.

## Consequências

- Enquanto isso não existe, a página pública **diz** que a compra é presencial,
  em vez de oferecer um botão que não leva a lugar nenhum (#64).
- Nada do que já está publicado depende disto. O balcão vende, a porta lê, o
  comprovante sai, o e-mail avisa.
- Quando for construído, o teste de integração (#67–#69) já tem a estrutura: o
  `banco-de-teste.sh` sobe o esquema, e a Cielo entra por uma interface que o
  teste substitui — a chamada de rede é a única coisa que não se exercita, e é
  a única que precisa ficar atrás de uma porta.
