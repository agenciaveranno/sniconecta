# SNI Conecta — regras de interface (design system v2.9)

Plataforma da SEICHO-NO-IE DO BRASIL.

## Os dois arquivos, e a diferença entre eles

| Arquivo | O que é | Quem manda nele |
|---|---|---|
| `src/design/tokens.css` | **Cópia fiel** do arquivo publicado pelo design system. Tokens e classes **sem prefixo**: `.btn` `.inp` `.field` `.card` `.side` `.topbar` `.bg` `.sheet` `.modal` `.menu` `.t-page`. | O design system |
| `src/design/componentes.css` | **Só o que é nosso**, sempre com prefixo `sni-`. | Este projeto |

**O prefixo `sni-` passou a significar uma coisa só: isto não vem do design
system.** São três grupos, e nenhum outro:

1. **Esqueleto do aplicativo** — `.sni-app-shell`, `.sni-content`, `.sni-page`.
2. **Componentes que o sistema não tem** — abas, alerta, paginação, busca,
   métrica, o corpo do modal.
3. **Variantes que a operação pediu** — `.sni-btn-xl` (o balcão pede um botão
   maior que o do sistema), `.sni-btn-xs` (a linha de tabela, um menor),
   `.sni-badge-info`, `.sni-btn-dark`.

⚠️ **Antes de escrever regra nova, procurar no `tokens.css`.** Uma classe nossa
que faz o que uma de lá já faz é dívida: na próxima versão do design system, a
de lá muda e a nossa não — e a tela passa a ter duas aparências para a mesma
coisa. Foi exatamente assim que este projeto ficou parado no v2.7 enquanto o
design system ia para o v2.9, e a atualização veio junto com uma correção de
produção que nunca tinha chegado aqui (o `box-sizing`).

⚠️ Sobrescrever uma classe do sistema é permitido, mas **escopado por uma classe
nossa** — `.sni-app-shell .side`, nunca `.side` solto. Escrita solta, a nossa
regra viaja junto com o design system e fica invisível para quem o atualizar.
`tests/design-system.test.ts` reprova quem escrever solto.

## Como atualizar o design system

1. Substituir `src/design/tokens.css` inteiro pelo arquivo novo.
2. **Reaplicar a única adaptação nossa**: as três famílias de fonte vêm do
   `next/font` (`src/app/layout.tsx`), então `--font`, `--font-serif` e
   `--font-num` apontam para `var(--font-figtree)`, `var(--font-platypi)` e
   `var(--font-plex-mono)`. O arquivo publicado escreve `'Figtree'` literal, o
   que pede a fonte ao sistema operacional de quem abre a tela — onde ela não
   estiver instalada, o sistema inteiro cai para o fallback sem avisar.
   O teste reprova quem esquecer.
3. Rodar `npm test`: os guardas conferem versão, fontes, `box-sizing`, a altura
   compartilhada do cabeçalho e o prefixo.
4. Podar de `componentes.css` o que a versão nova passou a cobrir.

## O que a v2.9 mudou aqui

- **`box-sizing: border-box`** entrou no `tokens.css` — era a causa dos campos
  inflados em produção (padding somado por fora da caixa).
- **Campo com `height` fixo**, não `min-height`: `input[type=date]` carrega um
  botão de calendário interno que empurrava a caixa 2px além dos demais, e o
  Safari em iOS ignora padding nesses tipos.
- **Título institucional em CAIXA ALTA, peso 800, entreletra zero.** Vale para
  título de página, de seção, de modal e de estado vazio.
- **Cabeçalho com altura única**: `--header-h` veste o bloco de marca da lateral
  e a barra superior. As duas faixas fecham na mesma linha horizontal.
- **Identidade do usuário no canto superior direito** — avatar e primeiro nome,
  com menu suspenso. **Sair mora dentro do menu**: não existe botão de saída
  permanentemente visível, porque ação de saída não ocupa espaço fixo.
- **A ação primária da tela saiu da barra superior** e vive em `.page-actions`,
  ao lado do título, na área de conteúdo. A barra superior carrega só o título
  da tela e a identidade.
- **Marca**: emblema (`/marca/emblema.svg`) mais "SNI Conecta", sem subtítulo. O
  logotipo completo (`/marca/completo.svg`) fica para relatório e impressão — a
  assinatura vira borrão na altura do cabeçalho.
- **Navegação lateral mais densa**: itens de 44px para 36px.

## Como o design system entra neste projeto

- **O aplicativo inteiro é painel**: tokens no `:root`, sem escopo. Páginas
  públicas (landing de evento, checkout, certificado) usam os mesmos tokens.
- Toda tela monta a interface com os primitivos de `ui.tsx` (`Botao`, `Campo`,
  `Input`, `Badge`, `Card`, `Tabela`, `TituloPagina`, `Recado`, `Vazio`, `Num`,
  `Entidade`…). É neles que a escolha entre classe do sistema e classe nossa
  está feita — a página não escolhe.
- **Tema escuro.** A pessoa escolhe em Minha conta (Claro, Escuro ou
  Automático). A escolha vai para `localStorage` e para a conta; um script no
  `<head>` aplica `data-theme` no `<html>` antes da primeira pintura. Lógica em
  `src/lib/tema.ts`. A barra lateral mantém o azul institucional nos dois temas
  — é o único bloco de cor cheia do tema escuro, e é por isso que funciona.

## Quem usa o sistema

Coordenadores e voluntários de várias idades, muitos em telas pequenas e em
ambientes com luz difícil. Boa parte do público é sênior. **Legibilidade vence
estilo em qualquer empate.** Se uma escolha visual custa clareza, ela está errada
mesmo quando fica bonita.

---

## A regra que governa todas as outras

O sistema tem **duas camadas e uma fronteira**:

| Camada | O que é | Tratamento |
|---|---|---|
| Conteúdo | tabelas, campos, texto, números, cards de dado | **sempre opaco** (`.solid`, `.sni-card`) |
| Funcional | barra superior, menus, popovers, modais, barras flutuantes | vidro (`.lg`, `.sni-topbar`, `.sni-menu`) |

- Nunca aplicar vidro em tabela, formulário ou card de conteúdo.
- Nunca vidro sobre vidro. Um elemento sobre superfície de vidro usa
  preenchimento sólido, não outro material.
- Todo vidro leva `saturate(150%)` junto do blur. Sem isso o fundo lava e vira cinza.

**O que ficou deliberadamente de fora e não deve ser reintroduzido:** refração por
filtro SVG, aberração cromática e vidro transparente sobre foto. Foram avaliados e
recusados — chamam atenção para si e custam legibilidade.

---

## Tipografia — três vozes, três funções

| Fonte | Função | Onde |
|---|---|---|
| **Platypi** (serif) | instituição | título de página, título de seção, título de modal, estado vazio, boas-vindas, citação |
| **Figtree** (sans) | ferramenta | navegação, botões, rótulos, cabeçalho e corpo de tabela, marcadores, dicas, erros, texto corrido |
| **IBM Plex Mono** | dado | métricas, valores de tabela, telefones, percentuais, datas, contadores, IDs |

As três são carregadas pelo `next/font` em `src/app/layout.tsx` e publicadas como
`--font-figtree`, `--font-platypi` e `--font-plex-mono`; o `tokens.css` as expõe
como `--font`, `--font-serif` e `--font-num`.

Regras rígidas:

- Platypi **nunca** em número, rótulo de campo ou dentro de botão.
- Platypi **nunca abaixo de 16px** — as serifas triangulares afinam demais em tela.
- Platypi em peso **700**. O 800 existe, mas só para título de página se pedido.
- Caixa alta é permitida **só na Platypi 700, de 16px para cima, com entreletra normal**
  (`letter-spacing: 0`). Não adicionar tracking.
- Caixa alta continua **proibida** em rótulo pequeno de interface. Foi removida do v1
  justamente por isso.
- Plex Mono **nunca** em texto corrido nem em rótulo. Ela existe para alinhar coluna.
  Pesos 500 e 600 apenas.
- O itálico da Platypi é reservado à voz que fala com a pessoa — estado vazio,
  primeiro acesso, mensagem de conclusão. Ênfase dentro de frase é negrito da Figtree.

### Escala mínima

- Corpo: **15px**. Apoio: 13,5px. **Mínimo absoluto da interface: 13px.**
- Nada abaixo de 13px, em nenhuma circunstância.
- Cinza secundário no **600**, não no 400. Em estilo inline, usar `--txt-1` a
  `--txt-4`, nunca `--sni-gray-*` como cor de texto.

---

## Nomenclatura — atenção redobrada

- **`Seicho-No-Ie`** — movimento e ensinamento. Livre: caixa mista no corpo do texto,
  caixa alta num título, ambas corretas.
- **`SEICHO-NO-IE DO BRASIL`** — sede brasileira e pessoa jurídica.
  **Sempre em caixa alta, sem exceção.**

**A forma em caixa mista com "do Brasil" em minúsculas nunca pode aparecer, em lugar
nenhum, em suporte nenhum.** Sempre que "do Brasil" acompanhar o nome, o conjunto
inteiro vai em caixa alta.

- Escrever a caixa alta **no conteúdo**, não via `text-transform`. Assim a grafia
  sobrevive a copiar e colar, a exportação em PDF e a troca de estilo.
- Usar a classe `.entidade`, que impede a quebra do nome em duas linhas.
  Em coluna estreita, reduzir o corpo antes de deixar quebrar.
- Hifens obrigatórios nas duas formas. Não existe "Seicho No Ie" nem "SEICHO NO IE".
- **"SNI Conecta"** é o nome do produto e segue à parte: iniciais maiúsculas sempre.

---

## Ergonomia e acessibilidade

- **Alvo de toque de 44px** em botões, itens de navegação e campos.
  Espaçamento de 8px entre alvos adjacentes. (`.sni-btn-sm` fica em 38px.)
- Foco de teclado: contorno sólido de 3px com 2px de afastamento.
  Nunca apenas mudança de cor.
- Contraste mínimo de 4,5:1, medido **depois do blur** e contra o pior ponto do fundo.
- Situação nunca comunicada só por cor: todo marcador combina cor, texto e ponto.
- As três preferências do sistema já estão atendidas em `tokens.css`
  (`prefers-reduced-transparency`, `prefers-contrast`, `prefers-reduced-motion`).
  Não desfazer.

---

## Forma

Cápsula em controle, raio moderado em superfície:

| Token | Valor | Uso |
|---|---|---|
| `--r-pill` | 999px | botões, chips, marcadores, avatares, chaves |
| `--r-field` | 12px | inputs, selects, textareas |
| `--r-tile` | 14px | itens de lista, caixas de ícone |
| `--r-card` | 18px | cards, tabelas, painéis internos |
| `--r-panel` | 24px | modais, painéis externos |

Aninhamento: **raio interno = raio externo − padding**.
Painel de 24px com 12px de padding pede card interno de 12px.

### Alinhamento de ícone

O glifo do ícone é centrado na caixa em da fonte de ícones; o texto é centrado na
caixa de linha. Alturas diferentes, centros diferentes. A solução do sistema é dar
ao ícone **caixa quadrada de tamanho fixo com centralização própria**
(classe `.ti`) e apertar o `line-height` do texto ao lado.

**Não corrigir com `margin-top` ou `translateY` de um ou dois pixels** — quebra assim
que alguém muda o tamanho da fonte.

---

## Equilíbrio de linhas

Equivalente ao "balance ragged lines" do InDesign:

- `text-wrap: balance` — títulos, citações, estados vazios, legendas, títulos de card.
  Navegadores só balanceiam blocos de até ~6 linhas.
- `text-wrap: pretty` — parágrafos e textos de apoio. Evita órfã na última linha.
  Ainda sem suporte no Firefox; degrada para quebra normal, sem prejuízo.

Aplicar `balance` em parágrafo longo não tem efeito e ainda cobra o cálculo.

---

## Cor

- **Azul institucional** (`--navy-*`, amostrado do logo) veste a barra lateral e
  superfícies de marca. **Não é o azul de ação.**
- **Azul de ação**: usar sempre `var(--accent)`, nunca `--sni-blue-600` direto.
  O token troca com o tema — clareia para `#3A6FE0` no escuro, onde o 600 perde
  separação do fundo.
- **Um destaque por tela.** Uma ação primária azul; o resto em vidro neutro ou
  contorno. Três botões coloridos numa tela não é hierarquia, é confusão.

### Tema escuro

Grafite neutro (`--ink-900` a `--ink-600`), **não** o azul institucional escurecido.
Um azul saturado ocupando a tela inteira compete com o conteúdo e cansa em jornada
longa. No escuro o azul é acento: barra lateral, ação primária, ícones de apoio.

- Texto principal em `#F2F3F5`, **não branco puro** — branco absoluto sobre grafite
  gera halo e cansa a vista.
- A barra lateral mantém o azul institucional nos dois temas. É o único bloco de cor
  cheia do tema escuro, e é por isso que funciona.

---

## Ao implementar

1. `tokens.css` já é importado pelo `globals.css` antes de qualquer CSS de componente.
2. Usar as variáveis, nunca valores literais. Se um valor não existe como token,
   perguntar antes de inventar.
3. Ao criar componente novo, verificar em qual das duas camadas ele vive.
   Isso decide se leva vidro ou não, e é a primeira pergunta a fazer.
4. Todo número visível ao usuário vai em `.num` ou `--font-num`.
5. Ao escrever qualquer texto de interface, conferir a regra de nomenclatura acima.
6. Tela nova de painel: renderizar dentro de `<Painel>` (`src/componentes/Painel.tsx`),
   que resolve a sessão e filtra os módulos por capacidade.
7. Cadastro (criar e editar) acontece em modal: Esc e clique fora não fecham,
   só o X e os botões do rodapé. A pessoa não pode perder o que digitou.
