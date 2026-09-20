# 0020 — O evento é página, não modal

**Data:** 2026-09-20
**Situação:** aceita
**Decide:** Sede (SEICHO-NO-IE DO BRASIL)
**Altera:** a regra "todo cadastro acontece em modal" (`docs/design-system.md`),
pela terceira vez — antes vieram a ficha da pessoa (0015) e a unidade (0019).

## Problema

O evento nasceu cabendo num modal: nome, duas datas, onde acontece e quem
promove. Cinco campos.

Só que um evento assim **não vende nada**. Falta o que diz o que se compra: os
tipos de ingresso. E com eles vêm os campos que a compra pergunta, os combos,
os cupons, a comissão e o voucher — que sozinho traz nove colunas, duas delas
de imagem.

Empilhar isso na mesma caixa repetiria exatamente o que a decisão 0019
descreveu na unidade: quem vinha corrigir a data do evento passaria por tudo.

E havia um problema mais concreto que o incômodo: **não existia tela para
criar tipo de ingresso**. Os seis que existem vieram todos da carga, do sistema
antigo. Um evento novo, cadastrado aqui, nascia sem nenhum — e sem como ganhar
um. A plataforma cadastrava eventos que não vendiam.

## Decisão

**O evento é uma página dedicada**, em `/eventos/admin/[id]`, com abas:

- **Dados do evento** — o que era o modal de editar.
- **Ingressos** — os tipos de ingresso, com valor, janela de venda, faixa
  etária e papel.

As abas que faltam entram aqui conforme as fatias avançam: campos da compra,
combos, cupons, comissão e voucher.

**Criar continua em modal**, na lista. Nascer é um punhado de campos.

## O critério da 0015 e da 0019, aplicado

Vira página quem tiver **duas** destas. O evento tem as quatro:

- passa de ~15 campos — com o voucher, passa de vinte;
- tem upload de arquivo — banner e logotipo do voucher;
- tem mais de um assunto dentro — cadastro, ingressos, compra, comissão;
- precisa de URL própria — "me manda o Seminário de Verão" vira um link.

O critério continua sendo o que impede a decisão de virar "cada tela do jeito
que deu". As três exceções registradas até aqui passaram por ele.

## O que a tela avisa antes da venda, e não durante

Duas coisas deixam um evento sem vender, e as duas só apareciam no balcão:

- **Sem promotor** — é ele que diz em qual conta Cielo o dinheiro cai
  (decisão 0012).
- **Sem nenhum ingresso principal ativo** — `adicional` só pode ser comprado
  acompanhando um `principal`. Um evento só com jantar e transporte não vende
  nem jantar nem transporte.

As duas viram aviso na aba Ingressos. Quem está no balcão com a fila na frente
não tem como resolver nenhuma das duas.

## Fuso na janela de venda

`venda_inicio` e `venda_fim` são `timestamptz`, o formulário manda
`datetime-local` (sem fuso) e a conexão do módulo não fixa fuso — o padrão do
Supabase é UTC. Gravado cru, "10:00" viraria 10h UTC, e a venda marcada para as
dez abriria às sete da manhã em Brasília, sem erro nenhum aparecer.

A gravação e a leitura nomeiam a zona: `at time zone 'America/Sao_Paulo'`.
**Nomear a zona, e não fixar `-03:00`:** o Brasil não tem horário de verão desde
2019, mas se voltar a ter, quem acerta é o banco — não uma constante nossa que
ninguém lembraria de mudar.

## Nulo e zero não são a mesma coisa

`quantidade` nula é **sem limite**; zero é **esgotado**. A tela mostra as duas
diferente e o campo não tem valor padrão — um `0` pré-preenchido criaria o tipo
de ingresso já sem nada à venda.

## O que NÃO muda

- O modal continua sendo o padrão do sistema para todo o resto.
- Desativar continua desativando, nunca apagando — e aqui o banco já obrigava:
  `inscricoes.ingresso_tipo_id` é `on delete restrict`.
- Server Action continua começando com `exigirCapacidade(...)`.
- As abas continuam sendo URL (`?aba=ingressos`), renderizadas no servidor.
