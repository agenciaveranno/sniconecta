# Estudo — interface e design system (Ciclo × esqueleto × Eventos)

Base para reescrever `src/componentes/ui.tsx`, `src/design/componentes.css`,
`src/componentes/AppShell.tsx` e `src/lib/tema.ts` do esqueleto de forma que
o esqueleto vire **superconjunto** do que as telas do Ciclo consomem, sem
perder o que o módulo de eventos já entregou (design system v2.7).

Três fontes comparadas, sempre por caminho e linha:

| Sigla | Repositório | Arquivos lidos |
|---|---|---|
| **(a) Ciclo** | `/home/user/sistema-ciclo` (Next 14, React 18, Tailwind 3) | `src/components/ui.tsx` (426 linhas), `src/components/Modal.tsx` (197), `src/app/admin/Sidebar.tsx` (176), `src/app/globals.css` (67), `tailwind.config.ts` (77), `src/lib/auth.ts` (115), `src/lib/permissoes.ts` (234), `src/app/admin/layout.tsx` (83), `src/app/layout.tsx` (27), `src/app/painel/page.tsx`, `src/app/login/page.tsx`, `src/app/admin/minha-localidade/page.tsx`, e varredura por `grep`/script de **todos os 52 `.tsx` de `src/app`** |
| **(b) Esqueleto** | `/home/user/sniconecta` (Next 16, React 19, Tailwind 4) | `src/componentes/ui.tsx` (226), `AppShell.tsx` (109), `Painel.tsx` (29), `src/design/tokens.css` (383), `src/design/componentes.css` (487), `src/app/globals.css` (12), `src/app/layout.tsx` (43), `src/lib/tema.ts` (35), `src/lib/auth.ts` (86), `src/lib/permissoes.ts` (80), `src/modulos/registro.ts` (54), `src/app/painel/page.tsx`, `src/app/login/page.tsx`, `docs/design-system.md` (205), `docs/tokens.json` (177), `docs/referencia-visual.html` |
| **(c) Eventos** | `/home/user/sni-ciclo` (Next 16, React 19, Tailwind 4, MySQL) | `src/app/tokens.css` (376), `src/app/globals.css` (1156), `design/DESIGN-SYSTEM.md` (208), `design/tokens.json`, `src/components/AppShell.tsx` (225), `Modal.tsx` (79), `Toast.tsx` (76), `Navbar.tsx` (167), `SniTopBar.tsx` (67), `src/lib/tema.ts` (117), `src/lib/preferencia-usuario.ts` (96), `src/app/layout.tsx` (73), `src/app/minha-conta/page.tsx` (106), `src/app/api/preferencias/route.ts` |

## 0. O que NÃO foi encontrado (e o que o plano de fundação cita errado)

1. **`src/components/Tema.tsx` não existe no Ciclo.** `find src -iname '*tema*'` e
   `git log --all -- src/components/Tema.tsx` no repositório `sistema-ciclo`
   voltam vazios; a única branch é `claude/system-development-0yi4m6` (commit
   `70f61d6`). O plano de fundação (`1accfd11-SNICONECTAFUNDACAO.md`, §2.1)
   lista "`src/components/Tema.tsx` ~60 linhas — ThemeScript + alternador
   claro/escuro", "`ui.tsx` ~550 linhas" e "`globals.css` ~430 linhas — tokens
   do DS, fonte da verdade". No checkout real: `ui.tsx` tem 426 linhas,
   `globals.css` tem **67** e não há tema escuro em lugar nenhum
   (`grep -rn "prefers-color-scheme\|data-theme\|darkMode" src tailwind.config.ts`
   → nada). O plano descreve uma versão do Ciclo que não está neste ambiente.
2. **O Ciclo não tem Toast, menu/popover, segmentado, chave (switch), spinner
   nem estado vazio com título.** Só os 22 exports listados em §1.1.
3. **O esqueleto não tem a rota `/minha-conta`** (`find src/app -iname '*conta*'`
   → nada), mas `AppShell.tsx:74` já linka para ela. Hoje é um 404.
4. **O esqueleto não tem `useTema` nem gravação do tema na conta**: `src/lib/tema.ts`
   (35 linhas) só tem o script inicial e `aplicarTema`. O comentário em
   `tokens.css:137-139` diz "trocado pela pessoa em Minha conta" — a tela não existe.
5. **A classe `.sni-field`, usada por `Campo` em `src/componentes/ui.tsx:96`, não
   está definida em nenhum CSS** (nem no esqueleto, nem no Eventos: `grep -rn
   "sni-field" /home/user/sni-ciclo/src` → nada). Idem `.sni-content`,
   `.sni-page-wide` e `.sni-sidebar-user-info`, usadas em `AppShell.tsx:90,99,76`
   e ausentes de `src/design/*.css` (ver §6.1 — o problema é maior que essas quatro).
6. **`docs/tokens.json` e `docs/referencia-visual.html` são byte a byte iguais** aos de
   `sni-ciclo/design/` (`diff` limpo). `docs/design-system.md` difere só no
   preâmbulo (escopo `:root` em vez de `.sni-painel`, itens 6–7 do "Ao
   implementar"). Ou seja: o design system do esqueleto **é** o v2.7 do Eventos.

---

## 1. Inventário dos primitivos exportados

### 1.1 Lado a lado

Legenda da coluna "Esqueleto tem?": **=** mesma assinatura; **≠** existe com
assinatura/nome diferente (quebra as telas do Ciclo); **AUSENTE** não existe.
"Telas do Ciclo" = número de arquivos em `src/app`+`src/components` que importam
o primitivo (script sobre `import {…} from "@/components/ui"` e `"@/components/Modal"`).

| Primitivo | (a) Ciclo — `src/components/ui.tsx` / `Modal.tsx` | (b) Esqueleto — `src/componentes/ui.tsx` | (c) Eventos | Esqueleto tem? | Telas do Ciclo |
|---|---|---|---|---|---|
| `Botao` | L45-57. Props: `ComponentProps<"button">` + `variante?: "primary"\|"secondary"\|"ghost"\|"success"\|"danger"\|"dark"` (L19) + `tamanho?: "xl"\|"lg"\|"md"\|"sm"\|"xs"` (L20). Classes Tailwind: `BASE_BOTAO` L41-43 (`inline-flex items-center justify-center gap-[7px] font-semibold … disabled:opacity-60`), `VARIANTE` L22-31 (`bg-sni-blue-600 text-white hover:bg-sni-blue-700` etc.), `TAMANHO` L33-39 (`text-[13px] px-4 py-2 rounded-md` no md) | L26-40. Props: `ComponentProps<"button">` + `variante?: "primary"\|"glass"\|"ghost"\|"success"\|"danger"` (L16) + `tamanho?: "lg"\|"md"\|"sm"` (L17) + `icone?: ReactNode`. Classes: `sni-btn` + `VARIANTE` L18-24 (`sni-btn-primary`, glass→`sni-btn-secondary`, `sni-btn-ghost`, `sni-btn-success`, `sni-btn-danger`) + `sni-btn-{tamanho}` | Sem primitivo React. As telas escrevem `className="sni-btn sni-btn-primary sni-btn-sm"` à mão (264 ocorrências de `sni-btn`, 164 de `sni-btn-sm`, 152 de `sni-btn-ghost`). CSS em `globals.css:123-170` (v1) e `:699-758` (v2.7) | **≠** — faltam `variante="secondary"` (11 usos nas telas), `"dark"`, `tamanho="xl"\|"xs"`. O CSS já tem `.sni-btn-dark` (`componentes.css:68`) e `.sni-btn-xl/-xs` (L44-48), só o TS não expõe | 12 |
| `BotaoLink` | L60-72. `ComponentProps<typeof Link>` + `variante` + `tamanho`; mesmas classes | L42-56. Idem + `icone` | — | **≠** (mesmas lacunas de variante/tamanho) | 7 |
| `BotaoIcone` | L75-92. `ComponentProps<"button">` + `variante?` (padrão `ghost`) + `rotulo: string` (vira `aria-label` e `title`). Classe `inline-flex … rounded-md p-2` + `VARIANTE` | L58-76. Idem + `tamanho?` (padrão `md`). Classes `sni-btn sni-btn-icon` + variante + `sni-btn-{tamanho}` | Telas usam `sni-btn sni-btn-icon` (69 ocorrências); `Modal.tsx:62` usa `sni-btn sni-btn-ghost sni-btn-icon sni-btn-sm` | **=** (superconjunto) | 0 direto |
| `Input` / `Select` / `Textarea` | L102-112. `ComponentProps<…>`; classe `INPUT_BASE` L96-100 (`w-full rounded-md border-[1.5px] border-sni-gray-200 bg-white px-3 py-[9px] text-[13px] … focus:border-sni-blue-400 focus:shadow-focus disabled:bg-sni-gray-50`) | L107-115. Classes `sni-input` / `sni-select` / `sni-textarea` | Telas usam `sni-input` (163), `sni-select` (42), `sni-textarea` (9) à mão | **=** em assinatura. **Mas** `.sni-input` no esqueleto não tem `width:100%` nem `outline:none` (ver §6.1) — o Ciclo depende de `w-full` | 21 / 12 / 9 |
| `Campo` | L114-142. Props `{ label: string; children; hint?: string; erro?: string; obrigatorio?: boolean }`. **Envolve tudo num `<label>`** (L128): o input filho fica associado sem `id`. Rótulo `text-[12px] font-semibold text-sni-gray-600` (L129); asterisco `text-sni-danger` (L131); `hint` `text-[11px] text-sni-gray-400` (L134); erro com `IconAlertCircle` (L136-138) | L80-105. Props `{ label; htmlFor?: string; dica?: string; erro?: string; obrigatorio?; children }`. Renderiza `div.sni-field > label.sni-label[htmlFor]` + filho + `p.sni-error`/`p.sni-hint` | `label.sni-label` à mão (196 ocorrências), `sni-hint` (14), `sni-error` (7) | **≠** — (1) `hint` virou `dica` (28 usos de `hint=` nas telas); (2) associação rótulo↔campo exige `htmlFor` + `id`, e **nenhum dos 81 `<Input` das telas do Ciclo passa `id`** (`grep -rhoE '<Input[^>]*\bid='` → 0). Trocar o primitivo sem manter o `<label>` envolvente perde a acessibilidade de 22 telas; (3) `.sni-field` não existe no CSS | 22 |
| `Badge` | L168-193. Props `{ tom?: "blue"\|"success"\|"warning"\|"danger"\|"gray"\|"dark"\|"outline" (L146); ponto?: boolean; tamanho?: "sm"\|"md"\|"lg"; children }`. Classes `TOM` L148-156 + `COR_PONTO` L158-166; tamanhos `text-[10px]/[11px]/[12px]` L179-184 (todos abaixo do mínimo 13px do v2.7) | L122-129. Props `{ tom?: "blue"\|"success"\|"warning"\|"danger"\|"info"\|"gray" (L119); ponto?; children }`. Classes `sni-badge sni-badge-{tom}` + `span.sni-badge-dot` | `sni-badge` (63), `sni-badge-sm` (62), `-success` (16), `-blue` (14), `-warning` (13), `-gray` (12), `-danger` (11), `-info` (10), `-dark` (1) à mão | **≠** — falta `tamanho` (23 usos de `tamanho="sm"`, 1 de `"lg"`), faltam tons `dark` (usado em `painel/page.tsx:120`) e `outline`. O CSS já tem `.sni-badge-lg/-sm` (`componentes.css:185-186`), `.sni-badge-dark` (L194) e `.sni-badge-outline-blue` (L195) | 23 |
| `Etiqueta` | L196-202. `{ ativo: boolean }` → `Badge` success/gray com ponto e texto "Ativo"/"Inativo" | — | — | **AUSENTE** | 4 (regionais, localidades, descontos, ciclos/[id]) |
| `Alerta` | L227-237. `{ tipo?: "info"\|"success"\|"warning"\|"danger"; children }`. **Escolhe o ícone sozinha** pelo tipo (`ALERTA` L208-225: `IconInfoCircle`, `IconCircleCheck`, `IconAlertTriangle`, `IconAlertCircle`). Classe `mb-2 flex items-start gap-2.5 rounded-md border-l-[3px] … text-[12px]` | L131-138. `{ tipo?; icone?: ReactNode; children }`. Ícone só se passado. `div.sni-alert.sni-alert-{tipo}` com `role="alert"` (danger) ou `"status"` | `sni-alert` (36) + `-danger` (16) / `-warning` (12) / `-info` (9) / `-success` (2); `Toast.tsx` reaproveita as classes | **≠** — 38 usos nas telas do Ciclo passam só `tipo`; no esqueleto ficariam sem ícone. E `.sni-alert` no esqueleto não tem `display:flex` nem `border-left` (§6.1) | 29 |
| `Card` | L241-255. `{ children; className? }` → `div.rounded-lg.border.border-sni-gray-200.bg-white.p-5.shadow-sm` | L142-148. `ComponentProps<"section">` → `section.sni-card` (aceita `style`, `id`, etc.) | `sni-card` (126), `sni-card-flat` (28) | **=** funcionalmente (a tag muda de `div` para `section` — pode alterar semântica de landmarks quando usado só como caixa) | 27 |
| `CardCabecalho` | L257-295. `{ titulo: string; subtitulo?; descricao? (sinônimo, L268); icone?; tom?: "blue"\|"success"\|"warning"\|"danger" (L270); acao?: ReactNode (L272, "normalmente um ModalCadastro com gatilho='link'") }`. Caixa do ícone 38px `rounded-md` com fundo por tom (L274-279); `acao` à direita com `ml-auto` (L292) | L150-160. `{ icone?; titulo: ReactNode; subtitulo? }`. `div.sni-card-header > div.sni-card-icon.blue + div.sni-card-title/.sni-card-subtitle` | `sni-card-header` (44), `sni-card-icon` (45), `sni-card-title` (51), `sni-card-subtitle` (38) | **≠** — faltam `descricao`, `tom` e `acao`. O CSS do esqueleto só tem `.sni-card-icon.blue` e `.dark` (`componentes.css:154-155`); `.success/.warning/.danger/.info` existem só na camada v1 do Eventos (`globals.css:266-269`) | 3 |
| `Metrica` | L298-329. `{ rotulo: string; valor: ReactNode; detalhe?: string; tom?; icone?; alerta?: boolean }`. Sem ícone, rótulo em **9px caixa alta** (L321-323, proibido no v2.7); com ícone usa `CardCabecalho`; `alerta` troca borda/fundo para warning (L316); valor em `.t-metric` | L167-174. `{ valor; rotulo }` → `div > div.sni-metric-value + div.t-support` (sem card, sem borda) | `sni-metric-value` (9); `t-metric` (1) | **≠** — faltam `detalhe` (4 usos), `alerta` (3), `tom`, `icone`; e a versão do esqueleto não é um card (as telas do Ciclo põem `Metrica` direto em grid, contando com a borda) | 4 |
| `TituloPagina` | L333-363. `{ titulo: string; descricao?; acao?: ReactNode; voltar?: { href; texto } }`. Link "← voltar" (L346-352), `h1.t-h1`, `acao` à direita (L358) | L183-190. `{ children; descricao? }` → `h1.t-page` + `p.sni-page-subtitle`, `marginBottom: 24` | `sni-page-title` (40), `sni-page-subtitle` (31) à mão | **≠** — nome da prop (`titulo` × `children`), faltam `acao` (11 usos) e `voltar` (18 usos) | 30 |
| `TituloSecao` | L365-367. `{ children }` → `div.section-title` (11px caixa alta com régua, `globals.css:60-66`) | L192-194. `{ children }` → `h2.t-section` (Platypi 18px caixa alta) | `sni-section-eyebrow` (6) | **=** | 8 |
| `Tabela` | L371-391. `{ cabecalho: string[]; children }`. Renderiza `thead` sozinha (th `text-[10px] uppercase tracking-[.07em]`, L380) e `tbody` | L209-217. `{ children }` → `div.sni-card-flat > div[overflowX] > table.sni-table` — **quem chama monta `thead`/`tbody`** | `sni-table` (22) dentro de `sni-card-flat` | **≠** — 15 usos de `cabecalho={[…]}` nas telas; sem `thead` automático nenhuma tabela do Ciclo renderiza cabeçalho | 13 |
| `Linha` | L393-395. `{ children }` → `tr.transition-colors.hover:bg-sni-gray-50` | — (hover já vem de `.sni-table tbody tr:hover td`, `componentes.css:238`) | — | **AUSENTE** | 13 |
| `Celula` | L397-415. `{ children; forte?: boolean; className? }` → `td` com `font-semibold text-sni-gray-900` quando `forte` | L220-226. `ComponentProps<"td">` + `dado?: boolean` (liga `.num`) + `alinhar?: "left"\|"right"\|"center"` | — | **≠** — falta `forte` (11 usos) | 13 |
| `Vazio` | L419-426. `{ children; icone? }` → caixa tracejada `rounded-lg border-dashed`, `p.text-[13px]` | L196-205. `{ icone?; titulo: ReactNode (obrigatório); children?; acao? }` → `div.empty > h4 + p` (Platypi + itálico, `tokens.css:341-353`) | `empty` (1) | **≠** — `titulo` obrigatório; as 30 ocorrências no Ciclo passam só `children` (+ `icone` em 22) | 22 |
| `Num` | — | L163-165. `{ children; className? }` → `span.num` (Plex Mono tabular) | `num` (24) | novo no v2.7 | — |
| `Entidade` | — | L177-179 → `span.entidade` com "SEICHO-NO-IE DO BRASIL" | `entidade` (4) | novo | — |
| `Modal` | `Modal.tsx:22-93`. `{ aberto: boolean; aoFechar: () => void; titulo: string; descricao?; largura?: "sm"\|"md"\|"lg"; children }`. `<dialog>` nativo (L63), `showModal()`/`close()` por efeito (L39-44), trava rolagem (L47-54), larguras 420/640/880 (L56-60) | — | `Modal.tsx:19-79` (default export). `{ open; onClose; title; subtitle?; children; maxWidth?: number (640); footer?: ReactNode }`. `div.dimlayer[role=dialog]` + `div.sni-modal` | **AUSENTE** no esqueleto (só o CSS `.sni-modal*`, `componentes.css:431-464`) | 2 (`NovaRegra.tsx`, `DefinirSenha.tsx`) |
| `ModalCorpo` | `Modal.tsx:96-98` → `div.max-h-[60vh].overflow-y-auto.px-6.py-5` | — | (`sni-modal-body`) | **AUSENTE** | 2 |
| `ModalAcoes` | `Modal.tsx:101-107` → rodapé `flex justify-end gap-3 border-t bg-sni-gray-50` | — | (`sni-modal-foot`, via prop `footer`) | **AUSENTE** | 2 |
| `ModalCadastro` | `Modal.tsx:115-197`. `{ rotulo: ReactNode; titulo: string; descricao?; acao: (fd: FormData) => Promise<void>\|void; children; icone?; rotuloConfirmar?: string ("Salvar"); variante?; tamanho?; largura?; gatilho?: "botao"\|"link" }`. Gatilho abre (L147-160), `<form action>` com `useTransition` fecha só depois da action (L169-177), rodapé Cancelar/Salvar (L181-192) | — | — (as telas do Eventos montam `sni-dimlayer` + card inline, ex. `admin/locais/page.tsx:218`) | **AUSENTE** — é o primitivo mais estrutural do Ciclo: 32 usos em 16 arquivos; `gatilho="link"` em 8-9; `largura` sm/md/lg; `rotuloConfirmar`, `variante`, `tamanho` 1 uso cada | 16 |
| `Toast` | — | — | `Toast.tsx:28-76`. `{ message; type: "success"\|"error"\|"info"\|"warning"; onClose; duration? (4000) }`; fixo topo-direita, reaproveita `.sni-alert-*`; importado por **27 telas** | AUSENTE nos dois | — |
| `AppShell` | (`src/app/admin/Sidebar.tsx`, ver §5) | `AppShell.tsx` + `Painel.tsx` | `AppShell.tsx` (cliente, `useSession`) | ver §5 | — |
| `SniTopBar` | — | — | `SniTopBar.tsx:13-67`: faixa `#02509d` (cor fora dos tokens, L29) das páginas públicas, busca logo em `/api/branding` (L17-25), texto "Evento da SEICHO-NO-IE DO BRASIL" (L63) | AUSENTE — decidir se páginas públicas de eventos (`/e`, `/comprar`) mantêm a faixa | — |
| `Navbar` | — | — | `Navbar.tsx:24-167`: navegação legada horizontal com paleta Tailwind padrão (`bg-blue-900`, L32) remapeada por `@theme` (`globals.css:82-104`). Não é usada pelo painel v2.7 | descartar | — |

### 1.2 Matriz tela × primitivo (Ciclo)

Extraída dos `import { … } from "@/components/ui"` e `"@/components/Modal"` de
cada arquivo (45 arquivos importam; script em Node sobre `src/**/*.tsx`).
Marcados com **★** os primitivos que o esqueleto não tem ou tem com assinatura
incompatível (`Etiqueta`, `Linha`, `ModalCadastro`, `Modal*`, `Tabela`
com `cabecalho`, `Celula forte`, `Campo hint`, `TituloPagina titulo/acao/voltar`,
`Vazio` sem título, `Badge tamanho/dark`, `Botao secondary`, `Alerta` sem ícone,
`Metrica detalhe/alerta`, `CardCabecalho tom/acao`).

| Arquivo (`src/app/…`) | Primitivos importados |
|---|---|
| `admin/apostilas/[id]/page.tsx` | Alerta★, Badge, Campo★, Card, Celula★, Input, Linha★, ModalCadastro★, Tabela★, Textarea, TituloPagina★ |
| `admin/certificados/page.tsx` | Alerta★, Badge, Botao, Card, TituloPagina★, Vazio★ |
| `admin/chamada/[id]/Chamada.tsx` | Botao |
| `admin/chamada/[id]/page.tsx` | Card, TituloPagina★, Vazio★ |
| `admin/chamada/page.tsx` | Badge, Card, TituloPagina★, Vazio★ |
| `admin/ciclos/[id]/page.tsx` | Alerta★, Badge, Campo★, Card, Celula★, Etiqueta★, Input, Linha★, ModalCadastro★, Select, Tabela★, Textarea, TituloPagina★, Vazio★ |
| `admin/ciclos/page.tsx` | Alerta★, Badge, Campo★, Celula★, Input, Linha★, ModalCadastro★, Tabela★, Textarea, TituloPagina★, Vazio★ |
| `admin/configuracoes/page.tsx` | Alerta★, Badge, Campo★, Card, CardCabecalho★, Celula★, Input, Linha★, ModalCadastro★, Select, Tabela★, Textarea, TituloPagina★, TituloSecao, Vazio★ |
| `admin/descontos/NovaRegra.tsx` | Botao, Campo★, Input, Modal★, ModalAcoes★, ModalCorpo★, Select |
| `admin/descontos/concedidos/page.tsx` | Alerta★, Card, Celula★, Linha★, Metrica★, Tabela★, TituloPagina★, Vazio★ |
| `admin/descontos/page.tsx` | Alerta★, Badge, Celula★, Etiqueta★, Linha★, Tabela★, TituloPagina★, Vazio★ |
| `admin/dispensas/page.tsx` | Alerta★, Campo★, Celula★, Linha★, ModalCadastro★, Tabela★, Textarea, TituloPagina★, Vazio★ |
| `admin/edicoes/[id]/page.tsx` | Alerta★, Badge, Campo★, Card, Input, ModalCadastro★, Select, TituloPagina★, Vazio★ |
| `admin/grades/[id]/page.tsx` | Alerta★, Badge, Campo★, Card, Input, ModalCadastro★, Select, TituloPagina★ |
| `admin/importacao/ImportadorCliente.tsx` | Alerta★, Badge, Botao, Card, Celula★, Linha★, Metrica★, Tabela★, TituloSecao |
| `admin/importacao/page.tsx` | TituloPagina★ |
| `admin/layout.tsx` | BotaoLink★ (`variante="secondary"`), Card |
| `admin/locais/CamposLocal.tsx` | Campo★, Input, Textarea |
| `admin/locais/page.tsx` | Alerta★, Celula★, Linha★, ModalCadastro★, Tabela★, TituloPagina★, Vazio★ |
| `admin/localidades/[id]/landing/page.tsx` | Alerta★, Badge, Botao, Campo★, Card, Input, Textarea, TituloPagina★, TituloSecao |
| `admin/localidades/[id]/page.tsx` | Alerta★, Badge, BotaoLink, Campo★, Card, Celula★, Input, Linha★, ModalCadastro★, Select, Tabela★, TituloPagina★, TituloSecao, Vazio★ |
| `admin/localidades/page.tsx` | Alerta★, Badge, Campo★, Celula★, Etiqueta★, Input, Linha★, ModalCadastro★, Tabela★, TituloPagina★, Vazio★ |
| `admin/minha-localidade/page.tsx` | Badge, Card, TituloPagina★, Vazio★ |
| `admin/papeis/ProvisionarAcesso.tsx` | Alerta★, Botao |
| `admin/papeis/page.tsx` | Alerta★, Badge, Campo★, Card, ModalCadastro★, Select, TituloPagina★, TituloSecao, Vazio★ |
| `admin/pessoas/CamposPessoa.tsx` | Campo★, Input, Select |
| `admin/pessoas/[id]/DefinirSenha.tsx` | Alerta★, Botao, Campo★, Input, Modal★, ModalAcoes★, ModalCorpo★ |
| `admin/pessoas/[id]/page.tsx` | Alerta★, Badge, Campo★, Card, Input, ModalCadastro★, Select, TituloPagina★, TituloSecao |
| `admin/pessoas/page.tsx` | Alerta★, Badge, Botao, Card, Celula★, Input, Linha★, ModalCadastro★, Tabela★, TituloPagina★, Vazio★ |
| `admin/provas/[id]/page.tsx` | Alerta★, Badge, Campo★, Card, Input, ModalCadastro★, Select, Textarea, TituloPagina★, Vazio★ |
| `admin/provas/page.tsx` | Alerta★, Badge, Botao, Campo★, Card, CardCabecalho★, Input, ModalCadastro★, Select, TituloPagina★, TituloSecao, Vazio★ |
| `admin/regionais/page.tsx` | Alerta★, Campo★, Celula★, Etiqueta★, Input, Linha★, ModalCadastro★, Tabela★, TituloPagina★, Vazio★ |
| `aulas/[id]/page.tsx` | BotaoLink, Card, TituloPagina★ |
| `aulas/page.tsx` | Badge, Card, TituloPagina★, Vazio★ |
| `certificado/[codigo]/page.tsx` | BotaoLink, Card |
| `l/[slug]/matricula/MatriculaForm.tsx` | Alerta★, Campo★, Input, Select |
| `login/page.tsx` | Alerta★, Campo★, Input |
| `meu-curso/page.tsx` | Alerta★, Badge, BotaoLink, Card, CardCabecalho★, Metrica★, TituloPagina★, Vazio★ |
| `page.tsx` | BotaoLink |
| `painel/page.tsx` | Badge★ (`tom="dark"`, `tamanho="lg"`), Card, TituloSecao |
| `politicas/FormExclusao.tsx` | Alerta★, Campo★, Input, Textarea |
| `provas/[id]/resultado/[tid]/page.tsx` | Alerta★, BotaoLink, Card, Metrica★, TituloPagina★ |
| `provas/[id]/tentativa/[tid]/page.tsx` | Botao, Card, TituloPagina★ |
| `provas/page.tsx` | Alerta★, Badge, Botao, Card, TituloPagina★, Vazio★ |
| `src/components/Modal.tsx` | Botao |

Frequência por primitivo (nº de arquivos): TituloPagina 30 · Alerta 29 · Card 27 ·
Badge 23 · Campo 22 · Vazio 22 · Input 21 · ModalCadastro 16 · Celula 13 · Linha 13 ·
Tabela 13 · Botao 12 · Select 12 · Textarea 9 · TituloSecao 8 · BotaoLink 7 ·
Etiqueta 4 · Metrica 4 · CardCabecalho 3 · Modal 2 · ModalAcoes 2 · ModalCorpo 2.

Uso de props nas telas (contagem de ocorrências, grep sobre `src/app`):
`Badge tamanho="sm"` 23, `tamanho="lg"` 1, `tom="blue"` 8, `"success"` 3,
`"gray"` 3, `"warning"` 2, `ponto` 5 · `Botao/BotaoLink variante="secondary"` 11,
`"ghost"` 1, `tamanho="md"` 7, `"sm"` 4, `"lg"` 2 · `TituloPagina titulo=` 37,
`descricao=` 30, `voltar=` 18, `acao=` 11 · `Metrica rotulo/valor` 14, `detalhe` 4,
`alerta` 3 · `Vazio icone` 22 de 30 · `Tabela cabecalho` 15 de 15 · `Celula forte` 11 ·
`Campo hint=` 28, `obrigatorio` 50, `erro=` 0 · `Alerta tipo=` 38 (nunca passa ícone) ·
`ModalCadastro gatilho="link"` 8, `largura="sm"` 3, `"md"` 2, `"lg"` 1,
`variante="secondary"` 1, `tamanho="sm"` 1, `rotuloConfirmar` 1.
Padrão de retorno de Server Action: `?erro=` aparece 77 vezes e `?ok=` 5 vezes em
`src/app` — as páginas leem `searchParams` (23 arquivos) e mostram `<Alerta>`.

---

## 2. Tokens

### 2.1 Variáveis de cor, raio, sombra, fonte e tipografia

Ciclo: tokens vivem em `tailwind.config.ts` (nomes de utilitário), não em CSS
custom properties — só `--font-figtree` é variável (`src/app/layout.tsx:7-12`).
Esqueleto e Eventos: `tokens.css` (idênticos exceto escopo, ver §4).

| Conceito | (a) Ciclo — `tailwind.config.ts` | (b) Esqueleto — `src/design/tokens.css` (claro → escuro) | Observação para a migração |
|---|---|---|---|
| Azul de interface | `sni.blue.50…900` L13-24 (`#EEF3FC`, `#D0DFFA`, `#A3BFF4`, `#6B94EC`, `#3A6FE0`, `#1C4CC7`, `#163BA3`, `#0F2B7A`, `#091D57`, `#050F30`); comentário "500 primária", "800 sidebar" | `--sni-blue-50…900` L29-32, **mesmos hex**. Escuro: `50/100/200` viram tinta translúcida `rgba(58,111,224,.16/.26/.40)`, `700/800` viram `#A9C2F2/#C5D6F7` (L162-166) | Valores iguais; muda o **papel**: azul de ação é `--accent` (L55, = blue-600; escuro `#3A6FE0` L150), não `bg-sni-blue-600` direto (`design-system.md:174-176`) |
| Azul institucional | não existe (sidebar usa `bg-sni-blue-800`, `Sidebar.tsx:104`) | `--navy-900/800/700/600` L22-25 (`#0D1A4E`, `#101E58`, `#132460`, `#1B2E6E`); `.navy` L297-301 | Sidebar do Ciclo (`#091D57`) → gradiente `--navy-800→600` (`componentes.css:274`) |
| Cinzas | `sni.gray.50…900` L25-36; `sni.black #0A0A0F` L37 | `--sni-gray-50…900` L35-38, mesmos hex; **sem `black`**. Escuro: `50→--ink-700`, `100→--ink-600`, `200→rgba(255,255,255,.10)`, `300→.18` (L156-159); grafite `--ink-900…600` L145-148 | Texto nunca em `--sni-gray-*`: usar `--txt-1…4` (L104-107; escuro L189-192). `text-sni-gray-500` (41 usos) e `-400` (34 usos) são exatamente o "cinza no 400" que o v2.7 proíbe (`design-system.md:91-92`) |
| Semânticas | `success #16A34A`, `success-bg #DCFCE7`, `success-fg #15803D`; `warning #D97706 / -bg #FEF3C7 / -fg #B45309`; `danger #DC2626 / -bg #FEE2E2 / -fg #B91C1C`; `info #0EA5E9 / -bg #E0F2FE / -fg #0369A1` (L38-49) | `--sni-success #15803D` / `-bg #DCFCE7`; `--sni-warning #B45309`; `--sni-danger #B91C1C`; `--sni-info #0369A1` (L41-44) = os `-fg` do Ciclo. Fundo sólido de botão: `--sni-*-solid` (L49-52, não mudam no escuro). Escuro: texto clareia (`#8EDCA8`, `#E8B75C`, `#EE9A9A`, `#8ECDF2`) e fundo vira tinta (L169-172) | Mapa: `text-sni-*-fg` → `var(--sni-*)`; `bg-sni-*-bg` → `var(--sni-*-bg)`; `bg-sni-success` (botão) → `--sni-success-solid`; `text-sni-success` (ícone, 5 usos) → `--sni-success`. O `#16A34A`/`#DC2626`/`#D97706`/`#0EA5E9` do Ciclo **deixam de existir** |
| Fundo de página | `sni.page #F2F5FB` L50 | `--sni-page-bg #F4F6FB` + `--bg` com dois radiais (L116-120); escuro `--ink-900` | `bg-sni-page` (4 usos) → `.sni-app-shell` já pinta |
| Superfície/linha | `bg-white`, `border-sni-gray-200/100` | `--surface #FFF` (escuro `--ink-800`), `--line`, `--line-soft` (L108-110; escuro L193-195); aliases `--sni-surface`, `--sni-border` L112-113 | `bg-white` (12), `border-sni-gray-200` (14), `border-sni-gray-100` (8) → `--surface`, `--line`, `--line-soft` |
| Raios | `borderRadius.sm 6px, md 10px, lg 16px, xl 24px` L56-61 | `--r-pill 999px, --r-field 12px, --r-tile 14px, --r-card 18px, --r-panel 24px` L64-68; aliases `--radius-sm→field, md→tile, lg→card, xl→panel` L71-74 | `rounded-sm`(8)→`--r-field`; `rounded-md`(28)→`--r-field` (campo) ou `--r-tile` (caixa de ícone); `rounded-lg`(14)→`--r-card`; `rounded-xl`(4)→`--r-panel`; `rounded-full`(8)→`--r-pill`; `rounded-[14px]`(5)→`--r-tile`; `rounded-[12px]`(1)→`--r-field` |
| Sombras | `shadow-sm/md/lg` tingidas de `rgba(28,76,199,…)` L62-66; `shadow-focus 0 0 0 3px rgba(58,111,224,.12)` L66 | `--sh-1/2/3` tingidas de `rgba(13,26,78,…)` L94-96; aliases `--shadow-sm/md/lg` L99-101; foco `0 0 0 3px rgba(58,111,224,.28)` (`componentes.css:116`); `--dim` L97 | `shadow-sm`(2), `shadow-md`(1), `shadow-lg`(1), `group-hover:shadow-md`(3) → `--sh-1/2/3` |
| Vidro / reflexo | não existe | `--lg-frost, --lg-sat, --lg-surface, --lg-hover, --lg-tint, --lg-edge, --lg-line, --lg-spec, --lg-spec-dark` L77-85; `--btn-spec`, `--btn-sheen` L88-91 | novo; `backdrop-blur-sm` do Ciclo (4 usos, hero) some |
| Fontes | só `fontFamily.sans = var(--font-figtree)` L53-55; Figtree 300–800 (`layout.tsx:9`) | `--font` (Figtree), `--font-serif` (Platypi), `--font-num` (IBM Plex Mono) L59-61; carregadas em `src/app/layout.tsx:7-25` | `font-mono` (5 usos: `pessoas/page.tsx`, `DefinirSenha.tsx`, `ProvisionarAcesso.tsx`, `ImportadorCliente.tsx`) → `.num`/`<Num>` |
| Tipografia (classes) | `globals.css:34-57`: `.t-display` 36/800, `.t-h1` 24/700 `-.02em`, `.t-h2` 18/700, `.t-h3` 15/600, `.t-body` 14/400, `.t-small` 12/400, `.t-caption` 11/700 caixa alta `.1em`, `.t-metric` 28/800; `.section-title` 11px caixa alta com régua L60-66 | `tokens.css:257-273`: `.t-page` Platypi 26/700, `.t-section` Platypi 18/700 caixa alta, `.t-screen` 17/700, `.t-card` 16/700, `.t-body` 15, `.t-support` 13.5, `.t-metric` Plex 31/600; `.serif/.serif-cap/.serif-i` L236-244; `.pull` L356-360 | `t-h1`(1)→`t-page`; `t-h2`(2)→`.sni-modal-title`/`t-card`; `t-h3`(5)→`t-card`; `t-display`(1)→`t-page`; `section-title`(2)→`t-section`. **`t-caption`/`t-small` não têm equivalente** (abaixo de 13px) |
| Escala mínima | 9–15px (65× `text-[11px]`, 45× `text-[12px]`, 9× `text-[10px]`, 3× `text-[9px]`) | corpo 15px, apoio 13.5px, **mínimo 13px** (`design-system.md:89-90`) | 122 ocorrências abaixo de 13px nas telas do Ciclo precisam subir (lista por arquivo em §2.3) |
| Layout do shell | `spacing.sidebar 220px, topbar 64px` L68-71; header admin `h-[52px]` (`admin/layout.tsx:68`) | `--sidebar-w 236px`, `--topbar-h 62px` L128-129; `--tap 44px` L125 | — |
| Movimento | `duration-150`, `transition-all` | `--dur .18s`, `--ease cubic-bezier(.32,.72,0,1)` L123-124; `prefers-reduced-motion` L376-380 | — |
| Tema escuro | inexistente | `:root[data-theme="dark"]` L142-201 | ver §4 |

### 2.2 Classes utilitárias Tailwind 3 usadas pelas telas do Ciclo

Censo por script sobre `className="…"`, `className={\`…\`}` e `className={"…"}`
em 53 arquivos (`src/app/**/*.tsx` + `src/components` menos `ui.tsx`/`Modal.tsx`):
**328 classes distintas**. Nenhum prefixo `dark:`. Abaixo, as que carregam token
(cor, raio, sombra, tipografia) e precisam de equivalente no esqueleto. As de
layout puro (`flex` 176, `items-center` 101, `flex-col` 56, `gap-4` 53, `grid` 30,
`mx-auto` 29, `sm:grid-cols-2` 20, `min-w-0` 17, `justify-between` 13, `max-w-3xl` 10,
`min-h-screen` 9, `sm:col-span-2` 6, `lg:grid-cols-3` 3…) continuam valendo em
Tailwind 4 e são permitidas pelo `globals.css:5-6` do esqueleto ("Tailwind entra só
como utilitário de layout").

| Classe (ocorrências · arquivos) | Equivalente no esqueleto v2.7 |
|---|---|
| `text-sni-gray-500` (41 · 25) | `color: var(--txt-3)` — nunca gray-500 como texto (`design-system.md:91-92`) |
| `text-sni-gray-400` (34 · 18) | `--txt-4` (só em dica/placeholder) ou `--txt-3` |
| `text-sni-gray-600` (25 · 17) | `--txt-3` |
| `text-sni-gray-900` (18 · 16) | `--txt-1` |
| `text-sni-blue-600` (18 · 17), `hover:text-sni-blue-600` (9) | `var(--accent)` / `.sni-btn-link` |
| `border-sni-gray-200` (14 · 13), `border-sni-gray-100` (8), `divide-sni-gray-100` (1), `border-sni-gray-300` (1) | `--line`, `--line-soft` |
| `text-sni-success-fg` (12 · 6), `text-sni-success` (5), `bg-sni-success-bg` (6), `border-sni-success` (4), `text-sni-success-fg/80` (2), `/85` (1) | `--sni-success`, `--sni-success-bg` (variantes com opacidade somem) |
| `text-sni-gray-800` (11 · 9), `text-sni-gray-700` (7) | `--txt-2` |
| `bg-sni-blue-50` (10 · 7), `hover:bg-sni-blue-50` (3), `group-hover:bg-sni-blue-50` (2), `has-[:checked]:bg-sni-blue-50` (1) | `--sni-blue-50` (vira tinta translúcida no escuro) |
| `text-sni-blue-500` (9 · 5), `text-sni-blue-700` (6), `text-sni-blue-400` (3), `group-hover:text-sni-blue-500` (1) | `--accent` / `--sni-blue-700` (texto claro no escuro) |
| `from-sni-blue-900 via-sni-blue-700 to-sni-blue-500` + `bg-gradient-to-br` (6 · 6: `page.tsx`, `login/page.tsx`, `painel/page.tsx`, `politicas/page.tsx`, `l/[slug]/page.tsx`, `l/[slug]/matricula/page.tsx`) | `.navy` / `.sni-auth-bg` (`linear-gradient(140deg, var(--navy-800), var(--navy-600))`, `componentes.css:26-28`) |
| `text-sni-warning-fg` (4), `text-sni-warning` (4), `bg-sni-warning-bg` (4), `border-sni-warning` (1), `text-sni-warning-fg/90` (1) | `--sni-warning`, `--sni-warning-bg` |
| `bg-sni-page` (4) | `.sni-app-shell` (fundo `--bg`) |
| `bg-sni-blue-600` (4), `hover:bg-sni-blue-700` (4), `file:bg-sni-blue-600` (1), `hover:file:bg-sni-blue-700` (1), `accent-sni-blue-600` (3) | `--accent`, `--accent-hover`; `accent-color: var(--accent)` |
| `group-hover:border-sni-blue-200` (3), `hover:border-sni-blue-300` (1), `border-sni-blue-500` (1), `has-[:checked]:border-sni-blue-500` (1) | `.sni-clickable:hover` (`componentes.css:151`) / `--sni-blue-300` |
| `bg-sni-gray-50` (3), `bg-sni-gray-100` (1), `bg-sni-gray-200` (2) | `--sni-gray-50/100/200` (remapeados no escuro, `tokens.css:156-159`) |
| `bg-sni-danger-bg` (2), `text-sni-danger` (2), `text-sni-danger-fg` (2), `hover:text-sni-danger` (3), `border-sni-danger/20` (1) | `--sni-danger`, `--sni-danger-bg` |
| `bg-sni-blue-800` (1, sidebar), `bg-sni-blue-400` (1, avatar) | `.sni-sidebar` (navy), `.sni-sidebar-avatar` |
| `text-sni-gray-300` (1), `hover:text-sni-gray-600` (1) | `--txt-4` |
| `focus:border-sni-blue-400` (1) | `.sni-input:focus` |
| `text-[11px]` (65), `text-[12px]` (45), `text-[10px]` (9), `text-[9px]` (3) | **sem equivalente** — subir para 13px/13.5px/15px (`t-support`, `t-body`) |
| `text-[13px]` (45), `text-[14px]` (17), `text-[15px]` (7), `text-[16px]` (1) | `t-support` (13.5), `t-body` (15) |
| `text-[18px]` (2), `text-[22px]` (2), `text-[24px]` (1), `text-[26px]` (1), `text-[36px]` (2) | `t-card`, `t-page`, `.serif` |
| `uppercase` (25) + `tracking-[.12em]` (11), `[.06em]` (7), `[.07em]` (4), `[.1em]` (1), `tracking-wide` (1) | **proibido** em rótulo pequeno (`design-system.md:78-81`); só `t-section`/`.serif-cap` (Platypi ≥16px, tracking 0) |
| `font-semibold` (57), `font-bold` (36), `font-extrabold` (4), `font-medium` (2), `font-normal` (2) | continuam (Figtree 500/600/700); `font-extrabold` (800) só título de página se pedido |
| `tracking-[-.02em]` (4), `[-.01em]` (2), `[-.03em]` (2) | embutidos em `t-page` (`-.01em`) e `t-metric` (`-.02em`) |
| `rounded-md` (28), `rounded-lg` (14), `rounded-full` (8), `rounded-sm` (8), `rounded-[14px]` (5), `rounded-xl` (4), `rounded-[12px]` (1) | `--r-field / --r-card / --r-pill / --r-field / --r-tile / --r-panel / --r-field` |
| `shadow-sm` (2), `shadow-md` (1), `shadow-lg` (1), `group-hover:shadow-md` (3) | `--sh-1 / --sh-2 / --sh-3` |
| `font-mono` (5) | `.num` |
| `border-[1.5px]` (7) | `.sni-input` já tem 1.5px; caixa de ícone do hero some |
| `leading-relaxed` (12), `leading-tight` (1) | `line-height 1.6` do body / `t-*` |
| `backdrop-blur-sm` (4), `bg-white/[.15]` (6), `border-white/30` (5), `text-white/65` (5), `text-white/90` (3), `border-white/[.08]`, `border-white/20`, `text-white/40` | vidro sobre navy do hero; no v2.7 hero público vira `.navy` + `.sni-sidebar-logo-icon`-like |
| `transition-colors` (22), `transition-all` (6), `duration-150` (4), `transition-shadow` (3) | `--dur`/`--ease` já nas classes `.sni-*` |
| `disabled:opacity-60` (3) | `.sni-btn:disabled` (falta no esqueleto, §6.1) |
| `hover:underline` (12) | `.sni-btn-link:hover` |
| `sr-only` (2), `truncate` (3), `whitespace-pre-line` (3), `pointer-events-none` (3) | utilitários de layout — continuam |

Onde estão os tamanhos abaixo de 13px (arquivo:ocorrências) — `text-[9px]`:
`admin/Sidebar.tsx`:3, `ui.tsx`:1 · `text-[10px]`: `admin/configuracoes/page.tsx`:4,
`admin/grades/[id]/page.tsx`:2, `ui.tsx`:2, `politicas/page.tsx`, `admin/pessoas/[id]/page.tsx`,
`admin/edicoes/[id]/page.tsx`:1 cada · `text-[11px]`: `admin/pessoas/[id]/page.tsx`:9,
`ui.tsx`:6, `admin/grades/[id]/page.tsx`:5, `admin/pessoas/page.tsx`:4,
`admin/localidades/[id]/page.tsx`:4, `admin/importacao/ImportadorCliente.tsx`:4,
`admin/edicoes/[id]/page.tsx`:4, `admin/ciclos/[id]/page.tsx`:4, `l/[slug]/page.tsx`:3,
`admin/localidades/page.tsx`:3, `admin/dispensas/page.tsx`:3, `certificado/[codigo]/page.tsx`:2 ·
`uppercase`: `admin/pessoas/[id]/page.tsx`:5, `admin/edicoes/[id]/page.tsx`:3,
`ui.tsx`:2, `l/[slug]/page.tsx`:2, `admin/grades/[id]/page.tsx`:2, `admin/configuracoes/page.tsx`:2,
`admin/ciclos/[id]/page.tsx`:2, `admin/Sidebar.tsx`:2, e 1 em `politicas`, `painel`, `page`, `certificado`.

### 2.3 Tailwind 3 → Tailwind 4 no esqueleto

- O esqueleto usa `@import "tailwindcss"` (`src/app/globals.css:1`) **sem bloco
  `@theme`**. Logo, `bg-sni-blue-50`, `text-sni-gray-500`, `border-sni-gray-200`,
  `shadow-focus` etc. **não existem** como utilitário lá; qualquer tela do Ciclo
  colada como está perde toda a cor. O Eventos resolveu isso para a camada pública
  com `@theme { --color-blue-50: … }` (`globals.css:82-104`), remapeando a paleta
  padrão do Tailwind — o esqueleto não tem nada equivalente, de propósito
  (`globals.css:5-6`: cor vem dos tokens). Consequência: as telas do Ciclo precisam
  ser reescritas com primitivos/estilo inline por variável, não só "convertidas".
- `tailwind.config.ts` (Ciclo) some inteiro: Tailwind 4 configura por CSS. O
  `content` (L8) também não é mais necessário.
- Renomeações do Tailwind 4 que atingem classes do Ciclo, se alguém tentar
  reaproveitar utilitários: `shadow-sm`→`shadow-xs`, `shadow`→`shadow-sm`,
  `rounded-sm`→`rounded-xs`, `rounded`→`rounded-sm`, `outline-none`→`outline-hidden`,
  `ring`→`ring-3`; `hover:` só se aplica em dispositivo com hover. Nada disso deve
  importar se raio/sombra vierem dos tokens, como manda `globals.css:5-6`.
- Variantes usadas pelo Ciclo que continuam válidas no 4: `sm:`/`lg:` (33 usos),
  `group-hover:` (7), `has-[:checked]:` (2), `file:` (2), `disabled:` (3),
  `accent-*` (3), `placeholder:` (em `INPUT_BASE`).

---

## 3. Modal e ModalCadastro

### 3.1 A regra

`AGENTS.md` ("Interface", penúltimo item) e `docs/design-system.md:204-205`:
"Cadastro (criar e editar) acontece em modal. Esc e clique fora não fecham, só o
X e os botões do rodapé. A pessoa não pode perder o que digitou." O Ciclo
formaliza o mesmo em `Modal.tsx:8-20`: fundo desfocado, clique fora **não**
fecha, Esc **não** fecha.

### 3.2 Como cada fonte implementa

| Aspecto | (a) Ciclo `src/components/Modal.tsx` | (b) Esqueleto | (c) Eventos `src/components/Modal.tsx` |
|---|---|---|---|
| Base | `<dialog>` nativo (L63); `showModal()`/`close()` num `useEffect` (L39-44) — top layer, foco preso e `::backdrop` de graça (L18-20) | **Não existe componente.** Só CSS: `.sni-modal`, `-head`, `-title`, `-sub`, `-body`, `-foot` (`componentes.css:431-464`) e `.dimlayer` (`tokens.css:304`), mais `.sni-dimlayer > .sni-card` (L469-480) para "modais escritos direto na página" | `div.dimlayer[role=dialog][aria-modal]` fixo com `zIndex:1000` (L36-49) + `div.sni-modal` (L51-54). Renderiza `null` quando fechado (L33) |
| Esc | **bloqueado**: `onCancel={(e) => e.preventDefault()}` no `<dialog>` (L66-68) | — | **fecha**: listener `keydown` → `onClose()` (L23) — **viola a regra** |
| Clique fora | **não fecha** (`<dialog>` não fecha por padrão; nada escuta o backdrop) | — | **fecha**: `onClick={onClose}` no dimlayer (L40), filho faz `stopPropagation` (L52) — **viola a regra** |
| Fundo desfocado | `backdrop:bg-sni-blue-900/40 backdrop:backdrop-blur-[6px]` (L69) | `.dimlayer { background: var(--dim) }` — **sem blur** (`tokens.css:304`; `--dim` L97 = `rgba(13,26,78,.48)`, escuro `.68`) | `.dimlayer` sem blur; o design system chama de "camada de escurecimento" (`referencia-visual.html:370`, seção "Confirmação" L799-815) |
| Rolagem do fundo | `document.body.style.overflow = "hidden"` (L47-54) | — | idem (L25-30) |
| Fechamento legítimo | botão X (L79-87, `aria-label="Fechar"`) e botões de `ModalAcoes` (L100-107) | — | botão X `sni-btn sni-btn-ghost sni-btn-icon sni-btn-sm` (L56-68) e `footer` (L75) |
| Largura | `largura: "sm"\|"md"\|"lg"` → 420/640/880px (L56-60) | `.sni-modal { width:100% }`; largura máxima fica por conta do chamador | `maxWidth?: number` (padrão 640, L20) |
| Título | `h2.t-h2` 18px Figtree (L74) | `.sni-modal-title` Platypi 21px (`componentes.css:446-455`) | `h2.sni-modal-title` (L58) |
| Corpo | `ModalCorpo`: `max-h-[60vh] overflow-y-auto` (L97) | `.sni-modal-body { flex:1; overflow-y:auto }` (L457) | `.sni-modal-body` (L71) com `maxHeight: calc(100vh - 12vh)` no painel (L53) |
| Rodapé | `ModalAcoes` (L101-107) | `.sni-modal-foot` (L458-464) | prop `footer` (L75); exemplo em `relatorios/page.tsx:704-713` |
| Cadastro pronto | `ModalCadastro` (L115-197): gatilho botão ou link, `<form action>` + `useTransition`, fecha só após a action resolver (L169-177), Cancelar/Salvar, "Salvando…" (L190) | — | — (cada tela reinventa: `sni-dimlayer` inline em `admin/locais/page.tsx:218`, `orientadores:158`, `usuarios:194`, `cielo-contas:245`, `promotores:183`, `eventos/[id]:1275`; só 2 telas importam o `Modal`: `admin/eventos/[id]/page.tsx` e `relatorios/page.tsx`) |
| Acessibilidade | `aria-labelledby="modal-titulo"` (L65) — id fixo, colide se houver dois modais montados | — | `aria-labelledby="modal-title"` (L39) — mesmo problema |

### 3.3 O que levar

- **A implementação correta da regra é a do Ciclo** (`<dialog>` + `onCancel`
  bloqueado). O Modal do Eventos precisa ser descartado nesse ponto (Esc e clique
  fora fecham). O visual (`.sni-modal*` v2.7) fica.
- O blur do fundo do Ciclo (`backdrop-blur-[6px]`) não está no v2.7 (`--dim` é só
  escurecimento). Se a regra "fundo desfocado" (`Modal.tsx:15`) prevalecer, o
  `::backdrop` do `<dialog>` leva `background: var(--dim); backdrop-filter:
  blur(6px) saturate(var(--lg-sat))`, respeitando `prefers-reduced-transparency`
  (`tokens.css:365-371`). Decisão de design, não técnica — registrar.
- `ModalCadastro` é o que 16 telas usam; deve existir no esqueleto com a mesma
  assinatura (§6.2). Observação: `Modal.tsx:169-177` do Ciclo chama a action e
  fecha; se a action redireciona com `?erro=`, o `redirect()` lança e o
  `setAberto(false)` não roda — o modal fecha porque a página recarrega. Manter
  esse contrato (padrão `?erro=` em 77 pontos) até haver `useActionState`.

---

## 4. Tema claro/escuro

| | (a) Ciclo | (b) Esqueleto | (c) Eventos |
|---|---|---|---|
| Existe? | **Não.** Sem `dark:`, sem `data-theme`, sem `prefers-color-scheme` (grep vazio em `src` e `tailwind.config.ts`) | Tokens sim (`tokens.css:142-201`); escolha **não** | Completo |
| Atributo | — | `data-theme="dark"` no `<html>` (`tokens.css:142`; `tema.ts:17` grava `dataset.theme`) | `data-sni-theme="dark"` no `<html>` (`tema.ts:40` grava `dataset.sniTheme`) **ou** `data-theme="dark"` no próprio `.sni-painel` (`tokens.css:138`: `&:is([data-theme="dark"], :root[data-sni-theme="dark"] *)`) |
| Escopo dos tokens | — | `:root` — o app inteiro é painel (`design-system.md:11-13`) | `.sni-painel` (`tokens.css:25`) — páginas públicas ficam na camada v1 e não escurecem (`DESIGN-SYSTEM.md:10-14`) |
| Script antes da 1ª pintura | — | `SCRIPT_TEMA_INICIAL` (`tema.ts:14-17`), injetado em `layout.tsx:38` | `SCRIPT_TEMA_INICIAL` (`tema.ts:37-40`), injetado em `layout.tsx:59` |
| Persistência local | — | `localStorage["sni-tema"]` (`tema.ts:7`, `aplicarTema` L27-35) | `localStorage["sni-tema"]` (L19; `lerTemaLocal` L55-62, `gravarTemaLocal` L64-71 dispara evento `sni-tema` para sincronizar abas) |
| Persistência na conta | — | **não** (comentário em `tema.ts:3`: "entra com Minha conta") | `UserPreferencia` chave `"tema"` (`tema.ts:18`; tabela criada em `api/migrate/route.ts:1224`; `GET/PUT/DELETE /api/preferencias`, `route.ts:29-…`); hook `usePreferenciaUsuario` (`preferencia-usuario.ts:21-96`, debounce 600 ms) |
| Hook | — | **não** | `useTema()` (`tema.ts:82-117`): `useSyncExternalStore` no local + servidor manda quando difere (L91-96), segue `matchMedia` no modo "sistema" (L99-105) |
| Tela | — | `/minha-conta` **não existe** | `/minha-conta` (`page.tsx:79-92`): `.seg` com `OPCOES_TEMA` (`tema.ts:22-26`: Claro/Escuro/Automático com ícones `ti-sun`/`ti-moon`/`ti-device-desktop`) |
| Sincronização por sessão | — | — | `SincronizaTema` montado uma vez pelo `AppShell` (`AppShell.tsx:12-19, 145`) |
| Valores dos tokens | — | idênticos ao Eventos | idem |
| Nomes de tipo | — | `Tema = "claro"\|"escuro"\|"sistema"`, `TEMA_PADRAO="claro"`, `ehTema`, `resolver`, `aplicarTema` (`tema.ts:4-35`) | mesmos nomes + `CHAVE_PREFERENCIA`, `OPCOES_TEMA`, `useTema` |

**Como unificar** (o esqueleto já escolheu `:root` + `data-theme`; é só completar):

1. Manter `data-theme` no `<html>` e o seletor `:root[data-theme="dark"]`
   (`tokens.css:142`). Apagar do mundo o `data-sni-theme`/`.sni-painel` do
   Eventos: na plataforma, páginas públicas também recebem o v2.7
   (`design-system.md:11-13`), então o duplo seletor deixa de ter razão.
2. Portar `useTema` e `OPCOES_TEMA` de `sni-ciclo/src/lib/tema.ts:22-26, 55-117`
   para `src/lib/tema.ts` do esqueleto, trocando `dataset.sniTheme` por
   `dataset.theme` e os ícones-string (`ti-sun`) por componentes Tabler
   (`IconSun`, `IconMoon`, `IconDeviceDesktop`), já que o esqueleto usa
   `@tabler/icons-react` e não a webfont (`sni-ciclo/src/app/layout.tsx:60-63`).
3. Persistência na conta: em vez de `UserPreferencia` + `/api/preferencias`
   (MySQL/NextAuth), gravar em `public.pessoas` (coluna `preferencias jsonb` ou
   tabela `pessoa_preferencias(pessoa_id, chave, valor)`) via Server Action com
   `exigirCapacidade` dispensada (é dado próprio) e RLS `pessoa_id = app.current_pessoa_id()`.
   O hook `usePreferenciaUsuario` (`preferencia-usuario.ts`) pode virar um
   Server Action + `useOptimistic`; a semântica "servidor manda quando difere"
   (`tema.ts:91-96`) deve ser preservada.
4. Criar `/minha-conta` (painel comum, não de módulo) com o `.seg` de tema
   (`minha-conta/page.tsx:79-92`) — o link já existe em `AppShell.tsx:74`.
5. O `.seg`/`.sw` de `tokens.css:309-336` viram primitivos `Segmentado` e `Chave`
   (§6.2) para a tela não escrever `aria-pressed` à mão.
6. Ciclo: nada a portar — mas todas as telas dele usam cor por classe Tailwind
   (§2.2), então **só escurecem depois de reescritas com tokens**. Enquanto isso,
   o tema escuro deixaria as telas do Ciclo brancas sobre fundo grafite.

---

## 5. AppShell / Sidebar

### 5.1 Como o esqueleto monta o menu

1. `src/modulos/registro.ts:11-16` declara `ItemMenu { href, rotulo, icone: string, capacidade: Capacidade }` e L18-22 `Modulo { chave, rotulo, itens }`. `MODULOS` (L24-54) tem 3 blocos: `ciclo` (1 item, `/ciclo` por `ciclo.matricula.ver`), `eventos` (8 itens: `/eventos`, `/eventos/pessoas`, `/eventos/venda`, `/eventos/checkin`, `/eventos/relatorios`, `/eventos/estornos`, `/eventos/admin`, `/eventos/configuracoes`) e `comum` ("Administração": `/admin/pessoas` por `pessoa.gerir`, `/admin/auditoria` por `auditoria.ver`).
2. `src/componentes/Painel.tsx:15-17` (servidor) filtra `MODULOS` por `eu.pode(i.capacidade)` e descarta módulo sem item; L18-22 monta o rótulo de papel: "Sede" se houver papel `sede`, senão os `tipo` com `_` trocado por espaço (`"presidente uap"`, `"eventos admin"`), senão "Sem papel".
3. `src/componentes/AppShell.tsx` (cliente): recebe `modulos`, `pessoa {nome, papel}`, `titulo`, `acoes`; resolve o ícone por nome em `@tabler/icons-react` (L38-41, via `import * as Icones` L6); `ativo()` (L33-36) marca o href mais específico (mesma lógica de `sni-ciclo/AppShell.tsx:110-117`); menu móvel com `aberto` (L30, fecha no clique do item L63); bloco do usuário linka `/minha-conta` (L74) e `Sair` é `<form action="/login/sair" method="post">` (L81-86, rota em `src/app/login/sair/route.ts`); topbar com `titulo` e `acoes` (L91-97).
4. `src/app/painel/page.tsx:12, 27-39`: hub com atalhos = todos os itens visíveis.

### 5.2 Comparação com o Ciclo e com o Eventos

| Aspecto | (a) Ciclo `src/app/admin/Sidebar.tsx` + `admin/layout.tsx` | (b) Esqueleto | (c) Eventos `src/components/AppShell.tsx` |
|---|---|---|---|
| Fonte do menu | constante `SECOES` dentro do componente (L36-73): Estrutura (regionais, localidades, locais), Minha localidade (minha-localidade, dispensas, chamada, certificados), Programa (ciclos, provas), Pessoas (pessoas), Configuração (descontos, descontos/concedidos, importacao, configuracoes) — **14 itens**, cada um com `cap` | `MODULOS` em `registro.ts` (11 itens); o bloco `ciclo` tem **1** item genérico | 3 listas constantes (`principalItems` L29-34, `analiseItems` L36-40, `configItems` L42-55 — 19 itens) com `perm` por tela |
| Filtro | por `capacidades: string[]` (Set, L92-96) | por `eu.pode()` no servidor (`Painel.tsx:15`) | por `temPermissao(permCtx, perm)` no cliente (L131-138); `isAdmin` libera tudo (`permissions.ts:45-50`) |
| Ícone | componente importado (`Icone: typeof IconMap2`, L26) — tree-shaking | nome em string resolvido com `import * as Icones` (`AppShell.tsx:6, 38-41`; também `painel/page.tsx:2`) — **embarca o pacote inteiro de ícones no cliente** | webfont Tabler via CDN jsDelivr (`layout.tsx:60-63`), `<i class="ti ti-…">` |
| Item ativo | prefixo simples + `aria-current="page"` (L132-136) | mais específico vence (L33-36); **sem `aria-current`** | mais específico vence (L110-117); sem `aria-current` |
| Marca | "Ciclo da Prosperidade" / "SNI Brasil" (L115-119, 13px e 9px caixa alta) | "SNI Conecta" / "Seicho-No-Ie" (L53-54) | "SNI Conecta" / "Seicho-No-Ie" (L156-157) |
| Bloco do usuário | avatar 28px com iniciais (L156-158), nome 11px, `papel` = `eu.rotuloPapel` (L160-161), logout `form action={aoSair}` (L163-171) | avatar `.sni-sidebar-avatar` com `iniciais()` (L75, L106-109), nome, `papel` calculado em `Painel.tsx:18-22`, link Minha conta, logout por POST | avatar, nome, `userRole` = "Administrador"/"Acesso restrito" (L139), link Minha conta (L184-194), `signOut` NextAuth (L195-202) |
| Topbar | header fixo "Administração" + e-mail (`admin/layout.tsx:68-73`) | `sni-topbar` com `titulo` obrigatório e `acoes` (L91-97) | `sni-topbar` com `title ?? pageTitleFor(pathname)` (L63-90, mapa de 25 prefixos) e `topbarRight` |
| Faixa de diagnóstico | `<AvisoDiagnostico />` só para quem pode `configuracao.gerir` (`admin/layout.tsx:75-77`; componente em `admin/AvisoDiagnostico.tsx:17-36`) | — | — |
| Service worker | `<RegistrarSW />` no layout admin (L59; `components/RegistrarSW.tsx`) para a chamada offline | — | — |
| Guarda de área | `admin/layout.tsx:26-33`: entra quem tem alguma capacidade administrativa; senão card "Área restrita" (L36-54) com `eu.rotuloPapel` | `Painel.tsx:13`: só exige sessão; sem "área restrita" — quem não tem item vê o hub vazio (`painel/page.tsx:24-27`) | — |
| Área do aluno | **sem shell**: `/meu-curso`, `/aulas`, `/provas` são `main.mx-auto.max-w-3xl` soltos (`aulas/page.tsx:37`, `meu-curso/page.tsx:75`); `/painel` tem hero próprio com gradiente (`painel/page.tsx:92-109`) e badges de papel (L113-125) | tudo dentro de `<Painel>` | tudo dentro de `AppShell` |
| Móvel | não trata | backdrop + `.open` (L45-47) — **mas o CSS de `position:fixed; left:-260px`, `.open{left:0}` e `.sni-mobile-toggle{display:none}` não foi copiado** (§6.1) | CSS completo em `globals.css:564-592` |
| Badge numérico no item | — | CSS `.sni-sidebar-badge` existe (`componentes.css:320-328`), nada o alimenta | `badgeKey?: "campanhas"\|"inbox"` declarado em `NavItem` (L26) e **nunca usado** |

### 5.3 O que falta no esqueleto

1. **`/minha-conta`** — rota, tela (dados da pessoa, papéis por localidade, tema) e
   gravação da preferência (§4). O link em `AppShell.tsx:74` aponta para o vazio.
2. **Contexto de localidade.** O `PessoaSessao` do Ciclo (`src/lib/auth.ts:17-34`)
   carrega `localidades: string[]` (L25, via `localidadesDosPapeis`,
   `permissoes.ts:209-214`), `isSede` (L28), `capacidades: Set` (L27),
   `papelPrincipal` (L22) e `rotuloPapel` (L23, via `NOME_PAPEL`, `permissoes.ts:157-164`).
   O esqueleto (`src/lib/auth.ts:15-24`) só tem `papeis`, `pode`, `podeEm`. O
   "seletor de contexto" do Ciclo é o redirecionamento de
   `admin/minha-localidade/page.tsx:26-28` (Sede → lista; 1 localidade → direto;
   várias → escolher) e o cabeçalho hero de `painel/page.tsx:113-125` ("Seus papéis").
   Na plataforma, com módulos nacionais (eventos) e locais (ciclo) convivendo, o
   shell precisa de: (a) `localidades` e `isSede` no `PessoaSessao`; (b) um
   **seletor de localidade ativa** na topbar (menu `.sni-menu`, `componentes.css:408-428`),
   guardado em cookie/preferência, que os módulos escopados leem para filtrar
   e que `podeEm(cap, localidadeAtiva)` valida; (c) módulos nacionais ignoram.
3. **Badge de papel.** `Painel.tsx:18-22` mostra `tipo.replace(/_/g," ")`
   ("presidente uap", "eventos operador"). Falta um `NOME_PAPEL: Record<TipoPapel,string>`
   como o do Ciclo (`permissoes.ts:157-164`: "Sede Central", "Coordenador do Ciclo",
   "Orientador Responsável", "Presidente de UAP", "Professor", "Aluno") estendido com
   os dois papéis de eventos, `papelPrincipal()` (`permissoes.ts:220-234`, ordem de
   abrangência) e, na ficha/minha-conta, um `<Badge tom="dark"|"blue" ponto>` por papel
   com a localidade (`painel/page.tsx:119-123`).
4. **`aria-current="page"`** no item ativo (o Ciclo tem, `Sidebar.tsx:136`).
5. **Itens do módulo `ciclo`**: o bloco de `registro.ts:25-31` precisa receber os 14
   itens de `Sidebar.tsx:36-73` com capacidades renomeadas (`ciclo.*`), mais os três
   do aluno (`/ciclo/meu-curso`, `/ciclo/aulas`, `/ciclo/provas`, hoje sem shell).
6. **Ícone por nome × bundle**: trocar `icone: string` + `import * as Icones` por
   `icone: ComponentType` no registro (como o Ciclo) ou por um mapa explícito de
   ícones permitidos, para não embarcar ~5 mil ícones no cliente.
7. **Faixa de diagnóstico** e **registro de service worker** — hooks de layout que
   o Ciclo tem e o esqueleto não: prever slots no `Painel` (`faixa?: ReactNode`) e
   um `ClienteDoModulo` opcional por módulo no registro.
8. **CSS estrutural do shell** — ver §6.1: sem `.sni-content`, `.sni-page-wide`,
   `display:flex` em `.sni-app-shell`/`.sni-sidebar`/`.sni-topbar`, e sem as regras
   móveis, o `AppShell` do esqueleto não fica de pé.
9. **Título automático**: o `Painel` exige `titulo` (`Painel.tsx:11`); o Eventos deriva
   do pathname (`AppShell.tsx:63-90`). Com registro declarativo, o título pode vir
   do `ItemMenu.rotulo` ativo, deixando `titulo` opcional.

---

## 6. Plano: `ui.tsx` do esqueleto como superconjunto do `ui.tsx` do Ciclo

### 6.1 Primeiro o CSS — restaurar a camada estrutural

Diagnóstico: `src/design/componentes.css` foi extraído da **segunda metade** de
`sni-ciclo/src/app/globals.css` (L667-1156, o bloco `.sni-painel { … }` que só
*sobrescreve* valores do v2.7). A **primeira metade** (L122-665, camada v1 no
`:root`) é quem define `display`, `position`, `width`, `cursor`, `border-collapse`,
o `@keyframes sniSpin`, as regras móveis e várias classes inteiras — e não foi
copiada. Diff mecânico (script: propriedades por seletor em `globals.css:122-666`
ausentes do mesmo seletor em `componentes.css`+`tokens.css`): **76 seletores**.

| Seletor | No esqueleto | Propriedades a restaurar (origem `sni-ciclo/src/app/globals.css`) |
|---|---|---|
| `.sni-app-shell` | parcial | `display:flex` (L389-393) |
| `.sni-content` | **AUSENTE** | `flex:1; display:flex; flex-direction:column; min-width:0` (L520-525) |
| `.sni-page` | parcial | `flex:1; min-width:0` (L560) |
| `.sni-page-wide` | **AUSENTE** | `max-width:1400px; margin:0 auto` (L561) |
| `.sni-sidebar` | parcial | `flex-shrink:0; display:flex; flex-direction:column; position:sticky; top:0; height:100vh; z-index:30` (L395-406); móvel `position:fixed; left:-260px; transition:left .25s` (L566-571) |
| `.sni-sidebar.open` | **AUSENTE** | `left:0` (L572) |
| `.sni-sidebar-backdrop` | parcial (só `background`) | `position:fixed; inset:0; z-index:25` (L585-590) |
| `.sni-mobile-toggle` | parcial | `display:none` fora do móvel (L564); `display:flex; align-items; justify-content; cursor` dentro (L573-584) |
| `.sni-sidebar-logo` | parcial | `display:flex; align-items:center` (L407-413) |
| `.sni-sidebar-logo-icon` | parcial | `display:flex; align-items; justify-content; color:#fff; flex-shrink:0` (L414-424) |
| `.sni-sidebar-scroll` | parcial | `flex:1; overflow-y:auto; display:flex; flex-direction:column` (L429-436) |
| `.sni-sidebar-item` | parcial | `display:flex; align-items:center; cursor:pointer; text-decoration:none` (L447-459) |
| `.sni-sidebar-item i` | parcial | `flex-shrink:0` (L460) |
| `.sni-sidebar-badge` | parcial | `margin-left:auto` (L465-473) |
| `.sni-sidebar-bottom` | parcial | `margin-top:auto` (L475-479) |
| `.sni-sidebar-user` | parcial | `display:flex; align-items:center; transition` (L480-487) |
| `.sni-sidebar-user-info` | **AUSENTE** | `flex:1; min-width:0` (L501) |
| `.sni-sidebar-user-name` | parcial | `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` (L502) |
| `.sni-sidebar-avatar` | parcial | `border-radius:50%; display:flex; align-items; justify-content; font-weight:700; color:#fff; flex-shrink:0` (L489-500) |
| `.sni-sidebar-logout` | parcial | `background:transparent; cursor:pointer; display:flex; align-items; justify-content` (L504-516) |
| `.sni-topbar` | parcial | `display:flex; align-items:center; position:sticky; top:0; z-index:20` (L526-537) |
| `.sni-topbar-right` | parcial | `margin-left:auto; display:flex; align-items:center` (L544) |
| `.sni-icon-btn` | parcial | `display:flex; align-items; justify-content; cursor` (L545-557) |
| `.sni-btn` | parcial | `display:inline-flex; align-items:center; justify-content:center; cursor:pointer; white-space:nowrap; text-decoration:none` (L123-137) |
| `.sni-btn:disabled` | **AUSENTE** | `opacity:.55; cursor:not-allowed` (L138) |
| `.sni-btn-primary/-danger/-success/-dark` (+ `:hover`) | parcial | camada v1 usa `background`; v2.7 usa `background-color` + `background-image` — **ok, não restaurar** (L147-163) |
| `.sni-btn-secondary`, `.sni-btn-ghost` | parcial | v1 tinha `border: 1.5px solid …` (L150-153); v2.7 usa `border-color` sobre `border:1px solid transparent` do `.sni-btn` — ok |
| `.sni-btn-icon.sni-btn-sm/-xs` | parcial | `border-radius` (L169-170) — v2.7 já é pílula; ok |
| `.sni-input`, `.sni-select`, `.sni-textarea` | parcial | `width:100%; outline:none` (L173-186) |
| `.sni-input:disabled` etc. | parcial | `cursor:not-allowed` (L209-211) |
| `.sni-label` | parcial | `display:block` (L213-219) |
| `.sni-hint` | parcial | `display:block` (L220) |
| `.sni-error` | parcial | `display:flex; align-items:center` (L221) |
| `.sni-input-icon-wrap` | **AUSENTE** | `position:relative; display:flex; align-items:center` (L223) |
| `.sni-input-icon-wrap .sni-input-icon` | parcial | `position:absolute; pointer-events:none` (L225-231) |
| `.sni-card-header` | parcial | `display:flex; align-items:center` (L249-254) |
| `.sni-card-icon` | parcial | `display:flex; align-items; justify-content; flex-shrink:0` (L255-264) |
| `.sni-card-icon.success/.warning/.danger/.info` | **AUSENTE** | `background`/`color` semânticos (L266-269) — usar `--sni-*-bg` / `--sni-*` |
| `.sni-clickable` / `:hover` / `:active` | parcial / AUSENTE | `cursor:pointer`; `transform:translateY(-1px)` no hover; `translateY(0)` no active (L246-248) |
| `.sni-metric-trend` | parcial | `display:inline-flex; align-items:center` (L282-289) |
| `.sni-trend-up` / `.sni-trend-down` | **AUSENTE** (só a versão escura) | `color: var(--sni-success)` / `var(--sni-danger)` (L290-291) |
| `.sni-badge` | parcial | `display:inline-flex; align-items:center; white-space:nowrap` (L294-304) |
| `.sni-badge-dot` | parcial | `border-radius:50%; flex-shrink:0; display:inline-block` (L317-322) |
| `.sni-alert` | parcial | `display:flex; align-items:flex-start; border-left:3px solid` (L325-335) |
| `.sni-alert i` | parcial | `flex-shrink:0` (L336) |
| `.sni-table` | parcial | `width:100%; border-collapse:collapse` (L343) |
| `.sni-table th` | parcial | `text-align:left` (L344-354) |
| `.sni-table td` | parcial | `vertical-align:middle` (L355-360) |
| `.sni-table tbody tr:last-child td` | **AUSENTE** | `border-bottom:none` (L361) |
| `.sni-section-eyebrow` | parcial | `display:flex; align-items:center` (L366-375) |
| `.sni-spinner` | parcial | `display:inline-block; width:16px; height:16px; border-radius:50%; animation: sniSpin .7s linear infinite` + `@keyframes sniSpin` (L595-604) |
| `.sni-spinner-lg` | **AUSENTE** | `width:32px; height:32px; border-width:3px` (L603) |
| `.sni-divider` | parcial | `height:1px; margin:.25rem 0` (L607) |
| `.sni-divider-vert` | parcial | `width:1px; height:20px; margin:0 4px` (L608) |
| `.sni-auth-bg` | parcial | `min-height:100vh` (L615-621) |
| `.sni-selos`, `.sni-selo`, `.evt-capa*` | AUSENTE | específicos do checkout de eventos (L627-665) — ficam para o módulo `eventos` |

Além disso, criar o que nenhum dos dois define:

- `.sni-field { display:flex; flex-direction:column }` (usada por `Campo`, `ui.tsx:96`).
- `.sni-form-grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)) }` — substitui os `grid gap-4 sm:grid-cols-2` (20 usos) dos formulários do Ciclo.
- `.sni-modal-backdrop` / `dialog.sni-modal::backdrop { background: var(--dim); [backdrop-filter …] }` e `dialog.sni-modal { padding:0; border:0; max-width: … }` para o `<dialog>` (§3.3).
- `.sni-toast { position:fixed; top:20px; right:20px; z-index:100; max-width:420px; box-shadow:var(--sh-3); background:var(--surface) }` (hoje inline em `Toast.tsx:38-48`).
- `.sni-hero` (cabeçalho público em `.navy`, substitui o gradiente `from-sni-blue-900…` de 6 telas do Ciclo).
- `.sni-sidebar-item[aria-current="page"]` como sinônimo de `.active`.
- `.sni-metric` (card de métrica com borda; variante `.alerta` com `--sni-warning-bg`) para a `Metrica` do Ciclo.
- `.sni-table-wrap { overflow-x:auto }` (hoje inline em `Tabela`, `ui.tsx:212`).

### 6.2 Primitivos a adicionar ou ampliar em `src/componentes/ui.tsx`

Assinaturas propostas (TypeScript). Regra: toda prop do Ciclo continua aceita;
nome novo do esqueleto convive como sinônimo; nada obrigatório que o Ciclo não passava.

```ts
// Botões
type Variante = "primary" | "secondary" | "glass" | "ghost" | "success" | "danger" | "dark";
//  secondary === glass (ambos → .sni-btn-secondary); dark → .sni-btn-dark (CSS já existe)
type Tamanho = "xl" | "lg" | "md" | "sm" | "xs";   // xl/xs → .sni-btn-xl/-xs (CSS já existe)
export function Botao(p: ComponentProps<"button"> & { variante?: Variante; tamanho?: Tamanho; icone?: ReactNode; carregando?: boolean }): JSX.Element;
export function BotaoLink(p: ComponentProps<typeof Link> & { variante?: Variante; tamanho?: Tamanho; icone?: ReactNode }): JSX.Element;
export function BotaoIcone(p: ComponentProps<"button"> & { rotulo: string; variante?: Variante; tamanho?: Tamanho }): JSX.Element;

// Campos — mantém o <label> envolvente do Ciclo (associação implícita) e aceita htmlFor
export function Campo(p: { label: string; children: ReactNode; hint?: string; dica?: string; erro?: string; obrigatorio?: boolean; htmlFor?: string }): JSX.Element;
//  implementação: se htmlFor ausente, renderiza <label class="sni-field"> envolvendo; senão <div class="sni-field"><label htmlFor>…
export function Input(p: ComponentProps<"input"> & { erro?: boolean }): JSX.Element;      // erro → classe .error
export function Select(p: ComponentProps<"select"> & { erro?: boolean }): JSX.Element;
export function Textarea(p: ComponentProps<"textarea"> & { erro?: boolean }): JSX.Element;
export function CampoComIcone(p: { icone: ReactNode; children: ReactNode }): JSX.Element; // .sni-input-icon-wrap (login usa)

// Marcadores
type Tom = "blue" | "success" | "warning" | "danger" | "info" | "gray" | "dark" | "outline";
export function Badge(p: { tom?: Tom; ponto?: boolean; tamanho?: "sm" | "md" | "lg"; children: ReactNode }): JSX.Element;
//  sm → .sni-badge-sm (13px, mínimo), lg → .sni-badge-lg; outline → .sni-badge-outline-blue; dark → .sni-badge-dark
export function Etiqueta(p: { ativo: boolean; rotulos?: [string, string] }): JSX.Element;   // "Ativo"/"Inativo"
export function Alerta(p: { tipo?: "info" | "success" | "warning" | "danger"; icone?: ReactNode | false; titulo?: ReactNode; children: ReactNode }): JSX.Element;
//  ícone padrão por tipo (IconInfoCircle / IconCircleCheck / IconAlertTriangle / IconAlertCircle, como Modal.tsx do Ciclo L208-225); `false` esconde

// Cards e dados
export function Card(p: ComponentProps<"div"> & { como?: "div" | "section" }): JSX.Element;
export function CardCabecalho(p: { titulo: ReactNode; subtitulo?: ReactNode; descricao?: ReactNode; icone?: ReactNode; tom?: "blue" | "success" | "warning" | "danger" | "info" | "dark"; acao?: ReactNode }): JSX.Element;
export function Metrica(p: { rotulo: ReactNode; valor: ReactNode; detalhe?: ReactNode; tom?: "blue" | "success" | "warning" | "danger"; icone?: ReactNode; alerta?: boolean; semCard?: boolean }): JSX.Element;
//  padrão com card (.sni-metric) como no Ciclo; semCard reproduz a versão atual do esqueleto
export function Num(p: { children: ReactNode; className?: string }): JSX.Element;
export function Entidade(): JSX.Element;
export function Spinner(p: { tamanho?: "sm" | "md" | "lg" }): JSX.Element;               // .sni-spinner(-lg)
export function Divisor(p: { vertical?: boolean }): JSX.Element;                          // .sni-divider(-vert)
export function Avatar(p: { nome: string; tamanho?: number }): JSX.Element;               // .sni-sidebar-avatar + iniciais() (hoje duplicada em AppShell.tsx:106 e Sidebar.tsx:76)

// Títulos e vazio
export function TituloPagina(p: { titulo?: string; children?: ReactNode; descricao?: ReactNode; acao?: ReactNode; voltar?: { href: string; texto: string } }): JSX.Element;
export function TituloSecao(p: { children: ReactNode; icone?: ReactNode; acao?: ReactNode }): JSX.Element;
export function Vazio(p: { titulo?: ReactNode; children?: ReactNode; icone?: ReactNode; acao?: ReactNode }): JSX.Element;
//  sem titulo: children vira o <p> itálico (comportamento do Ciclo, 30 usos)
export function Citacao(p: { children: ReactNode }): JSX.Element;                          // .pull

// Tabela
export function Tabela(p: { cabecalho?: (string | { rotulo: string; alinhar?: "left" | "right" | "center"; largura?: string })[]; children: ReactNode; vazio?: ReactNode }): JSX.Element;
//  com cabecalho monta <thead> e envolve children em <tbody>; sem cabecalho, comportamento atual
export function Linha(p: ComponentProps<"tr"> & { selecionada?: boolean }): JSX.Element;   // tr(.selected)
export function Celula(p: ComponentProps<"td"> & { forte?: boolean; dado?: boolean; alinhar?: "left" | "right" | "center" }): JSX.Element;
//  forte → <strong> (o CSS .sni-table td strong já existe, componentes.css:237)

// Controles do v2.7
export function Segmentado<T extends string>(p: { valor: T; opcoes: { valor: T; rotulo: string; icone?: ReactNode }[]; aoMudar: (v: T) => void; rotulo: string }): JSX.Element; // .seg, aria-pressed
export function Chave(p: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: string }): JSX.Element;   // .sw
export function Menu(p: { gatilho: ReactNode; children: ReactNode }): JSX.Element;         // .sni-menu (vidro), fecha com Esc e clique fora (é menu, não cadastro)
export function MenuItem(p: { icone?: ReactNode; href?: string; onClick?: () => void; children: ReactNode }): JSX.Element;
export function MenuSeparador(): JSX.Element;
```

Em `src/componentes/Modal.tsx` (novo, cliente):

```ts
export function Modal(p: { aberto: boolean; aoFechar: () => void; titulo: string; descricao?: string; largura?: "sm" | "md" | "lg" | number; children: ReactNode }): JSX.Element;
//  <dialog class="sni-modal"> com showModal(); onCancel={preventDefault} (Esc não fecha); sem listener no backdrop (clique fora não fecha);
//  id do título por useId(); larguras 420/640/880 como Modal.tsx:56-60 do Ciclo; trava rolagem do body.
export function ModalCorpo(p: { children: ReactNode }): JSX.Element;      // .sni-modal-body
export function ModalAcoes(p: { children: ReactNode }): JSX.Element;      // .sni-modal-foot
export function ModalCadastro(p: {
  rotulo: ReactNode; titulo: string; descricao?: string;
  acao: (fd: FormData) => Promise<void> | void; children: ReactNode;
  icone?: ReactNode; rotuloConfirmar?: string; variante?: Variante; tamanho?: Tamanho;
  largura?: "sm" | "md" | "lg" | number; gatilho?: "botao" | "link" | "icone";
}): JSX.Element;
//  igual ao Ciclo (Modal.tsx:115-197); "icone" novo para linhas de tabela do Eventos (BotaoIcone lápis)
export function ModalConfirmacao(p: { aberto: boolean; aoFechar: () => void; titulo: string; children: ReactNode; confirmar: string; aoConfirmar: () => Promise<void> | void; perigoso?: boolean }): JSX.Element;
//  a "Confirmação" do design system (referencia-visual.html:799-815): texto com o número exato, botão repete o verbo
```

Em `src/componentes/Toast.tsx` (novo, cliente): `Toast({ mensagem, tipo, aoFechar, duracao? })`
+ `useToast()` com provedor no `Painel`, portando `sni-ciclo/src/components/Toast.tsx:28-76`
com ícones React e a classe `.sni-toast`. Vinte e sete telas do Eventos dependem disso.

Em `src/componentes/AppShell.tsx` / `Painel.tsx`: props `faixa?: ReactNode`
(diagnóstico), `localidadeAtiva?`, `titulo?` (derivado do item ativo quando
omitido), `aria-current`, `NOME_PAPEL`, e `icone: ComponentType` no registro (§5.3).

### 6.3 Roteiro de migração das telas do Ciclo (substituições mecânicas)

| No Ciclo | No esqueleto |
|---|---|
| `import { … } from "@/components/ui"` | `from "@/componentes/ui"`; `Modal*` de `@/componentes/Modal` |
| `<TituloPagina titulo="X" />` | continua (prop `titulo` aceita) |
| `<Tabela cabecalho={[…]}>` + `<Linha>` + `<Celula forte>` | continuam |
| `<Campo label hint>` sem `id` no input | continua (label envolvente) |
| `<Badge tamanho="sm">` | continua (13px em vez de 10px) |
| `<Botao variante="secondary">` | continua (= glass) |
| `<Alerta tipo="…">` sem ícone | continua (ícone automático) |
| `<Vazio icone>texto</Vazio>` | continua (texto vira `<p>`) |
| `<Metrica rotulo valor detalhe alerta>` | continua (com card) |
| `className="text-[11px] text-sni-gray-500"` etc. | `className="t-support"` ou `style={{ color: "var(--txt-3)" }}` — 328 classes distintas, tabela §2.2 |
| `className="bg-gradient-to-br from-sni-blue-900 …"` (hero) | `.sni-hero`/`.navy` |
| `t-h1/t-h2/t-h3/t-caption/section-title` | `t-page / t-card / t-card / (sem equivalente: subir para t-support) / t-section` |
| `font-mono` | `<Num>` |
| textos "Seicho-No-Ie do Brasil" (`login/page.tsx:41`, `layout.tsx:16`, `package.json` description) e "SNI Brasil" (`Sidebar.tsx:119`) | `<Entidade />` — a forma em caixa mista é proibida (`AGENTS.md`, "Interface", último item) |

### 6.4 Riscos que este recorte carrega

1. O `AppShell` do esqueleto **não renderiza corretamente hoje** (CSS estrutural
   ausente, §6.1). É o primeiro item a corrigir, antes de qualquer tela.
2. Tema escuro sem `/minha-conta` e sem `useTema` é meio caminho: o script
   inicial lê `localStorage` que ninguém grava.
3. `import * as Icones` (`AppShell.tsx:6`, `painel/page.tsx:2`) no cliente.
4. Modal do Eventos fecha com Esc e clique fora — contraria `AGENTS.md`; se for
   portado "como está", 27 telas de eventos nascem fora da regra.
5. As 122 ocorrências abaixo de 13px e as 25 de `uppercase` nas telas do Ciclo não
   têm tradução automática: cada uma é uma decisão de hierarquia tipográfica.
6. Sem `@theme`, nenhuma classe `sni-*` do Tailwind existe no esqueleto; "colar e
   ajustar" as telas do Ciclo não funciona, tem de ser reescrita por primitivo.
