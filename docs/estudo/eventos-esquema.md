# Estudo — o esquema MySQL do módulo `eventos` e sua tradução para Postgres

Recorte: **o esquema**. Identidade, compra e operação já estão estudados e
**não são repetidos aqui** — este documento cita:

- `docs/estudo/eventos-identidade.md` (User/Perfil, `Participant`, dedup,
  regional/organização, magic link, auditoria);
- `docs/estudo/eventos-compra.md` (máquinas de estado, cupons, combos, Cielo,
  dinheiro);
- `docs/estudo/eventos-operacao.md` (balcão, check-in, relatórios, régua de
  e-mails, configurações, lacunas do rascunho §7.3).

## 0. Fontes lidas, método e o que NÃO foi encontrado

| Fonte | Papel |
|---|---|
| `/home/user/sni-ciclo/server.js:16-55` | **onde a tabela `Participant` nasce** — e só ela |
| `/home/user/sni-ciclo/src/app/api/migrate/route.ts` (1 300 linhas) | onde nascem as **outras 30 tabelas** e todos os `ALTER` |
| `/home/user/sni-ciclo/src/lib/db.ts` (16 linhas) | pool `mysql2`, `connectionLimit: 5`, `queueLimit: 20`, `uri = DATABASE_URL` |
| `/home/user/sni-ciclo/prisma/schema.prisma` (36 linhas) | **legado morto** (ver §0.3) |
| `/home/user/sni-ciclo/prisma/migrations/20260402004532_init/migration.sql` | único `.sql` do repositório; **SQLite**, não MySQL |
| `/home/user/sni-ciclo/src/types/next-auth.d.ts` | único arquivo de `src/types/`; só tipa a sessão (`isAdmin`, `permissoes`, `perfilId`) — nenhum tipo de linha de banco |
| `/home/user/sni-ciclo/SNI-CONECTA-INTEGRACAO.md:40-130` | descrição de esquema **desatualizada** (ver §0.4) |
| `/home/user/sniconecta/supabase/rascunhos/eventos_schema.sql` (302 linhas) | destino a corrigir |
| `/home/user/sniconecta/scripts/migrar-mysql.ts`, `scripts/lib/transformar.ts`, `scripts/contagens.sql` | o carregador e as transformações puras |

Método: leitura integral do `migrate/route.ts` na ordem dos `Step N`;
verificação de cada tabela contra o código que a usa
(`grep -rn "FROM <Tabela>"`, `"INTO <Tabela>"`, `"UPDATE <Tabela>"` em `src`).

### 0.1 O que NÃO foi encontrado

- **Nenhuma `FOREIGN KEY` em lugar nenhum.** `grep -rn "FOREIGN KEY\|REFERENCES"`
  em `src` e `server.js` não devolve uma linha. Todas as relações são lógicas.
  Toda FK do Postgres é, portanto, uma restrição **nova**, e cada uma pode
  recusar linhas que hoje existem (§5.4).
- **Nenhum `ENGINE=`, nenhuma `CHARACTER SET` fora de `Participant`.** Só
  `server.js:39` declara `utf8mb4 / utf8mb4_unicode_ci`; as 30 tabelas do
  `migrate` herdam o padrão do servidor Railway — que **não foi verificado**
  (sem acesso ao banco). Se o padrão for `latin1`, acentos das 30 tabelas
  precisam de conversão na leitura. **Confirmar com `SHOW CREATE TABLE`.**
- **Nenhum dump, nenhum `information_schema`, nenhum acesso ao banco real.**
  Tudo aqui é o esquema que o código *pretende* criar. `CREATE TABLE IF NOT
  EXISTS` + `ALTER … ADD` em `try/catch` significa que **uma tabela pode
  existir em produção com forma diferente** da do código (por exemplo, criada
  antes de uma coluna ser adicionada ao `CREATE`). Só `SHOW CREATE TABLE` de
  cada uma das 31 tabelas fecha essa dúvida — é o **primeiro item da lista de
  perguntas** (§8).
- **Nenhuma contagem real.** `scripts/contagens.sql` existe e está pronto, mas
  não foi executado (`docs/estudo/README.md` já registra "ainda sem
  resultado"). §5 lista o que cada número decide, não os números.
- Nenhum `.sql` de MySQL no repositório de origem.

### 0.2 O esquema não é declarativo: é um endpoint HTTP

`POST /api/migrate` (`migrate/route.ts:7-10`) exige `requirePermissao("configuracoes")`
e roda 36 passos idempotentes. Cada passo é `try { … } catch { steps.push("SKIP") }`:
**um erro nunca interrompe**, só vira uma linha de texto na resposta. A tela
`/admin/configuracoes` tem o botão "Rodar migração" que mostra esses `steps`.

Consequências que a migração de dados precisa levar a sério:

1. A **ordem dos `Step N` no arquivo não é a ordem dos números**: 21 vem antes
   de 20 (l.848 e l.890), 25 antes de 24 (l.1010 e l.1028), e 31 é o **último**
   do arquivo (l.1293). A ordem que vale é a do arquivo, não a do rótulo.
2. Vários caminhos de escrita têm *fallback* para "a coluna nova pode não
   existir": `venda/route.ts:267-270`, `combo-checkout/route.ts:222-226`,
   `importar-convites/route.ts:339-343` tentam o `INSERT` com `compraGrupoId`
   e, se falhar, repetem sem ele. Ou seja, **o código admite que a produção
   pode estar atrás do esquema**.
3. Há DDL fora do `migrate`: `admin/config/route.ts:42`
   (`ALTER TABLE Configuracao MODIFY valor LONGTEXT`, "auto-heal" quando o
   `INSERT` estoura por tamanho) e `participants/dedupe/route.ts:291`
   (`ALTER TABLE Participant ADD UNIQUE KEY uniq_cpf (cpf)` — recria a
   unicidade de CPF depois de deduplicar).

### 0.3 `prisma/schema.prisma` está desatualizado — e nunca descreveu este banco

Sim, **está desatualizado**, e por dois motivos independentes:

- `datasource db { provider = "sqlite" }` (`schema.prisma:10`) — o Prisma foi
  configurado para **SQLite**, não MySQL. A única migração
  (`prisma/migrations/20260402004532_init/migration.sql:2-26`) é SQL de SQLite
  (`INTEGER … AUTOINCREMENT`, `DATETIME`, aspas duplas).
- Descreve **uma única tabela** (`Participant`, `schema.prisma:14-36`), com
  `cpf String @unique` — unicidade que `server.js:44` derruba na primeira
  subida do servidor. E o `nucleo` ainda com o nome antigo (l.23), renomeado
  para `associacaoLocal` em `migrate/route.ts:199`. Faltam `tipoConvite`,
  `ingressoEvento`, `ingressoJantar`, `primeiraVez`, `emailOptOut` e as outras
  30 tabelas.
- `@prisma/client` **não é importado em lugar nenhum** de `src`: todo acesso é
  `mysql2` cru via `src/lib/db.ts`.

**Conclusão: ignorar o Prisma.** Ele é resíduo do primeiro dia do projeto. Se
alguém rodar `prisma migrate` contra a produção, não acontece nada de útil e
pode acontecer algo ruim.

### 0.4 `SNI-CONECTA-INTEGRACAO.md` também não confere

O documento de integração do próprio repositório de origem descreve um esquema
idealizado que **não é o que roda**. Diferenças verificadas:

| `SNI-CONECTA-INTEGRACAO.md` | Realidade |
|---|---|
| `cpf VARCHAR(14) UNIQUE` (l.51) | `cpf VARCHAR(20) NOT NULL`, **sem** unique (`server.js:21` + `:44`) |
| `codSNI VARCHAR(50)` (l.50) | `VARCHAR(100)` (`server.js:20`) |
| `dataNascimento DATE` (l.58) | `DATETIME` (`server.js:28`) |
| `endereco TEXT` (l.59) | `VARCHAR(255)` (`server.js:29`) |
| `estado VARCHAR(2)` (l.62) | `VARCHAR(10)` (`server.js:31`) |
| `Inscricao.formaPagamento ENUM(...)`, `status ENUM(...)` (l.109-111) | `VARCHAR(100)` e `VARCHAR(20) DEFAULT 'pago'` (`migrate:110,113`) |
| "FK → Participant.id" (l.106) | não existe FK nenhuma |
| `Participant` sem `tipoConvite`/`numeroConvite`/`dataPurchase`/`formaPagamento`/`checkinAt`/`ingresso*`/`emailOptOut` | todas existem |

Vale como intenção, **não como fonte**. O mesmo já foi observado em
`eventos-identidade.md §2.1`.

---

## 1. Inventário completo das 31 tabelas MySQL

### 1.0 Mapa: onde cada tabela nasce

| # | Tabela | `CREATE TABLE` em | `ALTER` posteriores |
|---|---|---|---|
| 1 | `Participant` | **`server.js:17-40`** | `server.js:44,51,52`; `migrate:178,185,192,199,206,760,1076`; `dedupe/route.ts:291` |
| 2 | `Promotor` | `migrate:18-24` (Step 1) | Step 17 (l.706-707) |
| 3 | `Local` | `migrate:33-44` (Step 1) | Step 2 (l.169) |
| 4 | `Evento` | `migrate:53-73` (Step 1) | Steps 8 (l.458-459), 10 (l.508-509), 12 (l.607-610) |
| 5 | `IngressoTipo` | `migrate:82-95` (Step 1) | Steps 15 (l.672), 17 (l.705), 28 (l.1110-1112), 32 (l.1207) |
| 6 | `Inscricao` | `migrate:104-117` (Step 1) | Steps 7, 10, 14, 17, 29b, 30, 32, 34, 35 |
| 7 | `IngressoCampo` | `migrate:128-139` (Step 1) | — |
| 8 | `InscricaoResposta` | `migrate:150-159` (Step 1) | — |
| 9 | `Configuracao` | `migrate:326-330` (Step 6) | `migrate:340`; `admin/config/route.ts:42` |
| 10 | `Cupom` | `migrate:350-367` (Step 7) | Step 29b (l.1172) |
| 11 | `MagicLink` | `migrate:474-485` (Step 9) | — |
| 12 | `Regional` | `migrate:523-529` (Step 11) | Step 16 (l.687, redundante) |
| 13 | `Organizacao` | `migrate:532-537` (Step 11) | — |
| 14 | `User` | `migrate:540-549` (Step 11) | Step 21 (l.869) |
| 15 | `CieloAccount` | `migrate:552-561` (Step 11) | — |
| 16 | `PedidoPendente` | `migrate:564-593` (Step 11) | Steps 29b (l.1168), 30 (l.1186-1187) |
| 17 | `ComissaoSetorPadrao` | `migrate:722-728` (Step 18) | — |
| 18 | `ComissaoFuncaoPadrao` | `migrate:730-736` (Step 18) | Step 22 (l.952-953, 965, 971) |
| 19 | `ComissaoMembro` | `migrate:738-747` (Step 18) | — |
| 20 | `CarrinhoAbandonado` | `migrate:772-787` (Step 19) | — |
| 21 | `EmailAgendado` | `migrate:789-804` (Step 19) | l.829-834 |
| 22 | `EmailEnvio` | `migrate:806-816` (Step 19) | l.836-838 |
| 23 | `Perfil` | `migrate:852-859` (Step 21) | — |
| 24 | `AuditLog` | `migrate:894-906` (Step 20) | — |
| 25 | `Orientador` | `migrate:983-989` (Step 23) | — |
| 26 | `EventoOrientador` | `migrate:991-1000` (Step 23) | — |
| 27 | `RateLimit` | `migrate:1014-1021` (Step 25) | — |
| 28 | `Combo` | `migrate:1127-1139` (Step 29) | Step 29b (l.1164-1165) |
| 29 | `ComboItem` | `migrate:1141-1147` (Step 29) | — |
| 30 | `UserPreferencia` | `migrate:1224-1230` (Step 33) | — |
| 31 | `RegionalPromotorEmail` | `migrate:1277-1287` (Step 36) | — |

Passos sem DDL: 3, 4, 5 (seeds e a migração `Participant → Inscricao` do 39º
Seminário), 13 (semeia `CieloAccount` a partir da `Configuracao`), 24 (backfill
de funções sem setor), 27 (semeia `pendenteExpiraHoras=24`), 31 (baixa o selo
institucional para `Configuracao.relatorioLogoUrl`).

---

### 1.1 `Participant` — a pessoa (a única tabela que **não** nasce no migrate)

Nasce em `server.js:17-40`, executada por `initDatabase()` **a cada subida do
processo** (`server.js:60`). ⚠️ `package.json` manda `start: node server.js`,
mas o deploy é serverless na Vercel — ver `eventos-operacao.md §6.3`: quem
criou a tabela em produção foi uma subida do `server.js` (Railway), não o
`migrate`.

`CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` (l.39) — **a única tabela
com charset declarado**.

| Coluna | Tipo | Nulo | Default | Onde |
|---|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — | `server.js:18` — PK |
| `nomeCompleto` | VARCHAR(255) | não | — | l.19 |
| `codSNI` | VARCHAR(100) | sim | — | l.20 |
| `cpf` | VARCHAR(20) | **não** | — | l.21 |
| `telefone` | VARCHAR(50) | sim | — | l.23 |
| `email` | VARCHAR(255) | sim | — | l.24 |
| `regional` | VARCHAR(100) | sim | — | l.25 — texto livre |
| `organizacao` | VARCHAR(100) | sim | — | l.26 — texto livre |
| `nucleo` → `associacaoLocal` | VARCHAR(255) | sim | — | l.26 criada como `nucleo`; renomeada em `migrate:199` |
| `dataNascimento` | DATETIME | sim | — | l.27 |
| `endereco` | VARCHAR(255) | sim | — | l.28 |
| `bairro` | VARCHAR(100) | sim | — | l.29 |
| `cidade` | VARCHAR(100) | sim | — | l.30 |
| `estado` | VARCHAR(10) | sim | — | l.31 |
| `tipoConvite` | VARCHAR(255) | sim | — | l.32 — legado do evento único |
| `numeroConvite` | VARCHAR(100) | sim | — | l.33 — legado |
| `dataPurchase` | DATETIME | sim | — | l.34 — legado |
| `formaPagamento` | VARCHAR(100) | sim | — | l.35 — legado; valores de `constants.ts:125-137` (`"Pix"`, `"Cartão 3x"`…), **diferentes** dos de `Inscricao.formaPagamento` |
| `checkinAt` | DATETIME | sim | — | l.36 — legado; **ainda lido** por `api/stats` |
| `createdAt` | DATETIME | não | `CURRENT_TIMESTAMP` | l.37 |
| `updatedAt` | DATETIME | não | `CURRENT_TIMESTAMP ON UPDATE` | l.38 |
| `ingressoEvento` | TINYINT(1) | não | 0 | `server.js:51` / `migrate:185` |
| `ingressoJantar` | TINYINT(1) | não | 0 | `server.js:52` / `migrate:192` |
| `primeiraVez` | TINYINT(1) | não | 0 | `migrate:206` |
| `emailOptOut` | TINYINT(1) | não | 0 | `migrate:760` |

**25 colunas.**

Chaves e índices: PK `id`. O `UNIQUE` implícito em `cpf` (herdado do Prisma) é
**derrubado** duas vezes — `server.js:44` e `migrate:178`. `migrate:1071-1083`
cria o índice **não-único** `idx_cpf`. `dedupe/route.ts:291` pode **recriar**
`uniq_cpf` depois de deduplicar.

⚠️ **Contradição no código**: `dedupe/route.ts:284-286` faz
`UPDATE Participant SET cpf = NULL` para CPF vazio ("UNIQUE permite múltiplos
NULL no MySQL"), mas a coluna é `NOT NULL` (`server.js:21`). Em modo estrito
esse `UPDATE` estoura; em modo permissivo grava `''`. **Qual dos dois estados
está na base decide se existe `cpf = ''` ou `cpf IS NULL`** — a fase `pessoas`
trata os dois (`transformar.ts:70-71` rejeita como `sem_cpf`), mas a contagem
muda.

Para que serve, e quem aponta para ela (sem FK): `Inscricao.participanteId`,
`Inscricao.compradorId`, `Inscricao.titularAnteriorId`,
`PedidoPendente.compradorId`, `MagicLink.participanteId`,
`ComissaoMembro.participanteId`, `CarrinhoAbandonado.participanteId`,
`EmailEnvio.participanteId`. Detalhes de quem cria/atualiza/apaga:
`eventos-identidade.md §2.2-2.4`.

---

### 1.2 `Promotor` — quem promove o evento (`migrate:18-24`)

| Coluna | Tipo | Nulo | Default | Onde |
|---|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — | l.19 |
| `nome` | VARCHAR(255) | não | — | l.20 |
| `telefone` | VARCHAR(20) | sim | — | l.21 |
| `email` | VARCHAR(255) | sim | — | l.22 |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` | l.23 |
| `usarCorrespondenciaRegional` | TINYINT(1) | não | 0 | **Step 17**, l.706 |
| `logoUrl` | LONGTEXT | sim | — | **Step 17**, l.707 — base64 |

Sem índice além da PK. Serve a `Evento.promotorId`, a
`RegionalPromotorEmail.promotorId` e à correspondência de regionais na
estatística (`eventos-identidade.md §3.5`). Escrito por
`api/promotores/route.ts` (`INSERT INTO Promotor (nome, telefone, email, logoUrl, usarCorrespondenciaRegional)`).

---

### 1.3 `Local` — onde o evento acontece (`migrate:33-44`)

| Coluna | Tipo | Nulo | Default | Onde |
|---|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — | l.34 |
| `nome` | VARCHAR(255) | não | — | l.35 |
| `endereco` | TEXT | sim | — | l.36 |
| `bairro` | VARCHAR(255) | sim | — | l.37 |
| `cidade` | VARCHAR(255) | sim | — | l.38 |
| `estado` | VARCHAR(2) | sim | — | l.39 |
| `telefone` | VARCHAR(20) | sim | — | l.40 |
| `email` | VARCHAR(255) | sim | — | l.41 |
| `contaCielo` | VARCHAR(255) | sim | — | l.42 **e** Step 2 (l.169) — duplicado, o `ALTER` só serve a bancos antigos |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` | l.43 |

⚠️ `contaCielo` **está viva**: `api/locais/route.ts:24,29,39` grava e
`admin/locais/page.tsx:186,311` exibe e edita. O rascunho a removeu (§2.3).

`DELETE /api/locais/[id]` não checa eventos que apontam para o local
(`eventos-operacao.md §4.7`) — logo `Evento.localId` pode estar pendurado.

---

### 1.4 `Evento` (`migrate:53-73` + Steps 8, 10, 12)

| Coluna | Tipo | Nulo | Default | Onde |
|---|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — | l.54 |
| `nome` | VARCHAR(255) | não | — | l.55 |
| `dataInicial` | DATE | não | — | l.56 |
| `dataFinal` | DATE | não | — | l.57 |
| `localId` | INT | sim | — | l.58 |
| `promotorId` | INT | sim | — | l.59 |
| `voucherBannerUrl` | TEXT → **LONGTEXT** | sim | — | l.60; Step 8 l.458 |
| `voucherLogoUrl` | TEXT → **LONGTEXT** | sim | — | l.61; Step 8 l.459 |
| `voucherCorPrimaria` | VARCHAR(7) | sim | `'#1e3a5f'` | l.62 |
| `voucherCorSecundaria` | VARCHAR(7) | sim | `'#f59e0b'` | l.63 |
| `voucherBoasVindas` | TEXT | sim | — | l.64 |
| `voucherInstrucoes` | TEXT | sim | — | l.65 |
| `voucherRodape` | TEXT | sim | — | l.66 |
| `voucherMostrarParticipante` | TINYINT(1) | sim | 1 | l.67 |
| `voucherMostrarEvento` | TINYINT(1) | sim | 1 | l.68 |
| `voucherMostrarIngresso` | TINYINT(1) | sim | 1 | l.69 |
| `voucherMostrarQRCode` | TINYINT(1) | sim | 1 | l.70 |
| `voucherMostrarPagamento` | TINYINT(1) | sim | 1 | l.71 |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` | l.72 |
| `comprarLogoUrl` | LONGTEXT | sim | — | **Step 10**, l.508 — base64 |
| `ativo` | TINYINT(1) | não | 1 | **Step 10**, l.509 |
| `slug` | VARCHAR(100) | sim | — | **Step 12**, l.607 |
| `cieloAccountId` | INT | sim | — | **Step 12**, l.609 |

**23 colunas.** Índices: PK; `UNIQUE uniq_slug (slug)` (l.608);
`KEY idx_cieloAccountId` (l.610).

`api/eventos/route.ts:86-94` e `[id]/route.ts:106-114` gravam **exatamente**
essas 21 colunas editáveis — nenhuma outra. Não existe campo de "landing"
(ver §2.3, erro do rascunho).

---

### 1.5 `IngressoTipo` — o tipo de convite (`migrate:82-95` + Steps 15, 17, 28, 32)

| Coluna | Tipo | Nulo | Default | Onde |
|---|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — | l.83 |
| `eventoId` | INT | não | — | l.84 |
| `nome` | VARCHAR(255) | não | — | l.85 |
| `descricao` | VARCHAR(500) | sim | — | l.86 **e** Step 15 (l.672) — duplicado |
| `vendaInicio` | DATETIME | sim | — | l.87 |
| `vendaFim` | DATETIME | sim | — | l.88 |
| `quantidade` | INT | sim | **999** | l.89 |
| `valor` | DECIMAL(10,2) | sim | `0.00` | l.90 |
| `maxParcelas` | INT | sim | 1 | l.91 |
| `idadeMin` | INT | sim | — | l.92 |
| `idadeMax` | INT | sim | — | l.93 |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` | l.94 |
| `unicoPorCpf` | TINYINT(1) | não | 0 | **Step 17**, l.705 |
| `papel` | VARCHAR(20) | não | `'adicional'` | **Step 28**, l.1110 |
| `exigePrincipal` | TINYINT(1) | não | 0 | **Step 28**, l.1111 |
| `exibirVendaPublica` | TINYINT(1) | não | 1 | **Step 28**, l.1112 |
| `ativo` | TINYINT(1) | não | 1 | **Step 32**, l.1207 |

**17 colunas.** Sem índice além da PK — nem em `eventoId`, apesar de todo
carregamento de evento filtrar por ele.

⚠️ `quantidade DEFAULT 999` (l.89): o valor "sem limite" da base real é
**999**, não `NULL`. O rascunho documenta `null = ilimitado` — a carga precisa
decidir se 999 vira `null` ou fica 999 (§2.3).

Semântica de `papel`/`exigePrincipal`/`unicoPorCpf`: `eventos-compra.md §3.2`.

---

### 1.6 `Inscricao` — o convite vendido (`migrate:104-117` + 8 steps)

A maior tabela do esquema: **55 colunas**.

**Núcleo (Step 1, l.104-117):**

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — |
| `participanteId` | INT | não | — |
| `eventoId` | INT | não | — |
| `ingressoTipoId` | INT | sim | — |
| `numeroConvite` | VARCHAR(50) | sim | — |
| `formaPagamento` | VARCHAR(100) | sim | — |
| `dataPurchase` | DATETIME | sim | — |
| `checkinAt` | DATETIME | sim | — |
| `status` | VARCHAR(20) | sim | **`'pago'`** |
| `cieloOrderId` | VARCHAR(255) | sim | — |
| `qrCode` | VARCHAR(255) | sim | — |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |

⚠️ `qrCode` é **coluna morta**: `grep -rn "qrCode"` só a encontra na definição
(`migrate:115`). O QR do voucher é derivado do id (`SNI-INSCRICAO-<id>`,
`lib/voucher-codes.ts`), nunca lido daqui.

**Step 7 (l.374-428) — cupom, comprador, valores, transferência, cancelamento, estorno, grupo, titular:**

| Coluna | Tipo | Nulo | Default | Linha |
|---|---|---|---|---|
| `cupomId` | INT | sim | — | 375 |
| `compradorCpf` | VARCHAR(14) | sim | — | 376 |
| `compradorId` | INT | sim | — | 379 |
| `valorOriginal` | DECIMAL(10,2) | sim | — | 380 |
| `descontoAplicado` | DECIMAL(10,2) | **não** | 0 | 381 |
| `transferidoParaEventoId` | INT | sim | — | 388 |
| `transferidoParaInscricaoId` | INT | sim | — | 389 |
| `transferidoEm` | DATETIME | sim | — | 390 |
| `transferidoPor` | VARCHAR(255) | sim | — | 391 — **e-mail do operador**, não id |
| `origemTransferenciaId` | INT | sim | — | 392 |
| `canceladoEm` | DATETIME | sim | — | 396 |
| `canceladoPor` | VARCHAR(255) | sim | — | 397 — **e-mail** |
| `cancelamentoMotivo` | VARCHAR(500) | sim | — | 398 |
| `cancelamentoAncoraId` | INT | sim | — | 401 |
| `estornoValor` | DECIMAL(10,2) | sim | — | 404 |
| `estornoForma` | VARCHAR(20) | sim | — | 405 |
| `estornoStatus` | VARCHAR(20) | sim | — | 407 |
| `estornoEfetuadoEm` | DATETIME | sim | — | 408 |
| `estornoEfetuadoPor` | VARCHAR(255) | sim | — | 409 — **e-mail** |
| `estornoComprovante` | VARCHAR(255) | sim | — | 410 |
| `estornoObservacao` | VARCHAR(255) | sim | — | 413 |
| `compraGrupoId` | VARCHAR(36) | sim | — | 417 — uuid textual |
| `titularAnteriorId` | INT | sim | — | 421 |
| `titularTrocadoEm` | DATETIME | sim | — | 422 |
| `titularTrocadoPor` | VARCHAR(255) | sim | — | 423 — **e-mail** |
| `titularTrocaMotivo` | VARCHAR(500) | sim | — | 424 |

**Step 10 (l.496-507) — Cielo API 3.0:**

`cieloPaymentId VARCHAR(40)`, `cieloPaymentMethod VARCHAR(20)`,
`cieloTid VARCHAR(40)`, `cieloAuthCode VARCHAR(20)`, `cieloBrand VARCHAR(20)`,
`cieloPixQrCode TEXT`, `cieloPixQrImage LONGTEXT` (base64),
`cieloPixExpiresAt DATETIME`, `cieloReturnCode VARCHAR(32)`,
`cieloReturnMessage VARCHAR(512)` — todas nulas.

**Steps 14, 17/35, 29b, 34:**

| Coluna | Tipo | Nulo | Default | Onde |
|---|---|---|---|---|
| `credenciamentoPedido` | VARCHAR(255) | sim | — | Step 14, l.658 |
| `tipoVenda` | VARCHAR(10) → **VARCHAR(20)** | sim | — | Step 17 l.704; Step 35 l.1260 |
| `comboId` | INT | sim | — | Step 29b, l.1166 |
| `observacao` | VARCHAR(1000) | sim | — | Step 29b, l.1170 |
| `pixData` | DATE | sim | — | Step 34, l.1244 |
| `pixRecibo` | VARCHAR(255) | sim | — | Step 34, l.1245 |
| `cortesiaMotivo` | VARCHAR(500) | sim | — | Step 34, l.1246 |

**Índices (11 além da PK):** `idx_cupomId`, `idx_compradorCpf`,
`idx_compradorId` (l.382-384), `idx_origemTransferencia` (l.393),
`idx_titularAnterior` (l.425), `idx_estornoStatus (estornoStatus, canceladoEm)`
(l.426), `idx_cancelamentoAncora` (l.427), `idx_compraGrupo` (l.428),
`idx_cieloPaymentId` (l.507), `idx_status_datapurchase (status, dataPurchase)`
(l.1188), `idx_inscricao_ingressoTipo (ingressoTipoId)` (l.1208).

**Domínios reais (verificados no código, não declarados no banco):**

| Coluna | Valores em uso | Fonte |
|---|---|---|
| `status` | `pago`, `pendente`, `cancelado`, `expirado`, `transferido` | `pedido.ts:198`, `expiracao.ts:69`, `cancelar/route.ts:195`, `transferir/route.ts:108` |
| `tipoVenda` | `online`, `balcao`, `transferencia` — **e NULL** em toda linha anterior ao Step 17 | `venda:260`, `pedido.ts:198`, `transferir:64`; `relatorio-colunas.ts` |
| `formaPagamento` | `dinheiro`, `cartao`, `cielo`, `cielo-pix`, `cielo-credito`, `credenciamento`, `pix`, `cortesia`, `gratuito`, `transferencia` | `venda/page.tsx:70`, `cancelamento.ts:32-38`, `checkout:331`, `transferir:64` |
| `estornoStatus` | `pendente`, `efetuado`, `sem_estorno` (NULL = não cancelado) | `migrate:406`, `estornos/route.ts:89-91` |
| `estornoForma` | `pix`, `cartao`, `dinheiro`, `sede`, `sem_estorno` | `cancelamento.ts:32-38` |

Máquinas de estado completas: `eventos-compra.md §2`.

**Onde é escrita** (6 pontos, com listas de colunas diferentes):
`api/venda/route.ts:256-260` (balcão), `lib/pedido.ts:192-198` (confirmação
Cielo), `api/comprar/checkout/route.ts:328-331` (gratuito online),
`api/comprar/combo-checkout/route.ts:215-218`,
`api/inscricoes/transferir/route.ts:61-64`,
`api/eventos/[id]/importar-convites/route.ts:333-336`.

---

### 1.7 `IngressoCampo` — campo personalizado do tipo de convite (`migrate:128-139`)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — |
| `ingressoTipoId` | INT | não | — |
| `label` | VARCHAR(255) | não | — |
| `tipo` | VARCHAR(20) | não | `'texto'` |
| `opcoesJson` | TEXT | sim | — |
| `obrigatorio` | TINYINT(1) | não | 0 |
| `ordem` | INT | não | 0 |
| `ativo` | TINYINT(1) | não | 1 |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |

Índice `idx_ingressoTipo (ingressoTipoId)` (l.138).

`tipo ∈ {'texto','select'}` — `campos/route.ts:72` normaliza qualquer outro
valor para `'texto'`; `admin/eventos/[id]/page.tsx:1555-1556` só oferece esses
dois. `opcoesJson` é um array JSON de strings, obrigatório quando
`tipo = 'select'` (`campos/route.ts:80` descarta o campo se vier vazio).
`ativo = 0` é o soft-delete: a leitura filtra `AND ativo = 1`
(`campos/route.ts:29`), mas a resposta já dada continua resolvendo.

---

### 1.8 `InscricaoResposta` — a resposta do participante (`migrate:150-159`)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — |
| `inscricaoId` | INT | não | — |
| `campoId` | INT | sim | — |
| `label` | VARCHAR(255) | não | — |
| `valor` | TEXT | sim | — |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |

Índices `idx_inscricao`, `idx_campo` (l.157-158). `label` é **snapshot**
deliberado (comentário `migrate:146-147`): o relatório continua correto se o
campo mudar de nome ou for desativado. Escrita em 4 lugares
(`checkout:338`, `pedido.ts:217`, `transferir:95`, `r/campo/[token]:93` —
este último faz `UPDATE` quando já existe).

---

### 1.9 `Configuracao` — chave/valor global (`migrate:326-330`)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `chave` | VARCHAR(100) | não | — (**PK**) |
| `valor` | TEXT → **LONGTEXT** | sim | — (`migrate:340`) |
| `updatedAt` | DATETIME | sim | `CURRENT_TIMESTAMP ON UPDATE` |

`LONGTEXT` porque os logos são gravados em **base64** e estouravam os ~64 KB do
`TEXT` (comentário `migrate:337-338`). O `admin/config/route.ts:42` repete o
`ALTER` como auto-heal.

As 24 chaves em uso — e quais são segredo — estão em
`eventos-operacao.md §6.2`; §4 abaixo trata do que precisa ser cifrado.

---

### 1.10 `Cupom` (`migrate:350-367` + Step 29b)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — |
| `eventoId` | INT | não | — |
| `codigo` | VARCHAR(50) | não | — |
| `descricao` | VARCHAR(255) | sim | — |
| `tipo` | **ENUM('percentual','valor')** | não | `'percentual'` |
| `valor` | DECIMAL(10,2) | não | — |
| `ingressoTipoId` | INT | sim | — |
| `vigenciaInicio` | DATETIME | sim | — |
| `vigenciaFim` | DATETIME | sim | — |
| `maxUsosTotal` | INT | sim | — |
| `maxUsosPorCpf` | INT | sim | — |
| `ativo` | TINYINT(1) | não | 1 |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |
| `comboId` | INT | sim | — | Step 29b, l.1172 |

Índices: `UNIQUE uniq_evento_codigo (eventoId, codigo)` (l.364),
`idx_eventoId`, `idx_ingressoTipoId` (l.365-366).

⚠️ **O único `ENUM` do esquema inteiro** (`tipo`). ⚠️ `valor` é
`DECIMAL(10,2)` para os **dois** significados: em `tipo='percentual'` é um
percentual **com duas casas** (12,50 % é representável); em `tipo='valor'` é
reais. Ver §2.3 — o rascunho colapsou os dois em `integer`.

---

### 1.11 `MagicLink` — acesso do comprador sem conta (`migrate:474-485`)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `token` | VARCHAR(64) | não | — (**PK — não há `id`**) |
| `participanteId` | INT | não | — |
| `eventoId` | INT | sim | — |
| `ingressoTipoId` | INT | sim | — |
| `quantity` | INT | sim | — |
| `expiresAt` | DATETIME | não | — |
| `usedAt` | DATETIME | sim | — |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |

Índices `idx_participanteId`, `idx_expiresAt` (l.483-484).

⚠️ **O token é guardado em claro** e é a própria chave primária:
`magic-link/request/route.ts:54` gera `randomBytes(32).toString("hex")` (64
hex) e grava; `verify/route.ts:26-27` faz `WHERE token = ?`. Quem lê o banco
lê os links válidos. O rascunho já corrige isso com `token_hash` — mas perde o
contexto de compra (§2.3).

`eventoId`/`ingressoTipoId`/`quantity` **não são decoração**: reconstroem o
carrinho quando a pessoa volta pelo link (`verify/route.ts:66-70`) e são o
alvo da ação `comprar_ingresso` da régua de e-mails
(`cron/emails/route.ts:147-171`).

---

### 1.12 `Regional` (`migrate:523-529`)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — |
| `nome` | VARCHAR(255) | não | — (`UNIQUE uniq_nome`) |
| `correspondeRegionalId` | INT | sim | — (também no Step 16, l.687 — redundante) |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |

Auto-referência **lógica**, sem FK. `DELETE /api/regionais/[id]` não limpa o
`correspondeRegionalId` de quem apontava para a regional apagada
(`eventos-identidade.md §3.2`) — logo pode haver ponteiro pendurado.

---

### 1.13 `Organizacao` (`migrate:532-537`)

`id INT AUTO_INCREMENT PK`, `nome VARCHAR(255) NOT NULL UNIQUE (uniq_nome)`,
`createdAt DATETIME DEFAULT CURRENT_TIMESTAMP`. Três colunas. Alimenta o
select do checkout (`api/comprar/listas`) — e **não** o do painel, que usa a
lista fixa `constants.ts:118-123` (`eventos-identidade.md §3.3`).

---

### 1.14 `User` — o operador (`migrate:540-549` + Step 21)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — |
| `nome` | VARCHAR(255) | não | — |
| `username` | VARCHAR(100) | não | — (`UNIQUE uniq_username`) |
| `email` | VARCHAR(255) | sim | — |
| `passwordHash` | VARCHAR(255) | não | — |
| `ativo` | TINYINT(1) | não | 1 |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |
| `perfilId` | INT | sim | — | Step 21, l.869 |

⚠️ `email` é **anulável e não único**, mas é a identidade que a auditoria grava
(`AuditLog.userEmail`) e que `Inscricao.canceladoPor`/`transferidoPor`/
`titularTrocadoPor`/`estornoEfetuadoPor` guardam como texto. Operador sem
e-mail deixa rastro anônimo.

---

### 1.15 `CieloAccount` — credenciais do adquirente (`migrate:552-561`)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — |
| `nome` | VARCHAR(100) | não | — (`UNIQUE uniq_nome`) |
| `merchantId` | VARCHAR(40) | não | — |
| `merchantKey` | VARCHAR(80) | não | — ⚠️ **em texto puro** |
| `environment` | VARCHAR(20) | não | `'production'` |
| `isDefault` | TINYINT(1) | não | 0 |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |

`environment ∈ {'production','sandbox'}` (`migrate:641` normaliza
`homologacao → sandbox`). `isDefault` é lido por
`cielo/api3/diagnose/route.ts:56` (`WHERE isDefault = 1 ORDER BY id ASC LIMIT 1`)
e ordena a listagem (`cielo-accounts/route.ts:18`) — **o rascunho o perdeu**
(§2.3). Semeada a partir da `Configuracao` no Step 13 (l.624-652). Ver §4.

---

### 1.16 `PedidoPendente` — a tentativa de compra online (`migrate:564-593`)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — |
| `compradorId` | INT | não | — |
| `compradorCpf` | VARCHAR(14) | sim | — |
| `eventoId` | INT | não | — |
| `ingressoTipoId` | INT | **não** | — |
| `quantity` | INT | não | 1 |
| `cupomId` | INT | sim | — |
| `valorOriginal` | DECIMAL(10,2) | não | — |
| `descontoAplicado` | DECIMAL(10,2) | não | 0 |
| `participantesJson` | TEXT | sim | — |
| `status` | VARCHAR(20) | não | `'pendente'` |
| `cieloOrderId` | VARCHAR(40) | sim | — |
| `cieloPaymentId` | VARCHAR(40) | sim | — |
| `cieloPaymentMethod` | VARCHAR(20) | sim | — |
| `cieloTid` | VARCHAR(40) | sim | — |
| `cieloAuthCode` | VARCHAR(20) | sim | — |
| `cieloBrand` | VARCHAR(20) | sim | — |
| `cieloPixQrCode` | TEXT | sim | — |
| `cieloPixQrImage` | LONGTEXT | sim | — (base64) |
| `cieloPixExpiresAt` | DATETIME | sim | — |
| `cieloReturnCode` | VARCHAR(32) | sim | — |
| `cieloReturnMessage` | VARCHAR(512) | sim | — |
| `inscricaoIds` | **VARCHAR(255)** | sim | — |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |
| `updatedAt` | DATETIME | sim | `CURRENT_TIMESTAMP ON UPDATE` |
| `comboId` | INT | sim | — | Step 29b, l.1168 |

**26 colunas.** Índices: `idx_cieloOrderId`, `idx_cieloPaymentId`, `idx_status`
(l.590-592); `idx_status_pixexp (status, cieloPixExpiresAt)` e
`idx_status_created (status, createdAt)` (Step 30, l.1186-1187).

`status ∈ {pendente, confirmado, cancelado, expirado}` (verificado em todos os
`UPDATE PedidoPendente SET status`).

⚠️ `inscricaoIds VARCHAR(255)` guarda os ids das inscrições geradas **como CSV**
(`pedido.ts:224`, `join(",")`; lido com `split(",")` em
`cielo/api3/status:25`, `resumo:78`, `autorizar:50`). Com ids de 5-6 dígitos,
255 caracteres comportam ~35 inscrições: **um combo grande trunca em silêncio**
(MySQL não estrito) ou derruba o `UPDATE` (estrito). É um dos motivos para o
Postgres inverter a relação (`inscricoes.pedido_id`, §7).

`ingressoTipoId NOT NULL` mesmo em pedido de combo: guarda a **âncora** (o 1º
item do combo) — `cielo/link/route.ts:85`, `tipoAncora`.

---

### 1.17 `ComissaoSetorPadrao` (`migrate:722-728`)

`id`, `nome VARCHAR(255) NOT NULL UNIQUE (uniq_nome)`, `ordem INT NOT NULL DEFAULT 0`,
`createdAt`. Semeada com 6 setores (`migrate:920`): Coordenação Geral,
Andamento da Programação, Interna, Externa, Estacionamento, Cozinha e Refeitório.

### 1.18 `ComissaoFuncaoPadrao` (`migrate:730-736` + Step 22)

`id`, `nome VARCHAR(255) NOT NULL`, `ordem INT NOT NULL DEFAULT 0`, `createdAt`,
`setorId INT NULL` (Step 22, l.952). Semeada com 4 funções (`migrate:934`):
Coordenador, Encarregado, Assistente, Monitor.

Índices: `idx_setorId` (l.953); o `UNIQUE uniq_nome` **é derrubado** (l.965) e
substituído por `UNIQUE uniq_setor_nome (setorId, nome)` (l.971). O Step 24
(l.1032-1065) atribui as funções órfãs ao primeiro setor e **apaga** as que
colidirem com o novo único.

⚠️ `setorId` é anulável e o único `(setorId, nome)` no MySQL **não impede**
duas funções com o mesmo nome e `setorId IS NULL` (NULL não colide). Podem
existir órfãs se o Step 24 nunca rodou.

### 1.19 `ComissaoMembro` (`migrate:738-747`)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — |
| `eventoId` | INT | **não** | — |
| `participanteId` | INT | **não** | — |
| `setor` | VARCHAR(255) | **não** | — |
| `funcao` | VARCHAR(255) | **não** | — |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |

Índices `idx_evento`, `idx_participante` (l.745-746).

⚠️ `setor` e `funcao` são **texto copiado** dos cadastros padrão, não ids — se o
setor for renomeado, o membro fica com o nome antigo. E `participanteId` é
**obrigatório**: hoje **todo membro é uma pessoa cadastrada**; nome, telefone e
e-mail vêm do `JOIN Participant` (`comissao/route.ts:25`). O rascunho supõe o
contrário (§2.3).

---

### 1.20 `CarrinhoAbandonado` (`migrate:772-787`)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — |
| `eventoId` | INT | não | — |
| `ingressoTipoId` | INT | sim | — |
| `participanteId` | INT | sim | — |
| `nome` | VARCHAR(255) | sim | — |
| `email` | VARCHAR(255) | sim | — |
| `telefone` | VARCHAR(30) | sim | — |
| `cpf` | VARCHAR(14) | sim | — |
| `quantity` | INT | não | 1 |
| `convertido` | TINYINT(1) | não | 0 |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |
| `updatedAt` | DATETIME | sim | `CURRENT_TIMESTAMP ON UPDATE` |

Índices: `UNIQUE uniq_evento_cpf (eventoId, cpf)` (l.785) — é ele que faz o
`ON DUPLICATE KEY UPDATE` de `api/carrinho/route.ts:19-26` funcionar;
`idx_convertido` (l.786). `convertido = 1` é gravado pela confirmação
(`pedido.ts:230`, `checkout:345`). Consumido pelo segmento `carrinho` da régua
(`cron/emails/route.ts:92`).

⚠️ Guarda **nome, e-mail, telefone e CPF em texto**, duplicando a pessoa: é uma
tabela de dado pessoal de quem talvez nem tenha cadastro. Tem peso de LGPD.

---

### 1.21 `EmailAgendado` — a régua (`migrate:789-804` + l.829-834)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — |
| `eventoId` | INT | não | — |
| `nomeInterno` | VARCHAR(255) | não | — |
| `assunto` | VARCHAR(255) | não | — |
| `corpo` | LONGTEXT | sim | — (HTML) |
| `agendamentoTipo` | VARCHAR(20) | não | `'fixa'` |
| `dataEnvio` | DATETIME | sim | — |
| `dias` | INT | sim | — |
| `segmento` | VARCHAR(20) | não | `'todos'` |
| `ingressoTipoId` | INT | sim | — |
| `ativo` | TINYINT(1) | não | 1 |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |
| `updatedAt` | DATETIME | sim | `CURRENT_TIMESTAMP ON UPDATE` |
| `frequencia` | VARCHAR(20) | não | `'once'` | l.829 |
| `campoId` | INT | sim | — | l.830 |
| `ingressoTipoIdB` | INT | sim | — | l.831 |
| `acao` | VARCHAR(20) | não | `'nenhuma'` | l.832 |
| `acaoIngressoTipoId` | INT | sim | — | l.833 |
| `anexarVoucher` | TINYINT(1) | não | 0 | l.834 |

**19 colunas.** Índice `idx_evento` (l.803). Domínios de `frequencia`,
`agendamentoTipo`, `segmento` e `acao`: tabela em `eventos-operacao.md §5.5`.

### 1.22 `EmailEnvio` — o que já foi enviado (`migrate:806-816` + l.836-838)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — |
| `emailAgendadoId` | INT | não | — |
| `participanteId` | INT | sim | — |
| `email` | VARCHAR(255) | não | — |
| `status` | VARCHAR(20) | não | `'enviado'` |
| `erro` | VARCHAR(500) | sim | — |
| `sentAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |
| `periodo` | VARCHAR(10) | não | `''` | l.836 |

`status ∈ {processando, enviado, erro}`. O `UNIQUE uniq_email_dest
(emailAgendadoId, email)` **é derrubado** (l.837) e trocado por
`uniq_email_periodo (emailAgendadoId, email, periodo)` (l.838) — é essa chave
que dá a idempotência do envio recorrente. Índice `idx_agendado` (l.815).

⚠️ A dedup é por **e-mail**, não por pessoa: duas pessoas que compartilham
e-mail (comum em família, §5.2) recebem **um** e-mail só.

---

### 1.23 `Perfil` — o RBAC do operador (`migrate:852-859`)

`id`, `nome VARCHAR(255) NOT NULL UNIQUE (uniq_nome)`, `isAdmin TINYINT(1) NOT
NULL DEFAULT 0`, `permissoes TEXT NULL`, `createdAt`. `permissoes` é um **array
JSON de strings** (`auth.ts:49`, `JSON.parse(... || "[]")`). Semeado com
`("Administrador", isAdmin=1, "[]")` (l.881).

⚠️ `resolvePerfil` (`auth.ts:39-55`) devolve `{ isAdmin: true }` quando
`perfilId` é nulo, quando o perfil não existe **e quando a consulta falha** —
falha do banco vira administrador. Não é esquema, mas migra junto se o modelo
for copiado. As 20 permissões e o mapeamento para capacidades `eventos.*` estão
em `eventos-identidade.md §1.3 e §6.1`.

### 1.24 `AuditLog` (`migrate:894-906`)

`id`, `userEmail VARCHAR(255) NULL`, `acao VARCHAR(80) NOT NULL`,
`entidade VARCHAR(80) NULL`, `entidadeId VARCHAR(80) NULL`, `detalhes TEXT NULL`,
`ip VARCHAR(64) NULL`, `createdAt DATETIME DEFAULT CURRENT_TIMESTAMP`.
Índices `idx_createdAt`, `idx_entidade`, `idx_userEmail` (l.903-905).

`lib/audit.ts:31-41` corta `acao`/`entidade`/`entidadeId` em 80 e `detalhes`
(JSON) em **2 000** caracteres; nunca lança. `entidadeId` é **texto** porque
serve a ids inteiros e a chaves compostas.

### 1.25 `Orientador` (`migrate:983-989`)

`id`, `nome VARCHAR(255) NOT NULL`, `fotoUrl LONGTEXT NULL` (**base64**),
`bio VARCHAR(150) NULL`, `createdAt`. Sem unicidade de nome.

### 1.26 `EventoOrientador` (`migrate:991-1000`)

`id INT AUTO_INCREMENT PK`, `eventoId INT NOT NULL`, `orientadorId INT NOT NULL`,
`ordem INT NOT NULL DEFAULT 0`, `createdAt`.
`UNIQUE uniq_evento_orientador (eventoId, orientadorId)` (l.997), `idx_evento`,
`idx_orientador`. O `id` **não é referenciado por nada** — a lista do evento é
apagada e reinserida inteira (`eventos/[id]/orientadores/route.ts:43`).

### 1.27 `RateLimit` (`migrate:1014-1021`)

`id`, `bucket VARCHAR(80) NOT NULL`, `identifier VARCHAR(190) NOT NULL`,
`createdAt DATETIME DEFAULT CURRENT_TIMESTAMP`.
Índices `idx_bucket_identifier_time (bucket, identifier, createdAt)` e
`idx_createdAt`. `identifier` é IP ou `ip:cpf`, cortado em 190
(`rate-limit.ts:29`) — **cabe dado pessoal**. Janela deslizante em SQL,
*fail-open* (`rate-limit.ts:8-9`), limpeza oportunista a 2 % das chamadas
(l.59-62). **Tabela descartável**: nada aqui precisa migrar.

---

### 1.28 `Combo` (`migrate:1127-1139` + Step 29b)

| Coluna | Tipo | Nulo | Default |
|---|---|---|---|
| `id` | INT AUTO_INCREMENT | não | — |
| `eventoId` | INT | não | — |
| `nome` | VARCHAR(255) | não | — |
| `descricao` | VARCHAR(500) | sim | — |
| `valor` | DECIMAL(10,2) | não | 0 |
| `quantidade` | INT | sim | — (**null = ilimitado**, ao contrário de `IngressoTipo`) |
| `vendaInicio` | DATETIME | sim | — |
| `vendaFim` | DATETIME | sim | — |
| `ativo` | TINYINT(1) | não | 1 |
| `createdAt` | DATETIME | sim | `CURRENT_TIMESTAMP` |
| `limitePorCpf` | INT | sim | — | Step 29b, l.1164 |
| `maxParcelas` | INT | não | 1 | Step 29b, l.1165 |

Índice `idx_evento` (l.1138).

### 1.29 `ComboItem` (`migrate:1141-1147`)

`id INT AUTO_INCREMENT PK`, `comboId INT NOT NULL`, `ingressoTipoId INT NOT NULL`,
`quantidade INT NOT NULL DEFAULT 1`. Índice `idx_combo`. **Sem `createdAt`** —
a única tabela sem ele. Sem unicidade `(comboId, ingressoTipoId)`: o mesmo tipo
pode aparecer duas vezes no combo.

### 1.30 `UserPreferencia` (`migrate:1224-1230`)

`userId INT NOT NULL`, `chave VARCHAR(100) NOT NULL`, `valor LONGTEXT`,
`updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE`.
**PK composta `(userId, chave)`** — não tem `id`. Chaves em uso:
`relatorios:evento`, `relatorios:lista`, `tema`.

### 1.31 `RegionalPromotorEmail` (`migrate:1277-1287`)

`id`, `regionalId INT NOT NULL`, `promotorId INT NOT NULL`,
`email VARCHAR(255) NOT NULL`, `createdAt`, `updatedAt`.
`UNIQUE uniq_regional_promotor (regionalId, promotorId)` (l.1284),
`idx_promotor` (l.1285). Um endereço por par regional × promotor, porque "o
presidente da regional PROSPERIDADE não é o mesmo de JOVENS"
(comentário l.1269-1274). Detalhes em `eventos-identidade.md §3.4`.


---

## 2. Tradução coluna a coluna para `supabase/rascunhos/eventos_schema.sql`

### 2.1 Regras transversais (o que muda em toda coluna)

| Origem MySQL | Destino Postgres | Regra | Onde já está implementado |
|---|---|---|---|
| `camelCase` | `snake_case` | mecânico | rascunho inteiro |
| `INT AUTO_INCREMENT` | `integer` + sequência com `setval` | **ids preservados** (ADR 0002:21-24) | rascunho l.7-9; `setval` ainda não escrito (`migrar-mysql.ts:96`) |
| `DECIMAL(10,2)` | `integer` (centavos) | `centavosDe()` — `"1.234,56"` e `1234.56` → `123456` | `src/lib/dominio/dinheiro.ts:8-16`; `transformar.ts:107-109` |
| `TINYINT(1)` | `boolean` | `Number(v) === 1` | `transformar.ts:112-114` |
| `DATETIME` (sem fuso) | `timestamptz` | interpretar como **America/Sao_Paulo** | ⚠️ **não implementado**: `transformar.ts:59-64` usa `new Date(v).toISOString()`, que assume o fuso do **processo**. Ver §5.6 |
| `DATE` | `date` | direto | — |
| `VARCHAR(n)` | `text` (+ `check` onde a regra é real) | largura de coluna não é regra de negócio | rascunho |
| `LONGTEXT` com base64 | `text` com **URL do Storage** | mover imagem para o bucket | rascunho l.41 (comentário), sem script |
| `VARCHAR(36)` uuid textual | `uuid` | `compraGrupoId` | rascunho l.200 |
| ausência de FK | FK de verdade | **restrição nova**: pode recusar linha existente (§5.4) | rascunho |
| `''` (string vazia) | `NULL` | e-mail, CPF, CodSNI | `transformar.ts:53-56` |

### 2.2 O que o rascunho traduziu, tabela por tabela

O rascunho cobre **19 das 31** tabelas. As 12 restantes estão declaradas como
"ainda não traduzidas" no próprio arquivo (l.295-302) e tratadas em §2.5.

#### 2.2.1 `Local` → `eventos.locais` (rascunho l.22-33)

| MySQL | Postgres | Estado |
|---|---|---|
| `id` | `id integer primary key` | ok |
| — | `legado_id integer unique` | **redundante** (o id é preservado; §2.4-E7) |
| `nome`, `endereco`, `bairro`, `cidade`, `telefone`, `email` | idem, `text` | ok |
| `estado VARCHAR(2)` | `estado char(2)` | ⚠️ `char(2)` **preenche com espaço**; usar `text check (estado ~ '^[A-Z]{2}$')` |
| `contaCielo VARCHAR(255)` | — | **FALTA** — coluna viva (§1.3) |
| `createdAt` | `criado_em timestamptz not null default now()` | ok |

#### 2.2.2 `Promotor` → `eventos.promotores` (l.35-43)

| MySQL | Postgres | Estado |
|---|---|---|
| `id`, `nome`, `telefone`, `email`, `createdAt` | idem | ok |
| `logoUrl LONGTEXT` (base64) | `logo_url text` | ok (comentado como Storage) |
| `usarCorrespondenciaRegional TINYINT(1) DEFAULT 0` | — | **FALTA** |

#### 2.2.3 `Orientador` → `eventos.orientadores` (l.45-52)

Completa: `id`, `nome`, `fotoUrl → foto_url`, `bio`, `createdAt → criado_em`.
`bio VARCHAR(150)` vira `text` sem limite — a tela ainda limita a 150.

#### 2.2.4 `CieloAccount` → `eventos.contas_cielo` (l.54-62)

| MySQL | Postgres | Estado |
|---|---|---|
| `id`, `nome` | idem | ok |
| `merchantId` | `merchant_id text not null` | ok |
| `merchantKey` (texto puro) | `merchant_key_cifrada text not null` | **corrigido** — ver §4 |
| `environment ('production'\|'sandbox')` | `ambiente ('producao'\|'sandbox')` | ⚠️ **mudou de valor**: `production → producao`. O carregador precisa traduzir; nenhum código faz isso hoje |
| `isDefault TINYINT(1) NOT NULL DEFAULT 0` | — | **FALTA** — usada por `cielo/api3/diagnose:56` |
| `createdAt` | `criado_em` | ok |
| — | falta `unique (nome)` | **FALTA** (origem tem `uniq_nome`) |

#### 2.2.5 `Evento` → `eventos.eventos` (l.66-89)

| MySQL | Postgres | Estado |
|---|---|---|
| `id`, `nome`, `slug`, `dataInicial`, `dataFinal`, `localId`, `promotorId`, `cieloAccountId`, `ativo`, `createdAt` | `id`, `nome`, `slug unique`, `data_inicial`, `data_final`, `local_id`, `promotor_id`, `conta_cielo_id`, `ativo`, `criado_em` | ok |
| `voucherBannerUrl`, `voucherLogoUrl` | `voucher_banner_url`, `voucher_logo_url` | ok |
| `comprarLogoUrl LONGTEXT` | — | **FALTA** (gravada por `eventos/route.ts:89`) |
| `voucherCorPrimaria DEFAULT '#1e3a5f'` | `voucher_cor_primaria default '#132460'` | ⚠️ **default divergente** (§2.4-E5) |
| `voucherCorSecundaria DEFAULT '#f59e0b'` | `… default '#B45309'` | ⚠️ idem |
| `voucherBoasVindas`, `voucherInstrucoes`, `voucherRodape` | idem | ok |
| `voucherMostrarParticipante/Evento/Ingresso/QRCode/Pagamento` (5 TINYINT) | `voucher_mostrar jsonb` com 5 chaves | ok (colapso deliberado); a carga precisa montar o jsonb |
| — | `landing jsonb not null default '{}'` | **coluna inventada** (§2.4-E1) |

#### 2.2.6 `EventoOrientador` → `eventos.evento_orientadores` (l.91-96)

`id` AUTO_INCREMENT descartado, PK composta `(evento_id, orientador_id)` —
correto, nada referencia o id. `ordem` ok. `createdAt` perdido (irrelevante).

#### 2.2.7 `IngressoTipo` → `eventos.ingresso_tipos` (l.98-117)

**Todas as 17 colunas presentes.** Diferenças:

| MySQL | Postgres | Nota |
|---|---|---|
| `valor DECIMAL(10,2) DEFAULT 0.00` | `valor_centavos integer not null default 0 check (>= 0)` | ok |
| `quantidade INT DEFAULT 999` | `quantidade integer` (comentário "null = ilimitado") | ⚠️ **default divergente**: a base traz `999`, não `null`. Decidir se 999 vira `null` na carga |
| `maxParcelas INT` | `max_parcelas smallint not null default 1 check (>= 1)` | linhas com `maxParcelas = 0` (se existirem) são recusadas pelo `check` |
| `idadeMin/Max INT` | `smallint` | ok |
| `papel`, `exigePrincipal`, `exibirVendaPublica`, `unicoPorCpf`, `ativo` | idem | ok |
| `createdAt` | `criado_em` | ok |

#### 2.2.8 `IngressoCampo` → `eventos.ingresso_campos` (l.120-129)

| MySQL | Postgres | Estado |
|---|---|---|
| `label` | `rotulo` | ok (renomeado) |
| `opcoesJson TEXT` | `opcoes jsonb` | ok — a carga faz `JSON.parse` |
| `tipo`, `obrigatorio`, `ordem`, `ingressoTipoId` | idem | ok |
| `ativo TINYINT(1) NOT NULL DEFAULT 1` | — | **FALTA** — é o soft-delete |
| `createdAt` | — | **FALTA** |
| — | falta `check (tipo in ('texto','select'))` | recomendável |

#### 2.2.9 `Combo` → `eventos.combos` (l.131-145)

Completa (12 colunas). `valor → valor_centavos`, `limitePorCpf → limite_por_cpf smallint`.
⚠️ `limite_por_cpf smallint` contra `INT` na origem — improvável estourar, mas
é um estreitamento silencioso.

#### 2.2.10 `ComboItem` → `eventos.combo_itens` (l.147-152)

Completa. `quantidade smallint not null default 1 check (>= 1)`.
Sem `legado_id` (ok, id preservado). Falta o índice em `combo_id` (a origem tem
`idx_combo`).

#### 2.2.11 `Cupom` → `eventos.cupons` (l.154-169)

| MySQL | Postgres | Estado |
|---|---|---|
| `id`, `eventoId`, `codigo`, `tipo`, `ingressoTipoId`, `comboId`, `maxUsosTotal`, `maxUsosPorCpf`, `vigenciaInicio`, `vigenciaFim`, `ativo` | idem | ok |
| `tipo ENUM` | `text check (tipo in ('percentual','valor'))` | ok |
| `valor DECIMAL(10,2)` | `valor integer` ("percentual 0..100 **ou** centavos") | ⚠️ **perde a casa decimal do percentual** (§2.4-E4) |
| `descricao VARCHAR(255)` | — | **FALTA** (gravada por `cupons/route.ts:132`) |
| `createdAt` | — | **FALTA** |
| `UNIQUE (eventoId, codigo)` | `unique (evento_id, codigo)` | ok |

#### 2.2.12 `PedidoPendente` → `eventos.pedidos` (l.173-190)

| MySQL | Postgres | Estado |
|---|---|---|
| `id` | `id integer primary key` | ok |
| `compradorId INT` | `comprador_id uuid not null references public.pessoas(id)` | ⚠️ **FK impossível para comprador rejeitado** (§2.4-E9) |
| `compradorCpf VARCHAR(14)` | — | **FALTA** — usada para casar `CarrinhoAbandonado` (`pedido.ts:230`) e como CPF do pagador na Cielo |
| `eventoId`, `ingressoTipoId`, `comboId`, `cupomId` | idem | ok |
| `quantity` | `quantidade smallint not null default 1` | ok (`smallint` basta) |
| `valorOriginal DECIMAL NOT NULL` | `valor_original_centavos integer not null default 0` | ok |
| `descontoAplicado` | `desconto_centavos` | ok |
| `participantesJson TEXT NULL` | `participantes jsonb **not null**` | ⚠️ **NOT NULL sem base**: origem é anulável (§2.4-E6) |
| `status` | `text check (…4 valores…)` | ok, bate com o código |
| 10 colunas `cielo*` | `cielo jsonb not null default '{}'` | ok (colapso); a carga monta o jsonb; `cieloPixQrImage` (base64) **não deve entrar** no jsonb — vai ao Storage ou é descartada |
| `inscricaoIds VARCHAR(255)` CSV | `inscricao_ids integer[]` | ok — e §7 propõe inverter para `inscricoes.pedido_id` |
| `createdAt`, `updatedAt` | `criado_em`, `atualizado_em` | ok; falta o trigger de `atualizado_em` |
| índices `idx_cieloOrderId/PaymentId/status`, `idx_status_pixexp`, `idx_status_created` | — | **FALTAM todos** |

#### 2.2.13 `Inscricao` → `eventos.inscricoes` (l.192-233)

Das **55** colunas de origem, o rascunho traduz **29**. Faltam **19**
(descontadas 7 deliberadamente colapsadas/descartadas).

| MySQL | Postgres | Estado |
|---|---|---|
| `id` | `id integer primary key` | ok |
| `participanteId INT NOT NULL` | `pessoa_id uuid not null references public.pessoas(id)` | ok em forma; **FK impossível** para participante rejeitado (§2.4-E9) |
| `eventoId`, `ingressoTipoId`, `comboId`, `cupomId` | idem | ok |
| — | `pedido_id integer references eventos.pedidos(id)` | **coluna nova, boa** — precisa ser derivada de `PedidoPendente.inscricaoIds` na carga |
| `compraGrupoId VARCHAR(36)` | `compra_grupo_id uuid` | ok |
| `compradorId INT` | `comprador_id uuid references public.pessoas(id)` | ok |
| `compradorCpf VARCHAR(14)` | — | descartável **se** `comprador_id` sempre resolver; hoje não resolve (backfill `migrate:441-447` só cobre CPF que mapeia a **um** participante) |
| `numeroConvite`, `formaPagamento`, `dataPurchase → data_compra`, `checkinAt → checkin_em`, `createdAt → criado_em` | idem | ok |
| `status` | `check (pendente,pago,cancelado,expirado,transferido)` | valores ok; ⚠️ **default mudou de `'pago'` para `'pendente'`** |
| `tipoVenda` | `tipo_venda text **not null** default 'online' check (online,balcao,**importado**)` | ⚠️ **dois erros**: `importado` não existe e falta `transferencia`; e `not null` recusa as linhas legadas com `NULL` (§2.4-E2, E3) |
| `valorOriginal DECIMAL NULL` | `valor_original_centavos integer not null default 0` | ⚠️ NULL vira 0 — "convite grátis" onde era "valor desconhecido" |
| `descontoAplicado` | `desconto_centavos` | ok |
| `credenciamentoPedido`, `pixData`, `pixRecibo`, `cortesiaMotivo` | idem | ok |
| `cieloOrderId` | `cielo_order_id` | ok |
| `cieloPaymentId/Method/Tid/AuthCode/Brand/PixQrCode/PixQrImage/PixExpiresAt/ReturnCode/ReturnMessage` (10) | — | **FALTAM** — usar `cielo jsonb` como em `pedidos` |
| `qrCode` | — | ok descartar (coluna morta, §1.6) |
| `canceladoEm` | `cancelado_em` | ok |
| `canceladoPor VARCHAR(255)` (**e-mail**) | `cancelado_por uuid references public.pessoas(id)` | ⚠️ **mudança de tipo sem ponte**: o e-mail do operador precisa resolver para `pessoas.id`; operador sem e-mail ou já removido não resolve (§2.4-E8) |
| `cancelamentoMotivo` | `cancelamento_motivo` | ok |
| `cancelamentoAncoraId` | — | **FALTA** — é a chave do grupo de cancelamento |
| `estornoStatus` | `estorno_status text` (comentário `null\|pendente\|feito\|recusado`) | ⚠️ **valores errados**: a origem usa `pendente\|efetuado\|sem_estorno` |
| `estornoValor/Forma/EfetuadoEm/EfetuadoPor/Comprovante/Observacao` (6) | `estorno jsonb` | colapso aceitável, mas ⚠️ `estorno_efetuado_em` fora de coluna impede índice; a fila da Sede filtra por `(estornoStatus, canceladoEm)` |
| `transferidoParaEventoId` | — | **FALTA** |
| `transferidoParaInscricaoId` | `transferido_para_id integer` (ambíguo) | precisa nome explícito |
| `origemTransferenciaId` | `transferido_de_id integer` | ok (renomeado) |
| `transferidoEm`, `transferidoPor` | — | **FALTAM** |
| `titularAnteriorId` | `titular_anterior_id uuid` | ok |
| `titularTrocadoEm` | `titular_trocado_em` | ok |
| `titularTrocadoPor`, `titularTrocaMotivo` | — | **FALTAM** |
| `observacao VARCHAR(1000)` | — | **FALTA** (ObsPgto da importação) |
| índices | 4 criados (l.230-233) | faltam os de `(status, data_compra)`, `(estorno_status, cancelado_em)`, `ingresso_tipo_id`, `pedido_id`, `comprador_id`, `cancelamento_ancora_id` |

#### 2.2.14 `InscricaoResposta` → `eventos.inscricao_respostas` (l.235-241)

`label → rotulo` ok, `campoId → campo_id` ok. **Falta `createdAt`** e o índice
`(inscricao_id)` — o `on delete cascade` supre a integridade, não a leitura.

#### 2.2.15 `MagicLink` → `eventos.magic_links` (l.244-251)

| MySQL | Postgres | Estado |
|---|---|---|
| `token VARCHAR(64)` **PK** | `token_hash text not null unique` | **melhoria** (§4); a carga **não consegue** gerar o hash sem o token — pode, guardando `sha256(token)` |
| — | `id integer primary key` | ⚠️ **id sem origem** (§2.4-E10) |
| `participanteId` | `pessoa_id uuid not null references public.pessoas(id)` | ok em forma |
| `eventoId`, `ingressoTipoId`, `quantity` | — | **FALTAM** — quebram o retorno ao carrinho e a ação `comprar_ingresso` da régua |
| `expiresAt`, `usedAt`, `createdAt` | `expira_em`, `usado_em`, `criado_em` | ok |

#### 2.2.16 `CarrinhoAbandonado` → `eventos.carrinhos_abandonados` (l.253-261)

| MySQL | Postgres | Estado |
|---|---|---|
| `id`, `eventoId`, `convertido`, `createdAt` | idem | ok |
| `cpf VARCHAR(14) NULL` | `cpf text **not null**` | ⚠️ recusa linha sem CPF |
| `email` | `email` | ok |
| `ingressoTipoId`, `participanteId`, `nome`, `telefone`, `quantity`, `updatedAt` | — | **FALTAM as 6** — `ingressoTipoId` e `quantity` são o que o e-mail de remarketing precisa |
| — | `etapa text` | **coluna inventada** (§2.4-E1) |
| `UNIQUE (eventoId, cpf)` | — | **FALTA** — sem ela o `upsert` do carrinho não tem alvo |

#### 2.2.17 `ComissaoSetorPadrao` / `ComissaoFuncaoPadrao` (l.265-266)

Setores: completo (`nome unique`, `ordem`). Funções: `setor_id`, `nome`,
`ordem` — **falta o `unique (setor_id, nome)`** que a origem passou a ter
(`migrate:971`) e o `createdAt` das duas.

#### 2.2.18 `ComissaoMembro` → `eventos.comissao_membros` (l.268-278)

| MySQL | Postgres | Estado |
|---|---|---|
| `id`, `eventoId`, `setor`, `funcao` | idem | ok |
| `participanteId INT **NOT NULL**` | `pessoa_id uuid **nullable**` | afrouxamento; ver §2.4-E11 |
| — | `nome text **not null**` | ⚠️ **coluna sem origem e obrigatória** |
| — | `telefone`, `email` | colunas sem origem (vêm do `JOIN Participant`) |
| `createdAt` | — | **FALTA** |

### 2.3 Resumo: tabelas e colunas que faltam

**Colunas que existem na origem e não no rascunho (23):**

`Local.contaCielo` · `Promotor.usarCorrespondenciaRegional` ·
`CieloAccount.isDefault` · `Evento.comprarLogoUrl` · `IngressoCampo.ativo` ·
`IngressoCampo.createdAt` · `Cupom.descricao` · `Cupom.createdAt` ·
`PedidoPendente.compradorCpf` · `Inscricao.observacao` ·
`Inscricao.cancelamentoAncoraId` · `Inscricao.transferidoParaEventoId` ·
`Inscricao.transferidoEm` · `Inscricao.transferidoPor` ·
`Inscricao.titularTrocadoPor` · `Inscricao.titularTrocaMotivo` ·
`InscricaoResposta.createdAt` · `MagicLink.eventoId` ·
`MagicLink.ingressoTipoId` · `MagicLink.quantity` ·
`CarrinhoAbandonado.{ingressoTipoId, participanteId, nome, telefone, quantity, updatedAt}` ·
`ComissaoMembro.createdAt` · `ComissaoSetorPadrao/FuncaoPadrao.createdAt`.

Mais as **10 colunas `cielo*` de `Inscricao`**, que devem virar o `cielo jsonb`.

**Índices e restrições que faltam:** `unique(nome)` em `contas_cielo`;
`unique(evento_id, cpf)` em `carrinhos_abandonados`; `unique(setor_id, nome)`
em `comissao_funcoes_padrao`; todos os índices de `pedidos`; 6 índices de
`inscricoes`; índice de `combo_itens(combo_id)`, `ingresso_tipos(evento_id)`,
`inscricao_respostas(inscricao_id)`.

**Tabelas inteiras ausentes: 12** — tratadas em §2.5.

### 2.4 Erros do rascunho (o que quebra a carga se não for corrigido)

**E1 — Colunas inventadas, sem origem.**
`eventos.eventos.landing jsonb not null default '{}'` (l.87) e
`eventos.carrinhos_abandonados.etapa text` (l.258). Nenhuma das duas existe no
MySQL nem em nenhuma tela. `landing` é `not null` com default, então não
quebra a carga — só cria um campo que ninguém preenche e que a próxima sessão
vai tratar como dado. Decidir: definir o conteúdo ou remover (a mesma pergunta
está em `eventos-operacao.md §7.4 q13`).

**E2 — `tipo_venda check (… 'importado')`** (l.204). `importado` **não existe
na base**. Os três valores reais são `online`, `balcao`, `transferencia`
(`transferir/route.ts:64`). A importação de convites grava `tipoVenda` da
planilha, que é `online`/`balcao` (`importar-convites/route.ts:304`), e
`formaPagamento = 'credenciamento'`. **O `check` como está recusa toda
transferência já feita.**

**E3 — `tipo_venda not null default 'online'`** (l.204). A coluna nasceu no
Step 17 sem backfill: **toda inscrição anterior a esse deploy tem `NULL`**.
`not null` recusa a linha, ou o carregador é obrigado a inventar `'online'`
para vendas que podem ter sido de balcão. Manter **anulável**.

**E4 — `cupons.valor integer`** (l.160) para percentual e centavos ao mesmo
tempo. A origem é `DECIMAL(10,2)`: `12.50` % é representável e vira `12` ou
`1250` conforme a leitura. Separar em `percentual numeric(5,2)` e
`valor_centavos integer`, com `check` de exclusividade.

**E5 — Defaults de cor divergentes.** `#132460`/`#B45309` (l.80-81) contra
`#1e3a5f`/`#f59e0b` da produção (`migrate:62-63`, repetidos em
`eventos/[id]/route.ts:127-128`). Não quebra a carga (o valor vem da linha),
mas **muda o visual de todo evento criado depois**. Decidir (é a pergunta 14 de
`eventos-operacao.md §7.4`).

**E6 — `pedidos.participantes jsonb not null`** (l.184) contra
`participantesJson TEXT NULL`. Além do `not null`, o conteúdo é uma string JSON
que pode estar malformada (nada valida na gravação). `not null default '[]'` +
tolerância a parse na carga.

**E7 — `legado_id` redundante em 10 tabelas.** O próprio cabeçalho do rascunho
(l.7-9) diz que os ids das tabelas de eventos são **preservados**; então
`legado_id` é sempre igual a `id` em `locais`, `promotores`, `orientadores`,
`contas_cielo`, `eventos`, `ingresso_tipos`, `ingresso_campos`, `combos`,
`cupons`, `pedidos`, `inscricoes`, `comissao_membros`. Uma coluna `unique` a
mais em cada tabela, um índice a mais, e a chance de as duas divergirem. **Só
`public.pessoas` precisa de `legado_id`** (lá o id muda de inteiro para uuid).

**E8 — `cancelado_por uuid references public.pessoas(id)`** (l.219) contra
`canceladoPor VARCHAR(255)` (e-mail do operador). O mesmo vale para
`transferidoPor`, `titularTrocadoPor`, `estornoEfetuadoPor` e
`AuditLog.userEmail`. A ponte é `User.email → pessoas.email`, e ela **falha**
quando: `User.email` é `NULL` (permitido, §1.14), o operador foi removido, ou
o e-mail não existe em `pessoas`. Guardar **as duas coisas**: `…_por_id uuid`
(quando resolve) e `…_por_email text` (sempre), como faz a auditoria.

**E9 — FK obrigatória para `public.pessoas` em `inscricoes.pessoa_id`,
`pedidos.comprador_id`, `magic_links.pessoa_id`.** É a restrição mais perigosa
do rascunho. Todo `Participant` **rejeitado** por `transformar.ts:66-72`
(`sem_nome`, `sem_cpf`, `cpf_invalido`) deixa órfãs as inscrições que apontavam
para ele — e a inscrição é o **dinheiro**. Ver §5.4 e a proposta de §7 (fila de
pendências em vez de descarte).

**E10 — `magic_links.id integer primary key` sem origem.** `MagicLink` **não
tem `id`** (PK é o `token`, `migrate:475`). Ou a coluna vira
`generated always as identity`, ou some. Como está, a carga precisa inventar
ids — e nada os referencia.

**E11 — `comissao_membros.nome text not null`** (l.273). Não existe na origem:
`ComissaoMembro` só tem `participanteId NOT NULL` e o nome vem do
`JOIN Participant` (`comissao/route.ts:25`). A carga teria de copiar o nome da
pessoa para uma coluna que passa a divergir no dia seguinte. Ou se decide que
o membro pode não ser pessoa cadastrada (e aí `pessoa_id` nulo + `nome`
obrigatório é coerente), ou `pessoa_id` é obrigatório e `nome` some. É a
pergunta 5 de `eventos-operacao.md §7.4`.

**E12 — FKs que a origem não garante.** `eventos.local_id → locais`,
`promotor_id → promotores`, `conta_cielo_id → contas_cielo`,
`inscricoes.ingresso_tipo_id → ingresso_tipos`, `cupons.ingresso_tipo_id`,
`combo_itens.ingresso_tipo_id`, `comissao_membros.evento_id`. Sem FK no MySQL e
com `DELETE` que não checa dependentes (`eventos-operacao.md §7.4 #9`), pode
haver **ponteiro para linha apagada**. Cada uma dessas FKs recusa a carga da
linha inteira. O carregador precisa **detectar e relatar** antes, não descobrir
no `insert`.

**E13 — `enable row level security` sem policy nenhuma.** O bloco `do $$` do
rascunho (l.284-291) liga a RLS e revoga `anon`/`authenticated` — correto e
alinhado à ADR 0003. Mas: (a) o `revoke` de quem **nunca teve** GRANT é
inofensivo e passa falsa sensação de proteção; o que protege é o projeto estar
com "expose new tables" desligado (`AGENTS.md`) — vale afirmar isso no
cabeçalho da migração; (b) **não há `alter table … force row level security`**,
então o dono da tabela (o papel que roda as migrações) continua ignorando a
RLS; (c) o bloco roda sobre `pg_tables`, ou seja, **depende da ordem** — uma
tabela criada depois do bloco fica sem RLS. Numa migração, escrever
`alter table … enable row level security` explicitamente por tabela.

**E14 — `atualizado_em` sem trigger.** `pedidos.atualizado_em` (l.189) tem
default mas nada o atualiza; o MySQL fazia isso com `ON UPDATE CURRENT_TIMESTAMP`.
Precisa do trigger `tg_set_atualizado_em` (o Ciclo já tem um,
`ciclo-esquema.md`).

### 2.5 As 12 tabelas listadas como "ainda não traduzidas" (rascunho l.295-302)

| Origem | Destino proposto no rascunho | Avaliação |
|---|---|---|
| `AuditLog` | `public.auditoria` | **ok**, com ressalva: `userEmail` é texto e `entidadeId` também; o `auditoria` comum do Ciclo precisa aceitar ator sem `pessoa_id` (operador antigo) e alvo textual |
| `Configuracao` | `public.configuracoes` + `eventos.configuracao_segredos` (cifrada) | **ok** — ver §4. Atenção: hoje é **uma tabela chave/valor global**, e o comum do Ciclo é uma tabela de **linha única** (`insert id=1`, `ciclo-esquema.md`). São formas diferentes: as 24 chaves precisam virar colunas, ou o comum ganha um `eventos.configuracoes(chave, valor)` próprio |
| `EmailAgendado` | `public.notificacoes` | ⚠️ **não é a mesma coisa**. `notificacoes` é a **fila** (uma linha por envio); `EmailAgendado` é a **regra** (uma linha por rotina, com segmento, recorrência e audiência dinâmica). O certo é `eventos.emails_agendados` (regra, do módulo) alimentando `public.notificacoes` (fila, comum) |
| `EmailEnvio` | `public.notificacoes` | **ok** — é literalmente a fila, com o `unique (agendado_id, email, periodo)` virando a chave de idempotência |
| `RateLimit` | `eventos.rate_limits` ou Upstash | **descartável**: nada precisa migrar; decidir só a implementação nova |
| `RegionalPromotorEmail` | `eventos.regional_avisos` | ⚠️ o rascunho descreve como "e-mail da regional que recebe aviso"; é **por par regional × promotor**, e depende de `public.regionais` (comum) e `eventos.promotores` (módulo) — FK cruzando schemas |
| `UserPreferencia` | `public.preferencias` | **ok**; `userId INT` → `pessoa_id uuid` (ponte por `User.id → pessoas`, que **não existe hoje**: `User` não tem CPF) |
| `Regional` | `public.regionais` | **ok**, mas falta `correspondeRegionalId` no destino (auto-referência) e a decisão sobre a lista de 114 nomes de `constants.ts` (`eventos-identidade.md §3.3`) |
| `Organizacao` | `public.organizacoes` | **ok**; 4 nomes, com conflito de nomenclatura já registrado no `README.md` do estudo |
| `Participant` | `public.pessoas` | tratado em §3 |
| `User` | conta no Supabase Auth + `public.papeis` | tratado em `eventos-identidade.md §6.2`. ⚠️ **`User` não tem CPF**: não há como criar `pessoas` a partir dele sem casar por e-mail ou pedir o CPF de cada operador |
| `Perfil` | matriz de `src/lib/permissoes.ts` (dado, não tabela) | **ok** — o RBAC por linha de banco morre; ver `eventos-identidade.md §6.1` |


---

## 3. As colunas institucionais de `Participant` — o que vira plataforma

`Participant` tem 25 colunas. Cinco delas não descrevem a pessoa nem a compra:
descrevem **a relação da pessoa com a SEICHO-NO-IE DO BRASIL**. São elas que
justificam a plataforma existir (ADR 0002).

### 3.1 As cinco colunas, o que são e o que dizem hoje

| Coluna | Tipo | O que é | Estado do dado hoje |
|---|---|---|---|
| `codSNI` | VARCHAR(100) | identificador institucional da pessoa | texto livre, **sem unicidade**, buscável; o cliente confirmou que **todas as 16 mil têm** (`docs/estudo/README.md`) |
| `regional` | VARCHAR(100) | Regional Doutrinária | **texto livre**, alimentado por **três listas diferentes** (`constants.ts` com 114 nomes no painel, tabela `Regional` no checkout, planilha na importação) — `eventos-identidade.md §3.3` |
| `organizacao` | VARCHAR(100) | Organização transversal (Prosperidade / Fraternidade / Pomba Branca / Jovens) | texto livre; **obrigatória** no checkout público (`comprar/register:20-22`) |
| `associacaoLocal` (ex-`nucleo`) | VARCHAR(255) | Núcleo ou Associação Local | texto livre, **sem cadastro nenhum** — nem lista fixa, nem tabela (`eventos-identidade.md §3.6`) |
| `primeiraVez` | TINYINT(1) NOT NULL DEFAULT 0 | "primeira vez na SNI" | usado na estatística institucional (`relatorio-estatistica-pdf.ts:122`) |

### 3.2 Para onde cada uma vai

O critério é o da ADR 0002: **o que é da pessoa e da instituição fica em
`public`; o que é do convite fica em `eventos`.**

| Coluna de origem | Destino | Forma |
|---|---|---|
| `codSNI` | `public.pessoas.cod_sni` | `text`, só dígitos, **único quando presente**, anulável (ADR 0004:17-19). Anulável porque o checkout público cadastra gente nova **sem CodSNI** (`comprar/register:49-60` não pede) — o `primeiraVez` é exatamente esse caso |
| `regional` | **vínculo** pessoa↔unidade em `public` | não é coluna de `pessoas`: é uma linha de vínculo com a unidade de tipo `regional` (decisão 2 do `README.md` do estudo). Enquanto a árvore `unidades` não existe, o texto fica em `pessoas.migracao_extras` (`migrar-mysql.ts:69-77`) |
| `organizacao` | **vínculo** pessoa↔organização em `public` | idem. A pergunta aberta "organização é atributo da pessoa ou do vínculo?" (`README.md`) decide se é 1:1 ou histórico |
| `associacaoLocal` | **vínculo** pessoa↔unidade (`nucleo`/`associacao_local`) | idem; hoje sem cadastro, então a carga produz **a lista de valores distintos** para a Sede aprovar antes de virar unidade |
| `primeiraVez` | `public.pessoas.primeira_vez boolean` **ou** fato do módulo | ⚠️ **ambíguo**. Semanticamente é "primeira vez na SNI" (plataforma). Operacionalmente é preenchido no cadastro **de eventos** e lido só pela estatística **de eventos**. Recomendação: `public.pessoas.primeira_vez boolean not null default false`, porque "nunca teve contato com a instituição" é fato da pessoa, não do convite — e o Ciclo vai querer o mesmo |

### 3.3 O que fica em `public.pessoas` e o que fica no módulo

**Vai para `public.pessoas` (13 colunas de origem):**
`nomeCompleto → nome`, `codSNI → cod_sni`, `cpf`, `telefone`, `email`,
`dataNascimento → nascimento`, `endereco`+`bairro`+`cidade`+`estado` →
`endereco` (o Ciclo usa **um campo só**, `ciclo-esquema.md §pessoas`; a junção
já está feita em `migrar-mysql.ts:76`), `createdAt → criado_em`,
`primeiraVez → primeira_vez`.

⚠️ **Perda de estrutura**: colapsar `endereco/bairro/cidade/estado` num `text`
único destrói a busca por cidade e a estatística por estado. O Ciclo tem
`src/lib/endereco.ts` (`README.md` do estudo, item 4 do plano) — vale conferir
se ele já prevê campos separados antes de aceitar a junção.

**Fica no módulo `eventos` (7 colunas legadas do 39º Seminário):**
`tipoConvite`, `numeroConvite`, `dataPurchase`, `formaPagamento`, `checkinAt`,
`ingressoEvento`, `ingressoJantar`. Já foram migradas para `Inscricao` no Step 5
(`migrate:274-320`) e **não devem ser recriadas em lugar nenhum** — são a
sombra do evento único que o sistema teve antes de ter a tabela `Evento`.
⚠️ Exceção: `api/stats/route.ts:14,20` ainda **lê** `Participant.checkinAt`
(`eventos-operacao.md §7.4 #1`); a tela nova lê de `inscricoes.checkin_em`.

**Vira comportamento da plataforma, não coluna:**
`emailOptOut` → consentimento/opt-out comum (o Ciclo tem
`consentimentos_lgpd`, `ciclo-esquema.md`). Não é dado de eventos: quem pediu
para não receber e-mail pediu para a instituição, não para o módulo.

### 3.4 O que a fase `pessoas` já faz — e o que ela ainda não tem para onde escrever

`migrar-mysql.ts:73-83` grava hoje: `legado_id, cpf, cod_sni, nome, email,
telefone, nascimento, endereco, migracao_extras, criado_em`.

⚠️ **Três dessas colunas não existem em `public.pessoas`** como o Ciclo a define
(`ciclo-esquema.md §pessoas`): `legado_id`, `migracao_extras` e — de novo —
`primeira_vez`. O comentário do script (l.69-72) assume isso, mas a migração
que cria essas colunas **ainda não foi escrita**. Sem ela o `insert … on
conflict (legado_id)` estoura na primeira linha. É trabalho do passo 2 do
`supabase/migrations/README.md`.

---

## 4. Segredos em texto puro

### 4.1 O inventário

| Onde | Segredo | Estado hoje | Quem lê |
|---|---|---|---|
| `CieloAccount.merchantKey VARCHAR(80)` | chave de API do adquirente | **texto puro no banco** (`migrate:556`) | `lib/cielo.ts`; listado por `api/cielo-accounts/route.ts:17` |
| `Configuracao['smtp.pass']` | senha SMTP | **texto puro** | `mailer.ts:73,125` |
| `Configuracao['whatsapp.token']` | token da Cloud API | **texto puro** | `whatsapp/send/route.ts:14` |
| `Configuracao['meta.capiToken']` | token da Conversions API | **texto puro** | `meta-capi.ts:31` |
| `Configuracao['cielo.merchantKey']` | chave legada (pré-`CieloAccount`) | **texto puro**, sem campo na tela | `cielo.ts:106-118` |
| `Configuracao['cielo.mpi.clientSecret']` | segredo 3DS/Braspag | **texto puro**, sem campo na tela | `cielo.ts:124-146` |
| `MagicLink.token VARCHAR(64)` | credencial de acesso do comprador | **texto puro e é a PK** (`migrate:475`) | `magic-link/verify:26` |
| `User.passwordHash` | senha do operador | hash (bcrypt) — **não é segredo em claro** | `auth.ts` |

Fonte da tabela de chaves: `eventos-operacao.md §6.2`.

⚠️ Agravante que não é do esquema mas viaja com ele:
`GET /api/admin/config` **devolve todas as chaves em claro** para preencher a
tela (`eventos-operacao.md §6.1`). Qualquer operador com a permissão
`configuracoes` lê a senha do SMTP e o token do WhatsApp.

### 4.2 O que precisa ser cifrado com `src/lib/cripto.ts`

`cripto.ts` é AES-256-GCM, formato `v1.<iv>.<tag>.<texto>` em base64url, chave
derivada de `CREDENCIAIS_ENCRYPTION_KEY` (mín. 32 caracteres); **estoura em vez
de gravar em claro** quando a chave falta (`cripto.ts:16-22`). GCM e não CBC
porque autentica: quem escreve no banco não troca a credencial por outra
(`cripto.ts:4-8`).

| Segredo | Destino | Tratamento |
|---|---|---|
| `merchantKey` | `eventos.contas_cielo.merchant_key_cifrada` | `cifrar()` na carga; `decifrar()` só no servidor, nunca devolvido a tela |
| `smtp.pass`, `whatsapp.token`, `meta.capiToken`, `cielo.merchantKey` legada, `cielo.mpi.clientSecret` | `eventos.configuracao_segredos(chave, valor_cifrado)` — **tabela separada, sem GRANT para `anon`/`authenticated`** (regra do `AGENTS.md`) | `cifrar()`; a tela mostra "definido/não definido", nunca o valor |
| `merchantId`, `smtp.host/port/user/from`, `whatsapp.phoneNumberId/template`, `meta.pixelId`, `ga.measurementId`, `cielo.mpi.establishmentCode/merchantName/mcc` | `public.configuracoes` (ou `eventos.configuracoes`) **em claro** | não são segredo; identificam, não autenticam |
| `MagicLink.token` | `eventos.magic_links.token_hash` | **não cifrar: derivar.** `sha256(token)` guardado; o token só existe no e-mail. Cifrar seria pior — permitiria recuperar o token a partir do banco |
| `Configuracao['logoUrl'/'sniLogoUrl'/'relatorioLogoUrl']` (base64) | Supabase Storage | não é segredo; sai do banco por tamanho |

**Nunca em auditoria, nem cifrado** (`AGENTS.md`). Hoje
`admin/config/route.ts` já audita só a **lista de chaves**, sem valores — esse
comportamento se mantém.

⚠️ **Regra que a migração precisa herdar**: segredo de infraestrutura
(`CREDENCIAIS_ENCRYPTION_KEY`, `DATABASE_URL`, `CRON_SECRET`) mora em variável
de ambiente; segredo que é **decisão do cliente** (a chave da Cielo dele, a
senha do e-mail dele) mora no banco, cifrado, editável em tela
(`AGENTS.md`, seção Banco de dados).

---

## 5. Volumes e riscos do dado real

### 5.1 Os números que ainda não temos

`scripts/contagens.sql` está pronto e **não foi executado**. Ele responde
exatamente as perguntas abaixo; sem elas, várias decisões de esquema ficam no
escuro. O que cada número decide:

| Consulta (`contagens.sql`) | Decide |
|---|---|
| `total` (l.4) | ordem de grandeza da carga; hoje só sabemos "mais de 16 mil" (ADR 0002:3) |
| `sem_cpf` (l.5) | quantas pessoas a decisão pendente da ADR 0004:20-22 (pessoa sem CPF) afeta |
| `cpf_fora_do_formato` (l.6) | quantas linhas o `check (cpf ~ '^[0-9]{11}$')` recusa |
| `cpf_placeholder` (l.7, `^(.)\1{10}$`) | quantos `00000000000`/`11111111111` foram inventados — proibidos pela ADR 0004:16 |
| `sem_codsni` (l.8) | confirma (ou derruba) o "todas têm CodSNI" do cliente; decide `not null` |
| `sem_email` (l.9) | confirma a ADR 0004 (`email` anulável) |
| `menores` (l.10) | dimensiona a pergunta "venda de balcão sem CPF (menor)" do `README.md` |
| `cpf_duplicado` (l.13-15) | **o número mais importante**: quantos grupos a dedup precisa resolver antes de `unique(cpf)` existir |
| `codsni_duplicado` (l.17-19) | decide se `cod_sni` pode ser `unique` |
| `email_duplicado` (l.21-23) | quantas famílias compartilham e-mail (§5.2) |
| `inscricoes`, `pedidos`, `eventos` (l.25-27) | volume das fases seguintes |
| `regionais_distintas`, `organizacoes_distintas` (l.28) | tamanho da lista que a Sede vai ter de aprovar (§3.2) |

⚠️ Faltam consultas que este estudo mostrou serem necessárias. Sugeridas para
`contagens.sql`:

```sql
-- Inscrições que ficariam órfãs se a pessoa for rejeitada (§5.4).
SELECT COUNT(*) AS inscricoes_de_cpf_invalido
FROM Inscricao i JOIN Participant p ON p.id = i.participanteId
WHERE p.cpf IS NULL OR LENGTH(REGEXP_REPLACE(p.cpf,'[^0-9]','')) <> 11;

-- Inscrições apontando para participante inexistente (não há FK).
SELECT COUNT(*) AS inscricoes_orfas
FROM Inscricao i LEFT JOIN Participant p ON p.id = i.participanteId
WHERE p.id IS NULL;

SELECT COUNT(*) AS compradores_orfaos
FROM Inscricao i LEFT JOIN Participant p ON p.id = i.compradorId
WHERE i.compradorId IS NOT NULL AND p.id IS NULL;

-- tipoVenda nulo (linhas anteriores ao Step 17) — decide o NOT NULL (E3).
SELECT COUNT(*) AS tipovenda_nulo FROM Inscricao WHERE tipoVenda IS NULL;
SELECT COUNT(*) AS valororiginal_nulo FROM Inscricao WHERE valorOriginal IS NULL;

-- Ponteiros pendurados (E12).
SELECT COUNT(*) FROM Evento e LEFT JOIN Local l ON l.id=e.localId WHERE e.localId IS NOT NULL AND l.id IS NULL;
SELECT COUNT(*) FROM Inscricao i LEFT JOIN IngressoTipo t ON t.id=i.ingressoTipoId WHERE i.ingressoTipoId IS NOT NULL AND t.id IS NULL;

-- Operadores que não resolvem para pessoa (E8).
SELECT COUNT(*) AS users_sem_email FROM User WHERE email IS NULL OR email = '';
SELECT COUNT(DISTINCT canceladoPor) AS emails_em_cancelamento FROM Inscricao WHERE canceladoPor IS NOT NULL;

-- Truncamento do CSV de inscrições (§1.16).
SELECT COUNT(*) AS pedidos_csv_no_limite FROM PedidoPendente WHERE LENGTH(inscricaoIds) > 240;

-- Base64 no banco (§5.5): quanto pesa.
SELECT SUM(LENGTH(valor)) AS bytes_config FROM Configuracao;
SELECT SUM(LENGTH(voucherBannerUrl)+LENGTH(voucherLogoUrl)+LENGTH(comprarLogoUrl)) AS bytes_evento FROM Evento;
SELECT COUNT(*) AS pix_qr_base64 FROM Inscricao WHERE cieloPixQrImage IS NOT NULL;
```

### 5.2 CPF, e-mail e CodSNI — os três riscos de identidade

**CPF duplicado.** O `UNIQUE` foi removido duas vezes (`server.js:44`,
`migrate:178`) e cinco caminhos criam participante com validações diferentes —
dois deles **sem dígito verificador** (`eventos-identidade.md §2.2`). A base
tem, portanto: CPF repetido, CPF com máscara (`123.456.789-00`), CPF inválido e
possivelmente CPF vazio. O destino é `not null unique` com DV validado (ADR
0004). A dedup existente (`/api/participants/dedupe`) resolve grupos **na
origem**; rodá-la antes da virada reduz o problema, mas ela repõe o
`UNIQUE` na origem (`dedupe:291`), o que pode **derrubar escritas em produção**
se sobrar duplicado. ⚠️ Não rodar `reindex` durante venda ao vivo.

**E-mail vazio ou compartilhado.** `transformar.ts:75-77` já faz o certo:
vazio → `NULL`, malformado → `NULL` com aviso. Mas **e-mail compartilhado em
família não é erro e é comum** — e o destino tem `unique` (ADR 0004:9). Com
`unique`, a segunda pessoa da mesma família **perde o e-mail**, silenciosamente,
e some da régua. O relatório precisa contar isso como **rejeição de coluna**,
não como sucesso. Consequência prática já visível na origem: `EmailEnvio` faz
dedup **por e-mail** (`uniq_email_periodo`), então hoje a família já recebe uma
mensagem só (§1.22).

**CodSNI ausente.** O cliente afirma que todas as 16 mil têm
(`docs/estudo/README.md`), mas **o checkout público cadastra sem**
(`comprar/register:49-60`). Logo: `cod_sni` continua anulável e único quando
presente. `transformar.ts:79-80` só **avisa** quando o CodSNI tem caractere não
numérico — e o Ciclo tem `check (cod_sni ~ '^[0-9]+$')`
(`ciclo-esquema.md §pessoas`): **aviso vira rejeição no `insert`**. Ou o
carregador limpa não-dígitos (perigoso: muda o identificador), ou o `check`
afrouxa, ou a linha é rejeitada. **Decidir antes da carga.**

### 5.3 Ids inteiros já publicados em e-mails, vouchers e recibos

Este é o motivo pelo qual os ids de eventos **não podem mudar**:

| Id | Onde já saiu do sistema |
|---|---|
| `Inscricao.id` | QR do voucher `SNI-INSCRICAO-<id>` (`lib/voucher-codes.ts`); token assinado do voucher (`voucher-acesso.ts`); token de coleta de campo (`campo-token.ts`, URL `/r/campo/<token>` com o id dentro do HMAC); anexo PDF dos e-mails da régua |
| `PedidoPendente.id` | `orderNumber = "SNI" + pedidoId` enviado à **Cielo** (`cielo/link/route.ts:89`) — é o número que aparece no extrato do adquirente e na conciliação financeira |
| `Participant.id` | token de descadastro `optOutUrl(participanteId)` (`lib/email-optout.ts`), no rodapé de **todo** e-mail já enviado; `MagicLink.participanteId` |
| `Evento.id`, `IngressoTipo.id` | links `/comprar?evento=&ingresso=` de magic links com 45 dias de validade (`cron/emails:147-171`) |
| `IngressoCampo.id` | dentro do token HMAC de coleta de campo |

⚠️ **`Participant.id` é o único que muda** (inteiro → uuid). Todo link de
descadastro já enviado deixa de resolver, a menos que a rota nova aceite o
`legado_id`. **Ação obrigatória**: a rota `/descadastro` do módulo novo precisa
resolver o token antigo por `pessoas.legado_id`, ou milhares de rodapés de
e-mail viram 404 — e opt-out que não funciona é problema de LGPD, não de UX.
O mesmo vale para os magic links de 45 dias emitidos antes da virada
(`MagicLink.participanteId`).

### 5.4 As FKs novas contra o dado real

Nenhuma FK existe hoje. Cada FK do destino é um novo motivo de recusa:

| FK proposta | O que pode recusar |
|---|---|
| `inscricoes.pessoa_id → pessoas` **not null** | toda inscrição de participante rejeitado (`sem_cpf`, `cpf_invalido`, `sem_nome`) e toda inscrição órfã (participante apagado por `DELETE /api/participants/[id]`, que não checa inscrições — `eventos-identidade.md §2.4`) |
| `pedidos.comprador_id → pessoas` **not null** | idem, do lado do comprador |
| `inscricoes.comprador_id → pessoas` | `compradorId` nulo é permitido; `compradorId` apontando para apagado, não |
| `inscricoes.ingresso_tipo_id → ingresso_tipos` | tipo apagado antes do Step 32 introduzir o `ativo` (os JOINs do código são `LEFT`, o que denuncia que o autor esperava ponteiro pendurado) |
| `eventos.local_id / promotor_id / conta_cielo_id` | local ou promotor apagado (`DELETE /api/locais/[id]` não checa) |
| `comissao_membros.pessoa_id → pessoas` | participante apagado |
| `magic_links.pessoa_id → pessoas` | idem |
| `evento_orientadores` cascata | orientador apagado já apaga o vínculo hoje (`orientadores/[id]:45`) |

**Regra que a carga precisa seguir**: uma pessoa rejeitada **não pode** derrubar
em silêncio o convite dela — o convite é dinheiro que entrou. As três saídas
possíveis, em ordem de preferência:

1. **Quarentena**: `eventos.inscricoes_pendentes` (mesma forma, `pessoa_id`
   nulo + `legado_participante_id` + motivo), conferida por tela antes da
   virada. Nada se perde, nada entra errado.
2. **Bloqueio**: a fase `pessoas` falha a migração inteira enquanto houver
   inscrição de pessoa rejeitada. Honesto, mas trava tudo por um CPF.
3. **Placeholder**: **proibido** (ADR 0004:16).

### 5.5 Base64 dentro do banco

Sete colunas guardam imagem em base64: `Configuracao.valor` (3 logos),
`Evento.voucherBannerUrl`, `Evento.voucherLogoUrl`, `Evento.comprarLogoUrl`,
`Promotor.logoUrl`, `Orientador.fotoUrl`, `Inscricao.cieloPixQrImage`,
`PedidoPendente.cieloPixQrImage`.

Riscos concretos: `GET /api/eventos` devolve o base64 de **todos** os eventos em
toda tela operacional (`eventos-operacao.md §7.4 #10`); a coluna
`Configuracao.valor` já teve de virar `LONGTEXT` porque `TEXT` truncava
(`migrate:337-338`).

Na migração: **as de identidade visual vão para o Storage** e a coluna guarda a
URL (`docs/migracao.md:47`). As de Pix (`cieloPixQrImage`) **não migram**: são
QR de pagamento com validade de horas; linha antiga não tem valor nenhum.

### 5.6 Fuso horário — o risco silencioso

`docs/migracao.md:43-44` manda interpretar `DATETIME` como São Paulo.
`transformar.ts:59-64` **não faz isso**: `new Date(v).toISOString()` usa o fuso
do processo Node. Rodando a migração num runner do GitHub Actions (UTC), toda
data de nascimento anterior às 03:00 volta **um dia**. `dataIso` corta para
`YYYY-MM-DD`, então o erro é invisível no relatório.

O mesmo vale, com mais peso, para `dataPurchase`, `checkinAt`, `canceladoEm`,
`createdAt`: 3 horas de deslocamento movem uma venda de 22h para o dia
seguinte, e o relatório "vendas por dia" muda.

**Correção**: converter com fuso explícito (`America/Sao_Paulo`) e **testar**;
`tests/transformar.test.ts` existe e é o lugar. Nenhum teste cobre fuso hoje.


---

## 6. Sequências, `legado_id` e a ordem de carga

### 6.1 Ids preservados e sequências

Todas as 30 tabelas de eventos usam `INT AUTO_INCREMENT`. No destino, os ids
são **inseridos explicitamente** (não gerados), e a sequência é reposicionada
ao final de cada fase:

```sql
select setval(pg_get_serial_sequence('eventos.inscricoes','id'),
              coalesce((select max(id) from eventos.inscricoes), 0) + 1, false);
```

Fazer isso **por tabela, ao final da carga inteira** (fase `sequencias`,
`migrar-mysql.ts:96`, hoje `não implementada`). Se a sequência não for
reposicionada, a primeira venda depois da virada tenta o id 1 e colide.

**Tabelas cuja sequência precisa de `setval`** (todas as que têm `id` gerado
no destino): `locais`, `promotores`, `orientadores`, `contas_cielo`, `eventos`,
`ingresso_tipos`, `ingresso_campos`, `combos`, `combo_itens`, `cupons`,
`pedidos`, `inscricoes`, `inscricao_respostas`, `comissao_setores_padrao`,
`comissao_funcoes_padrao`, `comissao_membros`, `carrinhos_abandonados`,
`emails_agendados`, `regional_avisos`.
**Não precisam**: `evento_orientadores` (PK composta), `magic_links` (§7 usa o
hash como chave natural), `public.pessoas` (uuid).

⚠️ A migração é **repetível** (ADR 0006). Se ela roda duas vezes, o `setval`
roda duas vezes — inofensivo. Mas o `insert` com id explícito **precisa** ser
`on conflict (id) do update`, não `do nothing`, ou a segunda passada não traz o
dado fresco.

### 6.2 Política de `legado_id`

| Caso | Política |
|---|---|
| `public.pessoas` | **`legado_id integer unique`** — obrigatório. É a única tabela cuja chave muda de forma (int → uuid). É por ele que o upsert repetível funciona (`migrar-mysql.ts:79`) e que os links de descadastro antigos podem resolver (§5.3) |
| Tabelas de `eventos` com id preservado | **sem `legado_id`** — seria sempre igual ao `id` (erro E7). O rascunho o coloca em 12 tabelas; remover |
| `MagicLink` | não tem id; a chave natural é o token. `legado_token_hash` é o próprio `token_hash` |
| `User` → conta do Auth | **`legado_user_id integer`** em algum lugar do vínculo, para resolver `canceladoPor`/`transferidoPor` (e-mail) e `UserPreferencia.userId` |
| `Regional`, `Organizacao` | **`legado_id`** em `public.regionais`/`organizacoes`, porque os ids de eventos vão conviver com os do Ciclo (que já tem `regionais` próprias) |

### 6.3 Grafo de dependência e ordem de carga

Dependências lógicas extraídas das colunas `*Id` (não há FK que as declare):

```
public.pessoas ......................... (Participant)
   ↑ inscricoes.pessoa_id, .comprador_id, .titular_anterior_id
   ↑ pedidos.comprador_id
   ↑ magic_links.pessoa_id
   ↑ comissao_membros.pessoa_id
   ↑ carrinhos_abandonados.pessoa_id
   ↑ notificacoes.pessoa_id  (EmailEnvio.participanteId)

public.regionais ← RegionalPromotorEmail.regionalId, Regional.correspondeRegionalId (auto)
public.organizacoes

eventos.locais        eventos.promotores       eventos.orientadores    eventos.contas_cielo
        ↑                      ↑     ↑                    ↑                     ↑
        └──────────── eventos.eventos ────────────────────┴─────────────────────┘
                              ↑
        ┌─────────────────────┼──────────────────┬──────────────────┐
 ingresso_tipos          combos            cupons          emails_agendados
        ↑                   ↑                 ↑                    ↑
 ingresso_campos       combo_itens ──────────>┘             (cupons.combo_id,
        ↑              (→ ingresso_tipos)                    cupons.ingresso_tipo_id,
        │                                                    emails_*.campo_id/
        │                                                    ingresso_tipo_id[_b])
        └──────────────> pedidos ──────> inscricoes ──────> inscricao_respostas
                                            ↑  ↑                    ↑
                                            │  └── (auto-referência: transferido_de_id,
                                            │        transferido_para_inscricao_id,
                                            │        cancelamento_ancora_id)
                          eventos.regional_avisos (regionais × promotores)
                          eventos.comissao_setores_padrao → comissao_funcoes_padrao
                          eventos.comissao_membros (eventos × pessoas)
                          eventos.magic_links, carrinhos_abandonados
```

**Ordem de carga (13 passos), com o motivo de cada posição:**

| # | Fase | Tabelas | Depende de |
|---|---|---|---|
| 1 | `pessoas` | `public.pessoas` | nada. **Precisa terminar sem rejeição pendente** antes de qualquer fase de eventos (§5.4) |
| 2 | `estrutura-comum` | `public.regionais` (com auto-referência em 2 passadas: insere, depois atualiza `corresponde_id`), `public.organizacoes` | nada |
| 3 | `acesso` | contas do Auth a partir de `User` + `public.papeis`; tabela de ponte `legado_user_id → pessoa_id` | 1 |
| 4 | `estrutura-eventos` | `eventos.locais`, `promotores`, `orientadores`, `contas_cielo` (chave **cifrada**) | nada |
| 5 | `eventos` | `eventos.eventos` | 4 |
| 6 | `catalogo` | `ingresso_tipos` → `ingresso_campos`; `combos` → `combo_itens`; `cupons`; `evento_orientadores` | 5 (e `combo_itens`/`cupons` dependem de `ingresso_tipos` **e** `combos`) |
| 7 | `pedidos` | `eventos.pedidos` | 1, 5, 6 |
| 8 | `inscricoes` | `eventos.inscricoes` **sem** as auto-referências | 1, 6, 7 |
| 9 | `inscricoes-ligacoes` | `UPDATE` das auto-referências (`transferido_de_id`, `transferido_para_inscricao_id`, `cancelamento_ancora_id`) e do `pedido_id` derivado de `PedidoPendente.inscricaoIds` | 8 |
| 10 | `respostas` | `inscricao_respostas` | 8 (e `ingresso_campos` para `campo_id`) |
| 11 | `comissao` | `comissao_setores_padrao` → `comissao_funcoes_padrao` → `comissao_membros` | 1, 5 |
| 12 | `comunicacao` | `emails_agendados`, `public.notificacoes` (de `EmailEnvio`), `regional_avisos`, `magic_links`, `carrinhos_abandonados` | 1, 2, 4, 5, 6 |
| 13 | `configuracao` + `auditoria` + `sequencias` | `public.configuracoes`, `eventos.configuracao_segredos` (cifrados), `public.auditoria`, `setval` por tabela | tudo |

Comparando com o `FASES` atual de `migrar-mysql.ts:88-97` (8 fases): faltam a
separação `pedidos`/`inscricoes`/`ligações` (passos 7-9) — sem ela, a
auto-referência de `inscricoes` não fecha —, a fase `acesso` (passo 3) e a
separação entre estrutura comum e estrutura do módulo (passos 2 e 4).

**Não migram**: `RateLimit` (descartável), `Inscricao.qrCode` (morta),
`Inscricao.cieloPixQrImage` / `PedidoPendente.cieloPixQrImage` (QR vencido),
`Perfil` (vira a matriz `permissoes.ts`), `Participant.{tipoConvite,
numeroConvite, dataPurchase, formaPagamento, checkinAt, ingressoEvento,
ingressoJantar}` (já migrados para `Inscricao` no Step 5).

