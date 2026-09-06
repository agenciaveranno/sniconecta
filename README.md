# SNI Conecta

Plataforma única da SEICHO-NO-IE DO BRASIL. Um aplicativo Next 16, um banco
Supabase (Postgres, região São Paulo), módulos por pasta:

| Módulo | O que faz | Origem |
|---|---|---|
| `ciclo` | Ciclo de Estudos da Prosperidade: turmas, matrícula, aulas, provas, certificados | reescrita do sistema Ciclo (Supabase, ainda sem dados) |
| `eventos` | Inscrições em eventos: checkout público, venda balcão, check-in, vouchers, relatórios, estornos | migração do SNI Ciclo de Eventos (MySQL no Railway, em produção) |

O que é comum aos módulos vive no schema `public`: pessoas, papéis, regionais,
localidades, auditoria, fila de notificações, configurações.

## Desenvolvimento

```bash
cp .env.example .env.local   # preencha com o projeto Supabase de homologação
npm install
npm run dev
```

Antes de abrir PR: `npm run typecheck && npm test && npm run build`.

## Como as coisas chegam à produção

- **Aplicação:** merge em `main` → Vercel publica.
- **Banco:** merge em `main` com arquivo novo em `supabase/migrations/` →
  GitHub Actions aplica (`.github/workflows/migrations.yml`). Ninguém roda SQL
  à mão.

## Migração dos dados de eventos

`scripts/migrar-mysql.ts` lê o MySQL de origem (usuário só de leitura) e grava
no Supabase, em fases e de forma repetível. Roda na sua máquina ou por
`workflow_dispatch`; o dado não passa por terceiros. Ver `docs/migracao.md`.

## Leitura obrigatória

- `AGENTS.md` — regras do repositório, para pessoas e para agentes.
- `docs/decisoes/` — por que as coisas são como são.
- `docs/design-system.md` — a interface.
