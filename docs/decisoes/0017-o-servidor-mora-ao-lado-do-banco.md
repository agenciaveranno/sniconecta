# 0017 — O servidor mora ao lado do banco

**Data:** 2026-09-07
**Situação:** aceita
**Decide:** arquitetura

## Problema

A navegação estava lenta, e não era o volume de dado: eram **quilômetros**.

O banco Supabase é `sa-east-1` — São Paulo. A Vercel, sem configuração de
região, executa as funções em `iad1` — Washington. Cada consulta ao banco
atravessava o Atlântico duas vezes: cerca de **120 ms de rede pura por ida e
volta**, antes de o Postgres sequer olhar a tabela.

E não era uma ida por tela. Uma navegação para `/admin/pessoas` fazia, **uma
depois da outra**:

| Onde | Quantas |
|---|---|
| Proxy de sessão, validando o token no Auth | 1 |
| `pessoaAtual()`: token, pessoa, papéis | 3 |
| A página: pessoas, papéis, vínculos, tipos, associações, unidades | 6 |

Dez idas e voltas **em série** — mais de um segundo de tela em branco em que
nada acontecia além de esperar a luz atravessar o oceano. Nenhum índice, nenhum
cache e nenhuma tela mais enxuta resolveriam isso: o custo não estava no banco
nem no navegador, estava no meio.

## Decisão

**1. A função roda em `gru1` (São Paulo).** Uma linha em `vercel.json`. A ida e
volta cai de ~120 ms para poucos milissegundos, e as dez continuam dez — só que
agora imperceptíveis. É a correção de maior efeito e menor risco, e nenhuma
outra otimização faz sentido antes dela: sem isto, cada consulta que alguém
acrescentar amanhã custa mais um oceano.

⚠️ Isto **não** é enfeite de configuração: apagar a chave `regions` devolve o
sistema a Washington, em silêncio, e a lentidão volta sem que nada quebre. Por
isso tem teste.

**2. Consulta que não depende de outra vai junto, com `Promise.all`.** Estavam
em série por hábito de escrita, não por dependência. Vale mesmo com o servidor
ao lado do banco: em série, cada tela nova soma seu tempo ao total; juntas,
somam o da mais lenta.

**3. Os papéis vêm embutidos na consulta da pessoa.** `pessoaAtual()` roda em
TODA página do painel, e fazia duas consultas em série para responder uma
pergunta só. Agora é uma.

⚠️ O filtro `papeis.ativo` é sobre a relação embutida, **sem `!inner`**: com
`!inner`, quem não tem papel nenhum sumiria do resultado e o sistema a trataria
como quem nunca entrou.

## Consequências

- Quem acessa de fora do Brasil paga um pouco mais para chegar ao servidor. É a
  troca certa: a instituição é brasileira, e quem usa o sistema todo dia está
  aqui.
- A Vercel no plano Hobby aceita **uma** região. Se um dia for preciso servir
  outro continente, a resposta é replicar leitura, não espalhar função para
  longe do banco.
- Fica registrado, para não se refazer a análise: **antes de otimizar consulta,
  conferir a distância.** Índice não conserta geografia.

## O que ficou de fora

`getClaims()` valida o token localmente, sem rede, **se** o projeto usar chave
assimétrica de assinatura. Como o projeto ainda pode estar na chave simétrica —
onde `getClaims()` faz exatamente a mesma chamada de rede que `getUser()` —, a
troca não foi feita às cegas. Vale revisitar depois de conferir a configuração
de assinatura no painel do Supabase; com a função em São Paulo, o ganho passou
a ser pequeno.
