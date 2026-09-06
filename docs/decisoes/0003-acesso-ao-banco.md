# 0003 — Dois modos de acesso ao banco, ambos com RLS ligada

**Situação.** O módulo `ciclo` é escopado por localidade e autoriza no
Postgres com RLS por linha, pelo cliente Supabase. O módulo `eventos` é
nacional, sem escopo geográfico, com 449 consultas SQL, quatro transações com
`FOR UPDATE`, relatórios com joins pesados e deduplicação em lote — nada disso
cabe no PostgREST, e RLS por linha não tem escopo natural no domínio.

**Decisão.**

| Módulo | Como fala com o banco | Onde a autorização acontece |
|---|---|---|
| `ciclo` | cliente Supabase com cookies (RLS por localidade) | matriz + policies por linha |
| `eventos` | Postgres direto pelo pooler (`src/lib/db.ts`), papel próprio | matriz, no servidor, antes de qualquer consulta |

Nas tabelas de `eventos` a RLS fica **ligada** e **não há GRANT** para `anon`
nem `authenticated`: o navegador nunca as alcança, e uma concessão futura por
engano não abre nada por omissão. É o mesmo padrão que o Ciclo usa para
tabelas de segredo.

**O que isto não permite.** Nenhum componente do navegador consulta tabela de
`eventos` direto. Toda leitura e escrita passa por Server Action ou rota com
`exigirCapacidade` na primeira linha.

**Quando revisar.** Se um dia o domínio de eventos ganhar escopo por regional
(operador que só vê a própria regional), as policies por linha entram aí, e o
papel de conexão passa a assumir a identidade da pessoa (`set role` /
`request.jwt.claims`). Não antes.
