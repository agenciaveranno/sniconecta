# Migrações

SQL puro, um arquivo por mudança, nome `AAAAMMDDHHMMSS_o_que_muda.sql`.
Aplicadas em ordem pelo workflow `migrations.yml` no merge para `main`.

## Ordem combinada entre os módulos

1. **Schema comum (`public`)** vem do módulo `ciclo`: `pessoas`, `papeis`,
   `regionais`, `localidades`, `auditoria`, `notificacoes`, `configuracoes`,
   funções `app.*` de autorização, GRANTs padrão. A sessão do `ciclo` traz as
   migrações dela para cá com o prefixo de data original, então elas ficam
   naturalmente antes das demais.
2. **Ajustes do comum decididos para a plataforma**, em migração nova:
   `pessoas.email` anulável (obrigatório só quando `auth_user_id` existe) e
   os tipos de papel do módulo `eventos`. Ver `docs/decisoes/0004-pessoas.md`.
3. **Schema `eventos`**: hoje em `supabase/rascunhos/eventos_schema.sql`.
   Vira migração quando os passos 1 e 2 estiverem na `main`.

Enquanto o passo 1 não chega, esta pasta fica só com este arquivo, de
propósito: uma migração de `eventos` aplicada antes de `pessoas` existir
derrubaria o workflow.

## Cada arquivo abre com um cabeçalho

```sql
-- Por quê: ...
-- O que aconteceria sem isto: ...
```

O SQL diz o quê; o cabeçalho diz por quê.
