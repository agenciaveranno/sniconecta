# Estudo — a camada de PLATAFORMA do Ciclo, em código

Recorte: o que o plano de fundação (§2.1) diz que "atravessa praticamente
intacto" do Ciclo de Estudos da Prosperidade para o SNI Conecta. Este documento
é a base para **reescrever** essa camada; por isso lista cada export, cada
tabela e cada regra, com caminho e linha.

## 0. Fonte, estado do checkout e o que NÃO foi encontrado

| Item | Valor |
|---|---|
| Repositório lido | `/home/user/sistema-ciclo`, branch `claude/system-development-0yi4m6`, commit `70f61d6` ("Diagnóstico de configuração: avisar antes de alguém ficar trancado fora") |
| Stack | Next `^14.2.15`, React 18, Tailwind 3, `@supabase/ssr ^0.5.2`, `@supabase/supabase-js ^2.45.4`, zod 3, vitest 2 (`package.json`) |
| Migrations | **23** arquivos, `0001` a `0023` (`supabase/migrations/`, 2 462 linhas no total) |
| Esqueleto comparado | `/home/user/sniconecta`, branch `claude/novo-sistema-ambiente-sz4q9y`: Next `^16.3.4`, React 19, Tailwind 4, `@supabase/ssr ^0.12.6`, zod 4, vitest 3, `postgres ^3.4.9` |

**O plano de fundação cita coisas que não existem neste checkout do Ciclo.**
Ou o plano foi escrito sobre um commit posterior, ou descreve intenção:

| Citado no plano (§2.1, §1.3, §4, §5) | Situação aqui |
|---|---|
| `src/lib/cripto.ts` (~90 linhas, AES-256-GCM) | **não existe** — `git log --all` não tem o arquivo. O esqueleto tem o seu próprio `src/lib/cripto.ts` (41 linhas), que é então a única implementação. |
| `src/lib/endereco.ts` (endereço público com retaguarda da Vercel) | **não existe**. `NEXT_PUBLIC_SITE_URL` é lido direto em `src/lib/certificado/emitir.ts:227` e cobrado pelo diagnóstico (`src/lib/diagnostico/index.ts:7`). |
| Tabela `configuracao_email` e provedor SMTP | **não existem**. `grep -ri smtp` só acha o comentário "não usar SMTP cru" (`src/lib/comunicacao/index.ts:39`). Só há Resend e WhatsApp Cloud API. |
| "24 migrations" / "0019 desfaz parte da 0006" | há **23**; a 0019 existe (`0019_progresso_video_somente_leitura.sql`). |
| `PLATAFORMA-SNI-REFERENCIA.md` | **não encontrado** em lugar nenhum do disco (`find / -name "PLATAFORMA-SNI-REFERENCIA*"`). |
| `src/lib/auth.ts` "~120 linhas" com `pessoaAtual()` cacheada | 115 linhas, **sem** `cache()` (ver §1.1). |
| `vercel.json` com `crons` | o do Ciclo só tem `regions: ["gru1"]` e `framework` — **não há cron configurado**; a fila só roda se alguém chamar a rota à mão. O esqueleto já tem `crons` (`vercel.json`, `0 12 * * *`). |

Tudo o mais que este documento descreve foi lido nos arquivos.

---

## 1. Inventário: cada export de cada arquivo

Convenção das tabelas: **Export** (assinatura completa) · **Faz** · **Tabelas** que toca · **Quem chama** (contagem de arquivos, por `grep -rn`).

### 1.1 `src/lib/auth.ts` (115 linhas)

Importa `criarClienteServidor` (cliente com cookies, RLS por baixo) e `exigir`. **Não** usa `service_role`, **não** usa `cache()` do React.

| Export | Faz | Tabelas | Quem chama |
|---|---|---|---|
| `export type { Capacidade, PapelAtribuido, TipoPapel }` (l.15) | reexporta os tipos de `permissoes.ts` | — | `src/app/painel/page.tsx:15` importa `Capacidade` daqui |
| `interface PessoaSessao` (l.17-34): `id: string; nome: string; email: string; papeis: PapelAtribuido[]; papelPrincipal: TipoPapel \| null; rotuloPapel: string; localidades: string[]; capacidades: Set<Capacidade>; isSede: boolean; pode(cap): boolean; podeEm(cap, localidadeId): boolean` | a sessão montada | — | todo consumidor de `pessoaAtual` |
| `async function pessoaAtual(): Promise<PessoaSessao \| null>` (l.43-87) | `supabase.auth.getUser()`; sem usuário → `null`. Lê `pessoas(id, nome, email)` por `auth_user_id` com `exigir(...maybeSingle())` (l.50-57): falha de consulta lança `ErroConsulta`, ausência legítima devolve `null`. Lê `papeis(tipo, localidade_id, edicao_id)` com `.eq("pessoa_id").eq("ativo", true)` (l.63-70). Monta `papelPrincipal`, `rotuloPapel` (`NOME_PAPEL[principal]` ou "Sem papel atribuído"), `localidades`, `capacidades`, `isSede` (`papeis.some(tipo === "sede")`), `pode`, `podeEm`. | `pessoas`, `papeis` (sob RLS: `pessoas_select_self` 0011:122-127 e `papeis_select` 0011:147-153 liberam a própria linha) | 12 arquivos: `admin/pessoas/actions.ts` (3), `admin/localidades/[id]/landing/actions.ts` (3), `provas/actions.ts` (2), `admin/papeis/actions.ts` (2), `admin/importacao/actions.ts` (2), `provas/page.tsx`, `provas/[id]/tentativa/[tid]/page.tsx`, `provas/[id]/resultado/[tid]/page.tsx`, `painel/page.tsx`, `meu-curso/page.tsx`, `aulas/page.tsx`, `admin/layout.tsx`, `admin/pessoas/[id]/page.tsx` |
| `class SemPermissao extends Error` (l.90-95), `constructor(cap: Capacidade, escopo?: string)` | mensagem `Sem permissão para "<cap>" em <escopo>.`, `name = "SemPermissao"` | — | só `exigirCapacidade` |
| `async function exigirCapacidade(cap: Capacidade, localidadeId?: string): Promise<PessoaSessao>` (l.104-115) | `pessoaAtual()`; sem sessão → **lança** `SemPermissao(cap)`; com `localidadeId` usa `podeEm`, sem usa `pode`; negado → lança `SemPermissao(cap, localidadeId)`. **Não redireciona.** | (as de `pessoaAtual`) | 44 chamadas em 14 arquivos (lista completa em §2.4). Apenas UMA passa localidade: `admin/certificados/actions.ts:36` `exigirCapacidade("certificado.emitir", localidadeId)`. |

⚠️ Não há `cache()`: `admin/layout.tsx:22` e `admin/pessoas/[id]/page.tsx:32` chamam `pessoaAtual()` na mesma requisição e fazem duas leituras. O esqueleto já cacheia (`src/lib/auth.ts:34`).

### 1.2 `src/lib/permissoes.ts` (234 linhas)

Módulo puro, sem I/O. Cabeçalho (l.1-31) declara: "ESTA MATRIZ É UMA PROPOSTA, NÃO UMA LEI" e explica a relação com o RLS ("o RLS decide QUAIS LINHAS a pessoa alcança, esta matriz decide QUAIS AÇÕES ela pode disparar").

| Export | Faz | Quem chama |
|---|---|---|
| `type TipoPapel = "sede" \| "coordenador" \| "orientador" \| "presidente_uap" \| "professor" \| "aluno"` (l.33-39) | os 6 papéis | auth, admin/papeis (lista própria `TIPOS_VALIDOS`), testes |
| `type Capacidade` (l.45-71) | 23 capacidades (lista em §2.1) | tudo |
| `const MATRIZ: Record<Capacidade, readonly TipoPapel[]>` (l.82-148) — **não exportada** | "esta capacidade pertence a estes papéis" (orientação capacidade → papéis) | funções abaixo |
| `const PAPEIS_LOCAIS: readonly TipoPapel[] = ["coordenador","orientador","presidente_uap"]` (l.151-155) | papéis que administram uma localidade inteira | `localidadesDosPapeis` |
| `const NOME_PAPEL: Record<TipoPapel, string>` (l.157-164) | `sede: "Sede Central"`, `coordenador: "Coordenador do Ciclo"`, `orientador: "Orientador Responsável"`, `presidente_uap: "Presidente de UAP"`, `professor: "Professor"`, `aluno: "Aluno"` | `auth.ts:80`, `painel/page.tsx:121`, `admin/minha-localidade/page.tsx` |
| `interface PapelAtribuido { tipo: TipoPapel; localidade_id: string \| null; edicao_id: string \| null }` (l.167-171) | um papel concedido (nomes **snake_case**, como no banco) | auth, testes |
| `function pode(papeis: readonly PapelAtribuido[], cap: Capacidade): boolean` (l.174-177) | algum papel está em `MATRIZ[cap]`, qualquer escopo | `auth.ts:84`, `capacidadesDe` |
| `function podeNaLocalidade(papeis, cap, localidadeId: string): boolean` (l.186-197) | como `pode`, mas exige `p.tipo === "sede" \|\| p.localidade_id === localidadeId`. **Ignora `edicao_id`.** | `auth.ts:85`, testes |
| `function capacidadesDe(papeis: readonly PapelAtribuido[]): Set<Capacidade>` (l.200-206) | itera `Object.keys(MATRIZ)` e aplica `pode` | `auth.ts:82`, testes |
| `function localidadesDosPapeis(papeis): string[]` (l.209-214) | ids únicos das localidades onde há papel em `PAPEIS_LOCAIS` (professor e aluno NÃO contam) | `auth.ts:81` |
| `const ORDEM_ALCANCE` (l.220-227) — não exportada | `sede, coordenador, orientador, presidente_uap, professor, aluno` | `papelPrincipal` |
| `function papelPrincipal(papeis): TipoPapel \| null` (l.229-234) | primeiro tipo presente na ordem de alcance | `auth.ts:72` |

### 1.3 `src/lib/acesso.ts` (198 linhas) — `import "server-only"`

| Export | Faz | Tabelas / Auth | Quem chama |
|---|---|---|---|
| `interface ResultadoAcesso { ok: boolean; erro?: string; senhaGerada?: string; email?: string; contaCriada?: boolean }` (l.23-31) | contrato de retorno | — | `admin/pessoas/acesso-actions.ts`, `admin/papeis/actions.ts` |
| `function bytes(n: number): Uint8Array` (l.34-36) — privada | `randomBytes` de `node:crypto` para `gerarSenha` | — | — |
| `async function emailDeLogin(authUserId: string): Promise<string \| null>` (l.45-50) | `servico.auth.admin.getUserById` → e-mail que o Auth guarda (para mostrar desencontro cadastro × Auth) | Supabase Auth admin | `admin/pessoas/[id]/page.tsx:39` |
| `async function sincronizarEmailDeLogin(pessoaId: string, emailNovo: string): Promise<{ sincronizado: boolean; erro?: string }>` (l.66-90) | lê `pessoas.auth_user_id`; sem conta → `{sincronizado:false}` sem erro; com conta → `auth.admin.updateUserById(id, { email, email_confirm: true })`. Silenciosa por desenho (l.61-64). | `pessoas`; Auth admin | `admin/pessoas/actions.ts:144` |
| `async function definirSenhaDePessoa(opcoes: { pessoaId: string; atorId: string; senha: string \| null; confirmacao: string \| null }): Promise<ResultadoAcesso>` (l.92-198) | fluxo completo de criar conta / redefinir senha (passo a passo em §3.3) | `pessoas` (select/update), `auditoria` (insert), Auth admin (`updateUserById`, `createUser`, `deleteUser`) | `admin/pessoas/acesso-actions.ts:37`, `admin/papeis/actions.ts:99` |

Ações de auditoria gravadas aqui (l.181-190): `acesso.provisionado` (conta criada) e `acesso.senha_redefinida`, com `entidade: "pessoas"`, `entidade_id: pessoaId`, `motivo: "senha gerada pelo sistema" | "senha definida pelo operador"`. Nunca a senha.

### 1.4 `src/lib/supabase/*`

**`client.ts` (14 linhas)** — `"use client"`.

| Export | Faz | Quem chama |
|---|---|---|
| `function criarClienteBrowser()` (l.9-14) | `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`, sem tipos | 1 uso: `admin/chamada/[id]/Chamada.tsx` |

**`server.ts` (35 linhas)**

| Export | Faz | Quem chama |
|---|---|---|
| `function criarClienteServidor()` (l.11-35) — **síncrona** (`cookies()` do Next 14) | `createServerClient` com `getAll`/`setAll` (try/catch no `setAll` para Server Component) | 39 arquivos |

**`service.ts` (20 linhas)** — `import "server-only"`.

| Export | Faz | Quem chama |
|---|---|---|
| `function criarClienteServico()` (l.12-20) | `createClient(url, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })`; lança `"SUPABASE_SERVICE_ROLE_KEY ausente — obrigatória no servidor."` se faltar | 12 arquivos, entre eles `acesso.ts`, `comunicacao/index.ts`, `configuracao/index.ts`, `login/actions.ts`, `politicas/actions.ts`, `admin/pessoas/actions.ts`, `admin/papeis/actions.ts` |

**`consulta.ts` (36 linhas)**

| Export | Faz | Quem chama |
|---|---|---|
| `class ErroConsulta extends Error` (l.20-28), `constructor(readonly oQue: string, readonly causa: PostgrestError)` | mensagem `Falha ao consultar <oQue>: <causa.message>`; `name = "ErroConsulta"` | `politicas/actions.ts`, `l/[slug]/matricula/actions.ts`, `admin/pessoas/acesso-actions.ts` (todos fazem `instanceof ErroConsulta` para responder "nada foi alterado") |
| `function exigir<T>(resultado: { data: T; error: PostgrestError \| null }, oQue: string): T` (l.30-36) | se `error` → lança `ErroConsulta`; senão devolve `data` **inclusive `null`** (o `null` do `maybeSingle` é legítimo — `tests/consulta.test.ts:13-17`) | 30 arquivos |

**`middleware.ts` (107 linhas)** — chamado por `src/middleware.ts:4-6` (`export async function middleware(request) { return atualizarSessao(request) }`, matcher l.13: `"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"`).

| Export | Faz | Quem chama |
|---|---|---|
| `const TEMPO_LIMITE_SESSAO_MS = 3000` (l.15) — privada | teto da checagem de sessão (houve 504 em produção, l.9-13) | `atualizarSessao` |
| `function rotaPublica(pathname: string): boolean` (l.18-27) | `"/"`, `startsWith("/login")`, `"/l/"`, `"/certificado/"`, `"/politicas"`, `"/auth"` | `atualizarSessao`, `tests/middleware.test.ts` |
| `async function atualizarSessao(request: NextRequest)` (l.41-87) | pública → `NextResponse.next({ request })` sem tocar no Supabase; senão cria `createServerClient` com cookies da request, `getUser()` sob `comPrazo(…, 3000)`, `.catch` → `console.error` + `null`; sem usuário → redirect `/login?redirect=<pathname>` (l.80-83) | `src/middleware.ts` |
| `function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T>` (l.90-107) | **rejeita** com `Error("checagem de sessão excedeu <ms>ms")` ao estourar; limpa o timer nos dois caminhos | `atualizarSessao`, testes |

⚠️ Não existe pasta `src/app/auth` (verificado com `find`), embora `rotaPublica` libere `/auth`. O middleware **não** exclui `/api/`: `POST /api/notificacoes/processar` sem cookie recebe redirect 307 para `/login` (é exatamente a armadilha descrita no plano §5.3; o esqueleto corrige com `rotaDeApi()`, `src/proxy.ts:19-21`).

### 1.5 `src/lib/configuracao/*`

**`index.ts` (116 linhas)** — `"server-only"`, `export * from "./politica"` (l.12).

| Export | Faz | Tabelas | Quem chama |
|---|---|---|---|
| `interface Configuracao extends PadraoNacional` (l.15-27): `controladorRazaoSocial, controladorCnpj, controladorEndereco, controladorEmail, dpoNome, dpoEmail, dpoTelefone: string \| null; politicaRetencao, politicaCancelamento: string; prazoArrependimentoDias: number; atualizadoEm: string \| null` | a configuração nacional em camelCase | — | `politicas/page.tsx` |
| `const COLUNAS` (l.29-33) — privada | lista das 15 colunas lidas | — | — |
| `async function configuracaoVigente(): Promise<Configuracao>` (l.46-87) | `servico.from("configuracoes").select(COLUNAS).eq("id", 1).maybeSingle()` sob `exigir` (banco fora → estoura, não cai no padrão, l.38-42). Linha ausente → `PADRAO_NACIONAL_FALLBACK` + nulos + `prazoArrependimentoDias: 7`. Mapeia snake → camel, `Number(mdr_percent_padrao)`. | `configuracoes` (service_role) | `politicas/page.tsx:23`, `politicaDaLocalidade` |
| `async function politicaDaLocalidade(localidadeId: string): Promise<PoliticaPagamento>` (l.93-116) | `Promise.all([configuracaoVigente(), localidades(max_parcelas, modo_pagamento, mdr_percent, tarifa_fixa_centavos)])` → `resolverPolitica(nacional, override)`; `mdr_percent` só vira número se não-nulo (l.111-113) | `configuracoes`, `localidades` | `lib/pagamento/index.ts`, `l/[slug]/matricula/page.tsx`, `l/[slug]/matricula/actions.ts` |

**`politica.ts` (120 linhas)** — puro.

| Export | Faz | Quem chama |
|---|---|---|
| `type ModoPagamento = "split" \| "centralizado"` (l.15) | | index, configuracoes/page, actions |
| `interface PadraoNacional { maxParcelasPadrao: number; modoPagamentoPadrao: ModoPagamento; mdrPercentPadrao: number; tarifaFixaCentavosPadrao: number }` (l.18-23) | | |
| `interface OverrideLocalidade { maxParcelas?: number \| null; modoPagamento?: ModoPagamento \| null; mdrPercent?: number \| null; tarifaFixaCentavos?: number \| null }` (l.26-31) | | |
| `interface PoliticaPagamento { maxParcelas: number; modo: ModoPagamento; mdrPercent: number; tarifaFixaCentavos: number; personalizados: (keyof OverrideLocalidade)[] }` (l.34-41) | "já é a decisão", sem nulos; `personalizados` diz o que veio da localidade (tela escreve "herdado") | |
| `const PADRAO_NACIONAL_FALLBACK: PadraoNacional = { 12, "centralizado", 0, 0 }` (l.43-48) | | index, testes |
| `const MIN_PARCELAS = 1`, `const MAX_PARCELAS_ABSOLUTO = 24` (l.51-52) | "iguais aos `check` da migration 0023" | `admin/configuracoes/actions.ts` (zod), testes |
| `function resolverPolitica(nacional: PadraoNacional, local: OverrideLocalidade = {}): PoliticaPagamento` (l.54-85) | `usar(chave, valor, padrao)`: `null`/`undefined` → padrão; presente → empurra em `personalizados`. `maxParcelas` recebe clamp `[MIN, MAX_ABSOLUTO]` com `Math.trunc` | `index.ts:108`, `admin/configuracoes/page.tsx:392`, testes |
| `function parcelasPermitidas(pedidas: number, politica: PoliticaPagamento, aVista: boolean): number` (l.94-102) | à vista → 1; `NaN`/não finito → 1; `trunc`, clamp `[1, politica.maxParcelas]` (corrige em vez de recusar) | `l/[slug]/matricula/actions.ts`, testes |
| `function precoParaEntradaTardia(precoIntegralCentavos: number): number` (l.118-120) | devolve o integral — decisão do cliente de 01/09/2026 nomeada em função | só testes |

### 1.6 `src/lib/diagnostico/*`

**`index.ts` (45 linhas)** — `"server-only"`, `export * from "./regras"` (l.4).

| Export | Faz | Quem chama |
|---|---|---|
| `const ENV_ESPERADAS = ["RESEND_API_KEY", "CRON_SECRET", "NEXT_PUBLIC_SITE_URL"]` (l.7) — privada | | |
| `const PRAZO_MS = 4000` (l.10) — privada | | |
| `async function lerConfigAuth(): Promise<ConfigAuth \| null>` (l.20-39) — privada | `fetch(\`${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings\`, { headers: { apikey, Authorization: Bearer anon }, signal: AbortSignal.timeout(4000), cache: "no-store" })`; qualquer falha → `null` + `console.error` | `diagnosticar` |
| `async function diagnosticar(): Promise<Achado[]>` (l.41-45) | `avaliarDiagnostico({ auth, envAusentes: ENV_ESPERADAS.filter(n => !process.env[n]?.trim()) })` | `admin/configuracoes/page.tsx:68`, `admin/AvisoDiagnostico.tsx:18` |

**`regras.ts` (127 linhas)** — puro (l.19-20: "Sem rede, sem `process.env`").

| Export | Faz |
|---|---|
| `type Gravidade = "critico" \| "atencao"` (l.23) | |
| `interface Achado { chave: string; gravidade: Gravidade; titulo: string; efeito: string; correcao: string }` (l.25-34) | |
| `interface ConfigAuth { external?: { email?: boolean }; disable_signup?: boolean }` (l.37-40) | forma do JSON do GoTrue |
| `interface EntradaDiagnostico { auth: ConfigAuth \| null; envAusentes: string[] }` (l.42-47) | |
| `const EFEITO_ENV` (l.54-73) — privada | textos para `RESEND_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` (regras em §6) |
| `function avaliarDiagnostico(entrada: EntradaDiagnostico): Achado[]` (l.75-127) | regras de §6; ordena crítico primeiro |

### 1.7 `src/lib/comunicacao/*`

**`index.ts` (249 linhas)** — `"server-only"`.

| Export | Faz | Tabelas | Quem chama |
|---|---|---|---|
| `interface Mensagem { destino: string; assunto?: string; corpo: string; template?: ChaveTemplate; variaveis?: string[] }` (l.20-27) | o que o entregador recebe | — | `processarFila` |
| `interface Entregador { readonly canal: CanalMensagem; readonly configurado: boolean; enviar(m: Mensagem): Promise<void> }` (l.29-33) | adaptador por provedor | — | |
| `class EntregadorResend` (l.42-70) — privada | `POST https://api.resend.com/emails` com `{ from: remetente, to: [destino], subject: assunto ?? "Ciclo de Estudos", text: corpo }`; `configurado = Boolean(chave)`; sem chave lança `"RESEND_API_KEY ausente."`; `!r.ok` → `Error("Resend <status>: <200 chars>")`. **Só texto puro, sem HTML.** | — | `entregadorDe` |
| `class EntregadorWhatsapp` (l.81-125) — privada | `POST https://graph.facebook.com/v21.0/<phoneNumberId>/messages` com `type: "template"`, `template.name = TEMPLATES[m.template].nomeMeta`, `language: pt_BR`, `components: [{ type: "body", parameters: variaveis.map(text) }]`; exige `m.template` (l.96); `configurado = Boolean(token && phoneNumberId)` | — | `entregadorDe` |
| `function entregadorDe(canal: CanalMensagem): Entregador` (l.127-138) | `whatsapp` → `EntregadorWhatsapp(WHATSAPP_CLOUD_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID)`; senão `EntregadorResend(RESEND_API_KEY, EMAIL_REMETENTE ?? "Ciclo de Estudos <nao-responda@seicho.org.br>")` | — | `processarFila` |
| `interface PedidoNotificacao { pessoaId: string \| null; canal: CanalMensagem; template: ChaveTemplate; destino: string; variaveis: string[]; chaveUnica?: string }` (l.144-152) | contrato de enfileirar | — | 2 chamadores (§4.3) |
| `async function enfileirar(p: PedidoNotificacao): Promise<void>` (l.158-177) | `renderizar(template, canal, variaveis)` → `servico.from("notificacoes").insert({ pessoa_id, canal, template, destino, variaveis, assunto, corpo, chave_unica: p.chaveUnica ?? null })`; **tudo em try/catch, nunca lança**; chave duplicada (23505) cai no catch e é o comportamento desejado (l.173-175) | `notificacoes` (service_role) | `l/[slug]/matricula/actions.ts:316`, `lib/certificado/emitir.ts:228` |
| `const MAX_TENTATIVAS = 5` (l.180) — privada | | | |
| `async function processarFila(limite = 50): Promise<{ enviadas: number; falhas: number; ignoradas: number }>` (l.188-249) | algoritmo em §4.4 | `notificacoes` (select/update, service_role) | `api/notificacoes/processar/route.ts:33` |

**`templates.ts` (156 linhas)** — puro.

| Export | Faz |
|---|---|
| `type CanalMensagem = "email" \| "whatsapp"` (l.25) | |
| `type ChaveTemplate = "matricula_confirmada" \| "lembrete_aula" \| "pagamento_pendente" \| "certificado_liberado"` (l.27-31) | |
| `interface Template { chave; nomeMeta: string; categoriaMeta: "UTILITY" \| "MARKETING" \| "AUTHENTICATION"; descricao; variaveis: string[]; assuntoEmail: string; corpoEmail(v): string; corpoWhatsapp(v): string; corpoParaSubmissao: string }` (l.33-46) | |
| `const ASSINATURA_EMAIL` (l.48-51) — privada | "—\nCiclo de Estudos da Prosperidade\nEsta é uma mensagem automática; não é necessário responder." |
| `const TEMPLATES: Record<ChaveTemplate, Template>` (l.53-136) | os 4 templates (§4.5) |
| `function renderizar(chave, canal, variaveis: string[]): { assunto: string; corpo: string }` (l.139-156) | contagem de variáveis diferente de `t.variaveis.length` → **lança** (`Template "<chave>" espera N variáveis (...), recebeu M.`); `assunto` é sempre `assuntoEmail`; corpo conforme canal |

### 1.8 `src/lib/landing.ts` (45 linhas)

Está no recorte, mas é **conteúdo do módulo Ciclo** (landing por localidade, §11 da especificação), não plataforma.

| Export | Faz | Quem chama |
|---|---|---|
| `interface CampoLocal { chave: string; rotulo: string; tipo: "text" \| "textarea"; hint?: string }` (l.9-14) | | |
| `const CAMPOS_LOCAIS: CampoLocal[]` (l.17-22) | `datas_horarios`, `local_hotel`, `contato_coordenador`, `observacoes_locais` (gravados em `landing_pages.campos_jsonb`) | `l/[slug]/page.tsx`, `admin/localidades/[id]/landing/{page,actions}.ts(x)` |
| `type CamposLanding = Record<string, string>` (l.24) | | |
| `const TEMPLATE_SEDE` (l.30-40) | `titulo`, `subtitulo: "Seicho-No-Ie do Brasil"`, `descricao`, `texto_doutrinario` | `l/[slug]/page.tsx` (6), `l/[slug]/matricula/page.tsx` (2) |
| `function lerCampos(campos: unknown): CamposLanding` (l.42-45) | objeto → cast; senão `{}` | 2 páginas |

⚠️ `subtitulo: "Seicho-No-Ie do Brasil"` fere a regra do `AGENTS.md` ("A forma com 'do Brasil' em minúsculas não pode aparecer em lugar nenhum"). O mesmo texto está em `src/app/login/page.tsx:41,96` e no `src/app/painel/page.tsx` (hero) do Ciclo. Ao portar, substituir por `<Entidade />`.

### 1.9 `src/lib/dominio/{cpf,codsni,senha,slug,dinheiro}.ts`

| Arquivo | Export | Faz | Quem chama |
|---|---|---|---|
| `cpf.ts` (49) | `normalizarCpf(entrada: string): string` (l.12-14) | `replace(/\D/g, "")` | 8 arquivos (login, politicas, matrícula pública, admin/pessoas, admin/grades, importacao/previa, testes) |
| | `cpfValido(entrada: string): boolean` (l.21-42) | 11 dígitos, rejeita repetidos, confere DV1 (peso 10) e DV2 (peso 11) | 7 arquivos |
| | `formatarCpf(entrada: string): string` (l.45-49) | `000.000.000-00`; se não tiver 11 dígitos devolve a entrada | `admin/pessoas/page.tsx`, `admin/pessoas/[id]/page.tsx`, `admin/dispensas/page.tsx` |
| `codsni.ts` (19) | `normalizarCodSni(entrada: string): string` (l.11-13) | `trim()` — **preserva zeros à esquerda** | `admin/pessoas/actions.ts`, `importacao/previa.ts` |
| | `codSniValido(entrada: string): boolean` (l.16-19) | `/^[0-9]+$/` sobre o normalizado (vazio é inválido) | idem |
| `senha.ts` (136) | `const MIN_SENHA = 8` (l.16) | | `DefinirSenha.tsx` (4), testes |
| | `interface DadosDaPessoa { cpf?; codSni?; email?; nome? }` (l.22-27) | o que a senha não pode ser | `acesso.ts` |
| | `const OBVIAS` (l.30-40) — privada | `12345678, 123456789, 1234567890, senha123, password, qwertyui, abcd1234, mudar123, trocar123` | |
| | `interface ResultadoSenha { ok: boolean; erro?: string }` (l.42-45) | | |
| | `validarSenha(senha: string, confirmacao: string, pessoa: DadosDaPessoa = {}): ResultadoSenha` (l.51-100) | na ordem: `< MIN_SENHA`; `senha !== senha.trim()`; `senha !== confirmacao`; em `OBVIAS` (minúsculas); dígitos da senha **contêm** o CPF (11 dígitos); dígitos da senha **iguais** ao CodSNI (≥4 dígitos); igual à parte local do e-mail (≥4); igual ao primeiro nome (≥4) | `acesso.ts:130`, testes (18) |
| | `const ALFABETO = "ABCDEFGHJKMNPQRTUVWXYabcdefghijkmnopqrstuvwxyz346789"` (l.110) — privada | sem 0/O, 1/l/I, 5/S, 2/Z | |
| | `gerarSenha(tamanho = 12, aleatorios: (n: number) => Uint8Array = () => { throw }): string` (l.117-136) | rejeição de bytes ≥ `floor(256/len)*len` para não enviesar; fonte injetada (teste determinístico; produção `randomBytes`) | `acesso.ts:126`, testes (5) |
| `slug.ts` (12) | `slugify(texto: string): string` (l.5-12) | NFD, remove diacríticos, minúsculas, `[^a-z0-9]+` → `-`, apara hífens | `admin/localidades/actions.ts` |
| `dinheiro.ts` (35) | `reaisParaCentavos(valor: string \| number): number` (l.8-19) | número → `round(*100)`; string: tira `\s` e `R$`, remove `.` de milhar, `,` → `.`; **lança** `Valor monetário inválido` se NaN | `admin/localidades/actions.ts` (3), `admin/descontos/actions.ts`, testes |
| | `formatarCentavos(centavos: number): string` (l.22-27) | `Intl.NumberFormat pt-BR BRL` | 6 telas |
| | `percentualDeCentavos(centavos: number, percentual: number): number` (l.33-35) | `round(centavos*percentual/100)` | `lib/dominio/desconto.ts`, testes |

### 1.10 `src/app/api/notificacoes/processar/route.ts` (36 linhas)

| Export | Faz |
|---|---|
| `export const dynamic = "force-dynamic"` (l.4), `export const maxDuration = 60` (l.5) | |
| `export async function POST(req: Request)` (l.19-36) | sem `CRON_SECRET` → `503 { erro: "CRON_SECRET não configurado. A rota fica fechada até que esteja." }`; `authorization !== "Bearer <segredo>"` → `401 { erro: "Não autorizado." }`; `processarFila()` → `console.log("[notificacoes]", r)` → `json(r)` |

**Só POST.** Não há GET, e não há cron no `vercel.json`. Vercel Cron chama por GET — logo, neste estado, um cron configurado receberia 405. O esqueleto exporta `GET` e `POST` (`route.ts:22-23`).

### 1.11 `src/app/admin/Sidebar.tsx` (176), `layout.tsx` (83), `AvisoDiagnostico.tsx` (35)

**`SECOES`** (`Sidebar.tsx:36-74`), constante não exportada, `{ titulo, itens: { href, rotulo, Icone, cap }[] }[]`. É o que o plano manda virar registro de módulos:

| Seção | href | rótulo | ícone Tabler | cap |
|---|---|---|---|---|
| Estrutura | `/admin/regionais` | Regionais | `IconMap2` | `estrutura.gerir` |
| Estrutura | `/admin/localidades` | Localidades | `IconMapPin` | `estrutura.gerir` |
| Estrutura | `/admin/locais` | Locais | `IconBuildingSkyscraper` | `estrutura.gerir` |
| Minha localidade | `/admin/minha-localidade` | Edições e turmas | `IconMapPin` | `edicao.gerir` |
| Minha localidade | `/admin/dispensas` | Dispensas | `IconClipboardCheck` | `prerequisito.dispensar` |
| Minha localidade | `/admin/chamada` | Chamada | `IconUserCheck` | `presenca.lancar` |
| Minha localidade | `/admin/certificados` | Certificados | `IconCertificate` | `certificado.emitir` |
| Programa | `/admin/ciclos` | Ciclo anual | `IconBook2` | `ciclo.gerir` |
| Programa | `/admin/provas` | Provas | `IconFileText` | `prova.gerir` |
| Pessoas | `/admin/pessoas` | Cadastro | `IconUsers` | `pessoa.gerir` |
| Configuração | `/admin/descontos` | Descontos | `IconDiscount2` | `politica_desconto.gerir` |
| Configuração | `/admin/descontos/concedidos` | Concedidos | `IconReportMoney` | `financeiro.ver` |
| Configuração | `/admin/importacao` | Importação | `IconFileImport` | `importacao.executar` |
| Configuração | `/admin/configuracoes` | Sistema e LGPD | `IconSettings` | `configuracao.gerir` |

`export default function Sidebar({ nome, papel, capacidades: string[], aoSair: () => void })` (l.83-176): filtra itens por `tem.has(i.cap)`, some seção vazia (l.96-99); `ativo = pathname === href || pathname.startsWith(href + "/")` (l.132); marca "Ciclo da Prosperidade / SNI Brasil" (l.115-120); rodapé com iniciais, nome, papel e `<form action={aoSair}>`. Não há item para `/admin/papeis` (chega-se por link da ficha da pessoa) nem para auditoria (não existe tela de auditoria no Ciclo — só a tabela).

**`admin/layout.tsx`**: `pessoaAtual()`; sem sessão → `redirect("/login")` (l.23); "tem alguma capacidade admin" = `estrutura.gerir || ciclo.gerir || edicao.gerir || grade.gerir || pessoa.gerir || presenca.lancar || prerequisito.dispensar` (l.26-33) — lista **manual**, que não cobre `configuracao.gerir`, `acesso.gerir`, `prova.gerir` isoladas; sem nada → card "Área restrita" com `rotuloPapel` (l.35-55). Renderiza `<RegistrarSW />` (PWA), `<Sidebar capacidades={[...eu.capacidades]} aoSair={sair} />` e `<AvisoDiagnostico />` só para quem `pode("configuracao.gerir")` (l.77).

**`AvisoDiagnostico.tsx`**: `export default async function AvisoDiagnostico()`; `diagnosticar()` filtrado a `critico`; nada → `null`; senão faixa vermelha com título, efeito e link "Como corrigir" para `/admin/configuracoes`.

### 1.12 `src/app/painel/page.tsx` (162 linhas)

`const ATALHOS: { href; titulo; descricao; Icone; cap: Capacidade }[]` (l.27-83):

| href | título | cap |
|---|---|---|
| `/admin/localidades` | Estrutura e cadastros | `estrutura.gerir` |
| `/admin/minha-localidade` | Minha localidade | `edicao.gerir` |
| `/admin/minha-localidade` | Grade e acompanhamento | `prerequisito.dispensar` |
| `/meu-curso` | Meu curso | `matricula.ver` |
| `/aulas` | Aulas complementares | `matricula.ver` |
| `/provas` | Provas | `matricula.ver` |
| `/admin/importacao` | Importação de base histórica | `importacao.executar` |

`export default async function Painel()`: sem sessão → `redirect("/login")` (l.87); hero com nome, e-mail e `<form action={sair}>`; seção "Seus papéis" com `Badge` por papel (`NOME_PAPEL[p.tipo]`, tom `dark` para sede); "O que você pode fazer" = `ATALHOS.filter(a => pessoa.pode(a.cap))`.

### 1.13 `src/app/login/actions.ts` (114), `page.tsx` (100)

| Export | Faz |
|---|---|
| `interface EstadoLogin { erro?: string }` (l.8-10) | estado do `useFormState` |
| `async function entrar(_prev: EstadoLogin, formData: FormData): Promise<EstadoLogin>` (l.19-59) | lê `identificador`, `senha`, `redirect` (default `/painel`); vazios → erro; `pareceCpf = !identificador.includes("@") && normalizarCpf(identificador).length >= 11` (l.32); CPF inválido → `"CPF inválido."`; `servico.from("pessoas").select("email").eq("cpf", soDigitos).maybeSingle()`; erro ou sem e-mail → `"Não encontramos uma conta com esse CPF."` (l.45-47, **revela existência do CPF** — o esqueleto responde "Credenciais inválidas", `login/actions.ts:39`); `supabase.auth.signInWithPassword({ email, password })`; erro → `mensagemDeErro`; sucesso → `redirect(redirectTo)` (sem validar que começa com `/`) |
| `function mensagemDeErro(error): string` (l.73-108) — privada | `console.error` sempre; por `error.code`: `email_not_confirmed`, `user_banned`, `over_request_rate_limit` e `over_email_send_rate_limit`, `email_provider_disabled` (mensagem longa explicando o botão errado do Supabase), default `"Credenciais inválidas."` |
| `async function sair()` (l.110-114) | `signOut()` + `redirect("/login")` |

`page.tsx`: `"use client"`, `useFormState(entrar, {})`, `useFormStatus` no botão ("Entrando…"), campos `identificador` (placeholder `000.000.000-00`, `autoComplete="username"`) e `senha`, hidden `redirect` de `searchParams.redirect`. Marca "Ciclo de Estudos da Prosperidade / Seicho-No-Ie do Brasil".

### 1.14 `src/app/admin/pessoas/**`

**`page.tsx` (138)** — Server Component, cliente **com RLS** (`criarClienteServidor`): `select("id, cpf, cod_sni, nome, email, auth_user_id").order("nome").limit(50)`; busca `q` → `.or("nome.ilike.%q%,email.ilike.%q%[,cpf.ilike.%dígitos%,cod_sni.ilike.%dígitos%]")` (l.35-40); lê `funcoes_doutrinarias(id, nome)` ativas por `ordem` para o modal; `ModalCadastro` "Nova pessoa" → `criarPessoa`; tabela Nome/CPF/CodSNI/E-mail/Login, com badge "Ativo" ou link "Sem login" (l.112-125); aviso quando bate 50.

⚠️ Sob RLS, quem não é Sede só enxerga a própria linha (`pessoas_select_self`, 0011:122-127). A tela promete `pessoa.gerir` a coordenador e presidente (matriz), mas eles veriam lista de um. Ver §2.5.

**`CamposPessoa.tsx` (80)** — `interface DadosPessoa { id?, cpf?, cod_sni?, nome?, email?, nascimento?, telefone?, endereco? }`, `interface FuncaoOpcao { id, nome }`, `export default function CamposPessoa({ pessoa?, funcoes? })`: campos `cpf`*, `cod_sni`*, `nome`*, `email`* (type email), `nascimento` (date), `telefone`, `endereco`; `funcao_id` + `vigencia` só quando `funcoes` é passado (criação).

**`actions.ts` (187)** — `"use server"`.

| Export | Faz | Tabelas |
|---|---|---|
| `extrair(formData)` / `validar(c)` (privadas, l.23-43) | normaliza CPF/CodSNI/e-mail (minúsculas); valida `cpfValido`, `codSniValido`, nome ≥ 2, `EMAIL_RE` | — |
| `async function criarPessoa(formData)` (l.45-96) | **gate `eu?.isSede`** (não `exigirCapacidade`), l.47; erro → `redirect("/admin/pessoas?erro=")`; `servico.from("pessoas").insert({cpf, cod_sni, nome, email, nascimento, telefone, endereco}).select("id").single()`; `23505` → "Já existe pessoa com esse CPF, CodSNI ou e-mail."; se `funcao_id` → insert `pessoa_funcao_hist { pessoa_id, funcao_id, vigencia_inicio (ou hoje), registrado_por: eu.id }`; auditoria `pessoa.criada` com `depois_jsonb: { cpf, nome }`; `revalidatePath("/admin/pessoas")`; `redirect("/admin/pessoas/<id>")` | `pessoas`, `pessoa_funcao_hist`, `auditoria` (service_role) |
| `async function atualizarPessoa(formData)` (l.98-168) | gate `isSede`; lê `email` anterior; `update` dos 7 campos por `id`; `23505` → "CPF, CodSNI ou e-mail já usados por outra pessoa."; se e-mail mudou → `sincronizarEmailDeLogin(id, c.email)`; `r.erro` → redirect com "Cadastro salvo, mas o e-mail de login não pôde ser atualizado (...). Use "Definir nova senha" para reconciliar."; `r.sincronizado` → auditoria `acesso.email_alterado` com `antes_jsonb/depois_jsonb { email }` | `pessoas`, `auditoria`, Auth |
| `async function definirFuncao(formData)` (l.171-187) | gate `isSede`; insert `pessoa_funcao_hist`; `revalidatePath` | `pessoa_funcao_hist` |

**`acesso-actions.ts` (47)** — `interface RespostaSenha` (espelho de `ResultadoAcesso`); `async function definirSenha(_prev, formData): Promise<RespostaSenha>` (l.23-47): **`exigirCapacidade("acesso.gerir")` na primeira linha**; `gerar = formData.get("gerar") === "on"`; chama `definirSenhaDePessoa`; `ErroConsulta` → `"Não foi possível concluir agora. Nada foi alterado."`.

**`[id]/page.tsx` (244)** — lê `pessoas(id, cpf, cod_sni, nome, email, nascimento, telefone, endereco, auth_user_id)` sob RLS; `notFound()` se ausente; `podeGerirAcesso = eu.pode("acesso.gerir")`; se pode e há conta → `emailDeLogin(auth_user_id)`; `emailDivergente` quando difere do cadastro (l.40-41) → aviso "O login não confere com o cadastro" (l.127-138); lê `funcoes_doutrinarias`, `pessoa_funcao_hist(id, vigencia_inicio, funcoes_doutrinarias(nome, ordem))` desc, `papeis(tipo, ativo, localidades(nome), edicoes(ano))`; cards: dados cadastrais (modal `atualizarPessoa`), "Acesso ao sistema" (só com `acesso.gerir`, com `<DefinirSenha>`), "Função doutrinária" (modal `definirFuncao` + histórico), "Papéis" (link `/admin/papeis?pessoa=<id>`).

**`[id]/DefinirSenha.tsx` (194)** — `"use client"`; `Modal` direto (não `ModalCadastro`) porque troca campos entre "Digitar a senha" e "Gerar automática"; hidden `pessoa_id` e `gerar` (`on`/`off`); campos `senha` e `confirmacao` com olho mostrar/ocultar e `minLength={MIN_SENHA}`; aviso "Quem define a senha de alguém consegue entrar como essa pessoa. A troca fica registrada na auditoria com seu nome."; sucesso com senha gerada mostra a senha uma única vez e o e-mail de login; sucesso sem senha gerada fecha o modal (`useEffect`, l.50-52).

### 1.15 `src/app/admin/papeis/**`

**`page.tsx` (166)** — rota `?pessoa=<id>`; sem `pessoa` → instrução "Abra uma pessoa em Pessoas e clique em Gerenciar"; `TIPOS` (l.18-25): `coordenador` "Coordenador do Ciclo", `orientador` "Orientador Responsável", `presidente_uap` "Presidente de UAP", `professor` "Professor", `aluno` "Aluno", `sede` "Sede Central (nacional)" — **lista duplicada** de `NOME_PAPEL`; lê `pessoas(id, nome, email, auth_user_id)`, `papeis(id, tipo, localidades(nome), edicoes(ano))`, `localidades(id, nome)` ativas, `edicoes(id, ano, localidades(nome))`; lista com botão "Revogar" (`<form action={revogarPapel}>`); `ModalCadastro` "Conceder papel" com selects `tipo`*, `localidade_id` ("Ignorado para o papel Sede"), `edicao_id` (opcional); card "Acesso ao sistema" com `<ProvisionarAcesso>`.

**`actions.ts` (109)**

| Export | Faz | Tabelas |
|---|---|---|
| `TIPOS_VALIDOS` (l.9-16) — privada, terceira cópia da lista de tipos | | |
| `async function concederPapel(formData)` (l.18-60) | **gate `isSede`** (l.20); tipo inválido → erro; `sede` → `localidade_id` e `edicao_id` nulos; não-sede sem localidade → "Selecione a localidade do papel."; `servico.from("papeis").insert({ pessoa_id, tipo, localidade_id, edicao_id })`; `23505` → "Esse papel já existe para a pessoa."; auditoria `papel.concedido` (`entidade: "papeis"`, `entidade_id: pessoaId`, `depois_jsonb: { tipo, localidade_id, edicao_id }`); `revalidatePath` + `redirect` | `papeis`, `auditoria` |
| `async function revogarPapel(formData)` (l.62-78) | gate `isSede`; **`delete()` físico** por `id` (não `ativo = false`); auditoria `papel.revogado` (`antes_jsonb: { papel_id }`) | `papeis`, `auditoria` |
| `interface RespostaAcesso { ok; erro?; senhaTemporaria?; email? }` (l.80-85) | | |
| `async function provisionarAcesso(_prev, formData): Promise<RespostaAcesso>` (l.95-109) | `exigirCapacidade("acesso.gerir")`; `definirSenhaDePessoa({ senha: null, confirmacao: null })` (sempre gera); devolve `senhaTemporaria` e `email` | via `acesso.ts` |

**`ProvisionarAcesso.tsx` (57)** — `"use client"`; se `jaTemAcesso && !senhaTemporaria` → "Acesso já provisionado."; sucesso → caixa verde com "Senha temporária" e "A pessoa deve trocá-la no primeiro acesso." (⚠️ **não há fluxo de troca obrigatória** — nem tela "minha conta" — verificado: não existe `src/app/minha-conta` no Ciclo); senão botão "Provisionar acesso".

### 1.16 `src/app/admin/configuracoes/**`

**`actions.ts` (220)** — todas com `exigirCapacidade` na primeira linha e cliente **com RLS** (`criarClienteServidor`, l.7): escrita passa pelas policies `configuracoes_write` (sede), `ref_write_localidades` (sede), `solicitacoes_exclusao_sede` (sede).

| Export | Guard | Faz | Tabela |
|---|---|---|---|
| `salvarIdentificacao(formData)` (l.43-73) | `configuracao.gerir` | zod `schemaIdentificacao` (`""` → `null`; e-mails validados); regra: `dpo_nome` sem `dpo_email` nem `dpo_telefone` → "Informe e-mail ou telefone do encarregado — a lei exige um canal de contato." (art. 41 §1º); `update ... atualizado_em, atualizado_por: eu.id where id = 1`; `revalidatePath` de `/admin/configuracoes` e `/politicas` | `configuracoes` |
| `salvarPoliticas(formData)` (l.85-111) | `configuracao.gerir` | `politica_retencao` e `politica_cancelamento` ≥ 30 chars; `prazo_arrependimento_dias` int 0..365 e **≥ 7** (art. 49 CDC, l.97-99) | `configuracoes` |
| `salvarPadraoPagamento(formData)` (l.124-144) | `configuracao.gerir` | `max_parcelas_padrao` int [1,24]; `modo_pagamento_padrao` enum; `mdr_percent_padrao` [0, 99.999]; `tarifa_fixa_centavos_padrao` int ≥ 0 | `configuracoes` |
| `salvarPagamentoDaLocalidade(formData)` (l.159-187) | `configuracao.gerir` | `id` uuid; cada campo `"" \| valor`; `""` → `null` (herda) | `localidades` |
| `decidirSolicitacaoExclusao(formData)` (l.190-220) | `lgpd.decidir` | `status ∈ {em_analise, atendida, recusada}`; fora de `em_analise` exige `decisao ≥ 10` chars; `update { status, decisao, decidido_por: eu.id, decidido_em }`; **não apaga nada** | `solicitacoes_exclusao` |

`function voltarComErro(msg): never` (l.12-14) → `redirect("/admin/configuracoes?erro=")`.

**`page.tsx` (595)** — `dynamic = "force-dynamic"`; `exigirCapacidade("configuracao.gerir")` (l.65, ⚠️ lança `SemPermissao` dentro de uma página, que vira erro 500 e não redirect); `diagnosticar()`; lê `configuracoes(*)`, `localidades(id, nome, ativo, max_parcelas, modo_pagamento, mdr_percent, tarifa_fixa_centavos)`, `solicitacoes_exclusao(...)` limit 50 — todos sob RLS com `exigir`. Seções: Diagnóstico (lista de achados; tom `danger` se há crítico; l.117-158), aviso DPO incompleto (l.160-166), Controlador e encarregado (modal `salvarIdentificacao`), Retenção/cancelamento (modal `salvarPoliticas`), Padrão nacional de pagamento (modal `salvarPadraoPagamento`), Ajustes por localidade (tabela; `resolverPolitica` por linha; `<Herdado>` mostra "herdado" em cinza; modal `salvarPagamentoDaLocalidade` com "Deixe em branco para herdar"), Pedidos de exclusão (tabela; modal `decidirSolicitacaoExclusao`). Helpers privados `Dado`, `Trecho`, `Herdado`, `ouTraco`, `formatarBRL`, `NOME_STATUS`.

### 1.17 Rota pública `/politicas` (fora da lista, mas parte do ciclo de configuração)

- `src/app/politicas/page.tsx`: `dynamic = "force-dynamic"`; `configuracaoVigente()` (service_role) → controlador, DPO com contatos, textos, e `<FormExclusao />`.
- `src/app/politicas/actions.ts:27-90`: `solicitarExclusao(_prev, formData)` — **POST aberto, sem sessão**; valida nome ≥ 2, e-mail, CPF opcional mas válido; `service_role`: se já existe pedido `recebida|em_analise` para o e-mail devolve `{ ok: true }` **igual ao caminho feliz** (não revela nada, l.62-66); insere `solicitacoes_exclusao { nome_informado, email_informado, cpf_informado, motivo, origem_ip }` com IP de `x-forwarded-for`.

### 1.18 Bootstrap da primeira conta: `scripts/criar-sede.mjs` (163) e `criar-sede.sql` (90)

Como não há autocadastro e `papel sede` só pode ser concedido por quem já é Sede, o primeiro acesso é feito por script com `service_role` (`--cpf --nome --email --cod-sni [--senha]`): (1) `pessoas` por CPF, cria se não houver (l.84-101); (2) conta Auth: reaproveita `auth.admin.listUsers` por e-mail ou `createUser({ email_confirm: true })` com senha `randomBytes(9).toString("base64url")` (l.105-134) — **não passa por `validarSenha`**; (3) `papeis { tipo: "sede", localidade_id: null, edicao_id: null }` (l.137-152). Idempotente. A versão SQL exige que a conta tenha sido criada no painel com "Auto Confirm User".

### 1.19 Testes de plataforma (`tests/`)

| Arquivo | Linhas | O que fixa |
|---|---|---|
| `permissoes.test.ts` | 130 | isolamento entre localidades (`coordSP` não age em Campinas; nenhuma capacidade local vaza; sede age em qualquer; acúmulo soma sem misturar); regras do MD (§7.4 coordenador desconta, orientador não; §6.3 orientador dispensa, coordenador não; conteúdo nacional só sede; `acesso.gerir` só sede e `pessoa.gerir` também do coordenador); limites (presidente vê financeiro sem desconto; professor = presença + matrícula.ver; aluno = `Set(["matricula.ver"])`; sem papel = vazio); `papelPrincipal`; `localidadesDosPapeis` |
| `senha.test.ts` | 121 | todas as regras de `validarSenha` (inclui CPF com máscara e "CodSNI + uma letra"); `gerarSenha`: tamanho, alfabeto sem ambíguos, passa na própria validação, descarta bytes ≥ limite |
| `politica.test.ts` | 97 | herança, "1 parcela é escolha", MDR zero não vira nacional, split isolado, clamp 999→24 e 0/-3→1, fallback 12x; `parcelasPermitidas` (corta ao teto, à vista 1, NaN/0/-5→1, 2.7→2); `precoParaEntradaTardia` |
| `diagnostico.test.ts` | 93 | `login_desligado` crítico com correção citando "Allow new users to sign up"; `autocadastro_aberto`; ambos; saudável = `[]`; campos ausentes não geram achado; `auth: null` → `auth_inacessivel` crítico e ainda checa env; efeito descreve consequência; env desconhecida ignorada; ordenação |
| `templates.test.ts` | 79 | os 4 templates; nenhum corpo WhatsApp casa `/seicho\|no-ie\|doutrin\|religi/i`; `{{n}}` numerados sem sobra; `nomeMeta` `^[a-z][a-z0-9_]*$`; `renderizar` monta, WhatsApp mais curto, contagem errada lança, nunca "undefined" |
| `middleware.test.ts` | 50 | `rotaPublica` libera `/`, `/login`, `/login?redirect=…`, `/l/…`, `/certificado/…`, `/politicas`, `/auth/callback`; protege `/painel`, `/admin…`; não confunde `/lista-secreta` nem `/certificados-admin`; `comPrazo` resolve, rejeita ao estourar, propaga rejeição original |
| `consulta.test.ts` | 46 | `exigir` devolve dados; **deixa passar `null`**; lista vazia; lança `ErroConsulta` com `oQue` e `causa.code`; erro tem precedência sobre `data` |
| `cpf.test.ts` | 35 | normaliza, válidos com/sem máscara, DV errado, tamanho, repetidos, formata |
| `codsni.test.ts` | 20 | só dígitos sem limite; zeros à esquerda; rejeita não-dígitos e vazio |
| `dinheiro.test.ts` | 25 | `reaisParaCentavos` de string BR e número; lança em inválido; `percentualDeCentavos` |

Os testes de módulo (`desconto`, `prerequisito`, `previa`, `progresso-video`, `prova`, `fila-presenca`) ficam no Ciclo.

---

## 2. A matriz de permissões inteira e como a autorização funciona

### 2.1 As 23 capacidades × 6 papéis (`src/lib/permissoes.ts:82-148`)

Grupo conforme comentário do arquivo (l.46-71). ● = concedida.

| Capacidade | Grupo | sede | coordenador | orientador | presidente_uap | professor | aluno | Comentário no código |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| `estrutura.gerir` | Nacional | ● | | | | | | regionais, localidades, locais |
| `tipos.gerir` | Nacional | ● | | | | | | tipos de turma, funções doutrinárias, equivalências |
| `ciclo.gerir` | Nacional | ● | | | | | | tema do ano, apostila nacional, aulas complementares |
| `importacao.executar` | Nacional | ● | | | | | | |
| `auditoria.ver` | Nacional | ● | | | | | | (não há tela) |
| `prova.gerir` | Nacional | ● | | | | | | banco de questões e critério de aprovação |
| `politica_desconto.gerir` | Nacional | ● | | | | | | §7.2 a POLÍTICA anual |
| `configuracao.gerir` | Nacional | ● | | | | | | DPO, políticas públicas, padrões de pagamento |
| `lgpd.decidir` | Nacional | ● | | | | | | pedidos de exclusão (art. 18, VI) |
| `acesso.gerir` | Nacional | ● | | | | | | criar conta e definir senha de outra pessoa — "deliberadamente mais estreito que pessoa.gerir e papel.conceder" (l.105-109) |
| `edicao.gerir` | Localidade | ● | ● | | | | | preço, datas, status da edição |
| `turma.gerir` | Localidade | ● | ● | | | | | turmas e professores |
| `grade.gerir` | Localidade | ● | ● | ● | | | | etapas, datas, orientadores das aulas |
| `landing.editar` | Localidade | ● | ● | | | | | |
| `pessoa.gerir` | Localidade | ● | ● | | ● | | | "quem faz secretaria na prática" |
| `papel.conceder` | Localidade | ● | ● | | | | | |
| `matricula.ver` | Operação | ● | ● | ● | ● | ● | ● | |
| `matricula.decidir` | Operação | ● | ● | | | | | aprovar, cancelar, transferir |
| `financeiro.ver` | Operação | ● | ● | | ● | | | valores, descontos, pagamentos |
| `desconto.autorizar` | Operação | ● | ● | | | | | §7.4 |
| `prerequisito.dispensar` | Operação | ● | | ● | | | | §6.3 |
| `presenca.lancar` | Operação | ● | ● | ● | | ● | | |
| `certificado.emitir` | Operação | ● | ● | | | | | |

Por papel (o que cada um recebe, derivado da tabela):

| Papel | Capacidades | Total |
|---|---|---|
| `sede` | todas | 23 |
| `coordenador` | `edicao.gerir`, `turma.gerir`, `grade.gerir`, `landing.editar`, `pessoa.gerir`, `papel.conceder`, `matricula.ver`, `matricula.decidir`, `financeiro.ver`, `desconto.autorizar`, `presenca.lancar`, `certificado.emitir` | 12 |
| `orientador` | `grade.gerir`, `matricula.ver`, `prerequisito.dispensar`, `presenca.lancar` | 4 |
| `presidente_uap` | `pessoa.gerir`, `matricula.ver`, `financeiro.ver` | 3 |
| `professor` | `matricula.ver`, `presenca.lancar` | 2 |
| `aluno` | `matricula.ver` | 1 |

Mapeamento para o SNI Conecta conforme o plano §3.1: **plataforma, sem prefixo** — `estrutura.gerir`, `pessoa.gerir`, `papel.conceder`, `acesso.gerir`, `configuracao.gerir`, `lgpd.decidir`, `auditoria.ver` (7); **viram `ciclo.*`** — as outras 16. `financeiro.ver` → `ciclo.financeiro.ver`.

### 2.2 `pessoaAtual()` → `pode` / `podeEm` / `exigirCapacidade`

1. `pessoaAtual()` (`auth.ts:43-87`) carrega **só papéis ativos** (`.eq("ativo", true)`, l.68) e monta duas funções sobre o array: `pode(cap) = pode(papeis, cap)` e `podeEm(cap, loc) = podeNaLocalidade(papeis, cap, loc)`.
2. `pode` (`permissoes.ts:174-177`): existe papel cujo `tipo ∈ MATRIZ[cap]`. Serve para **menu** (`Sidebar`, `ATALHOS`, cards condicionais).
3. `podeNaLocalidade` (`permissoes.ts:186-197`): igual, mas o papel precisa ser `sede` **ou** ter `localidade_id === localidadeId`. É a função que "impede o coordenador de São Paulo de agir sobre Campinas" (l.183-184). Serve para **autorizar**.
4. `exigirCapacidade(cap, localidadeId?)` (`auth.ts:104-115`): com localidade usa `podeEm`, sem usa `pode`; falha **lança** `SemPermissao`. É a primeira linha de toda Server Action (`CLAUDE.md:139-141`).

**Escopo por edição.** `papeis.edicao_id` existe no banco (0002:78), é lido em `pessoaAtual` e exibido nas telas (`papeis/page.tsx:92-94`, `pessoas/[id]/page.tsx:232-234`), mas **nenhuma função de autorização o consulta** — nem `podeNaLocalidade`, nem as funções `app.*` do Postgres. Papel com edição vale para a localidade inteira. O único efeito prático é o índice único `uq_papel_local` (0002:94-96), que usa `coalesce(edicao_id, uuid zero)` para permitir o mesmo tipo em edições diferentes.

**Escopo por localidade na prática.** Das 44 chamadas de `exigirCapacidade`, **43 não passam localidade** (§2.4). A checagem de escopo real fica quase toda no RLS (§2.3). O esqueleto reproduz o mesmo desenho (`auth.ts:80-86`).

### 2.3 O que o Postgres decide (a segunda camada)

Funções `SECURITY DEFINER` no schema `app` (0010, 0016), todas `STABLE`, com `GRANT EXECUTE ... TO authenticated, anon` (0010:91-92, 0016:59):

| Função | Faz | Migration |
|---|---|---|
| `app.current_pessoa_id() returns uuid` | `pessoas.id where auth_user_id = auth.uid()` | 0010:14-18 |
| `app.is_sede() returns boolean` | papel `sede` ativo do usuário atual | 0010:21-31 |
| `app.admin_localidade_ids() returns setof uuid` | localidades onde o usuário é `coordenador`, `orientador` ou `presidente_uap` (ativo) | 0010:34-43 |
| `app.professor_turma_ids()` | via `turma_professores` (módulo) | 0010:46-53 |
| `app.edicao_localidade(uuid)`, `app.turma_localidade(uuid)` | resolvem localidade de edição/turma (módulo) | 0010:56-70 |
| `app.pode_admin_localidade(uuid)` | `is_sede() or loc in admin_localidade_ids()` (não definer) | 0010:73-77 |
| `app.pode_ver_matricula(pessoa, turma)` | módulo | 0010:81-89 |
| `app.tem_papel_na_localidade(text[], uuid)` | papel de um dos tipos nessa localidade (`is not distinct from`) | 0016:24-35 |
| `app.pode_coordenar(uuid)` = sede ou coordenador; `app.pode_orientar(uuid)` = sede ou orientador; `app.pode_conduzir(uuid)` = sede, coordenador ou orientador | | 0016:38-57 |

Policies das tabelas de **plataforma** (0011, 0022, 0023):

| Tabela | SELECT | Escrita (pelo cliente autenticado) |
|---|---|---|
| `regionais`, `localidades`, `localidade_regionais`, `locais`, `local_fotos`, `funcoes_doutrinarias` | qualquer autenticado (`using (true)`) | só `app.is_sede()` (0011:57-86) |
| `pessoas` | `app.is_sede() or auth_user_id = auth.uid()` (0011:122-127) | UPDATE próprio ou sede (0011:129-132); **sem INSERT/DELETE** → só service_role |
| `pessoa_funcao_hist` | sede ou própria (0011:137-139) | sede (0011:140-141) |
| `papeis` | sede, própria, ou `localidade_id in admin_localidade_ids()` (0011:147-153) | sede (0011:154-155) |
| `auditoria` | só sede (0011:358-359) | **nenhuma** → só service_role |
| `consentimentos_lgpd` | sede ou própria (0011:362-364) | nenhuma |
| `notificacoes` | sede, própria, ou quem `pode_conduzir` a localidade de uma matrícula da pessoa (0022:52-62) — **depende de `matriculas` (módulo)** | nenhuma; `grant select` a authenticated, `revoke all` de anon (0022:64-66) |
| `configuracoes` | qualquer autenticado (0023:175-176) | sede (0023:179-181) |
| `solicitacoes_exclusao` | sede | sede (0023:187-189) |

GRANTs (0014): `anon` sem privilégio em tabela alguma (l.63-66); `authenticated` CRUD em todas + default privileges; `service_role` tudo. O projeto roda com "expose new tables" desligado (0014:4-7).

**Harness**: `scripts/testar-rls.sh` sobe Postgres local, cria stub de `auth.users`/`auth.uid()`/papéis (l.38-49), aplica as 23 migrations, monta SP × Campinas com um papel de cada (l.57-102) e roda 40 asserções `t`/`ler` (escrita e leitura) trocando `set local role authenticated; set local "request.jwt.claim.sub"` (l.116-140). As de plataforma: `configuracoes` (l.205-216: sede altera, os três locais não; coordenador lê), `localidades.max_parcelas` (sede sim, coordenador da própria não), `solicitacoes_exclusao` (sede registra e lê; coordenador e aluno não).

### 2.4 Onde `exigirCapacidade` é chamada (44 chamadas)

`admin/localidades/actions.ts` ×6 (`estrutura.gerir` ×4, `edicao.gerir` ×2) · `admin/grades/actions.ts` ×5 (`grade.gerir`) · `admin/configuracoes/actions.ts` ×5 (`configuracao.gerir` ×4, `lgpd.decidir`) · `admin/ciclos/actions.ts` ×5 (`ciclo.gerir`) · `admin/provas/actions.ts` ×4 (`prova.gerir`) · `admin/apostilas/[id]/actions.ts` ×4 (`ciclo.gerir`) · `admin/edicoes/[id]/actions.ts` ×3 (`turma.gerir`) · `admin/regionais/actions.ts` ×2 · `admin/locais/actions.ts` ×2 · `admin/dispensas/actions.ts` ×2 (`prerequisito.dispensar`) · `admin/descontos/actions.ts` ×2 (`politica_desconto.gerir`) · `admin/pessoas/acesso-actions.ts` ×1 e `admin/papeis/actions.ts` ×1 (`acesso.gerir`) · `admin/configuracoes/page.tsx` ×1 · `admin/certificados/actions.ts` ×1 (`certificado.emitir`, **com localidade**).

**Não usam `exigirCapacidade` e sim `isSede`** (11 pontos): `admin/pessoas/actions.ts:47,100,173`, `admin/papeis/actions.ts:20,64`, `admin/localidades/[id]/landing/actions.ts` (3), `admin/importacao/actions.ts` (2), `admin/minha-localidade/page.tsx`, `admin/layout.tsx` (via `rotuloPapel`).

### 2.5 Divergências entre matriz, código e RLS (o porte precisa decidir)

1. **`pessoa.gerir` e `papel.conceder` prometidos ao coordenador (e `pessoa.gerir` ao presidente) mas travados por `isSede`** nas actions e por `papeis_write`/ausência de INSERT em `pessoas` no RLS. Hoje só a Sede cadastra pessoa e concede papel. O `tests/permissoes.test.ts:87` fixa `pode(coordSP, "pessoa.gerir") === true`, então a matriz é a intenção; o código ficou atrás.
2. **`auditoria.ver`** existe na matriz, no RLS (`auditoria_select_sede`) e no registro do esqueleto (`/admin/auditoria`, `registro.ts:51`), mas **não há tela** no Ciclo.
3. **`revogarPapel` apaga** (`delete()`), enquanto `pessoaAtual` filtra por `ativo` — a coluna `ativo` nunca é posta em `false` por nenhum código.
4. **`escopo_papel`** (0002:85-88) obriga `localidade_id not null` para tudo que não é `sede`; os papéis nacionais de eventos (`eventos_admin`, `eventos_operador`, `PAPEIS_NACIONAIS` no esqueleto) violam esse `check`, e `app.is_sede()` só reconhece `'sede'`.
5. **`papeis.edicao_id` → `edicoes`** é FK de tabela de plataforma para tabela de módulo (0002:78). Numa plataforma multi-módulo isso inverte a dependência.

---

## 3. Fluxo de acesso, passo a passo

Premissas: Supabase Auth com provedor Email **ligado** e "Allow new users to sign up" **desligado** (`regras.ts:92-116`). O sistema cria contas por `service_role`, nunca por autocadastro. `pessoas.email` é o identificador de login; CPF resolve para ele (`acesso.ts:53-60`).

### 3.1 Primeira conta (Sede) — `scripts/criar-sede.mjs`
1. Pessoa por CPF (cria se não existe).
2. Conta Auth: reaproveita usuário Auth com o mesmo e-mail ou cria com `email_confirm: true` e senha aleatória impressa no terminal.
3. `pessoas.auth_user_id` ← id da conta.
4. `papeis (pessoa_id, 'sede', null, null)`.

### 3.2 Cadastrar pessoa — `admin/pessoas/actions.ts:criarPessoa`
1. Gate `isSede` (vira `exigirCapacidade("pessoa.gerir")` no porte).
2. Normaliza e valida CPF (DV), CodSNI (dígitos), nome, e-mail.
3. `insert pessoas` via service_role; `23505` → mensagem de duplicidade.
4. Função doutrinária opcional → `pessoa_funcao_hist`.
5. `auditoria: pessoa.criada { depois_jsonb: { cpf, nome } }`.
6. Redirect à ficha. **A pessoa ainda não tem login** (a lista marca "Sem login", `pessoas/page.tsx:112-125`).

### 3.3 Criar acesso / definir senha — `lib/acesso.ts:definirSenhaDePessoa`
Chamado por duas telas: ficha da pessoa (`DefinirSenha` → `acesso-actions.ts:definirSenha`, digitada ou gerada) e tela de papéis (`ProvisionarAcesso` → `papeis/actions.ts:provisionarAcesso`, sempre gerada).
1. `exigirCapacidade("acesso.gerir")` na action (só Sede).
2. Lê `pessoas(id, nome, email, cpf, cod_sni, auth_user_id)` via service_role; ausente → "Pessoa não encontrada."; **sem e-mail → "Esta pessoa não tem e-mail no cadastro — informe um antes."** (l.119-123; relevante para o esqueleto, onde `email` é anulável).
3. `senha === null` → `gerarSenha(12, randomBytes)`; senão a digitada.
4. `validarSenha(senha, confirmacao (ou a própria, se gerada), { cpf, codSni, email, nome })`; falha → `{ ok: false, erro }`.
5. Se **já tem conta**: `auth.admin.updateUserById(auth_user_id, { password, email: pessoa.email, email_confirm: true })` — sincroniza o e-mail junto (l.140-157), o que também **conserta** contas com e-mail divergente.
6. Se **não tem conta**: `auth.admin.createUser({ email, password, email_confirm: true })`; depois `update pessoas set auth_user_id`; se o vínculo falhar, `auth.admin.deleteUser` e erro "Falha ao vincular a conta. Nada foi criado; tente de novo." (l.170-177).
7. `auditoria: acesso.provisionado | acesso.senha_redefinida { entidade: pessoas, entidade_id, motivo }` — sem a senha (l.181-190).
8. Devolve `{ ok, email, contaCriada, senhaGerada? }`; a tela mostra a senha gerada uma vez.

### 3.4 Editar e-mail — `admin/pessoas/actions.ts:atualizarPessoa`
1. Gate `isSede`; valida; `update pessoas`.
2. Se o e-mail mudou e há conta: `sincronizarEmailDeLogin` → `auth.admin.updateUserById({ email, email_confirm: true })`.
3. Falha → cadastro fica salvo e a tela avisa para reconciliar por "Definir nova senha".
4. Sucesso → `auditoria: acesso.email_alterado { antes_jsonb, depois_jsonb }`.
5. A ficha mostra "O login não confere com o cadastro" quando `emailDeLogin(auth_user_id)` difere (`[id]/page.tsx:38-41,127-138`).

### 3.5 Conceder/revogar papel — `admin/papeis/actions.ts`
1. Gate `isSede`.
2. `sede` → sem localidade/edição; outros → localidade obrigatória; `insert papeis`; `23505` → "Esse papel já existe para a pessoa.".
3. `auditoria: papel.concedido { depois_jsonb: { tipo, localidade_id, edicao_id } }`.
4. Revogar: `delete papeis where id`; `auditoria: papel.revogado { antes_jsonb: { papel_id } }`.

### 3.6 Login — `login/actions.ts:entrar`
1. `identificador` sem `@` e com ≥ 11 dígitos → trata como CPF: `cpfValido` ou "CPF inválido."; `service_role` lê `pessoas.email where cpf`; não achou → "Não encontramos uma conta com esse CPF.".
2. `signInWithPassword({ email, password })` no cliente com cookies.
3. Erro → `mensagemDeErro` por `error.code` (§1.13); sucesso → `redirect(formData.redirect ?? "/painel")`.
4. Middleware renova a sessão em toda rota privada com prazo de 3 s; sem sessão → `/login?redirect=<path>`.
5. `/painel` (`painel/page.tsx`) mostra papéis e atalhos por capacidade; `/admin/*` exige alguma capacidade administrativa (`admin/layout.tsx:26-33`).

### 3.7 Sair — `login/actions.ts:sair` (`signOut` + redirect), invocado por `<form action={sair}>` na Sidebar e no painel.

### 3.8 Vocabulário de auditoria de plataforma (coluna `auditoria.acao`)
`pessoa.criada`, `acesso.email_alterado`, `acesso.provisionado`, `acesso.senha_redefinida`, `papel.concedido`, `papel.revogado`. (Do módulo: `importacao.previa`, `importacao.efetivada`.) Quem escreve em `auditoria`: `lib/acesso.ts`, `admin/pessoas/actions.ts`, `admin/papeis/actions.ts`, `admin/importacao/actions.ts` — sempre por service_role, pois não há policy de INSERT.

---

## 4. A fila de notificações

### 4.1 Esquema — `0022_notificacoes.sql:21-45`

```sql
create table if not exists notificacoes (
  id            uuid primary key default gen_random_uuid(),
  pessoa_id     uuid references pessoas(id) on delete set null,
  canal         text not null check (canal in ('email','whatsapp')),
  template      text not null,
  destino       text not null,          -- e-mail ou telefone E.164
  variaveis     jsonb not null default '[]'::jsonb,
  assunto       text,
  corpo         text not null,
  status        text not null default 'pendente'
                  check (status in ('pendente','enviada','falhou','cancelada')),
  tentativas    integer not null default 0,
  ultimo_erro   text,
  chave_unica   text unique,             -- idempotência, ex. "certificado:<matricula_id>"
  criado_em     timestamptz not null default now(),
  enviado_em    timestamptz
);
create index idx_notificacoes_pendentes on notificacoes(status, criado_em) where status = 'pendente';
create index idx_notificacoes_pessoa on notificacoes(pessoa_id);
```

RLS: SELECT para sede, a própria pessoa, ou quem `app.pode_conduzir(app.turma_localidade(m.turma_id))` de uma `matriculas` da pessoa (0022:52-62). Sem policy de escrita. `grant select` a `authenticated`, `grant all` a `service_role`, `revoke all` de `anon`. O status `cancelada` está no `check` mas **nenhum código o escreve**.

### 4.2 Contrato de `enfileirar` (`comunicacao/index.ts:144-177`)

`enfileirar({ pessoaId, canal, template, destino, variaveis, chaveUnica? }): Promise<void>` — renderiza assunto e corpo **na hora de enfileirar** (ficam gravados), insere via service_role, e engole qualquer erro com `console.error` (inclusive `renderizar` lançando por contagem errada de variáveis e 23505 de `chave_unica`). **Nunca lança.**

### 4.3 Quem enfileira hoje (2 pontos)

| Chamador | canal | template | chaveUnica |
|---|---|---|---|
| `src/app/l/[slug]/matricula/actions.ts:316-327` | `email` | `matricula_confirmada` | `matricula:<matricula.id>` |
| `src/lib/certificado/emitir.ts:228-238` | `email` | `certificado_liberado` (link `${NEXT_PUBLIC_SITE_URL}/certificado/<codigo>`) | `certificado:<matriculaId>` |

Nenhum enfileira `whatsapp`, `lembrete_aula` ou `pagamento_pendente` — templates existem, disparo não.

### 4.4 `processarFila(limite = 50)` (`comunicacao/index.ts:188-249`)

1. `select id, canal, template, destino, assunto, corpo, variaveis, tentativas from notificacoes where status = 'pendente' and tentativas < 5 order by criado_em limit 50` (sob `exigir`: falha de leitura lança).
2. Para cada linha, `entregadorDe(canal)`; se `!configurado` → `ignoradas++` e **não gasta tentativa** (l.213-219; é o que faz WhatsApp sem token ficar pendente sem se perder, `docs/TEMPLATES-WHATSAPP.md:121`).
3. `entregador.enviar({ destino, assunto, corpo, template, variaveis })`.
4. Sucesso → `update { status: 'enviada', enviado_em: now }`; `enviadas++`.
5. Falha → `tentativas + 1`, `ultimo_erro: message.slice(0, 500)`, `status: tentativas >= 5 ? 'falhou' : 'pendente'`; `falhas++`.
6. Devolve `{ enviadas, falhas, ignoradas }`. Sequencial, sem lock: duas execuções simultâneas podem enviar a mesma linha duas vezes (não há `for update` nem marcação "processando").

### 4.5 Provedores

| Canal | Classe | Endpoint | Env | Observação |
|---|---|---|---|---|
| e-mail | `EntregadorResend` | `POST https://api.resend.com/emails` | `RESEND_API_KEY`, `EMAIL_REMETENTE` (default `Ciclo de Estudos <nao-responda@seicho.org.br>`) | só `text`, sem HTML; assunto default "Ciclo de Estudos" |
| WhatsApp | `EntregadorWhatsapp` | `POST https://graph.facebook.com/v21.0/<WHATSAPP_PHONE_NUMBER_ID>/messages` | `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | `type: template`, `language pt_BR`, `components[body].parameters` = variáveis; **exige template** |
| SMTP | — | — | — | **não existe** |

### 4.6 Templates (`templates.ts:53-136`; cópia para a Meta em `docs/TEMPLATES-WHATSAPP.md`)

| chave = nomeMeta | categoria | variáveis (ordem = `{{n}}`) | assunto e-mail | corpo para submissão à Meta |
|---|---|---|---|---|
| `matricula_confirmada` | UTILITY | nome, turma, localidade, ano | "Sua inscrição no Ciclo de Estudos está confirmada" | `Olá, {{1}}! Sua inscrição no Ciclo de Estudos {{4}} está confirmada. Turma {{2}}, em {{3}}. As datas estão na sua área de aluno.` |
| `lembrete_aula` | UTILITY | nome, data, hora, local | "Lembrete: sua próxima aula do Ciclo de Estudos" | `Olá, {{1}}! Lembrete: sua próxima aula do Ciclo de Estudos é {{2}}, às {{3}}, em {{4}}.` |
| `pagamento_pendente` | UTILITY | nome, valor, vencimento | "Há um pagamento pendente na sua inscrição" | `Olá, {{1}}. Consta um pagamento pendente de {{2}}, vencimento em {{3}}. Se já pagou, desconsidere: a confirmação pode levar até dois dias úteis.` |
| `certificado_liberado` | UTILITY | nome, numero, link | "Seu certificado do Ciclo de Estudos está disponível" | `Olá, {{1}}! Seu certificado do Ciclo de Estudos está disponível. Número {{2}}. Acesse em {{3}}` |

Regras fixadas em teste: nenhum texto nomeia a instituição religiosa (`templates.test.ts:13-23`, LGPD art. 11); textos vivem em código porque a Meta aprova por template (l.4-12). Os quatro são **do módulo Ciclo** (falam de "Ciclo de Estudos"); a plataforma leva a máquina, não os textos.

### 4.7 O cron

- Rota: `POST /api/notificacoes/processar`, `Bearer $CRON_SECRET`, 503 sem segredo, 401 sem/errado (`route.ts:19-31`), `maxDuration = 60`.
- **Nenhum `crons` no `vercel.json` do Ciclo.** O diagnóstico cobra `CRON_SECRET` (`regras.ts:61-66`, "Definir CRON_SECRET na Vercel e usá-lo no agendamento"), mas o agendamento não está no repositório.
- O middleware **não** exclui `/api/`, então um agendador sem cookie recebe redirect para `/login` antes de chegar ao 401 (`lib/supabase/middleware.ts:44-83`).
- O esqueleto já resolve os três pontos: `GET` e `POST` (`route.ts:22-23`), `crons: [{ path: "/api/notificacoes/processar", schedule: "0 12 * * *" }]` (`vercel.json`), `rotaDeApi()` no proxy (`proxy.ts:19-29`).

---

## 5. Configuração

### 5.1 Singleton nacional — `configuracoes` (`0023_configuracoes.sql:46-107`)

| Coluna | Tipo / restrição | Default |
|---|---|---|
| `id` | `smallint primary key check (id = 1)` | 1 |
| `controlador_razao_social`, `controlador_cnpj`, `controlador_endereco`, `controlador_email` | `text` | null |
| `dpo_nome`, `dpo_email`, `dpo_telefone` | `text` | null |
| `politica_retencao` | `text not null` | texto de retenção por prazo indeterminado (l.62-67) |
| `politica_cancelamento` | `text not null` | texto com 7 dias do art. 49 CDC (l.69-76) |
| `prazo_arrependimento_dias` | `integer not null check (>= 0)` | 7 |
| `max_parcelas_padrao` | `integer not null check (between 1 and 24)` | 12 |
| `modo_pagamento_padrao` | `text not null check in ('split','centralizado')` | `centralizado` |
| `mdr_percent_padrao` | `numeric(5,3) not null check (>= 0 and < 100)` | 0 |
| `tarifa_fixa_centavos_padrao` | `integer not null check (>= 0)` | 0 |
| `atualizado_em` | `timestamptz not null` | `now()` |
| `atualizado_por` | `uuid references pessoas(id) on delete set null` | |

A linha 1 nasce na migration (`insert ... on conflict do nothing`, l.107) para não haver "dois caminhos de escrita" (l.104-106). Leitura: qualquer autenticado; escrita: `app.is_sede()`; GRANT CRUD a `authenticated`, tudo a `service_role` (l.174-197).

Metade dessas colunas é **de plataforma** (controlador, DPO, política de retenção, `atualizado_*`); a outra metade é **do módulo Ciclo** (pagamento, cancelamento com "aulas já realizadas", arrependimento). No SNI Conecta a tabela `configuracoes` comum fica com as primeiras; as de pagamento viram `ciclo_*` ou coluna prefixada — decisão do porte (§7.3).

### 5.2 Override por localidade (`0023:112-125`)

`localidades.max_parcelas integer` (null ou 1..24), `modo_pagamento text` (null ou split/centralizado), `mdr_percent numeric(5,3)` (null ou [0,100)), `tarifa_fixa_centavos integer` (null ou ≥ 0). **Nulo herda; nulo não é zero** (`politica.ts:9-13`, `CLAUDE.md:110-115`). Só a Sede escreve em `localidades` (`ref_write_localidades`), então o coordenador não define o próprio teto (`testar-rls.sh:211-215`).

### 5.3 `politica.ts` — resolução pura

`resolverPolitica(nacional, local)` devolve a decisão sem nulos e a lista `personalizados`; `maxParcelas` recebe clamp `[1,24]` mesmo que o banco tenha sido escrito antes de um `check` mais apertado (l.72-75). `parcelasPermitidas` corrige em vez de recusar. `precoParaEntradaTardia` nomeia a decisão "sem pró-rata". Este arquivo inteiro é **regra de pagamento do Ciclo**; a parte de plataforma é só o padrão "nacional + override anulável + `personalizados`", que a Missão/Livraria/Eventos podem reutilizar como forma.

### 5.4 Pedidos de exclusão — `solicitacoes_exclusao` (`0023:140-162`)

`id uuid`, `pessoa_id uuid → pessoas set null`, `nome_informado text not null`, `email_informado text not null`, `cpf_informado text`, `motivo text`, `status text` (`recebida` → `em_analise` → `atendida` | `recusada`), `decisao text`, `decidido_por uuid → pessoas`, `decidido_em timestamptz`, `origem_ip inet`, `criado_em`. Guarda nome/e-mail em texto para sobreviver à própria exclusão (l.143-145). Só a Sede lê e decide (RLS); o público insere por service_role via `/politicas` (§1.17). Ninguém apaga dado por aqui: a decisão é registrada, a eliminação é ato manual (l.135-138).

---

## 6. Diagnóstico de pré-voo (`src/lib/diagnostico/`)

Existe porque "Credenciais inválidas" esconde configuração errada (`regras.ts:3-17`). Lê `/auth/v1/settings` com a chave anônima (o que o Supabase **de fato** está fazendo, `index.ts:13-18`) e as variáveis de ambiente.

| chave | gravidade | Quando | Título | Correção (resumo) |
|---|---|---|---|---|
| `auth_inacessivel` | critico | `auth === null` (fetch falhou, `!r.ok`, timeout 4 s, ou URL/anon key ausentes) | "Não foi possível ler a configuração do Supabase" | conferir `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` apontando para o mesmo projeto |
| `login_desligado` | critico | `auth.external.email === false` | "Login por senha está desligado" | Authentication → Providers → Email: religar; para barrar só o autocadastro usar "Allow new users to sign up" |
| `autocadastro_aberto` | atencao | `auth.disable_signup === false` | "Qualquer pessoa pode criar a própria conta" | desligar "Allow new users to sign up" |
| `env_RESEND_API_KEY` | atencao | variável ausente/vazia | "E-mail transacional não configurado" | criar chave no Resend e publicar na Vercel |
| `env_CRON_SECRET` | atencao | ausente | "Processamento da fila sem segredo" | definir na Vercel e usar no agendamento |
| `env_NEXT_PUBLIC_SITE_URL` | atencao | ausente | "Endereço público do sistema não definido" (link do certificado sem domínio) | definir na Vercel |

Regras de forma: campo ausente no JSON **não** é achado (`regras.ts:92,106` comparam com `=== false`; `diagnostico.test.ts:48-54`); variável sem entrada em `EFEITO_ENV` é ignorada (l.120-121); crítico primeiro (l.126). Superfície: faixa no topo de `/admin` só com críticos e só para quem pode corrigir (`AvisoDiagnostico.tsx`, `admin/layout.tsx:75-77`); lista completa em `/admin/configuracoes` (seção Diagnóstico).

Para o SNI Conecta: `env_NEXT_PUBLIC_SITE_URL` contradiz o plano §5.3 e o `.env.example` do esqueleto ("opcional; cai em `VERCEL_PROJECT_PRODUCTION_URL`") — a regra precisa considerar a retaguarda; `RESEND_API_KEY` deixa de ser a única forma de e-mail se entrar SMTP/`configuracao_email`; vale acrescentar `CREDENCIAIS_ENCRYPTION_KEY` (obrigatória para `cripto.ts`) e `DATABASE_URL` (módulo eventos) à lista de esperadas.

---

## 7. Comparação arquivo a arquivo com o esqueleto (`/home/user/sniconecta/src/lib/**`)

### 7.1 Tabela geral

| Ciclo | Esqueleto | Igual | Diverge | Falta portar |
|---|---|---|---|---|
| `lib/auth.ts` | `lib/auth.ts` (86) | ideia de `PessoaSessao` com `pode`/`podeEm`; `exigirCapacidade(cap, localidadeId?)` | (1) esqueleto usa `cache()` e **service_role** para ler `pessoas`/`papeis` (l.30-32,40); Ciclo usa cliente com cookies sob RLS. (2) esqueleto **não filtra `ativo`** (l.52-57) e `PapelRow` não tem `ativo` (`tipos.ts:22-29`). (3) `exigirCapacidade` do esqueleto **redireciona** (`/login` ou `/painel?erro=`) em vez de lançar `SemPermissao` — muda a semântica de Server Action com `useFormState` e de rotas de API (redirect 303 no lugar de 403). (4) `PessoaSessao` do esqueleto não tem `capacidades`, `localidades`, `isSede`, `papelPrincipal`, `rotuloPapel`; `email` é `string \| null`; `Papel` usa camelCase (`localidadeId`, `edicaoId`) enquanto `PapelAtribuido` usa snake_case. (5) esqueleto trata "conta sem pessoa" à mão porque o `exigir` dele lança em `null` (l.41-50). | `SemPermissao`, `capacidades`, `localidades`, `isSede`, `rotuloPapel`, `papelPrincipal`; filtro `ativo`; decidir lançar × redirecionar (recomendo lançar em action/API, redirecionar só em página/layout). |
| `lib/permissoes.ts` | `lib/permissoes.ts` (80) | conceito de matriz como dado; papel `{ tipo, localidade_id, edicao_id }` | **orientação invertida**: Ciclo `Record<Capacidade, TipoPapel[]>` (capacidade → papéis) com `pode(papeis, cap)`; esqueleto `Record<TipoPapel, Capacidade[]>` (papel → capacidades) com `capacidadesDe(tipo)`. `capacidadesDe` tem **mesmo nome e assinatura diferente** (`(papeis) → Set` × `(tipo) → readonly Capacidade[]`). Esqueleto já prefixa `ciclo.*` mas lista só 7 das 16 (l.34-41, "resumo"); acrescenta `eventos.*` (8) e `PAPEIS_NACIONAIS` (l.76) no lugar do `p.tipo === "sede"`; não tem `PAPEIS_LOCAIS`, `NOME_PAPEL`, `localidadesDosPapeis`, `papelPrincipal`, `podeNaLocalidade` (a lógica está inline em `auth.ts:66-71`). | as 16 capacidades `ciclo.*` completas; `NOME_PAPEL` com os dois papéis de eventos; `PAPEIS_LOCAIS`; `localidadesDosPapeis`; `papelPrincipal` com ordem de alcance incluindo eventos; escolher UMA orientação (a do esqueleto é a que o teste de minimização já usa, `tests/permissoes.test.ts:7-12`). |
| `lib/acesso.ts` | — | — | — | **inteiro**: `ResultadoAcesso`, `emailDeLogin`, `sincronizarEmailDeLogin`, `definirSenhaDePessoa`. Adaptar: `email` anulável (decisão 0004) já é tratado em l.119-123; `cod_sni` anulável (0004) exige `DadosDaPessoa.codSni` aceitar `null` (já aceita). |
| `lib/supabase/client.ts` `criarClienteBrowser()` | `client.ts` `criarClienteNavegador()` | mesma função | **nome**; esqueleto tipado com `Database` | só renomear o único chamador do Ciclo (`admin/chamada/[id]/Chamada.tsx`) ao portar o módulo |
| `lib/supabase/server.ts` `criarClienteServidor()` síncrona | `server.ts` `async criarClienteServidor()` | mesmo nome e forma | **async** (Next 16 `await cookies()`); tipado | todos os 39 chamadores do Ciclo passam a `await` |
| `lib/supabase/service.ts` `criarClienteServico()` | `service.ts` | igual | mensagem de erro diferente; tipado | nada |
| `lib/supabase/consulta.ts` `exigir`, `ErroConsulta` | `consulta.ts` `exigir` | nome e propósito | ⚠️ **comportamento**: esqueleto lança `Error` em `data === null \|\| undefined` ("resposta vazia", l.16-18); Ciclo devolve `null` (legítimo em `maybeSingle`, `tests/consulta.test.ts:13-17`). Chamadas do Ciclo que dependem disso: `auth.ts:50-57`, `acesso.ts:72-75,102-116`, `configuracao/index.ts:48-51,98-105`, `politicas/actions.ts:53-61`. Esqueleto não tem `ErroConsulta` (`acesso-actions.ts:41`, `politicas/actions.ts:81`, matrícula pública fazem `instanceof`). | trazer `ErroConsulta` (com `oQue`, `causa`) e a semântica "null passa"; ou criar `exigirLinha()` para o caso que quer estourar em vazio. Não misturar. |
| `lib/supabase/middleware.ts` + `src/middleware.ts` | `src/proxy.ts` (64) | prazo 3 s; rota pública não fala com o Supabase; redirect para login | esqueleto: `rotaDeApi()` (novo, exclui `/api/`), `comPrazo(p, ms, fallback)` **resolve** com fallback em vez de rejeitar (`proxy.ts:23-25`), `rotaPublica` com `Set` exato + prefixos (perde `/auth` e o prefixo `/login`; ganha `/e/`, `/comprar`, `/descadastro`, `/r/`); parâmetro `?voltar=` em vez de `?redirect=`; `PUBLICAS_*` não exportadas; matcher também ignora `icon.png` e `woff2`. `tests/middleware.test.ts` do Ciclo **não passa** contra o esqueleto (nomes e semântica de `comPrazo`). | `rotaPublica` como lista extensível pelo registro de módulos; testes portados com a semântica nova. |
| `lib/configuracao/index.ts`, `politica.ts` | — | — | — | inteiro. Separar plataforma (`configuracaoVigente` com controlador/DPO/retenção) de módulo (`politicaDaLocalidade`, `politica.ts`). |
| `lib/diagnostico/index.ts`, `regras.ts` | — | — | — | inteiro; ajustar `ENV_ESPERADAS`/`EFEITO_ENV` (§6). |
| `lib/comunicacao/index.ts`, `templates.ts` | `lib/comunicacao/fila.ts` (32, **stub**) | nomes `enfileirar`/`processarFila`; "nunca lança"; 5 tentativas; `chave_unica` | contrato: esqueleto `Notificacao { canal, destinatario, assunto?, corpo, chaveUnica?, pessoaId? }` (corpo livre, sem template); Ciclo `PedidoNotificacao { pessoaId, canal, template, destino, variaveis, chaveUnica? }` (template obrigatório; `renderizar` na hora). Retorno: `{ processadas, falhas }` × `{ enviadas, falhas, ignoradas }`. Nome do campo: `destinatario` × `destino`. | provedores, `entregadorDe`, `processarFila` real, tabela. Reconciliar: a fila precisa aceitar **corpo livre** (eventos manda e-mail por regional, HTML) **e** template (WhatsApp exige). `template text not null` deve virar anulável ou ganhar valor `livre`; `assunto` já é anulável; acrescentar `html` opcional se o e-mail de eventos for HTML. |
| `lib/landing.ts` | — | — | — | é do módulo Ciclo; portar junto com `/l/[slug]`. Corrigir "Seicho-No-Ie do Brasil". |
| `lib/dominio/cpf.ts` | `dominio/cpf.ts` (29) | `cpfValido`, `formatarCpf` | `normalizarCpf(string)` × `somenteDigitos(string \| null \| undefined)`; esqueleto aceita nulo em tudo | alias ou troca nos 8 chamadores |
| `lib/dominio/codsni.ts` | — | — | — | inteiro (`normalizarCodSni`, `codSniValido`) |
| `lib/dominio/senha.ts` | — | — | — | inteiro (`MIN_SENHA`, `validarSenha`, `gerarSenha`, `DadosDaPessoa`, `ResultadoSenha`) + `tests/senha.test.ts` |
| `lib/dominio/slug.ts` | — | — | — | inteiro (`slugify`) — usado por localidades (estrutura, plataforma) |
| `lib/dominio/dinheiro.ts` | `dominio/dinheiro.ts` (26) | `formatarCentavos`; percentual | `reaisParaCentavos(v): number` (lança) × `centavosDe(v): number \| null`; `percentualDeCentavos` × `descontoPercentual`; `formatarCentavos(number)` × `formatarCentavos(number \| null) → "—"` | escolher nomes do esqueleto e trocar nos 4 chamadores do Ciclo + `lib/dominio/desconto.ts` |
| — | `lib/cripto.ts` (41) | — | só no esqueleto (`cifrar`/`decifrar`, `v1.<iv>.<tag>.<texto>`, `CREDENCIAIS_ENCRYPTION_KEY` ≥ 32) | nada a portar do Ciclo; usar para `localidade_credenciais_cielo` ao portar o módulo |
| — | `lib/tema.ts` (35) | — | só no esqueleto (`Tema`, `SCRIPT_TEMA_INICIAL`, `aplicarTema`); Ciclo não tem tema escuro (`components/Tema.tsx` citado no plano não existe aqui — `ls src/components` mostra `Modal.tsx`, `RegistrarSW.tsx`, `ui.tsx`) | nada |
| — | `lib/db.ts` (33) | — | só no esqueleto (postgres direto, módulo eventos) | nada |
| `app/api/notificacoes/processar/route.ts` | idem (23) | 503/401/Bearer | esqueleto exporta `GET` e `POST`, sem `maxDuration`, sem `console.log`; responde `{ error }` em inglês/“Unauthorized” × `{ erro }` | `maxDuration = 60`; log do resultado |
| `app/admin/Sidebar.tsx` (`SECOES`) + `layout.tsx` | `modulos/registro.ts` (`MODULOS`) + `componentes/Painel.tsx` + `AppShell.tsx` | filtro por capacidade, seção vazia some | esqueleto: `{ chave, rotulo, itens: { href, rotulo, icone: string, capacidade } }` com ícone por **nome** resolvido no cliente; `Painel` faz o que `admin/layout.tsx` fazia (sem a lista manual de "capacidade admin" — qualquer sessão entra, e o painel mostra "Nenhum acesso liberado" se `atalhos.length === 0`, `painel/page.tsx:22-25`); rótulo de papel = `"Sede"` ou tipos com `_`→espaço (`Painel.tsx:18-22`) em vez de `NOME_PAPEL`. Registro já tem `/admin/pessoas` (`pessoa.gerir`) e `/admin/auditoria` (`auditoria.ver`) no bloco `comum`. | os 14 itens do Ciclo como bloco `ciclo` com hrefs `/ciclo/...`; `/admin/regionais`, `/admin/localidades`, `/admin/locais` (`estrutura.gerir`), `/admin/configuracoes` (`configuracao.gerir`) no bloco comum; `AvisoDiagnostico` no `Painel`; `NOME_PAPEL` para o rótulo. |
| `app/painel/page.tsx` (`ATALHOS`) | `app/painel/page.tsx` (43) | atalhos por capacidade | esqueleto deriva de `MODULOS` (sem lista própria); mostra `?erro=` do `exigirCapacidade` | "Seus papéis" (badges por papel) |
| `app/login/actions.ts`, `page.tsx` | `app/login/actions.ts` (64), `page.tsx` (47), `sair/route.ts` (10) | CPF → e-mail via service_role; `signInWithPassword`; mensagens não vazam | esqueleto: zod, `redirect("/login?erro=")` em vez de `useFormState`; **não revela CPF inexistente** (melhor); casa mensagens por substring (`"provider"`, `"too many"`) em vez de `error.code` (pior); valida `voltar.startsWith("/")` (melhor); `POST /login/sair` sem JS. | tabela `error.code` (`email_not_confirmed`, `user_banned`, `over_request_rate_limit`, `over_email_send_rate_limit`, `email_provider_disabled`) no lugar dos `includes`. |
| `app/admin/pessoas/**`, `papeis/**`, `configuracoes/**`, `politicas/**` | — | — | — | inteiras (com `ModalCadastro`, `CamposPessoa`, `DefinirSenha`, `ProvisionarAcesso`, `FormExclusao`); trocar `isSede` por `exigirCapacidade`; hooks `useFormState` → `useActionState` (React 19); `params`/`searchParams` viram `Promise`. |
| `components/ui.tsx`, `Modal.tsx` | `componentes/ui.tsx` (226) | `Botao, BotaoLink, BotaoIcone, Campo, Input, Select, Textarea, Badge, Alerta, Card, CardCabecalho, Metrica, TituloPagina, TituloSecao, Vazio, Tabela, Celula` | esqueleto não tem `Etiqueta`, `Linha`; tem `Num`, `Entidade`; **não há `Modal`/`ModalCadastro`** no esqueleto | `Modal`, `ModalCorpo`, `ModalAcoes`, `ModalCadastro` (regra "cadastro em modal", `AGENTS.md`), `Linha`. |
| `tests/*.test.ts` | `tests/permissoes.test.ts` (28), `cpf.test.ts` (34), `dinheiro.test.ts` (35), `transformar.test.ts` | | esqueleto testa contra a matriz invertida e nomes novos | `senha`, `politica`, `diagnostico`, `templates`, `middleware` (adaptado), `consulta`, `codsni`; reescrever `permissoes` com isolamento entre localidades **e** entre módulos (plano §6 passo 7). |
| `scripts/testar-rls.sh`, `.github/workflows/{ci,migrations}.yml` | `.github/workflows/{ci,migrations}.yml` (25/34 linhas) | CI roda typecheck+test; migrations por `supabase db push` | esqueleto sem `db:bundle`, sem conferência de formato de segredo (`migrations.yml:57-77` do Ciclo), sem `scripts/testar-rls.sh` | harness de RLS (com stub de `auth`) e a conferência de segredos. |
| `scripts/criar-sede.mjs`/`.sql` | — | — | — | script de bootstrap (usar `validarSenha`/`gerarSenha`; `cod_sni` opcional). |

### 7.2 Tabelas de plataforma a consolidar (e o que muda)

| Tabela (Ciclo) | Migration | Mudança obrigatória na fundação |
|---|---|---|
| `pessoas` | 0002:13-30 (`cpf text not null unique` + check 11 dígitos; `cod_sni text not null unique` + check dígitos; `nome`; `email citext not null unique`; `nascimento date`; `telefone`; `endereco`; `auth_user_id uuid unique → auth.users set null`; `criado_em`; `atualizado_em` com trigger `tg_set_atualizado_em` 0002:105-114; índices `auth_user_id`, `nome`) | `email` anulável com `check (auth_user_id is null or email is not null)` e `cod_sni` anulável (decisão 0004); `legado_id integer` (0002 decisão); `PessoaRow` do esqueleto (`tipos.ts:9-20`) **não tem `endereco`** — acrescentar. |
| `funcoes_doutrinarias` (0002:37-42), `pessoa_funcao_hist` (0002:46-55), view `pessoa_funcao_atual` com `security_invoker` (0013), seed das 11 funções (0012:10-22) | | atravessa intacta (é "funções doutrinárias" do enunciado do cliente). |
| `papeis` | 0002:74-100 (`tipo` check em 6 valores; `escopo_papel`; `uq_papel_sede`; `uq_papel_local` com `coalesce(edicao_id)`; índices parciais por `ativo`) | `tipo` aberto ou check incluindo `eventos_admin`, `eventos_operador`; `escopo_papel` reescrito para "papel nacional ⇔ localidade nula" com a lista de nacionais; **`edicao_id` → decidir** (remover da plataforma e o Ciclo guarda escopo por edição em tabela própria, ou generalizar para `escopo_tipo/escopo_id`); `PapelRow` do esqueleto precisa de `ativo`. |
| `regionais` (0001:14-20), `localidades` (0001:22-30 + overrides 0023:112-119), `localidade_regionais` (0001:32-38), `locais`, `local_fotos` (0001:43-63) | | o modelo do cliente é Sede Central > Regionais Doutrinárias > Núcleos/Associações Locais + Organizações transversais; `localidades`/`regionais` do Ciclo são o ponto de partida, mas as colunas de pagamento (`max_parcelas`…) são do módulo Ciclo e devem sair de `localidades` (ou ganhar prefixo). |
| `auditoria` (0009:59-72), `consentimentos_lgpd` (0009:78-87) | | intactas; `auditoria` ganha leitura para `auditoria.ver` (tela nova). |
| `notificacoes` (0022) | | policy sem `matriculas`/`pode_conduzir` (dependência de módulo); `template` anulável ou coluna `corpo_livre`; talvez `html`; índice de processamento já existe. |
| `configuracoes`, `solicitacoes_exclusao` (0023) | | separar colunas de pagamento (módulo) das de LGPD (plataforma). |
| funções `app.*` (0010, 0016) e GRANTs (0014) | | `app.is_sede()` reconhecendo papéis nacionais; `app.tem_papel_na_localidade` intacta; funções de turma/edição vão para o módulo; GRANT/default privileges intactos (o plano §1.3 conta com eles). |

### 7.3 O que precisa ganhar prefixo de módulo (`ciclo.`)

- **Capacidades** (16): `tipos.gerir`, `ciclo.gerir`, `edicao.gerir`, `turma.gerir`, `grade.gerir`, `landing.editar`, `matricula.ver`, `matricula.decidir`, `financeiro.ver`, `desconto.autorizar`, `politica_desconto.gerir`, `prerequisito.dispensar`, `presenca.lancar`, `certificado.emitir`, `prova.gerir`, `importacao.executar` → `ciclo.<recurso>.<acao>` (o esqueleto já escreveu `ciclo.estrutura.gerir` para `estrutura.gerir`, **contrariando o plano §3.1**, que a classifica como plataforma — corrigir num dos dois).
- **Rotas**: os 11 hrefs de módulo em `SECOES`/`ATALHOS` (`/admin/minha-localidade`, `/admin/dispensas`, `/admin/chamada`, `/admin/certificados`, `/admin/ciclos`, `/admin/provas`, `/admin/descontos`, `/admin/descontos/concedidos`, `/admin/importacao`, `/meu-curso`, `/aulas`, `/provas`) → `/ciclo/...`. Ficam sem prefixo: `/admin/regionais`, `/admin/localidades`, `/admin/locais`, `/admin/pessoas`, `/admin/papeis`, `/admin/configuracoes`, `/painel`, `/login`, `/politicas`.
- **Templates** de notificação: os 4 são do Ciclo (`ciclo.matricula_confirmada`… ou pasta `modulos/ciclo/comunicacao/templates.ts` registrada na fila).
- **Colunas** de `configuracoes` (`max_parcelas_padrao`, `modo_pagamento_padrao`, `mdr_percent_padrao`, `tarifa_fixa_centavos_padrao`, `politica_cancelamento`, `prazo_arrependimento_dias`) e de `localidades` (`max_parcelas`, `modo_pagamento`, `mdr_percent`, `tarifa_fixa_centavos`).
- **Policy** de `notificacoes` (referência a `matriculas`) e **FK** `papeis.edicao_id`.
- **Ações de auditoria** `importacao.previa`/`importacao.efetivada` → `ciclo.importacao.*`; as de plataforma (`pessoa.criada`, `acesso.*`, `papel.*`) ficam.
- **Diagnóstico**: `RESEND_API_KEY` e `NEXT_PUBLIC_SITE_URL` são plataforma; o texto "confirmação de matrícula nem aviso de certificado" (`regras.ts:57-58`) é do Ciclo — reescrever genérico.

### 7.4 Checklist de porte, em ordem

1. **Decidir os cinco pontos de esquema** antes de qualquer SQL: (a) `papeis.edicao_id` sai ou generaliza; (b) `escopo_papel` + `app.is_sede()` com papéis nacionais (`sede`, `eventos_admin`, `eventos_operador`); (c) `notificacoes.template` anulável/`corpo` livre; (d) colunas de pagamento saem de `configuracoes`/`localidades`; (e) `estrutura.gerir` é plataforma (plano) ou `ciclo.estrutura.gerir` (esqueleto).
2. **Migration de fundação** com as tabelas de §7.2 (pessoas 0004-compatível, funções doutrinárias + seed, papéis, regionais/localidades/vínculo, locais, auditoria, consentimentos, notificações, configurações, solicitações de exclusão), funções `app.*` de plataforma, RLS e GRANT/default privileges do 0014; provar por diff de `pg_dump` (plano §4). Regenerar `src/lib/supabase/tipos.ts` (`supabase gen types`) — hoje é escrito à mão e já está incompleto (`endereco`, `ativo`).
3. **`lib/supabase/consulta.ts`**: trazer `ErroConsulta` e a semântica "null passa"; portar `tests/consulta.test.ts`.
4. **`lib/permissoes.ts`**: fixar orientação (papel → capacidades), completar as 16 `ciclo.*`, `NOME_PAPEL` (8 papéis), `PAPEIS_LOCAIS`, `PAPEIS_NACIONAIS`, `podeNaLocalidade`, `localidadesDosPapeis`, `papelPrincipal`; testes de isolamento entre localidades **e** entre módulos.
5. **`lib/auth.ts`**: filtro `ativo`; `capacidades`, `localidades`, `isSede`, `rotuloPapel`; `SemPermissao`; `exigirCapacidade` lança (action/API) e um `exigirCapacidadeOuRedirecionar` para página/layout; manter `cache()` e a leitura por service_role (é a que funciona quando `pessoas.email` é nulo e quando a policy depende de `app.current_pessoa_id()`).
6. **`lib/dominio/`**: `codsni.ts`, `senha.ts`, `slug.ts` inteiros; conciliar nomes de `cpf.ts` e `dinheiro.ts`; portar `tests/senha`, `codsni`.
7. **`lib/acesso.ts`** inteiro (+ e-mail obrigatório só para quem terá conta).
8. **`lib/comunicacao/`**: provedores, `entregadorDe`, `enfileirar` aceitando template **ou** corpo, `processarFila` com `ignoradas` e, se possível, marcação de "processando" para evitar duplo envio; `route.ts` com `maxDuration`; `vercel.json` já tem o cron. Portar `tests/templates.test.ts` para dentro do módulo Ciclo.
9. **`lib/configuracao/`**: `configuracaoVigente` só com LGPD/controlador; `politica.ts` e `politicaDaLocalidade` para `modulos/ciclo/`; portar `tests/politica.test.ts` junto.
10. **`lib/diagnostico/`** com `ENV_ESPERADAS` revisado (`CREDENCIAIS_ENCRYPTION_KEY`, `DATABASE_URL`, retaguarda `VERCEL_PROJECT_PRODUCTION_URL`); `AvisoDiagnostico` no `Painel`; portar `tests/diagnostico.test.ts`.
11. **`src/proxy.ts`**: `rotaPublica` extensível (`/politicas` já está; `/l/`, `/certificado/` já estão); portar `tests/middleware.test.ts` com `comPrazo` de fallback.
12. **`componentes/Modal.tsx`** (`Modal`, `ModalCorpo`, `ModalAcoes`, `ModalCadastro`) e `Linha` em `ui.tsx`.
13. **Telas de plataforma**: `/admin/pessoas`, `/admin/pessoas/[id]` (com `DefinirSenha`), `/admin/papeis` (com `ProvisionarAcesso`, tipos e localidade/regional conforme o modelo novo), `/admin/configuracoes` (LGPD + diagnóstico), `/politicas` (+ `FormExclusao`), `/admin/regionais`, `/admin/localidades`, `/admin/locais` (não lidas neste recorte — estão em `src/app/admin/{regionais,localidades,locais}/`), e a **nova** `/admin/auditoria`. Todas com `exigirCapacidade` no lugar de `isSede`, `useActionState`, `params`/`searchParams` assíncronos, `<Entidade />`.
14. **`modulos/registro.ts`**: bloco `comum` com estrutura, pessoas, configurações, auditoria; bloco `ciclo` com os 11 itens de módulo; `Painel` mostra "Seus papéis".
15. **`scripts/criar-sede`** (bootstrap) e **`scripts/testar-rls.sh`** estendido para vazamento entre módulos; `migrations.yml` com a conferência de formato dos segredos.
16. Só então o módulo Ciclo (plano §2.2), consumindo tudo acima.
