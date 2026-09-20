# SNI Conecta — regras do repositório

Plataforma única da SEICHO-NO-IE DO BRASIL. Um aplicativo Next, um banco
Supabase, módulos por pasta. Este arquivo vale para as duas sessões que
trabalham aqui (módulo `ciclo` e módulo `eventos`). Decisões de arquitetura
estão em `docs/decisoes/`; quem discordar de uma, abre uma nova decisão, não
contorna no código.

## Este NÃO é o Next.js que você conhece

Next 16, React 19, Tailwind 4. APIs e convenções mudaram em relação ao que
está no treinamento. Antes de escrever código, leia o guia correspondente em
`node_modules/next/dist/docs/`. `params` e `cookies()` são assíncronos; o
middleware chama-se `src/proxy.ts` e exporta `proxy`.

## Mapa do repositório

```
src/app/                 App Router. Rotas públicas, login, painel, módulos.
src/modulos/<modulo>/    Código de domínio de cada módulo (ciclo, eventos).
src/modulos/registro.ts  Registro declarativo de módulos: itens de menu +
                         capacidade que os libera. A barra lateral lê daqui.
src/componentes/ui.tsx   TODOS os primitivos visuais. Não estilize na página.
src/design/tokens.css    CÓPIA FIEL do design system (v2.9). Classes SEM prefixo.
src/design/componentes.css  Só o que é NOSSO. Sempre com prefixo `sni-`.
src/lib/auth.ts          pessoaAtual(), exigirCapacidade().
src/lib/permissoes.ts    MATRIZ de capacidades (dado, não código).
src/lib/supabase/        clientes: servidor (RLS), navegador, serviço.
src/lib/db.ts            Postgres direto pelo pooler (módulo eventos).
src/lib/dominio/         regras puras e testadas: cpf, dinheiro…
supabase/migrations/     SQL puro, prefixo de data/hora, aplicado por CI.
supabase/rascunhos/      esquemas em discussão, ainda não aplicados.
scripts/                 migração MySQL → Postgres e apoio.
tests/                   vitest.
docs/                    decisões (ADR), design system, publicação, integração.
```

## Identidade e autorização

- `pessoas` é a espinha: CPF identifica quem tem, **passaporte identifica quem
  não tem** (decisão 0013 — exatamente um dos dois), e `id` (uuid) referencia.
  Toda tabela de módulo que fala de uma pessoa aponta para `pessoas.id`.
- Operador tem conta no Supabase Auth (`pessoas.auth_user_id`). **Quem só tem
  histórico não tem conta**: nunca criar conta em massa.
- Comprador do checkout público não tem conta: autentica por magic link
  próprio do módulo `eventos`.
- Duas camadas, ambas obrigatórias: a **matriz** (`permissoes.ts`) decide
  quais ações a pessoa dispara; o **RLS** decide quais linhas alcança.
- Capacidade é nomeada por **ação com prefixo do módulo**: `eventos.vender`,
  `ciclo.matricula.decidir`. Nunca por tela.
- Server Action e rota de API começam com `exigirCapacidade(...)` na
  primeira linha. O guard do layout não protege endpoint.
- Rota chamada por máquina (cron, webhook) fica fora do proxy de sessão e
  recusa por conta própria com 401/503.

## Banco de dados

- Migrações em `supabase/migrations/AAAAMMDDHHMMSS_nome.sql`, aplicadas por
  GitHub Actions no merge para `main`. **Ninguém roda SQL à mão em produção.**
- Cada migração abre com um cabeçalho explicando a decisão, não o comando.
- Tabela nova nasce com `enable row level security`, policies, GRANT
  explícito e asserção no harness de RLS. O projeto Supabase roda com
  "expose new tables" desligado: sem GRANT, a policy nem é avaliada.
- **Nunca um `alter default privileges` geral.** Ele concede a toda tabela
  futura, inclusive à que ninguém revisou. GRANT é tabela a tabela, na mesma
  migração que a cria, e o harness reprova quem sobrar sem declaração.
- Onde a tabela mora segue o **modo de acesso** do módulo (decisão 0007):
  quem fala pelo cliente Supabase fica em `public` com prefixo (`ciclo_*`),
  porque o PostgREST só embute relação dentro do schema ativo e todo módulo
  precisa embutir `pessoas`; quem fala Postgres direto ganha schema próprio
  não exposto (`eventos.*`). O comum fica em `public` sem prefixo:
  `pessoas`, `unidades`, `organizacoes`, `papeis`, `auditoria`,
  `notificacoes`, `configuracoes`.
- O módulo `eventos` acessa o Postgres **direto pelo pooler** (`src/lib/db.ts`)
  com RLS ligada e sem GRANT para `authenticated`: o navegador nunca fala
  com essas tabelas, e a autorização acontece por capacidade no servidor.
  O módulo `ciclo` usa o cliente Supabase com RLS por localidade. Os dois
  modelos convivem; ver `docs/decisoes/0003-acesso-ao-banco.md`.
- Toda leitura do cliente Supabase cuja ausência de resultado influencia uma
  decisão passa por `exigir()` (`src/lib/supabase/consulta.ts`). Consulta que
  falhou não é consulta vazia.
- Dinheiro em **centavos, inteiro**. CPF **só dígitos**, com dígito verificador
  validado na entrada. Passaporte em **caixa alta, sem separador** — não tem
  verificador, e apertar o formato recusaria documento legítimo no balcão.
  Identificador externo (CodSNI) é `text`.
- Segredo (credencial, chave de API, senha SMTP) vai **cifrado**
  (`src/lib/cripto.ts`) e em **tabela sem GRANT** para `anon`/`authenticated`.
  Nunca em auditoria, nem cifrado.
- Configuração que é decisão do cliente mora no banco, editável em tela.
  Segredo de infraestrutura mora em variável de ambiente.

## Comunicação

- Nunca enviar e-mail ou WhatsApp dentro da requisição do usuário. Enfileira
  em `notificacoes`; o cron processa. `enfileirar()` nunca lança.
- Uma fila só. Módulo novo não cria a segunda.

## Interface

Regras completas em `docs/design-system.md`. As que mais se erram:

- `tokens.css` é do design system e entra por SUBSTITUIÇÃO inteira; o que for
  nosso vai em `componentes.css`, com prefixo `sni-`. Classe nossa que faz o
  que uma de lá já faz é dívida — na próxima versão elas divergem, e a tela
  passa a ter duas aparências para a mesma coisa. Sobrescrever o sistema exige
  escopo nosso (`.sni-app-shell .side`, nunca `.side` solto).
- Duas camadas: conteúdo sempre opaco; só barra superior, menus e modais
  levam vidro. Nunca vidro sobre vidro.
- Platypi só em título (≥16px), **em CAIXA ALTA, peso 800, entreletra zero** —
  nunca em número, rótulo ou botão.
  Plex Mono em todo número que se lê (`.num` / `<Num>`). Figtree no resto.
- Nada abaixo de 13px. Corpo 15px. Caixa alta em rótulo pequeno é proibida.
- Cor, raio, sombra e tamanho vêm dos tokens. Precisou de algo que não
  existe: crie o primitivo em `ui.tsx` ou pergunte antes de inventar.
- Cadastro (criar e editar) acontece em modal. Esc e clique fora não fecham.
  **Exceção registrada (decisão 0015): a ficha da pessoa é página com abas.**
  Vira página quem tiver duas destas: mais de ~15 campos, upload de arquivo,
  mais de um assunto dentro, ou necessidade de URL própria.
- A ação primária de uma tela vive ao lado do título, no conteúdo — nunca na
  barra superior, que carrega só o título da tela e a identidade de quem entrou.
  Sair fica dentro do menu do usuário: ação de saída não ocupa espaço fixo.
- `SEICHO-NO-IE DO BRASIL` sempre em caixa alta, escrita no conteúdo
  (`<Entidade />`). A forma com "do Brasil" em minúsculas não pode aparecer
  em lugar nenhum. `Seicho-No-Ie` sozinho é livre. `SNI Conecta` é o produto.

## Voz do código

- Tudo em português: nomes, comentários, mensagens, commits.
- Comentário explica a decisão e o que aconteceria sem ela, não o comando.
- Armadilha conhecida vira comentário com ⚠️.
- Mensagem de erro fala em consequência para a pessoa, não em nome de chave.
- Commit explica o problema antes da solução.

## Antes de publicar

`npm run typecheck && npm test && npm run build`. Só com tudo verde.

## Depois de publicar

**CI verde e PR fechado não são prova de que o código está no ar.** São três
esteiras independentes: os testes e as migrações rodam no GitHub Actions, e a
aplicação é publicada pela Vercel. Repositório e projeto Vercel vivem na mesma
conta (`agenciaveranno`), e **é isso que faz a publicação funcionar**: a Vercel
amarra um login do GitHub por conta, e namespace pessoal de outra conta ela não
enxerga nunca. Mover o repositório para fora dessa conta para a publicação sem
avisar — merge acontece, deploy não nasce, e o site serve a versão anterior por
tempo indeterminado. Foi o que custou sete dias em 12/09. Se um dia ele
precisar sair de lá, o destino é uma ORGANIZAÇÃO do GitHub de que a conta
participe, nunca outra conta pessoal.

Quem faz merge confere se o deploy de produção existe com o SHA que acabou de
entrar. O sinal mais cedo aparece antes do merge: PR sem o status de commit da
Vercel é ligação caída. Endereços, receita de conferência e conserto em
`docs/publicacao.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
