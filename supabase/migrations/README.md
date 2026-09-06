# Migrações

SQL puro, um arquivo por mudança, nome `AAAAMMDDHHMMSS_o_que_muda.sql`.
Aplicadas em ordem pelo workflow `migrations.yml` no merge para `main`.
**Ninguém roda SQL à mão em produção.**

## O que já está aqui

| Arquivo | O que traz |
|---|---|
| `20260906190000_fundacao_plataforma.sql` | O comum: `pessoas`, a árvore de `unidades`, `organizacoes`, vínculos, funções doutrinárias, `papeis` com catálogo, `locais`, auditoria, fila de notificações, configuração, consentimento e pedidos de exclusão — com RLS, GRANT explícito e as funções `app.*` de autorização. |

## O que vem depois, e em que ordem

1. **Schema `eventos`** — hoje em `supabase/rascunhos/eventos_schema.sql`.
   Depende da fundação, porque `inscricoes.pessoa_id` aponta para `pessoas`.
2. **Tabelas do módulo `ciclo`**, com prefixo `ciclo_` em `public` (decisão
   0007): edições, turmas, matrículas, grade, provas, certificados.

## Onde a tabela mora (decisão 0007)

Segue o modo de acesso do módulo, não o gosto de quem escreve:

- fala pelo cliente Supabase → `public` com prefixo (`ciclo_*`), porque o
  PostgREST só embute relação dentro do schema ativo e todo módulo precisa
  embutir `pessoas`;
- fala Postgres direto pelo pooler → schema próprio, não exposto (`eventos.*`);
- comum a todos → `public`, sem prefixo.

## Toda tabela nova nasce com

`enable row level security`, policies, **GRANT explícito** e asserção em
`scripts/testar-rls.sh`. **Nunca um `alter default privileges` geral**: ele
concede a toda tabela futura, inclusive à que ninguém revisou. O harness
reprova qualquer tabela que ganhe privilégio sem estar declarada.

## Cada arquivo abre com um cabeçalho

```sql
-- Por quê: ...
-- O que aconteceria sem isto: ...
```

O SQL diz o quê; o cabeçalho diz por quê.
