# SNI Conecta

Plataforma única da SEICHO-NO-IE DO BRASIL. Um aplicativo Next 16, um banco
Supabase (Postgres, região São Paulo), módulos por pasta:

| Módulo | O que faz | Origem |
|---|---|---|
| `ciclo` | Ciclo de Estudos da Prosperidade: turmas, matrícula, aulas, provas, certificados | reescrita do sistema Ciclo (Supabase, ainda sem dados) |
| `eventos` | Inscrições em eventos: checkout público, venda balcão, check-in, vouchers, relatórios, estornos | migração do SNI Ciclo de Eventos (MySQL no Railway, em produção) |

O que é comum aos módulos vive no schema `public`, sem prefixo: pessoas, a
árvore de unidades (Sede Central → Regionais → Núcleos e Associações Locais),
organizações, papéis, auditoria, fila de notificações e configurações. Onde
ficam as tabelas de cada módulo é a decisão 0007; a estrutura institucional é
a 0008.

## Estado

A fundação está de pé: migração da plataforma aplicável e verificada,
primitivos de interface, e a tela de estrutura em `/admin/estrutura`. Os dois
módulos ainda não foram portados — o mapa de cada um está em
`docs/estudo/`, e o que ainda depende de resposta da Sede está em
`docs/estudo/estrutura-organizacional.md` §6.

## Desenvolvimento

```bash
cp .env.example .env.local   # preencha com o projeto Supabase de homologação
npm install
npm run dev
```

Antes de abrir PR: `npm run typecheck && npm test && npm run build`.
Mexeu em migração ou em policy: `sudo ./scripts/testar-rls.sh` — ele sobe um
Postgres, aplica tudo e fala com o banco como cada papel. Teste unitário não
alcança RLS.

## Como as coisas chegam à produção

Código em `github.com/viniveranno/sniconecta` (privado). Aplicação publicada
pela Vercel, projeto `sniconecta` da conta `agenciaveranno`, servindo
`sniconecta.com.br`.

- **Aplicação:** merge em `main` → Vercel publica.
- **Banco:** merge em `main` com arquivo novo em `supabase/migrations/` →
  GitHub Actions aplica (`.github/workflows/migrations.yml`). Ninguém roda SQL
  à mão.

⚠️ O GitHub e a Vercel estão em **contas diferentes**: o repositório é de
`viniveranno`, o projeto Vercel é de `agenciaveranno`. A publicação automática
só acontece enquanto o app Vercel do GitHub alcançar este repositório — e,
como ele é privado, quando essa concessão cai o GitHub responde "não
encontrado" e a Vercel para de publicar **em silêncio**, com o CI verde e o PR
fechado. Quem faz merge confere o deploy, não só o CI.
`docs/publicacao.md` traz os endereços, como conferir em dois minutos e como
consertar.

## Migração dos dados de eventos

`scripts/migrar-mysql.ts` lê o MySQL de origem (usuário só de leitura) e grava
no Supabase, em fases e de forma repetível. Roda na sua máquina ou por
`workflow_dispatch`; o dado não passa por terceiros. Ver `docs/migracao.md`.

## Leitura obrigatória

- `AGENTS.md` — regras do repositório, para pessoas e para agentes.
- `docs/decisoes/` — por que as coisas são como são.
- `docs/design-system.md` — a interface.
- `docs/publicacao.md` — onde o código mora e por onde ele chega ao ar.
