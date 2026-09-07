# 0012 — A conta do evento vem de quem promove, não do evento

*Aceita em 07/09/2026. Complementa a decisão 0010.*

## Problema

Na origem, `Evento.cieloAccountId` aponta direto para uma conta Cielo, e
`Local.contaCielo` é um texto solto. Traduzir isso literalmente manteria uma
armadilha: dois eventos da mesma Regional poderiam apontar para contas
diferentes sem ninguém perceber, e o dinheiro de um deles cairia no lugar
errado — descoberto no fechamento, semanas depois.

A decisão 0010 já estabeleceu que a conta é **da entidade**: cada Organização,
cada Regional e cada Academia tem a sua. Falta dizer como o evento chega até
ela.

## Decisão

**O evento declara QUEM PROMOVE, não em qual conta recebe.** As colunas são o
mesmo trio de `public.credenciais` — `promotor_organizacao_id`,
`promotor_unidade_id`, `promotor_local_id`, no máximo um preenchido. A conta
sai daí.

Duas consequências que valem o desenho:

- **A conta não pode divergir por evento.** Trocar a conta da Regional passa a
  valer para tudo que ela promove, que é o comportamento que a instituição
  espera — e o único que não exige revisar evento a evento.
- **A pergunta "de quem é este evento?" ganha resposta.** Na origem ela não
  tinha: `Promotor` era nome, telefone e e-mail em texto livre, sem vínculo
  com a estrutura institucional.

**Onde acontece é outra coisa.** `local_id` aponta para `public.locais` — a
Academia, o hotel, o salão alugado. Uma Regional pode promover um evento numa
Academia, e são duas entidades diferentes com contas diferentes. Conflatar as
duas faria o dinheiro seguir o endereço em vez de seguir quem organiza.

**O promotor é anulável durante a carga.** Os `Promotor` antigos não têm
vínculo com a estrutura, e adivinhar seria pior que deixar em branco: um
evento atribuído à Regional errada manda o dinheiro para a conta errada.
Enquanto não houver promotor, o evento **não vende** e a tela diz por quê. A
conciliação é trabalho de tela, com uma pessoa decidindo caso a caso.

## Consequências

- A venda precisa resolver a conta antes de cobrar. Sem conta, a mensagem tem
  de dizer "esta Regional ainda não tem conta cadastrada" — não "erro ao
  processar".
- `eventos.contas_cielo`, que existia no rascunho, não é criada. A conta vive
  em `public.credenciais`, cifrada e sem GRANT, para os dois módulos.
- A carga transporta a conta única que existe hoje para `credenciais`, e deixa
  o apontamento para o cadastro.
