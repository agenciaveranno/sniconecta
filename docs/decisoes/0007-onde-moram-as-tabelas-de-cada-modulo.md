# 0007 — Onde moram as tabelas de cada módulo

**Situação.** Duas sessões chegaram a respostas opostas para a mesma pergunta.
O esqueleto deste repositório escreveu `AGENTS.md` e o rascunho de eventos
supondo **schema por módulo** (`eventos.matriculas`). O plano de fundação
escrito pela sessão do Ciclo (`docs/SNICONECTA-FUNDACAO.md` §1.3) recomenda
**prefixo em `public`** (`ciclo_matriculas`), por ter menos atrito com a
plataforma. Sem resolver isso, nenhuma migração pode ser escrita.

**O fato técnico que decide.** O cliente Supabase fala com o PostgREST, e
`.schema('x')` envia o cabeçalho `Accept-Profile`
(`node_modules/@supabase/postgrest-js/src/PostgrestClient.ts:287`): **cada
requisição tem um único schema ativo**, e o PostgREST resolve as relações
embutidas dentro dele. O módulo `ciclo` é feito de consultas aninhadas —
`turmas(edicoes(localidades(nome)))`, `matriculas!inner`, `pessoas:autor_id`.
Se as tabelas do Ciclo forem para um schema `ciclo`, toda consulta que embute
`pessoas` — que está em `public` e é a espinha da plataforma — deixa de
resolver. São dezenas de consultas, e o erro só aparece em execução.

**Decisão.** O lugar da tabela segue o **modo de acesso** do módulo, que a
decisão 0003 já estabeleceu como o eixo:

| Como o módulo fala com o banco | Onde ficam as tabelas | Por quê |
|---|---|---|
| Cliente Supabase (PostgREST, RLS por linha) — hoje `ciclo` | `public`, com prefixo `<modulo>_` | Precisa embutir `pessoas`, e embutir só funciona dentro do schema ativo |
| Postgres direto pelo pooler — hoje `eventos` | schema próprio, **não exposto** ao PostgREST | Não usa embutimento; e o schema fora da exposição é a barreira mais forte que existe |
| Plataforma (comum aos dois) | `public`, sem prefixo | `pessoas`, `unidades`, `papeis`, `auditoria`, `notificacoes`, `configuracoes` |

**Módulo novo escolhe pelo acesso, não pelo gosto.** Vai consultar pelo
navegador com RLS? Prefixo em `public`. Vai falar SQL direto do servidor?
Schema próprio.

**O que substitui o isolamento que o schema dava ao Ciclo.** Um schema não
exposto é uma barreira que não depende de disciplina; um prefixo é convenção.
Para o prefixo valer o mesmo, três regras entram juntas:

1. **Nenhum `alter default privileges` geral em `public`.** O Ciclo tem um
   (`0014_grants_explicitos.sql`) que concede as quatro operações a toda
   tabela nova, e é por isso que hoje `authenticated` escreve em 44 tabelas —
   a escrita só não acontece porque falta policy. Aqui, tabela nova nasce sem
   privilégio nenhum.
2. **GRANT explícito, tabela a tabela**, na mesma migração que a cria.
3. **O harness de RLS confere a superfície de GRANT**: qualquer tabela fora da
   lista declarada que tenha privilégio para `anon` ou `authenticated` reprova
   a suíte. É o que torna a regra mecânica em vez de lembrada.

**Alternativa recusada — schema para todos.** Mais bonito e realmente isolado,
mas quebra o embutimento de `pessoas` no Ciclo. Apostar que o PostgREST
resolve relação entre schemas é apostar a espinha da plataforma num
comportamento que falha só em produção, consulta por consulta.

**Alternativa recusada — prefixo para todos.** Uniforme, e teria funcionado.
Recusada porque o módulo `eventos` não ganha nada com isso e perde a única
barreira que não depende de ninguém lembrar: com o schema fora da exposição, o
navegador não alcança aquelas tabelas nem se um GRANT for concedido por
engano.

**Consequência.** O rascunho `supabase/rascunhos/eventos_schema.sql` continua
valendo como está. As tabelas do Ciclo entram em `public` com prefixo `ciclo_`,
e as consultas aninhadas do módulo seguem funcionando sem reescrita. O
`AGENTS.md` passa a descrever a regra pelos dois casos, não por um só.
