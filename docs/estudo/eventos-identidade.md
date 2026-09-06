# Estudo — identidade, acesso e pessoas no sistema de eventos (`sni-ciclo`)

Recorte: como o sistema de credenciamento para eventos (repositório
`/home/user/sni-ciclo`, MySQL no Railway, **em produção** com mais de 16 mil
pessoas) trata **quem opera** (User/Perfil/permissões), **quem participa**
(Participant, importação, deduplicação, busca), a **estrutura** que ele conhece
(Regional, Organização, associação local), o **acesso sem conta** do comprador
(magic link, token de voucher, opt-out) e a **auditoria** — e como cada uma
dessas peças cai na plataforma SNI Conecta (`/home/user/sniconecta`).

Este documento é a base para **reescrever** essa parte. Por isso lista cada
tabela, coluna, rota, função exportada e regra, com caminho e linha. O que não
foi encontrado está dito como não encontrado.

## 0. Fonte, método e o que NÃO foi encontrado

| Item | Valor |
|---|---|
| Repositório lido | `/home/user/sni-ciclo`, último commit `82a8036` (2026-09-04, "Merge pull request #90 … claude/novos-parametros-design-i4hkg5") |
| Stack | Next `16.2.2`, React `19.2.4`, `next-auth ^4.24.13`, `bcryptjs ^3.0.3`, `mysql2 ^3.11.0`, `xlsx ^0.18.5`, `nodemailer ^7.0.13` (`package.json:12-33`); sem ORM (`src/lib/prisma.ts:1-2` é arquivo vazio "legacy") |
| Tamanho | 97 `route.ts` em `src/app/api`, 42 `page.tsx` em `src/app` |
| Esquema | não há migrações versionadas: `src/app/api/migrate/route.ts` (1 300 linhas) é um `POST` idempotente com `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` em `try/catch`, disparado **pelas telas** (`admin/usuarios/page.tsx:54`, `admin/perfis/page.tsx:38`, `admin/regionais/page.tsx:49`, `admin/auditoria/page.tsx:44`, `participantes/page.tsx:98`, `participantes/importar/page.tsx:66`) e protegido pela permissão `configuracoes` (`migrate/route.ts:9`) |
| Esqueleto comparado | `/home/user/sniconecta`, branch `claude/novo-sistema-ambiente-sz4q9y`, commit `0fc023f` (2026-09-06) |
| Contagens exatas | 93 chamadas `requirePermissao(` + 1 `requirePermissaoAny(` em 63 arquivos de `src/app`; 26 chamadas `logAudit({` fora de `src/lib/audit.ts` |

**O que este recorte procurou e não achou:**

| Procurado | Situação |
|---|---|
| `CREATE TABLE Participant` no `migrate/route.ts` | **Não existe.** O migrate só altera a tabela (l.178-210, 760, 1076). A criação está em `server.js:16-40` (rodado por `npm start`, `package.json:8`, ou seja, na era Railway; na Vercel `server.js` não roda) e, mais antiga ainda, em `prisma/migrations/20260402004532_init/migration.sql:2-26` (SQLite, com `cpf UNIQUE`). |
| `.env.example` | não existe. Variáveis inferidas do código: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`/`AUTH_SECRET`, `CRON_SECRET`, `WHATSAPP_*`, `CIELO_*`, `SMTP_*` (README.md e `SNI-CONECTA-INTEGRACAO.md:250-269`). |
| Tabela `Usuario` com `role`/`regional` (prometida em `SNI-CONECTA-INTEGRACAO.md:387-392`) | **não existe**; o que existe é `User` + `Perfil` (§1.1). Aquele documento (23/05/2026) está desatualizado: diz "usuário único hardcoded" e "sem roles" (l.222-224), o que já não é verdade. |
| Hash do token do magic link | **não há**: `MagicLink.token` é gravado em texto puro (§4.3). |
| Auditoria de edição/exclusão de participante, de usuário, de regional, de organização, de login e de deduplicação | **não há** `logAudit` nesses caminhos (§5.2). |
| Chave de permissão para "ver ficha do participante" separada de "cadastrar/editar/excluir/importar/deduplicar/transferir" | **não há**: é tudo `participantes` (§1.3). |
| Proteção de página para `/admin/**` e `/venda` no proxy | **não há**: o `matcher` só cobre cinco prefixos (§1.6). |
| Coluna de CPF em `User` | **não há** (`migrate/route.ts:540-550`). Operador não é pessoa cadastrada. |
| `usePreferenciaUsuario(` fora de `tema.ts` e `relatorios/page.tsx` | só esses dois usos (§4.7). |

Tudo o mais aqui descrito foi lido nos arquivos citados.

---

## 1. Modelo User / Perfil / permissões

### 1.1 Tabelas

**`User`** — `src/app/api/migrate/route.ts:540-550`

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | vira `token.sub` do JWT e `session.user.id` (`auth.ts:135`) |
| `nome` | VARCHAR(255) NOT NULL | |
| `username` | VARCHAR(100) NOT NULL | `UNIQUE KEY uniq_username`; regex de criação `^[a-z0-9._-]{3,100}$` (`api/users/route.ts:44`); **não pode ser alterado** depois (tela `admin/usuarios/page.tsx:214,220`; o `PUT` nem recebe `username`, `api/users/[id]/route.ts:15-37`) |
| `email` | VARCHAR(255) NULL | opcional. Quando nulo, a sessão recebe `` `${username}@sni.local` `` (`auth.ts:83`) — e-mail **fictício** que acaba gravado em `AuditLog.userEmail` e em colunas como `canceladoPor` (§5.3) |
| `passwordHash` | VARCHAR(255) NOT NULL | bcrypt custo 10 (`api/users/route.ts:54`, `[id]/route.ts:28`); senha mínima 6 caracteres (`route.ts:50`, `[id]/route.ts:25`) |
| `ativo` | TINYINT(1) NOT NULL DEFAULT 1 | só `ativo = 1` loga (`auth.ts:76`) |
| `createdAt` | DATETIME DEFAULT CURRENT_TIMESTAMP | |
| `perfilId` | INT NULL | adicionada em `migrate/route.ts:869`; **sem FK**; `NULL` = **acesso total** (§1.4) |

**`Perfil`** — `migrate/route.ts:852-859`

| Coluna | Tipo | Regras |
|---|---|---|
| `id` | INT AUTO_INCREMENT PK | |
| `nome` | VARCHAR(255) NOT NULL | `UNIQUE KEY uniq_nome` → 409 "Já existe um perfil com esse nome" (`api/perfis/route.ts:41-43`) |
| `isAdmin` | TINYINT(1) NOT NULL DEFAULT 0 | 1 = ignora a lista e libera tudo (`permissions.ts:47`; tela `admin/perfis/page.tsx:140-146`) |
| `permissoes` | TEXT NULL | JSON array de chaves; gravado sempre por `sanitize()`, que descarta o que não está em `PERM_KEYS` (`api/perfis/route.ts:10-13`, `[id]/route.ts:10-13`) |
| `createdAt` | DATETIME | |

Seed: se a tabela está vazia, cria `"Administrador"` com `isAdmin = 1` e `permissoes = "[]"` (`migrate/route.ts:878-888`).

### 1.2 Sessão NextAuth (`src/lib/auth.ts`, 144 linhas)

Handler: `src/app/api/auth/[...nextauth]/route.ts:1-6` exporta `GET`/`POST` de `NextAuth(authOptions)`. Provider: só `CredentialsProvider` com `username` e `password` (`auth.ts:58-63`). Tela: `src/app/login/page.tsx` chama `signIn("credentials", { username, password, redirect: false })` (l.19-21) e redireciona para `/dashboard` (l.27); a tela já se chama "SNI Conecta" (l.61).

Fluxo de `authorize` (`auth.ts:64-113`):

1. `username` em minúsculas e `trim` (l.65); vazio → `null`.
2. Rate limit `rateLimit("login", `${ip}:${username}`, 10, 600)` — 10 tentativas por 10 min por IP+usuário (l.69-73); o IP vem de `x-forwarded-for` (l.70-71). `rateLimit` é persistido na tabela `RateLimit` (`migrate/route.ts:1014-1022`) e **fail-open**: se o banco falhar, libera (`src/lib/rate-limit.ts:66-69`).
3. `findUserByUsername` faz `SELECT * FROM User WHERE username = ?` (l.25-28; `SELECT *` de propósito para tolerar banco sem `perfilId`, l.24).
4. Se existe e `ativo === 1`: `bcrypt.compare` (l.77). OK → `resolvePerfil(user.perfilId)` (l.79) e devolve `{ id, name, email (ou fictício), perfilId, isAdmin, permissoes }` (l.80-87). Senha errada → `null` (l.89).
5. Usuário inexistente/inativo: faz `bcrypt.compare` contra `DUMMY_HASH` para igualar o tempo de resposta (l.10, 95).
6. **Bootstrap**: se **nenhum** `User` ativo existe (`SELECT COUNT(*) … WHERE ativo = 1`, l.102-105) e as credenciais são `apsib` / `prosperidade`, entra como `{ id: "0", name: "APSIB (bootstrap)", email: "apsib@sni.org", isAdmin: true }` (l.109-110). ⚠️ Credencial fixa no código.

`resolvePerfil` (l.39-54) é **fail-safe para cima**: `perfilId` nulo → `{ isAdmin: true }` (l.40); perfil não encontrado → `isAdmin: true` (l.46); erro de banco → `isAdmin: true` (l.52); JSON inválido → `[]` (l.49).

Sessão: `strategy: "jwt"` (l.120). Callback `jwt` copia `isAdmin` (default `true`!), `permissoes` (default `[]`) e `perfilId` para o token **só no login** (l.123-130) — por isso a tela avisa "O usuário precisa relogar para as permissões passarem a valer" (`admin/usuarios/page.tsx:250`). Callback `session` expõe `session.user.id = token.sub`, `isAdmin`, `permissoes`, `perfilId` (l.131-141). Tipos em `src/types/next-auth.d.ts:4-29`. `secret` cai em `"sni-prosperidade-secret-key-2024"` se `NEXTAUTH_SECRET` faltar (l.143) — ⚠️ mesmo segredo assina os tokens de voucher/opt-out (§4.4).

No cliente: `SessionProvider` do NextAuth envolve a árvore inteira (`src/app/layout.tsx:69`, `src/app/providers.tsx:5-7`); `AppShell` e `minha-conta` leem `useSession()`.

### 1.3 Catálogo de permissões (`src/lib/permissions.ts:10-31`) e onde cada uma é checada

São **20 chaves**, nomeadas por **tela**, com `label` e `grupo` (`Principal` | `Análise` | `Administração`). O menu (`src/components/AppShell.tsx:29-55`) e a tela de perfis (`admin/perfis/page.tsx:150-160`) leem daqui; `PERM_KEYS` (l.33) é a lista aceita pelo `sanitize` da API.

| Chave | Label (grupo) | Item de menu (`AppShell.tsx`) | Rotas de API que exigem (`requirePermissao("…")`) |
|---|---|---|---|
| `dashboard` | Dashboard (Principal) | `/dashboard` l.30 | `api/stats/route.ts:7` |
| `participantes` | Participantes (Principal) | `/participantes` l.31 | `api/participants/route.ts:132` (DELETE todos), `:153` (POST); `api/participants/[id]/route.ts:10,28,76,105` (GET/PUT/PATCH/DELETE); `[id]/inscricoes:9`; `[id]/responsavel:11`; `[id]/transferidos:12`; `count:7`; `dedupe:115,153`; `import/analyze:55`; `import/apply:33`; `template:6`; `api/inscricoes/transferir/route.ts:15`; `api/eventos/[id]/importar-convites/route.ts:58` |
| `venda` | Venda balcão (Principal) | `/venda` l.32 | `api/venda/route.ts:79`; `api/cielo/link/route.ts:19` |
| `checkin` | Check-in (Principal) | `/checkin` l.33 | `api/checkin/route.ts:121,202,250` |
| `cancelamentos` | Cancelar convites (Principal) | — (ação na ficha) | `api/inscricoes/cancelar/route.ts:43,90` |
| `trocar-titular` | Trocar titular do convite (Principal) | — (ação na ficha) | `api/inscricoes/trocar-titular/route.ts:91,157` |
| `relatorios` | Relatórios (Análise) | `/relatorios` l.37, `/relatorios/campos` l.38 | `api/inscricoes/route.ts:7`; `api/relatorios/campos/route.ts:9`; `api/eventos/[id]/conflitos/route.ts:14`; `api/eventos/[id]/vendas-por-dia/route.ts:28` |
| `estornos` | Estornos (Sede Central) (Administração) | `/admin/estornos` l.39 | `api/estornos/route.ts:14,69` |
| `eventos` | Eventos (e comissão/e-mails) (Administração) | `/admin/eventos` l.43 | `api/eventos/route.ts:30`; `api/eventos/[id]/route.ts:48,163`; `apagar-inscricoes:15,47`; `combos/route.ts:48`; `combos/[comboId]:11,75`; `comissao/route.ts:35`; `comissao/[membroId]:9`; `cupons/route.ts:84`; `cupons/[cupomId]:15,83`; `emails/route.ts:25`; `emails/[emailId]:22,53`; `ingressos/route.ts:35`; `ingressos/[ingressoId]:12,142,188`; `ingressos/[ingressoId]/campos:50`; `orientadores/route.ts:28` |
| `locais` | Locais (Administração) | `/admin/locais` l.44 | `api/locais/route.ts:19`; `api/locais/[id]:28,68` |
| `promotores` | Promotores (Administração) | `/admin/promotores` l.45 | `api/promotores/route.ts:19`; `[id]:28,58` |
| `orientadores` | Orientadores (Administração) | `/admin/orientadores` l.46 | `api/orientadores/route.ts:22`; `[id]:11,39` |
| `regionais` | Regionais (Administração) | `/admin/regionais` l.47 | `api/regionais/route.ts:32` (POST); `[id]:10,45` (PUT/DELETE). **GET é público** (§3.2) |
| `organizacoes` | Organizações (Administração) | `/admin/organizacoes` l.48 | `api/organizacoes/route.ts:14`; `[id]:9,32`. GET público |
| `comissao` | Comissão (padrões) (Administração) | `/admin/comissao` l.49 | `api/comissao/setores/route.ts:14`; `setores/[id]:6,25`; `funcoes/route.ts:17`; `funcoes/[id]:6,27` |
| `cielo` | Contas Cielo (Administração) | `/admin/cielo-contas` l.50 | `api/cielo-accounts/route.ts:24`; `[id]:9,52`; `api/cielo/api3/diagnose/route.ts:17,51` |
| `usuarios` | Usuários (Administração) | `/admin/usuarios` l.51 | `api/users/route.ts:11,30`; `[id]:10,49` |
| `perfis` | Perfis de acesso (Administração) | `/admin/perfis` l.52 | `api/perfis/route.ts:25` (POST); `[id]:16,39`. **GET exige só sessão** (`route.ts:16-17`) |
| `auditoria` | Auditoria (Administração) | `/admin/auditoria` l.53 | `api/auditoria/route.ts:7` |
| `configuracoes` | Configurações (Administração) | `/admin/configuracoes` l.54 | `api/admin/config/route.ts:10,20`; `api/admin/email/test/route.ts:10`; **`api/migrate/route.ts:9`** (DDL) |

Único uso de `requirePermissaoAny`: a **busca de participantes** `GET /api/participants` libera para `["participantes", "venda", "eventos", "comissao", "trocar-titular"]` (`api/participants/route.ts:31`), porque balcão, comissão e troca de titular precisam procurar pessoa.

Não há tela nem chave para `/admin/duplicados` (a página existe, `admin/duplicados/page.tsx`, e é alcançada pelo botão "Duplicados" da lista, `participantes/page.tsx:159-161`; a API é `participantes`).

Rotas que exigem **apenas sessão** (`getServerSession` sem `requirePermissao`): `GET /api/perfis` (`route.ts:16`), `GET /api/branding/logo-relatorio` (`route.ts:10-11`), `GET/PUT/DELETE /api/preferencias` (`route.ts:18-23`), `GET /api/venda` (`venda/route.ts:320-321`), e os endpoints de voucher que **dispensam** o token quando há sessão (`api/comprar/inscricao/route.ts:24`, `api/voucher/[id]/pdf/route.ts:30`).

Rotas **sem sessão nem permissão** (públicas de fato, 29 arquivos): tudo em `api/comprar/**`, `api/cielo/api3/**` (checkout) e `api/cielo/webhook`, `api/analytics/**`, `api/carrinho`, `api/branding`, `api/descadastro`, `api/r/campo/[token]`, e — relevante para este recorte — `POST /api/email/send` e `POST /api/whatsapp/send`, que a **ficha interna** do participante usa para reenviar voucher (`participantes/[id]/ingressos/page.tsx:268,305`) e que se protegem só por rate limit por IP (20/h, `email/send/route.ts:37`, `whatsapp/send/route.ts:29`) e por derivar destinatário do `inscricaoId` no servidor (`email/send/route.ts:7-9`). `api/cron/emails` exige `Bearer CRON_SECRET` (`cron/emails/route.ts:26-33`), mas **libera tudo se a variável não existir** (l.28).

### 1.4 Como `temPermissao` / `requirePermissao` funcionam

`temPermissao(ctx, key)` (`src/lib/permissions.ts:45-50`), sem imports de servidor para rodar também no menu:

```ts
if (!ctx) return true;                       // l.46  sem contexto → libera
if (ctx.isAdmin) return true;                // l.47
if (!Array.isArray(ctx.permissoes)) return true; // l.48  sessão antiga → libera
return ctx.permissoes.includes(key);         // l.49
```

É **fail-open por desenho** ("Assim ninguém é travado no rollout", l.42-43). Somado ao `resolvePerfil` (§1.2), a regra efetiva é: **usuário sem perfil, com perfil apagado, com perfil `isAdmin`, ou com sessão anterior ao RBAC tem acesso total**. A tela de perfis diz isso explicitamente ("Usuário sem perfil tem acesso total", `admin/perfis/page.tsx:95`) e o `DELETE /api/perfis/[id]` desvincula os usuários do perfil, que "voltam a acesso total por fail-safe" (`[id]/route.ts:43-47`).

`requirePermissao(key)` (`src/lib/permissions-server.ts:15-23`): `getServerSession(authOptions)`; sem sessão → `401 { error: "Unauthorized" }` (l.17); sem a chave → `403 { error: "Sem permissão para esta ação" }` (l.20); ok → `null`. Padrão de uso: `const deny = await requirePermissao("x"); if (deny) return deny;` na primeira linha do handler. `requirePermissaoAny(keys)` (l.31-39) libera se qualquer chave passar.

### 1.5 Telas de identidade do operador

- **`/login`** (`src/app/login/page.tsx`, 117 l.): usuário + senha; mensagem única "Usuário ou senha inválidos." (l.24).
- **`/minha-conta`** (`src/app/minha-conta/page.tsx`, 106 l.): mostra nome, "Usuário" = `session.user.email` (l.18, 49 — logo pode aparecer o e-mail fictício), "Perfil" = `isAdmin === false ? "Acesso restrito" : "Administrador"` (l.19), contagem de "telas liberadas" (l.52-59) e o seletor de tema (l.79-92, §4.7). Só leitura: "Para trocar nome ou senha, peça a quem administra a tela de Usuários." (l.63).
- **`/admin/usuarios`** (`src/app/admin/usuarios/page.tsx`, 274 l.): lista (`nome`, `@username`, e-mail, badge ativo/inativo, l.156-188), modal criar/editar com `nome*`, `username*` (só na criação; sanitizado no cliente para `[a-z0-9._-]`, l.216), e-mail, senha (obrigatória só na criação, l.227-237), select "Perfil de acesso" com opção `""` = "Acesso total (sem perfil)" (l.241-248), checkbox "Usuário ativo (pode logar)" (l.253-261). Exclusão com `confirm()` (l.121-131). Não impede excluir/desativar a si mesmo.
- **`/admin/perfis`** (`src/app/admin/perfis/page.tsx`, 178 l.): lista com badge "Admin" e resumo "Acesso total" ou "N permissõe(s)" (l.84-89, 109-121); modal com nome, checkbox "Acesso total (Administrador) — Ignora a lista de permissões abaixo" (l.140-146) e as 20 chaves em grade por grupo (l.148-164).

### 1.6 Proteção de páginas (`src/proxy.ts`, 17 linhas)

`withAuth` do NextAuth com `signIn: "/login"` e `matcher: ["/dashboard/:path*", "/participantes/:path*", "/checkin/:path*", "/relatorios/:path*", "/minha-conta/:path*"]` (l.9-16). ⚠️ **`/admin/**` e `/venda` não estão no matcher**: as páginas administrativas abrem sem sessão e só as chamadas de API devolvem 401 (as páginas são todas `"use client"` e não têm `layout.tsx` com guard — `find src/app/admin src/app/venda -name layout.tsx` vazio; o único arquivo servidor em `/admin` é `admin/page.tsx:1-5`, que redireciona para `/admin/eventos`). O menu esconde itens por permissão (`AppShell.tsx:135-138`), mas a URL digitada abre a casca da tela.

### 1.7 APIs de usuários e perfis (regras completas)

| Rota | Método | Permissão | Regras | Auditoria |
|---|---|---|---|---|
| `/api/users` | GET | `usuarios` | `SELECT u.* + pf.nome AS perfilNome` com `LEFT JOIN Perfil` (`route.ts:15-19`); se falhar (banco sem `perfilId`), consulta sem join (l.21-26). **Não devolve `passwordHash`.** | — |
| `/api/users` | POST | `usuarios` | `nome` obrigatório (l.43); `username` regex (l.44); senha ≥ 6 (l.50); `ativo` default 1 (l.40); `perfilId` opcional (l.41); bcrypt 10 (l.54); duplicado → 409 (l.62-64) | `criar User` com `{ username, email }` (l.59) |
| `/api/users/[id]` | PUT | `usuarios` | `nome` obrigatório; `email`, `ativo`, `perfilId`; senha só se enviada (≥ 6) (l.16-38). Não muda `username`. | **nenhuma** |
| `/api/users/[id]` | DELETE | `usuarios` | `DELETE FROM User WHERE id=?` (l.53), sem proteção contra apagar o último admin ou a si mesmo | **nenhuma** |
| `/api/perfis` | GET | só sessão | lista `id, nome, isAdmin, permissoes` (l.18-20) — qualquer logado vê a matriz inteira | — |
| `/api/perfis` | POST | `perfis` | `nome` obrigatório; `isAdmin`; `permissoes` sanitizadas (l.29-37); duplicado → 409 | `criar Perfil { nome }` (l.38) |
| `/api/perfis/[id]` | PUT | `perfis` | idem (l.20-27) | `editar Perfil { nome }` (l.28) |
| `/api/perfis/[id]` | DELETE | `perfis` | desvincula `User.perfilId` (l.44-47) e apaga | `excluir Perfil` (l.49) |

---

## 2. Participante

### 2.1 Tabela `Participant` — colunas e origem

Base criada por `server.js:16-40` (MySQL, `utf8mb4_unicode_ci`); alterações em `migrate/route.ts`. O documento `SNI-CONECTA-INTEGRACAO.md:47-65` descreve tipos diferentes (`cpf VARCHAR(14) UNIQUE`, `endereco TEXT`…) — **não confere** com o `server.js`; o que vale em produção é o que o Railway criou por `server.js` e o que o migrate alterou.

| Coluna | Tipo (`server.js`) | Origem | Uso hoje |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT PK | l.18 | FK lógica (sem FK física) de `Inscricao.participanteId`, `Inscricao.compradorId`, `Inscricao.titularAnteriorId`, `PedidoPendente.compradorId`, `MagicLink.participanteId`, `ComissaoMembro.participanteId`, `CarrinhoAbandonado.participanteId`, `EmailEnvio.participanteId` |
| `nomeCompleto` | VARCHAR(255) NOT NULL | l.19 | obrigatório em todo cadastro |
| `codSNI` | VARCHAR(100) NULL | l.20 | texto livre; sem unicidade; buscável |
| `cpf` | VARCHAR(20) NOT NULL | l.21 | **UNIQUE removido** (`server.js:44`, `migrate:178`); índice não-único `idx_cpf` (`migrate:1071-1083`); a dedup pode recriar `uniq_cpf` (§2.9). Gravado só com dígitos nos caminhos novos; legado pode ter máscara (`participants/route.ts:19-22` compara "só os dígitos dos dois lados") |
| `telefone` | VARCHAR(50) NULL | l.23 | fator de posse do checkout (§4.1) |
| `email` | VARCHAR(255) NULL | l.24 | destino do magic link e da régua; pode repetir entre pessoas |
| `regional` | VARCHAR(100) NULL | l.25 | **texto livre** (§3.3) |
| `organizacao` | VARCHAR(100) NULL | l.26 | texto livre (§3.3) |
| `associacaoLocal` | VARCHAR(255) NULL | l.27 como `nucleo`; renomeada em `migrate:199` | texto livre (§3.6) |
| `dataNascimento` | DATETIME NULL | l.28 | |
| `endereco`, `bairro`, `cidade`, `estado` | VARCHAR(255/100/100/10) | l.29-32 | endereço em 4 campos |
| `tipoConvite` | VARCHAR(255) NULL | l.33 | **legado** do evento único (migrado para `Inscricao` em `migrate:274-320`); ainda editável no formulário |
| `numeroConvite` | VARCHAR(100) NULL | l.34 | legado; editável via `PATCH` e `PUT` |
| `dataPurchase` | DATETIME NULL | l.35 | legado |
| `formaPagamento` | VARCHAR(100) NULL | l.36 | legado; ainda gravado pela importação |
| `checkinAt` | DATETIME NULL | l.37 | legado; **ainda lido pelo dashboard** (`api/stats/route.ts:14,20`), que por isso mostra check-in de uma era anterior |
| `createdAt`, `updatedAt` | DATETIME | l.38-39 | `updatedAt ON UPDATE` |
| `ingressoEvento`, `ingressoJantar` | TINYINT(1) NOT NULL DEFAULT 0 | `server.js:51-52`, `migrate:185,192` | legado (flags do 39º Seminário); checkboxes "Convite: Evento / Jantar" no formulário (`ParticipantForm.tsx:332-356`) |
| `primeiraVez` | TINYINT(1) NOT NULL DEFAULT 0 | `migrate:206` | "Primeira vez na SNI" (`ParticipantForm.tsx:163-174`); usado na estatística (`relatorio-estatistica-pdf.ts:122`) |
| `emailOptOut` | TINYINT(1) NOT NULL DEFAULT 0 | `migrate:760` | opt-out de e-mail (§4.6) |

### 2.2 Todos os pontos que **criam** participante

| Onde | Campos gravados | Validação de CPF | Outras regras |
|---|---|---|---|
| `POST /api/participants` (`route.ts:151-201`) — cadastro manual, e "Cadastrar" no modal de troca de titular | 19 colunas (l.173-175) | só `replace(/\D/g,"")` (l.163); **nem tamanho nem dígito verificador**; CPF existente → 409 "CPF já cadastrado" (l.165-170) | `nomeCompleto` e `cpf` obrigatórios (l.159). O modal de troca de titular valida `isCpfValido` **no cliente** (`ingressos/page.tsx:409`) |
| `POST /api/participants/import/apply` (`route.ts:52-81`) | 15 colunas (l.63-67) | 11 dígitos (l.53-57), sem DV | `nomeCompleto` obrigatório (l.58); **não** reconfere se o CPF já existe (confia na análise) |
| `POST /api/eventos/[id]/importar-convites` (`route.ts:266-285`) | 15 colunas; `organizacao` canonizada (l.79-83) | 11 dígitos (herdado do parser) | cria só para CPF novo; **responsável pela compra desconhecido vira cadastro mínimo `nomeCompleto = "Responsável <cpf>"`** (l.223-235) |
| `POST /api/comprar/register` (`route.ts:49-60`) — autocadastro no checkout | `nomeCompleto, cpf, telefone, email, regional, organizacao` | `isCpfValido` (l.17) | nome, CPF e telefone obrigatórios (l.13); organização obrigatória (l.20-22); rate limit 8/15 min por IP+CPF (l.24); CPF existente devolve `status: "exists"` sem PII de contato (l.34-46) |
| `POST /api/comprar/checkout` (`route.ts:245-277`) — participantes adicionais da compra | 6 colunas | `isCpfValido` (l.230) | organização obrigatória (l.236); se existe, **atualiza** com `COALESCE(NULLIF(?,''), col)` (l.253-269) |

Consequência: a base **pode ter CPF duplicado, com máscara ou inválido** (o dedupe conta "CPF ausente/inválido" à parte, `dedupe/route.ts:79-84`; a tela avisa, `admin/duplicados/page.tsx:187-192`).

### 2.3 Todos os pontos que **atualizam** participante

| Onde | O que | Observação |
|---|---|---|
| `PUT /api/participants/[id]` (`route.ts:24-70`) | 20 colunas, inclusive `cpf` e legados (l.45-64) | duplicidade checada com `body.cpf` **cru** (l.39) e gravado cru (l.53) — diferente do POST, que limpa; sem auditoria |
| `PATCH /api/participants/[id]` (l.72-99) | `ingressoEvento`/`ingressoJantar` ou `numeroConvite` | legado |
| `import/apply` update (l.83-99) | só chaves de `FIELDS` | sem auditoria |
| dedupe backfill (`dedupe/route.ts:190-202`) | campos vazios do principal | |
| dedupe reindex (l.277-289) | normaliza `cpf` para dígitos; vazio → `NULL` | |
| `POST /api/comprar/atualizar` (`route.ts:48-56`) | `email, regional, organizacao, associacaoLocal` | público; exige `(id, cpf)` conferirem (l.29-39); rate 15/15 min |
| `POST /api/comprar/checkout` (l.253-269) | nome, telefone, e-mail, regional, organização de participantes adicionais | público |
| `POST /api/descadastro` (`route.ts:17`) | `emailOptOut = 1` | público, por token |

### 2.4 Exclusão

- `DELETE /api/participants/[id]` (`route.ts:101-111`): apaga a linha **sem verificar inscrições** (ficam órfãs — não há FK) e **sem auditoria**. Tela: botão lixeira com `confirm()` (`participantes/page.tsx:121-132`).
- `DELETE /api/participants` (`route.ts:131-149`): **apaga toda a base**; exige `{ confirm: "DELETE_ALL" }` (l.138); audita `excluir-todos` com `{ deleted }` (l.147). Tela: link "Apagar todos os participantes" e modal que exige digitar `APAGAR` (`participantes/page.tsx:328-392`). ⚠️ Em produção com 16 mil pessoas.

### 2.5 Formulário e telas de cadastro/edição

`src/components/ParticipantForm.tsx` (399 l.) — `ParticipantFormData` (l.5-26). Seções e campos:

| Seção | Campos | Widget / regra |
|---|---|---|
| Dados Pessoais (l.71-176) | `nomeCompleto*`, `cpf*`, `codSNI`, `dataNascimento`, `telefone`, `email`, `primeiraVez` | CPF formatado na tela e guardado só dígitos, máximo 11 (l.41-47, 61-64); `required` só no HTML |
| Dados da Organização (l.179-231) | `regional` (select), `organizacao` (select), `associacaoLocal` (texto) | selects alimentados por **`REGIONAIS` e `ORGANIZACOES` de `src/lib/constants.ts`** (l.3, 195, 212) — **não** pela tabela `Regional`/`Organizacao` (§3.3) |
| Endereço (l.234-295) | `endereco`, `bairro`, `cidade`, `estado` (select com 27 UFs, l.35-39) | |
| Dados do Pagamento (l.298-329) | `dataPurchase`, `formaPagamento` | legado |
| Convite (l.332-356) | `ingressoEvento`, `ingressoJantar` | legado |
| Convite (só com `showConvite`, l.359-396) | `tipoConvite`, `numeroConvite` (só dígitos) | legado; aparece só na edição (`[id]/page.tsx:109`) |

- `/participantes/novo` (`novo/page.tsx`): `emptyForm` (l.9-28), `POST /api/participants` (l.42-46), volta para `?return=` (l.36).
- `/participantes/[id]` (`[id]/page.tsx`): carrega `GET /api/participants/[id]` (l.18-54; datas → `YYYY-MM-DD`), `PUT` (l.61-65).

### 2.6 Busca, filtros e listagem

`GET /api/participants` (`route.ts:27-129`):

- Parâmetros: `search`, `regional`, `organizacao`, `eventoId`, `limit` (≤ 500; sem `limit` traz **tudo**, l.39-42).
- `eventoId` → `INNER JOIN Inscricao i ON i.participanteId = p.id AND i.eventoId = ?` (l.48-51).
- Cada palavra de `search` vira um bloco `AND` (l.53-70): `nomeCompleto`, `email`, `codSNI` com `LIKE` acento-insensível (`CONVERT(… USING utf8mb4) COLLATE utf8mb4_unicode_ci`, l.17); se a palavra tem dígitos, também `cpf` e `telefone` comparados sem máscara (`DIGITOS`, l.21-22, 63-68). `%`/`_` escapados (l.25).
- `regional`/`organizacao`: igualdade exata de texto (l.72-73).
- `GROUP BY p.id` (l.76); ordena quem **começa** com o primeiro termo primeiro (l.79-84).
- Depois anexa `eventos: [{ id, nome, corPrimaria, status }]` por participante numa segunda consulta (l.94-121).
- Devolve `SELECT p.*` — **todas** as colunas, inclusive `emailOptOut` e legados (l.44).

Tela `/participantes` (`page.tsx`, 417 l.): filtros nascem da URL e são reancorados nela (l.51-65); debounce 250 ms e `router.replace` (l.109-119); selects de regional/organização vindos de `constants.ts` (l.9, 217-224); evento vindo de `/api/eventos` (l.99-102); contador total por `GET /api/participants/count` (l.103-106); tabela Nome (abre `ParticipantInscricoesModal`), CPF, Regional, ações Convites / Editar / Excluir (l.245-323). Os filtros são guardados em `sessionStorage` (`src/lib/participantes-filtros.ts:8-28`) para as telas filhas voltarem à mesma lista (`hrefParticipantes`, `useHrefParticipantes`, l.30-41).

`ParticipantInscricoesModal` (`src/components/ParticipantInscricoesModal.tsx`, 327 l.): histórico via `GET /api/participants/[id]/inscricoes` (l.79); "Ver" abre `/comprar/confirmacao?inscricaoId=` **sem token** (l.262 — vale porque o operador está logado); "Baixar voucher" busca `/api/comprar/inscricao?id=` e gera PDF no navegador com `html2canvas` + `jsPDF` (l.101-123).

### 2.7 Ficha de convites do participante (`/participantes/[id]/ingressos`, 1 184 l.)

Carrega em paralelo `GET /api/participants/[id]`, `/inscricoes`, `/responsavel` (l.241-245), depois `/api/eventos` e `/transferidos` (l.249-250). Sub-recursos:

| Rota | Devolve | Regra |
|---|---|---|
| `[id]/inscricoes` (`route.ts:8-77`) | inscrições da pessoa com evento, tipo, local, cupom, combo, cancelamento, estorno, titular anterior; `valorPago = valorOriginal − descontoAplicado` (l.64-75) | tenta consulta completa e cai na antiga se faltarem colunas (l.55-62) |
| `[id]/responsavel` (`route.ts:10-49`) | inscrições de **outras** pessoas em que esta é compradora (`compradorId`, ou `compradorCpf` igual quando `compradorId` nulo, l.34-39) | exclui `expirado` |
| `[id]/transferidos` (`route.ts:11-40`) | convites que esta pessoa **cedeu** (`titularAnteriorId = ?`) | |

Ações da ficha e permissões que elas acionam: 2ª via do voucher (`/api/voucher/{ancora}/pdf`, sem token, l.722 — a sessão dispensa), reenviar por e-mail (`/api/email/send`, l.268 — rota pública) e WhatsApp (`/api/whatsapp/send`, l.305 — pública), transferir de evento (`/api/inscricoes/transferir` → `participantes`, l.525), trocar titular (`/api/inscricoes/trocar-titular` → `trocar-titular`, l.378, 441, 461; busca do novo titular por `/api/participants?search=` l.398; cadastro mínimo por `POST /api/participants` l.419-423; motivo ≥ 5 caracteres l.1063), cancelar convite (`/api/inscricoes/cancelar` → `cancelamentos`, l.357, 493; motivo ≥ 5, l.1168). O agrupamento "um voucher por pessoa por evento" está espelhado em `grupoVoucher` (l.114-120) e no servidor em `src/lib/voucher-grupo.ts:51-65`.

### 2.8 Importação XLSX

**Biblioteca `src/lib/import-xlsx.ts` (255 l.)** — fonte única do parser, usada pelo cadastro (`import/analyze`) e pelo import de convites de evento.

- Campos do participante (`IMPORT_FIELDS`, l.4-8): `nomeCompleto, codSNI, telefone, email, regional, organizacao, associacaoLocal, dataNascimento, endereco, bairro, cidade, estado, formaPagamento, tipoConvite`; `cpf` entra à parte como chave (`ColKey`, l.12).
- Campos da venda (`INSCRICAO_FIELDS`, l.17-20, só no import de convites): `codInscricao, respCompra, tipoVenda, valor, obsPgto`.
- Obrigatórios: `REQUIRED_COLS = ["cpf", "nomeCompleto"]` (l.61).
- Apelidos de cabeçalho reconhecidos (`FIELD_ALIASES`, l.80-96): `cpf`; `participante|nome completo|nomecompleto|nome`; `codsnipart|codsni|cod sni|codigo sni|código sni`; `telcel|telefone|celular|tel|fone|whatsapp`; `email|e-mail`; `descregional|regional`; `descorganizacao|organizacao|organização|org`; `descasslocal|associacaolocal|associação local|associacao local|asslocal|al`; `nascimento|datanascimento|data nascimento|data de nascimento|nasc`; `endereco|endereço|logradouro`; `bairrogeral|bairro`; `municgeral|cidade|municipio|município`; `ufgeral|estado|uf`; `formaspgto|formapagamento|forma pagamento|forma de pagamento|pagamento`; `nomeconvite|tipoconvite|convite|tipo convite|tipo de convite`. Os apelidos `CodSNIPart`, `DescRegional`, `DescAssLocal`, `MunicGeral`, `UFGeral`… são o **export do sistema da SNI** (é o que o template reproduz, `api/participants/template/route.ts:9-24`).
- Casamento (`matchFields`, l.129-143): para cada campo, primeiro cabeçalho igual a um apelido, depois cabeçalho que **contém** um apelido; uma coluna não é reutilizada.
- `parseDate` (l.100-115): `Date`, serial Excel (`XLSX.SSF.parse_date_code`), `DD/MM/AAAA`, ou `new Date(s)`.
- `parseValor` (l.165-173): aceita `R$ 1.100,00`, `1100,00`, `1100.00`, número.
- `parseParticipantesXlsx` (l.186-255): primeira aba; `rowNum = i + 2` (l.214); linha sem nome e sem CPF → `"Linha vazia"` (l.218); sem nome → `"Nome obrigatório"` (l.219); CPF sem 11 dígitos → `"CPF inválido: …"` (l.220-223) — **não valida DV**; strings vazias viram `null` (l.206-209).

**`GET /api/participants/template`** (`route.ts:9-41`): planilha com 14 cabeçalhos no dialeto SNI e uma linha de exemplo (`SP-CAMPINAS`, `Associação da Prosperidade`, `Núcleo Central`, `01/01/1980`, `Pix`, …). Não inclui `Endereco`.

**`POST /api/participants/import/analyze`** (`route.ts:54-167`, `maxDuration = 60`):
- `modo=headers` → `{ headers, sugestao, campos[{key,label,required}] }` (l.66-73).
- senão lê `colMap` (JSON) e parseia (l.75-76); vazio → 400 (l.77-79).
- busca existentes por `cpf IN (…)` (l.90-110) e classifica cada linha (l.113-152): `error` | `new` | `identical` | `conflict` (com `existing` e `diffFields`). Diferença = valor da planilha **não vazio e diferente** do atual (l.127-131): planilha em branco nunca apaga dado.
- `summary { total, new, conflict, identical, error }` (l.154-160).

**`POST /api/participants/import/apply`** (`route.ts:32-111`): recebe `decisions[]` de `create | update | skip` (l.15-20); `create` valida 11 dígitos e nome; `update` só aceita chaves de `FIELDS` (l.86-91); devolve `{ created, updated, skipped, errors[] }`. Sem transação, sem auditoria.

**Tela `/participantes/importar`** (`importar/page.tsx`, 665 l.): passos `upload → map → preview → done` (l.51, 271-292); aceita `.xlsx`/`.xls` (l.83); mapeamento com "— não importar —" por campo e aviso das colunas ignoradas (l.363-397); prévia com cards e conflitos linha a linha ("Manter atual" / "Atualizar", padrão **atualizar**, l.140-144, 458-515); aplicação em **lotes de 100, seriais** (l.178-218). Texto da tela: "Os participantes importados **não serão vinculados** a nenhum evento — o vínculo é feito depois pela Venda Balcão" (l.299).

**Importar convites por evento** (`POST /api/eventos/[id]/importar-convites`, 351+ l.): mesma planilha com colunas de venda; `dryRun=1` devolve tipos de convite encontrados, organizações da planilha × `ORGANIZACOES` do sistema e CPFs novos/existentes (l.199-207); ao aplicar, cria cadastro só para CPF novo (l.266-285), canoniza a organização (`orgKey`, l.24-33), lança a inscrição idempotente (l.287-300) e audita `importar-convites` (l.351-354).

### 2.9 Deduplicação por CPF (`POST/GET /api/participants/dedupe`, 315 l.; tela `/admin/duplicados`, 347 l.)

Regras declaradas com o cliente (`dedupe/route.ts:17-25`) e implementadas:

1. **Grupos** (`buildGroups`, l.62-112): `SELECT * FROM Participant`; chave = dígitos do CPF; **CPF sem 11 dígitos não entra** (contado em `invalidCpfCount`, l.79-84). Grupo = 2+ linhas com a mesma chave.
2. **Principal** = mais campos preenchidos (`completeness`, ignora `id, cpf, createdAt, updatedAt`, l.29, 86-87); empate → mais inscrições (l.95-96); empate → menor `id` (l.97).
3. **Prévia** (`GET`, l.114-142): `{ totalParticipants, duplicateGroups, duplicateRecordsToRemove, ticketsAffected, invalidCpfCount, groups[≤500]{ cpf, canonicalId, canonicalNome, members[{ id, nome, completeness, inscricoes, isCanonical }] }, groupsTruncated }`. Só leitura.
4. **Aplicação** (`POST`, l.152-315): exige `{ confirm: true }` (l.157); `reindex` default `true` (l.163). Resposta **streaming NDJSON** (`application/x-ndjson`, l.308-314) com eventos `start{total}`, `progress{done,total,current,…totais}`, `phase{phase}`, `done{…}`, `error{message,…}` (l.170-171, 176, 241, 249, 276, 298, 301).
5. **Por grupo, uma transação** (l.187-238): (a) backfill dos campos vazios do principal a partir do primeiro duplicado que tenha o valor (l.190-202); (b) `UPDATE Inscricao SET participanteId = principal` (l.205-209); (c) `UPDATE MagicLink SET participanteId` (l.211-217, tolera tabela ausente); (d) `UPDATE PedidoPendente SET compradorId` (l.219-225); (e) `DELETE FROM Participant` dos duplicados (l.228-232); commit. Erro → rollback do grupo e o stream emite `error` com os totais já commitados (l.235-237, 299-302).
6. **O que NÃO é repontado** (⚠️ lacuna, verificado por leitura de l.204-232): `Inscricao.compradorId`, `Inscricao.titularAnteriorId`, `ComissaoMembro.participanteId`, `CarrinhoAbandonado.participanteId`, `EmailEnvio.participanteId`. Depois da exclusão essas referências ficam órfãs.
7. **Conflitos de mesmo evento** (l.248-270): pessoa principal com 2+ inscrições no mesmo `eventoId` — **mantidas** e só reportadas (`sameEventConflicts`).
8. **Reindex** (l.272-296): todos os CPFs normalizados para dígitos; vazio → `NULL` ("UNIQUE permite múltiplos NULL", l.285); tenta `ALTER TABLE Participant ADD UNIQUE KEY uniq_cpf (cpf)` (l.291) e reporta "criado" ou o erro.
9. Tela: cards (Participantes, Grupos duplicados, Cadastros a remover, Convites religados), aviso de CPFs inválidos, confirmação em dois cliques, barra de progresso lendo o stream (l.98-132), e **retomada**: se o stream cai sem `done`, mostra "Processo interrompido … clique em Continuar" (l.134-139, 269-280), porque os grupos já commitados persistem.

### 2.10 Validação de CPF (`src/lib/cpf.ts`, 30 l.)

`somenteDigitos` (l.6-8) e `isCpfValido` (l.15-30: 11 dígitos, rejeita sequência repetida, confere os dois DVs). **Usada** em: `comprar/register:17`, `comprar/checkout:230`, `comprar/identify:44`, `comprar/page.tsx:429`, `ingressos/page.tsx:409`. **Não usada** em: `POST /api/participants`, `PUT /api/participants/[id]`, `import-xlsx`, `import/apply`, `importar-convites`, `dedupe`. O esqueleto tem a versão equivalente em `src/lib/dominio/cpf.ts:11-23` (`cpfValido`).

---

## 3. Regional, Organização e associação local

### 3.1 Tabelas

**`Regional`** (`migrate/route.ts:523-530`): `id`, `nome VARCHAR(255) NOT NULL UNIQUE (uniq_nome)`, `correspondeRegionalId INT NULL` (também em l.687; **auto-referência lógica, sem FK**), `createdAt`.

**`Organizacao`** (l.532-538): `id`, `nome UNIQUE`, `createdAt`.

**`RegionalPromotorEmail`** (l.1277-1287): `id`, `regionalId INT NOT NULL`, `promotorId INT NOT NULL`, `email VARCHAR(255) NOT NULL`, `createdAt`, `updatedAt`, `UNIQUE (regionalId, promotorId)`, `KEY idx_promotor`. Motivo (comentário l.1269-1274 e `regional-emails.ts:4-16`): "o presidente da regional PROSPERIDADE não é o mesmo de JOVENS" — um endereço por par regional × promotor.

**`Promotor.usarCorrespondenciaRegional TINYINT(1) DEFAULT 0`** (l.706): liga a correspondência na estatística dos eventos daquele promotor (§3.5).

### 3.2 APIs e telas

| Rota | Método | Guarda | Faz |
|---|---|---|---|
| `/api/regionais` | GET | **pública** | lista `id, nome, correspondeRegionalId, correspondeNome` (self-join, `route.ts:10-15`); `emails` só com sessão (l.17-28) |
| `/api/regionais` | POST | `regionais` | `nome` obrigatório; `correspondeRegionalId`; grava e-mails (l.31-58); 409 em nome duplicado |
| `/api/regionais/[id]` | PUT | `regionais` | idem; auto-correspondência anulada (l.22-23) |
| `/api/regionais/[id]` | DELETE | `regionais` | apaga `RegionalPromotorEmail` da regional (l.51) e a regional. **Não** limpa `Participant.regional` (texto) nem `correspondeRegionalId` de outras regionais que apontavam para ela |
| `/api/organizacoes` | GET | pública | `id, nome` |
| `/api/organizacoes` / `[id]` | POST/PUT/DELETE | `organizacoes` | só `nome` |
| `/api/comprar/listas` | GET | pública | `{ regionais, organizacoes }` das **tabelas**, para os selects do checkout (`route.ts:9-21`) |

Nenhuma dessas rotas grava auditoria.

Telas: `/admin/regionais` (`page.tsx`, 380 l.) — tabela Nome / "E-mails por promotor" (badge `N de M`, l.186-204) / "Correspondência (estatística)" (l.205-213); modal com nome, um campo de e-mail **por promotor cadastrado** (lista vinda de `/api/promotores`, l.53-56, 298-319; validação de formato no cliente l.95-102; em branco = apaga = "desliga o aviso", l.113-114), e checkbox "Corresponder na estatística" + select da correspondente excluindo a si mesma (l.146-147, 322-360). `/admin/organizacoes` (`page.tsx`, 17 l.) usa `SimpleNameAdmin` (`src/components/SimpleNameAdmin.tsx`, 230 l.: CRUD de `{ id, nome }`).

### 3.3 Como se ligam ao participante — texto livre, com **três listas diferentes**

`Participant.regional`, `organizacao` e `associacaoLocal` são `VARCHAR` sem FK. A ponte com `Regional` é o **nome** (`regional-emails.ts:11-15`: "Quem tiver um valor antigo que não bate com nenhuma regional simplesmente não gera aviso — não é erro, é cadastro desatualizado"). As listas que alimentam o texto **não são as mesmas**:

| Onde | Fonte da lista |
|---|---|
| Painel: `ParticipantForm` (l.195, 212) e filtros de `/participantes` (l.217-224) | **`src/lib/constants.ts`**: `REGIONAIS` com **114** nomes fixos (l.1-116, com formas concorrentes, ex.: `"SP-JABAQUARA"` l.77 e `"SP-SÃO PAULO 1 - Jabaquara"` l.104; `"PR-CURITIBA"` l.33 e `"PR-PARANÁ 5 - Curitiba"` l.41; `"MS-CAMPO GRANDE"` l.23 e `"MS-MATO GROSSO 1 - Campo Grande"` l.25) e `ORGANIZACOES` com **4** (`Associação da Prosperidade`, `Associação Fraternidade`, `Associação Pomba Branca`, `Associação dos Jovens`, l.118-123) |
| Checkout público (`/comprar`) | tabelas `Regional`/`Organizacao` via `/api/comprar/listas` |
| Import de convites | `ORGANIZACOES` de `constants.ts` como canônico (`importar-convites/route.ts:20,33,202`) |
| Relatório / e-mails por regional / estatística | tabela `Regional` (`/api/regionais`) |

Ou seja: um participante cadastrado pelo painel pode receber um nome de regional que **não existe na tabela `Regional`** (e vice-versa), o que quebra o aviso por e-mail e a correspondência. Não há tela que cruze as duas listas. O `scripts/contagens.sql:28` do esqueleto conta `regionais_distintas` e `organizacoes_distintas` em `Participant` — ainda sem resultado.

### 3.4 E-mails por regional (`src/lib/regional-emails.ts`, 101 l.; `src/lib/email-regional.ts`, 329 l.)

- `lerEmailsPorRegional(): Map<regionalId, { [promotorId]: email }>` (l.21-37; tabela ausente → vazio).
- `gravarEmailsDaRegional(regionalId, emails)` (l.44-73): por par, `INSERT … ON DUPLICATE KEY UPDATE` se o e-mail casa `EMAIL_RE` (l.18), senão `DELETE`.
- `emailDaRegional(regionalNome, promotorId)` (l.80-101): `JOIN Regional r ON r.id = rpe.regionalId WHERE r.nome = ? AND rpe.promotorId = ?` — resolve **pelo nome** que está no participante.

Avisos (`email-regional.ts`): corpo com "Olá, presidente!" (l.133) e assinatura do promotor; `avisarRegionalNovaCompra` (l.171-206, inclui "sua Regional já tem N convites confirmados" contado por pessoa, l.95-104); `avisarRegionalNovaCompraEmLote` (l.215-230, levas de 3 dentro do webhook); `avisarRegionalTrocaTitular` (l.237-279, avisa as duas regionais); `avisarRegionalTrocaEvento` (l.286-329). Chamados por `api/venda/route.ts:10`, `src/lib/pedido.ts:3` (confirmação Cielo) e `src/lib/email-transferencia.ts:7`. Tudo **dentro da requisição** e "nunca lança" (l.16-19, 158-165) — a plataforma manda isso para a fila `notificacoes` (AGENTS.md).

### 3.5 Correspondência de regional na estatística

- Cadastro: `Regional.correspondeRegionalId` (§3.1) — "As inscrições desta regional continuam nela no cadastro, mas são contabilizadas na regional correspondente no relatório Estatística" (`admin/regionais/page.tsx:338-340`).
- Habilitação por promotor: `Promotor.usarCorrespondenciaRegional` (`admin/promotores/page.tsx:248-249`, `api/promotores/route.ts:29-30`).
- Uso: `relatorios/page.tsx:135-161` monta `Map<nome, correspondeNome>` a partir de `/api/regionais` e o conjunto de promotores com a flag; `src/lib/relatorio-estatistica-pdf.ts:45-48, 100-141` resolve cada regional **em cadeia** (`while (correspondencia.has(atual))`, l.106-107) antes de agregar; sem regional → `"Sem Regional"` (l.128). Só o relatório institucional de Estatística usa isso; o dashboard (`api/stats/route.ts:16-40`) agrega `Participant.regional` cru.

### 3.6 O que é `nucleo` / `associacaoLocal`

Coluna criada como `nucleo VARCHAR(255)` (`server.js:27`, `prisma/schema.prisma:23`) e renomeada para `associacaoLocal` (`migrate/route.ts:199`). Rótulos: "Associação Local" no formulário (`ParticipantForm.tsx:219`), "Associação local" no import (`import-xlsx.ts:48`, apelidos `descasslocal|asslocal|al`), coluna `DescAssLocal` com exemplo `"Núcleo Central"` no template (`template/route.ts:17,34`). É **texto livre**, sem cadastro próprio, devolvido ao comprador logado (`comprar/auth:61`, `lookup:49`, `magic-link/verify:63`), pedido em `comprar/atualizar` e listado no relatório (`api/inscricoes/route.ts:23`). Corresponde ao nível "Núcleos e Associações Locais" da hierarquia descrita pelo cliente; **não há** vínculo com a regional nem lista de valores válidos.

---

## 4. Acesso do comprador: identificação, magic link, token de voucher, opt-out, preferências

### 4.1 Identificação no checkout (`/comprar`, público)

Sequência da tela (`src/app/comprar/page.tsx:420-560`) e rotas (`src/app/api/comprar/*`):

| Passo | Rota | Regras |
|---|---|---|
| CPF | `POST identify` (`route.ts:38-79`) | `isCpfValido` (l.44); rate 8/15 min por IP+CPF e 50/10 min por IP (l.50-51); `notFound` → tela de autocadastro; `found` → dicas mascaradas `{ firstName, telefoneMask, emailMask, hasPhone, hasEmail }` (l.66-75) |
| Telefone (prova de posse) | `POST auth` (`route.ts:9-67`) | compara últimos 9 dígitos (l.41-45); rate 8/15 min; `ok` devolve PII completa incluindo `associacaoLocal` (l.51-63) |
| Sem telefone no cadastro, com e-mail | `POST magic-link/request` | §4.3 |
| Autocadastro | `POST register` | §2.2 |
| Participante adicional | `POST lookup` (`route.ts:10-56`) | devolve só nome/regional/organização/associação (l.41-51); rate 6/15 min + 40/10 min |
| Complementar dados | `POST atualizar` | §2.3 |

### 4.2 Tabela `MagicLink` (`migrate/route.ts:474-486`)

| Coluna | Tipo |
|---|---|
| `token` | VARCHAR(64) **PK** — 32 bytes aleatórios em hex, **em texto puro** |
| `participanteId` | INT NOT NULL |
| `eventoId`, `ingressoTipoId`, `quantity` | INT NULL — contexto da compra para retomar |
| `expiresAt` | DATETIME NOT NULL |
| `usedAt` | DATETIME NULL — uso único |
| `createdAt` | DATETIME |
| índices | `idx_participanteId`, `idx_expiresAt` |

### 4.3 Geração, validade e uso do magic link

**Geração no checkout** (`api/comprar/magic-link/request/route.ts:15-111`): corpo `{ cpf, email, eventoId?, ingressoTipoId?, quantity? }`; responde **sempre 200 `{ ok: true }`** para não revelar cadastro (l.13-14, 26, 33, 41, 47, 109); rate `"magic-link"` 5/15 min por IP+CPF (l.31); exige que o e-mail informado seja **igual** ao do cadastro (minúsculas, l.44-48); SMTP não configurado → 503 (l.50-52); `token = randomBytes(32).toString("hex")` (l.54); `TOKEN_TTL_MIN = 30` (l.9); grava e envia link `${APP_URL}/comprar?token=…&evento=…&ingresso=…&qty=…` (l.64-69) com texto "expira em 30 minutos e só pode ser usado uma vez" (l.98).

**Geração pela régua de e-mails** (`api/cron/emails/route.ts:151-168`): ação `comprar_ingresso` cria um `MagicLink` com `quantity = 1` e `MAGIC_TTL_DIAS = 45` (l.24, 153) — link válido por 45 dias no e-mail de campanha.

**Verificação** (`api/comprar/magic-link/verify/route.ts:18-74`): token `^[a-f0-9]{16,128}$` (l.22); não encontrado / `usedAt` / expirado → `{ valid: false }` com mensagem (l.30-39); carrega o participante (l.41-44), marca `usedAt = NOW()` (l.50) e devolve `{ participant{ id, nomeCompleto, cpf, telefone, email, regional, organizacao, associacaoLocal }, context{ eventoId, ingressoTipoId, quantity } }`. A tela remove o `token` da URL após validar (`comprar/page.tsx:551-553`).

Não há sessão/cookie do comprador: o estado "autenticado" vive no `state` da página; cada rota seguinte (`checkout`, `atualizar`) revalida por `(id, cpf)` ou refaz a prova.

### 4.4 Token assinado do voucher (`src/lib/signed-token.ts`, `src/lib/voucher-acesso.ts`)

- `signPayload(payload)` = HMAC-SHA256 hex **truncado a 24 caracteres** (`signed-token.ts:7-9`); segredo `NEXTAUTH_SECRET || AUTH_SECRET || "sni-signed-token-secret"` (l.3). `verifyPayload` em tempo constante (l.13-22).
- `VOUCHER_TOKEN_PARAM = "vt"` (`voucher-acesso.ts:21`); `voucherToken(inscricaoId, participanteId) = signPayload("voucher:<insc>:<part>")` (l.23-25); `voucherUrl` → `/comprar/confirmacao?inscricaoId=&vt=` (l.36-39); `voucherPdfUrl` → `/api/voucher/{id}/pdf?vt=` (l.42-45).
- Regra (`voucher-acesso.ts:4-19`, `voucher-data.ts:91-101, 118-122`): o token **só é exigido** de convite que **já trocou de titular** (`titularAnteriorId` preenchido) e quando o chamador **não é interno**; como deriva do `participanteId`, a troca rotaciona o link sozinha. Links antigos por id puro continuam válidos para convites que nunca trocaram de mãos.
- Porta comum: `GET /api/comprar/inscricao?id=&vt=` (`route.ts:10-30`, rate 120/5 min) e `GET /api/voucher/[id]/pdf?vt=` (`route.ts:16-44`, rate 60/5 min): `interno = !token && !!session.user` (`inscricao:24`, `pdf:30`). O cron chama `getVoucherData` com `interno` para anexar PDF. A tela pública (`comprar/confirmacao/page.tsx:14,25,138-140`) repassa `vt` e usa o `voucherToken` devolvido para montar o link do PDF.
- `getVoucherData` remove `compradorCpf`/`compradorNome` do payload público (`voucher-data.ts:184-187`) e devolve só `responsavelNome`.

### 4.5 Token de coleta de campo (`src/lib/campo-token.ts`; `/r/campo/[token]`)

`campoToken(inscricaoId, campoId) = "<insc>.<campo>.<sig>"` (l.8-10), `campoUrl` → `/r/campo/<token>` (l.20-22), sem validade e sem uso único ("vale até o participante preencher", l.5-7). `GET /api/r/campo/[token]` devolve `{ participanteNome, eventoNome, ingressoNome, campo{ id, label, tipo, opcoes }, valorAtual }` (`route.ts:44-62`); `POST` valida opção de lista (l.84-86) e faz upsert em `InscricaoResposta` (l.88-99); convite cancelado → 410 (l.51-53, 79-81). Página `src/app/r/campo/[token]/page.tsx` (185 l.) usa botões para `select` e input para texto.

### 4.6 Descadastro (opt-out) de e-mail

- Token: `optOutToken(participanteId) = "<id>.<sig>"` com `sig = signPayload("optout:<id>")` (`src/lib/email-optout.ts:5-7`); `verifyOptOutToken` (l.9-14); `optOutUrl` → `/descadastro?token=` (l.17-19). Sem validade.
- Injeção: **só** o cron da régua monta o rodapé com `optOutUrl` (`cron/emails/route.ts:290`); a tela de e-mails promete "Um link de descadastro é adicionado automaticamente no rodapé de cada e-mail" (`admin/eventos/[id]/emails/page.tsx:320`). Voucher, avisos de regional, magic link e WhatsApp **não** levam o link.
- Efeito: `POST /api/descadastro` (`route.ts:7-22`, token no corpo ou na query) faz `UPDATE Participant SET emailOptOut = 1`. A audiência da régua exclui `COALESCE(p.emailOptOut,0) = 0` (`cron/emails/route.ts:95,108,123,140`). E-mails transacionais (voucher, magic link) **ignoram** a flag.
- Página `/descadastro` (`page.tsx`, 59 l.): dispara o POST ao abrir; texto "Você não receberá mais e-mails de programação. Suas inscrições e confirmações continuam válidas." (l.35). Não há tela para **reverter** o opt-out (nem interna).

### 4.7 Preferências por usuário

- Tabela `UserPreferencia` (`migrate/route.ts:1224-1231`): `userId INT`, `chave VARCHAR(100)`, `valor LONGTEXT` (JSON), `updatedAt`, PK `(userId, chave)`. Motivo (l.1219-1221): seguir a pessoa e não vazar entre usuários do mesmo computador.
- API `/api/preferencias` (`route.ts`, 96 l.): `userId` vem **só da sessão** (`session.user.id`, l.18-23); `chave` ≤ 100 (l.26); `GET ?chave=` → `{ valor }` (JSON inválido/tabela ausente → `null`, l.36-51); `PUT { chave, valor }` upsert, teto 64 KB (l.16, 66-69); `DELETE ?chave=`.
- Hook `usePreferenciaUsuario<T>(chave, padrao)` (`src/lib/preferencia-usuario.ts:21-96`): carrega, trava gravação até o servidor responder (l.36, 41, 54), debounce 600 ms (l.9, 62-76), `limpar()` cancela gravação pendente e faz `DELETE` (l.82-93).
- Chaves em uso: `"tema"` (`src/lib/tema.ts:18`, valores `claro|escuro|sistema`, com cópia local `localStorage["sni-tema"]` e script antes da primeira pintura, l.15-40); `"relatorios:evento"` e `"relatorios:lista"` (`src/app/relatorios/page.tsx:47-48`, filtros/colunas/ordenação do relatório).

---

## 5. Auditoria

### 5.1 Tabela e função

`AuditLog` (`migrate/route.ts:894-906`): `id`, `userEmail VARCHAR(255) NULL`, `acao VARCHAR(80) NOT NULL`, `entidade VARCHAR(80) NULL`, `entidadeId VARCHAR(80) NULL`, `detalhes TEXT NULL`, `ip VARCHAR(64) NULL`, `createdAt`; índices `createdAt`, `entidade`, `userEmail`.

`logAudit({ req?, userEmail?, acao, entidade?, entidadeId?, detalhes? })` (`src/lib/audit.ts:18-45`): se `userEmail` não vier, lê da sessão (l.20-26); IP de `x-forwarded-for`/`x-real-ip` (l.27-30); trunca `acao`/`entidade`/`entidadeId` a 80 e `detalhes` (JSON) a 2 000 caracteres (l.34-38); **nunca lança** (l.42-44). Identidade = **e-mail de sessão** (que pode ser o fictício `username@sni.local`, §1.1); ações do cron/webhook/tela pública ficam com `userEmail = NULL` (ex.: `email/send/route.ts:55`).

### 5.2 Tudo que é registrado (26 chamadas)

| `acao` | `entidade` | Onde | `detalhes` |
|---|---|---|---|
| `criar` | `User` | `api/users/route.ts:59` | `{ username, email }` |
| `criar` / `editar` / `excluir` | `Perfil` | `api/perfis/route.ts:38`, `[id]:28,49` | `{ nome }` |
| `criar` | `Participant` | `api/participants/route.ts:194` | — |
| `excluir-todos` | `Participant` | `api/participants/route.ts:147` | `{ deleted }` |
| `criar` / `editar` / `excluir` | `Evento` | `api/eventos/route.ts:130`, `[id]:152,172` | `{ nome }` |
| `apagar-inscricoes-evento` | (evento) | `api/eventos/[id]/apagar-inscricoes/route.ts:78-81` | |
| `importar-convites` | (evento) | `api/eventos/[id]/importar-convites/route.ts:351-354` | |
| `criar` / `editar-valor` / `reativar` / `inativar` / `excluir` | `IngressoTipo` | `api/eventos/[id]/ingressos/route.ts:88-91`, `[ingressoId]:106-109,166-169,217-220` | |
| `criar` / `editar` / `excluir` | `Orientador` | `api/orientadores/route.ts:42`, `[id]:31,47` | `{ nome }` |
| `editar` | `Configuracao` | `api/admin/config/route.ts:52` | `{ chaves }` (nunca valores) |
| `editar` (transferência de evento) | `Inscricao` | `api/inscricoes/transferir/route.ts:114-117` | |
| `trocar-titular` | `Inscricao` | `api/inscricoes/trocar-titular/route.ts:272-275` | |
| `cancelar-convite` | `Inscricao` | `api/inscricoes/cancelar/route.ts:212-215` | |
| `venda` | (venda balcão) | `api/venda/route.ts:281-284` | |
| `voucher-email` / `voucher-email-duplicado` | `Inscricao` | `api/email/send/route.ts:56-59, 81-84` | |
| `estorno-efetuado` | `Inscricao` | `api/estornos/route.ts:102-105` | |

A tela `/admin/auditoria` conhece só os tons de `criar, editar, excluir, venda, cancelar-convite, estorno-efetuado` (`page.tsx:17-24`).

**Não auditado** (verificado por ausência de `logAudit`): editar/excluir usuário; editar/excluir/PATCH participante; importação de participantes (analyze/apply); deduplicação; regionais, organizações, locais, promotores, comissão, contas Cielo; login/logout; check-in; alterações do comprador pelo checkout; descadastro.

### 5.3 Leitura e formato

`GET /api/auditoria` (`route.ts:6-31`): permissão `auditoria`; `limit` 1-500 (default 200, l.11); filtros `entidade` (igualdade) e `q` (`LIKE` em `userEmail`, `acao`, `detalhes`, l.17-18); ordem `createdAt DESC`; tabela ausente → `[]`. Tela: busca com debounce 250 ms e colunas Data/Hora, Usuário, Ação (badge), Entidade `#id`, Detalhes (truncado com `title`), IP (`page.tsx:77-100`).

Além do `AuditLog`, a identidade do operador é gravada **como texto** em colunas de domínio: `Inscricao.canceladoPor`, `transferidoPor`, `titularTrocadoPor`, `estornoEfetuadoPor` recebem `session.user.email` (`cancelar/route.ts:94,195`, `transferir:109`, `trocar-titular:161,264`, `estornos:73,90`), e a ficha mostra "por <email>" (`ingressos/page.tsx:697,817`).

---

## 6. Mapeamento para a plataforma SNI Conecta

### 6.1 Permissões (20 chaves por tela) → capacidades `eventos.*` do esqueleto (`src/lib/permissoes.ts:27-50`)

| Chave de origem | Capacidade no esqueleto | Situação |
|---|---|---|
| `dashboard` | `eventos.inscricoes.ver` (`registro.ts:36`) | casa |
| `participantes` | `eventos.inscricoes.ver` (ficha/histórico) + `eventos.inscricoes.gerir` (transferir de evento) + **`pessoa.gerir`** (criar/editar/excluir/importar/deduplicar pessoa) | **parcial**: hoje uma chave cobre cinco coisas; a plataforma separa em três. `eventos_admin` tem as três (`permissoes.ts:71`); `eventos_operador` só `inscricoes.ver` (l.72) — operador de balcão **não cadastraria** pessoa nova, mas hoje o balcão cadastra via `POST /api/participants` |
| `venda` | `eventos.vender` | casa (`api/cielo/link` também) |
| `checkin` | `eventos.checkin` | casa |
| `cancelamentos`, `trocar-titular` | `eventos.inscricoes.gerir` | casa (colapsa 2 → 1) |
| `relatorios` | `eventos.inscricoes.ver` | casa (README `src/modulos/eventos/README.md:15`) |
| `estornos` | `eventos.estornos.gerir` | casa |
| `eventos`, `locais`, `promotores`, `orientadores` | `eventos.gerir` | casa (colapsa 4 → 1); a comissão **por evento** e a régua de e-mails também caem aqui |
| `comissao` (setores/funções padrão) | `eventos.comissao.gerir` | casa |
| `cielo`, `configuracoes` (SMTP/WhatsApp/marca) | `eventos.configurar` | casa; `/api/migrate` deixa de existir (README l.36) |
| `configuracoes` (parte comum: logo institucional, GA/Pixel) | `configuracao.gerir` (comum) | casa se a configuração comum for separada da do módulo |
| `usuarios` | `pessoa.gerir` + `acesso.gerir` (criar conta/senha) | casa com a plataforma; no Ciclo `acesso.gerir` é **só Sede** (`ciclo-plataforma.md:393`) — decidir se `eventos_admin` provisiona acesso de operador |
| `perfis` | `papel.conceder` | **parcial**: perfil é combinação livre de 20 chaves; papel é tipo fixo da matriz (§6.2) |
| `regionais`, `organizacoes` | README l.20 diz `pessoa.gerir`; o Ciclo usa `estrutura.gerir` (`ciclo-plataforma.md:384`) | **falta**: o esqueleto **não tem** `estrutura.gerir`. Recomendação: `estrutura.gerir` (comum) para regionais/organizações/associações; os **e-mails por regional × promotor** e a **correspondência estatística** são configuração do módulo → `eventos.configurar` ou `eventos.gerir` |
| `auditoria` | `auditoria.ver` | casa |
| `requirePermissaoAny([participantes, venda, eventos, comissao, trocar-titular])` na busca | — | **falta**: a plataforma precisa de uma capacidade de **buscar pessoa** (nome/CPF/CodSNI) para quem vende, faz check-in, monta comissão ou troca titular, sem dar `pessoa.gerir`. Proposta: `pessoa.buscar` (comum) concedida a `eventos_operador`, ou regra "qualquer `eventos.*` busca campos mínimos" |

**Sobra no esqueleto** (não tem contrapartida na origem): nada — as 8 capacidades `eventos.*` cobrem as 20 chaves. **Falta no esqueleto** para reproduzir a origem: `estrutura.gerir`, `pessoa.buscar` (ou equivalente), e uma variante de `exigirCapacidade` para **rota de API** que responda `401/403 JSON` em vez de `redirect` (`src/lib/auth.ts:80-86` do esqueleto redireciona para `/login` ou `/painel?erro=` — errado para `fetch` do cliente e para webhook; a origem responde JSON, `permissions-server.ts:17,20`).

Também deixa de existir: fail-open (§1.4), bootstrap `apsib/prosperidade`, `isAdmin` como flag de perfil (vira papel `sede` ou `eventos_admin`).

### 6.2 `User` / `Perfil` → conta no Supabase Auth + `papeis`

| Origem | Destino | Observação |
|---|---|---|
| `User.nome` | `pessoas.nome` | |
| `User.username` | — | login passa a ser **CPF ou e-mail** (`src/app/login/actions.ts:33-41` do esqueleto); `username` pode ir para `migracao_extras` |
| `User.email` (nulo → `@sni.local`) | `pessoas.email` (obrigatório quando há `auth_user_id`, decisão 0004) | **cada operador precisa de e-mail real e único** |
| `User.passwordHash` (bcrypt) | Supabase Auth | a confirmar se o Admin API aceita `password_hash` bcrypt na criação; senão, senha provisória por `definirSenhaDePessoa` (`lib/acesso.ts`, `ciclo-plataforma.md:71-81`) |
| `User.ativo = 0` | `papeis.ativo = false` e/ou ban no Auth | não há campo equivalente em `pessoas` |
| `User.perfilId` → `Perfil.isAdmin` | papel `sede` (se opera tudo, inclusive o Ciclo) ou `eventos_admin` | decisão da Sede (§8) |
| `Perfil.permissoes` (combinação livre) | um dos dois papéis `eventos_admin` / `eventos_operador` | **lacuna**: perfis que hoje dão, p.ex., só `relatorios` ou só `checkin`+`venda` não têm papel exato; ou a matriz ganha mais tipos (`eventos_relatorios`, `eventos_checkin`) ou aceita-se o arredondamento. Precisa de `SELECT nome, isAdmin, permissoes FROM Perfil` e `SELECT perfilId, COUNT(*) FROM User GROUP BY perfilId` da produção (não estão em `scripts/contagens.sql`) |
| **`User` não tem CPF** | `pessoas.cpf NOT NULL` | **lacuna bloqueante**: não dá para criar `pessoas` para os operadores sem coletar o CPF de cada um (são dezenas) — trabalho manual antes da virada |
| `UserPreferencia(userId, chave, valor)` | `public.preferencias(pessoa_id uuid, chave, valor jsonb)` (rascunho `eventos_schema.sql:301` sugere `public.preferencias`) | chave `tema` vira comum; `relatorios:*` fica do módulo |

### 6.3 `Participant` → `public.pessoas`

Já parcialmente resolvido em `scripts/lib/transformar.ts:66-104` (rejeita `sem_nome`, `sem_cpf`, `cpf_invalido`; e-mail malformado vira `NULL` com aviso; UF maiúscula) e `scripts/migrar-mysql.ts:53-86` (upsert por `legado_id`; `regional`, `organizacao`, `associacao_local`, `primeira_vez` vão para `migracao_extras jsonb`, l.69-77).

| Coluna de origem | Destino | Lacuna |
|---|---|---|
| `id` | `pessoas.legado_id` | |
| `cpf` (dígitos, com máscara ou inválido; duplicável) | `pessoas.cpf NOT NULL UNIQUE`, DV validado (decisão 0004) | linhas rejeitadas precisam de destino (relatório da migração); **duplicados** precisam ser unificados **antes** (a dedup atual não repõe `compradorId`/`titularAnteriorId`/comissão/carrinho/`EmailEnvio` — a migração tem de fazê-lo) |
| `codSNI` (texto livre, repetível) | `pessoas.cod_sni` (Ciclo: `NOT NULL UNIQUE`, só dígitos, `ciclo-esquema.md:245`; decisão 0004: anulável) | `codsni_duplicado` e `sem_codsni` de `contagens.sql:8,17-19` ainda sem número; CodSNI com letras entra com aviso |
| `email` (repetível, pode ser de familiar) | `pessoas.email` único quando presente (0004) | e-mail compartilhado entre pessoas **viola o unique** — decidir (manter no primeiro, mover os demais para `migracao_extras`, ou coluna `email_contato` sem unicidade) |
| `telefone`, `dataNascimento` | `telefone`, `nascimento` | |
| `endereco`, `bairro`, `cidade`, `estado` | `pessoas.endereco` (texto único no Ciclo) | ⚠️ o script atual **concatena** com `", "` (`migrar-mysql.ts:76`) — perda de estrutura; propor 4 colunas em `pessoas` |
| `regional`, `organizacao`, `associacaoLocal` (texto) | FKs para a estrutura (§6.4) | hoje só em `migracao_extras` |
| `primeiraVez` | ? | atributo "primeira vez na SNI" da pessoa; não existe no Ciclo. Propor `pessoas.primeira_vez boolean` ou atributo do módulo |
| `emailOptOut` | preferência de comunicação comum (`notificacoes` respeita) | não existe no Ciclo; hoje só a régua obedece |
| `tipoConvite`, `numeroConvite`, `dataPurchase`, `formaPagamento`, `checkinAt`, `ingressoEvento`, `ingressoJantar` | **descartar** (já migrados para `Inscricao` em `migrate:274-320`) | conferir antes se restou linha com `ingressoEvento/Jantar = 1` sem `Inscricao` correspondente |
| `createdAt` | `criado_em` | |

Regras de negócio a preservar na reescrita: busca acento-insensível por palavras com AND (§2.6); pessoa cadastrada pelo balcão/troca de titular só com nome + CPF; CPF já cadastrado devolve o existente sem PII de contato no público; atualização pelo checkout com `COALESCE(NULLIF)` (vazio não apaga); importação com prévia `new/identical/conflict/error` e decisão por linha; deduplicação com prévia, transação por grupo e stream.

### 6.4 Regional / Organização / associação local → estrutura institucional

Hierarquia dita pelo cliente: Sede Internacional (fora) > **Sede Central** > **Regionais Doutrinárias** > **Núcleos e Associações Locais**; **Organizações** atravessam todas as esferas.

| Conceito | Eventos hoje | Ciclo hoje (`ciclo-esquema.md`) | Proposta comum |
|---|---|---|---|
| Regional | `Regional(nome único, correspondeRegionalId)` + 114 nomes fixos em `constants.ts` + texto em `Participant.regional` | `regionais(id uuid, nome, uf, ativo)` (l.140-156), N:N com `localidades` | `public.regionais` com `nome`, `uf`, `ativo`, **`nomes_legados text[]`** (ou tabela `regional_apelidos`) para casar os textos de origem; `pessoas.regional_id` FK anulável |
| Organização | `Organizacao(nome único)`; 4 fixas em `constants.ts`; texto em `Participant.organizacao`; **obrigatória** no checkout | não existe | `public.organizacoes(id, nome, ativo)`; `pessoas.organizacao_id`; decidir se é 1:1 com a pessoa (hoje é) ou N:N |
| Núcleo / Associação Local | texto livre `associacaoLocal` | `localidades` (35 unidades do Ciclo, com `slug` e política de pagamento — semântica **diferente**: é a unidade operacional do curso, l.158-178) | nova tabela `public.associacoes_locais(id, nome, regional_id, ativo)` (ou reaproveitar `localidades` se a Sede confirmar que são a mesma coisa); `pessoas.associacao_local_id`; texto original em `migracao_extras` até a Sede fornecer o catálogo |
| E-mail da regional por promotor | `RegionalPromotorEmail` | — | `eventos.regional_avisos(regional_id, promotor_id, email)` (rascunho l.300); envio pela fila `notificacoes` |
| Correspondência estatística | `Regional.correspondeRegionalId` + `Promotor.usarCorrespondenciaRegional` | — | é regra **do módulo**: `eventos.regional_correspondencias(regional_id, corresponde_id)` ou coluna em `eventos.promotor_regionais`; resolver em cadeia como hoje |
| Escopo de acesso por regional | nenhum (nacional) | papel por `localidade_id` | decisão 0003: não agora; mas a estrutura acima já permite `papeis.regional_id` no futuro |

### 6.5 Magic link, voucher, opt-out → módulo `eventos`

| Origem | Rascunho `supabase/rascunhos/eventos_schema.sql` | Lacuna |
|---|---|---|
| `MagicLink(token PK texto puro, participanteId, eventoId, ingressoTipoId, quantity, expiresAt, usedAt)` | `eventos.magic_links(id, pessoa_id uuid, token_hash unique, expira_em, usado_em)` (l.244-251) | rascunho **não tem** `evento_id`, `ingresso_tipo_id`, `quantidade` (contexto de retomada usado por `verify` e pela régua) — adicionar; guardar **hash** do token (melhora sobre a origem); duas validades (30 min checkout, 45 dias campanha) viram parâmetro |
| Token HMAC de voucher (`vt`) | — (stateless) | manter; segredo próprio em variável de ambiente, **sem fallback** literal; deixa de usar o `NEXTAUTH_SECRET` |
| Token de campo (`/r/campo/<insc>.<campo>.<sig>`) | — | manter stateless; rota pública já prevista no `proxy.ts:13` do esqueleto (`/r/`) |
| `emailOptOut` + `/descadastro?token=<id>.<sig>` | — | rota pública prevista (`/descadastro`, `proxy.ts:13`); a flag vira preferência **comum** (a fila `notificacoes` precisa respeitá-la para tudo que for "programação", e o Ciclo passa a ter opt-out também); `id` no token vira uuid |
| Sessão do comprador (não existe; estado na página) | decisão 0005: sem conta | manter; `identify/auth/lookup/register/atualizar` reescritos contra `pessoas` com as mesmas regras de PII e rate limit; rate limit em tabela própria ou Upstash (rascunho l.299) |

### 6.6 Auditoria → `public.auditoria`

| Origem (`AuditLog`) | Ciclo (`auditoria`, `ciclo-esquema.md:336-356`) | Lacuna |
|---|---|---|
| `userEmail` texto (pode ser fictício; nulo em cron/webhook/público) | `ator_id uuid → pessoas` | cron/webhook/comprador precisam de `ator_id NULL` + coluna `origem` (`'cron'`, `'webhook'`, `'publico'`) ou `ator_descricao`; operadores migrados precisam existir em `pessoas` |
| `entidadeId VARCHAR(80)` (ids inteiros preservados no módulo) | `entidade_id uuid` | **incompatível**: `eventos.inscricoes.id` é inteiro (rascunho l.193). Mudar `entidade_id` para `text` |
| `ip` | não existe | adicionar `ip inet` |
| `detalhes` JSON ≤ 2 000 | `antes_jsonb`/`depois_jsonb`/`motivo` | mapear `detalhes` → `depois_jsonb`; ações `cancelar-convite`/`trocar-titular` já têm motivo |
| ações por verbo curto (`criar`, `editar`, …) | ações qualificadas (`acesso.provisionado`, `papel.concedido`, `ciclo-plataforma.md:534`) | adotar `eventos.inscricao.cancelada`, `eventos.voucher.enviado`, `pessoa.criada`… |
| colunas `*Por` com e-mail em `Inscricao` | — | virar `cancelado_por uuid` (rascunho l.219 já faz isso), `transferido_por`, `titular_trocado_por`, `estorno_efetuado_por` |

### 6.7 Lista consolidada de lacunas

1. **Capacidades**: faltam `estrutura.gerir` e uma capacidade de busca mínima de pessoa (`pessoa.buscar`); falta `exigirCapacidade` para rotas JSON; decidir quem tem `acesso.gerir` no módulo.
2. **Papéis**: perfis livres × dois papéis fixos; usuários sem perfil (acesso total) precisam de papel explícito; `isAdmin` → `sede` ou `eventos_admin`.
3. **Operadores sem CPF nem e-mail real**: coleta manual obrigatória antes da virada; bootstrap `apsib` some (criação da primeira conta pelo caminho do Ciclo, `criar-sede.sql`).
4. **Pessoas**: CPF duplicado/inválido/com máscara; e-mail compartilhado × unique; CodSNI nulo/duplicado; endereço em 4 campos × 1; `primeiraVez`, `emailOptOut` sem lugar; colunas legadas a descartar.
5. **Estrutura**: três listas de regionais divergentes; organização obrigatória no checkout mas texto; associação local sem catálogo; correspondência e e-mails por promotor sem tabela no rascunho comum.
6. **Dedup**: cinco referências não repontadas; a migração precisa unificar por CPF antes de `pessoas` (ou rejeitar o segundo e registrar).
7. **Magic link**: rascunho sem contexto de compra; hash e validades.
8. **Auditoria**: `entidade_id` uuid × inteiro; ator não-pessoa; IP; ações não auditadas hoje (edição/exclusão de pessoa e usuário, importação, dedup, estrutura) devem passar a ser.
9. **Guardas**: `/admin/**` e `/venda` sem proteção de página; `/api/email/send` e `/api/whatsapp/send` públicos com rate limit; `GET /api/perfis` para qualquer sessão; `/api/regionais` e `/api/organizacoes` GET públicos (aceitável para os selects, mas os e-mails já são filtrados).
10. **Segredos com fallback literal** (`auth.ts:143`, `signed-token.ts:3`, `cron/emails/route.ts:28`): a plataforma exige variável presente.

---

## 7. Riscos

1. **RBAC fail-open** (§1.4): em produção pode haver usuários operando com acesso total por não terem perfil. Na virada, cada um recebe papel explícito; qualquer um que hoje "funciona sem perfil" vai perder acesso se não for mapeado.
2. **Apagar tudo / apagar pessoa com inscrições** (§2.4) estão a dois cliques de quem tem `participantes`. A plataforma não deve portar `DELETE /api/participants` e deve impedir exclusão de pessoa com vínculos.
3. **Duplicidade de CPF** volta a acontecer sempre que `POST /api/participants` ou `import/apply` correm em paralelo (não há unique até o reindex, e o reindex falha se sobrar duplicado). A migração precisa de unificação definitiva.
4. **Regional como texto**: renomear uma regional na tabela desliga os avisos e a correspondência de todo mundo com o nome antigo; apagar uma regional deixa `correspondeRegionalId` pendurado.
5. **Dashboard lendo `Participant.checkinAt`** (`api/stats/route.ts:14,20`): número de check-in do dashboard não é o de `Inscricao.checkinAt` — cuidado ao "reproduzir" o dashboard.
6. **Identidade em texto** (`userEmail`, `canceladoPor`…) com e-mail fictício `@sni.local`: a trilha de quem fez o quê pode não ser reconciliável com uma pessoa real na migração.
7. **Magic link em texto puro e sem hash** + segredo com fallback: vazamento do banco = links válidos por até 45 dias.
8. **E-mail dentro da requisição** (avisos de regional no webhook e no balcão, reenvio de voucher): já apontado em `docs/integracao-eventos.md`; muda para a fila.
9. **Migração lossy do endereço** (`migrar-mysql.ts:76`) e de `regional/organizacao/associacaoLocal` (`migracao_extras`): se o schema comum fechar sem essas colunas, o dado só existe em JSON.
10. **LGPD**: `SELECT p.*` na busca expõe `emailOptOut`, endereço completo e legados a qualquer um com `participantes`/`venda`/`comissao`; a visão 360º por capacidade (decisão 0002) precisa filtrar colunas, não só linhas.

## 8. Perguntas abertas (para a Sede / sessão de eventos)

1. Quais nomes de regional são canônicos: os 114 de `constants.ts`, a tabela `Regional` em produção, ou a lista oficial de Regionais Doutrinárias? Precisa de um mapa nome-antigo → regional-oficial.
2. As quatro `ORGANIZACOES` (Prosperidade, Fraternidade, Pomba Branca, Jovens) são exatamente as "Organizações" transversais da hierarquia? Existem outras? Uma pessoa pertence a uma só?
3. "Associação local"/"Núcleo" é a mesma coisa que `localidades` do Ciclo (35 unidades) ou um catálogo maior? Quem fornece a lista e o vínculo com a regional?
4. Quantos `User` existem, quantos sem perfil, quais combinações de `Perfil.permissoes` estão em uso (consultas a rodar em produção, sem dado pessoal: `SELECT perfilId, ativo, COUNT(*) FROM User GROUP BY 1,2` e `SELECT nome, isAdmin, permissoes FROM Perfil`). Todos têm e-mail real e CPF?
5. `Perfil.isAdmin` vira `sede` (vê o Ciclo também) ou `eventos_admin`?
6. Operador de balcão pode **cadastrar pessoa nova** (hoje pode) sem `pessoa.gerir`? Ou ganha uma capacidade `pessoa.cadastrar_minimo`?
7. `acesso.gerir` (criar conta/senha de operador) fica só com a Sede, como no Ciclo, ou `eventos_admin` também?
8. Opt-out: deve valer para todo e-mail não transacional de todos os módulos? Quem pode reverter (hoje ninguém)?
9. Magic link: manter 30 min (checkout) e 45 dias (campanha)? Guardar hash?
10. `primeiraVez` ("primeira vez na SNI") é atributo da pessoa ou da inscrição no evento?
11. `pessoas.email` único: como tratar famílias com um e-mail só (quantas linhas? `email_duplicado` em `contagens.sql:21-23`)?
12. Dados de auditoria antigos (`AuditLog`) migram? Com que `ator_id` quando o e-mail é fictício?
