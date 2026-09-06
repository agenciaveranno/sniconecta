# Auditoria do esqueleto da plataforma

Leitura de **todos** os arquivos versionados de `/home/user/sniconecta`
(`git ls-files`), exceto `docs/estudo/` e `docs/referencia-visual.html` — 66
arquivos no começo da leitura, 68 no fim — o repositório cresceu durante ela.
Cruzamento com o **Ciclo NOVO**
(`/home/user/sistema-ciclo-novo`, `2f07f6a`), que é a versão que vale — não a
`70f61d6` sobre a qual os outros documentos desta pasta foram escritos.

## Aviso: o alvo se moveu durante a auditoria

O estudo foi encomendado como "auditoria do commit `8cd93fa`". Quando começou,
o `HEAD` da branch estava em `332fb50`; quando terminou, em `1a22b26`. **Outra
sessão comitou quatro mudanças no meio da leitura**, e três delas atingem
exatamente pontos que este documento ia reportar como defeito:

| Commit | Hora | O que mudou | Efeito nesta auditoria |
|---|---|---|---|
| `ffd2e4c` | 17:08 | `src/design/componentes.css` +140 linhas: camada estrutural restaurada | O defeito mais grave do esqueleto **foi corrigido** durante a leitura |
| `e4e2daf` | 17:11 | ADR 0007 + `AGENTS.md` | A contradição `eventos.*` × prefixo **foi resolvida** durante a leitura |
| `dcd0193` | 17:20 | `ui.tsx` 226 → 541 linhas, `Modal.tsx` novo (175), `componentes.css` +140 | O segundo maior buraco — primitivos e modal — **foi fechado** durante a leitura |
| `1a22b26` | 17:22 | `docs/estudo/README.md` e outros estudos | marca este documento como "pronto" antes de ele existir |

Tudo abaixo descreve o estado em **`1a22b26`**, com uma releitura completa dos
arquivos que mudaram. Onde um achado já vale só como histórico, está dito.
Quem ler isto depois: confira o `HEAD` antes de agir sobre a seção 5.

---

## 1. Mapa arquivo a arquivo

Legenda: **real** = funciona e está terminado para o que se propõe ·
**parcial** = funciona, mas depende de coisa que não existe ·
**contrato** = escrito à mão para outro código programar contra ·
**stub** = casca sem implementação · **rascunho** = ainda não aplicável.

### 1.1 Domínio puro e testado — o núcleo sólido

| Arquivo | Estado | Observação |
|---|---|---|
| `src/lib/dominio/cpf.ts` | **real** | 29 linhas, DV validado, placeholder recusado (`cpf.ts:14`). Idêntico em intenção ao do Ciclo |
| `src/lib/dominio/dinheiro.ts` | **real** | centavos inteiros, aceita `"1.234,56"` e `"123.45"` (`dinheiro.ts:13`) |
| `scripts/lib/transformar.ts` | **real** (com 1 defeito) | transformações puras da migração; ver §5.6 |
| `tests/cpf.test.ts`, `dinheiro.test.ts`, `transformar.test.ts`, `permissoes.test.ts` | **real** | 22 asserções, todas verdes |
| `tests/apoio/server-only.ts` | **real** | 2 linhas, substituto do pacote no Vitest (`vitest.config.ts:14`) |

Esta é a parte do esqueleto que pode ser mantida sem revisão.

### 1.2 Plataforma — o que decide acesso

| Arquivo | Estado | O que é |
|---|---|---|
| `src/lib/permissoes.ts` | **parcial / resumo** | 80 linhas. O comentário `permissoes.ts:8-10` admite: "Os papéis e capacidades do módulo `ciclo` são os do sistema existente e **devem ser substituídos**". É um esboço de 7 das 23 capacidades reais — ver §3.2 |
| `src/lib/auth.ts` | **parcial** | `pessoaAtual()` + `exigirCapacidade()`. Lê `pessoas` e `papeis` que não existem em nenhuma migração deste repositório |
| `src/lib/supabase/tipos.ts` | **contrato escrito à mão** | O próprio arquivo diz (`tipos.ts:4-7`): "Escritos à mão enquanto o schema comum não está na main… substitua por `supabase gen types typescript` e apague". Só `pessoas` e `papeis` |
| `src/lib/supabase/server.ts` | **real** | cliente com cookies, `cookies()` já assíncrono (Next 16) |
| `src/lib/supabase/client.ts` | **real** | 12 linhas |
| `src/lib/supabase/service.ts` | **real** | `service_role`, falha explícita sem chave (`service.ts:12-14`) |
| `src/lib/supabase/consulta.ts` | **real** | `exigir()` — semântica **diferente** da do Ciclo, ver §3.7 |
| `src/lib/cripto.ts` | **real** | AES-256-GCM. **Compatível** com o do Ciclo — ver §3.3, é o achado mais importante |
| `src/lib/tema.ts` | **real, mas incompatível** | ver §3.4 |
| `src/lib/db.ts` | **real, com armadilha** | pooler em modo transação, `prepare: false`. Instancia no topo do módulo: ver §5.1 |
| `src/lib/comunicacao/fila.ts` | **STUB declarado** | 32 linhas, duas funções vazias com `TODO(ciclo)` (`fila.ts:25`, `fila.ts:30`). O próprio cabeçalho diz que existe só "para o módulo `eventos` já programar contra ele" |
| `src/proxy.ts` | **real, com furo** | proxy de sessão do Next 16. `/login/sair` escapa da lista pública: ver §5.2 |
| `src/modulos/registro.ts` | **real** | registro declarativo, 11 itens de menu. Todos apontam para rotas que não existem |

### 1.3 Rotas e telas

| Arquivo | Estado |
|---|---|
| `src/app/layout.tsx` | **real** — três fontes por `next/font`, script de tema antes da pintura (`layout.tsx:38`) |
| `src/app/page.tsx` | **real** — 8 linhas, redireciona para `/painel` |
| `src/app/login/page.tsx` | **real** — única tela realmente montada |
| `src/app/login/actions.ts` | **real** — login por CPF ou e-mail, mensagens que não enumeram conta (`actions.ts:18-22`). `sair()` em `actions.ts:60` é código morto: o AppShell usa a rota |
| `src/app/login/sair/route.ts` | **real, com comentário falso** — ver §5.2 |
| `src/app/painel/page.tsx` | **real** — hub de atalhos por capacidade |
| `src/app/api/notificacoes/processar/route.ts` | **parcial** — o porteiro (`Bearer $CRON_SECRET`, 401/503) está certo; chama um stub |
| `src/componentes/Painel.tsx` | **real** |
| `src/componentes/AppShell.tsx` | **real** — 109 linhas, casca completa |
| `src/componentes/ui.tsx` | **real desde `dcd0193`** — 541 linhas, 24 primitivos, superconjunto declarado das duas origens (`ui.tsx:23-26`); ver §3.5 |
| `src/componentes/Modal.tsx` | **real desde `dcd0193`** — 175 linhas, `<dialog>` nativo, Esc barrado (`Modal.tsx:65`); ver §3.5 |
| `src/app/globals.css` | **real** — 12 linhas, importa Tailwind + tokens + componentes |
| `src/design/tokens.css` | **real** — 383 linhas. **Todas** as `var(--x)` usadas no projeto resolvem (verificado por script) |
| `src/design/componentes.css` | **real desde `ffd2e4c`** — 627 linhas; era o buraco, ver §4.5 |

### 1.4 Banco

| Arquivo | Estado |
|---|---|
| `supabase/migrations/` | **VAZIO** — só o `README.md`. Deliberado (`README.md:19-21`): "uma migração de `eventos` aplicada antes de `pessoas` existir derrubaria o workflow" |
| `supabase/rascunhos/eventos_schema.sql` | **rascunho** — 302 linhas, 18 tabelas, marcado como não-migração na linha 1. Aponta para `public.pessoas(id)` em 6 lugares (`eventos_schema.sql:176,195,201,219,226,272`) |

O repositório **não tem uma única migração aplicável**. Não existe `pessoas`,
`papeis`, `notificacoes`, `auditoria`, `configuracoes`, `regionais`,
`localidades`, `organizacoes` nem `unidades`.

### 1.5 Scripts de migração de dados

| Arquivo | Estado |
|---|---|
| `scripts/migrar-mysql.ts` | **1 de 8 fases** — `pessoas` implementada (`migrar-mysql.ts:53`), as outras 7 lançam "não implementada" (`migrar-mysql.ts:90-96`) |
| `scripts/exportar-amostra.ts` | **real** — amostra anonimizada com CPF fictício de DV válido |
| `scripts/contagens.sql` | **real** — 6 consultas, nenhuma executada ainda (`docs/integracao-eventos.md:51`) |

### 1.6 Documentação e infraestrutura

| Arquivo | Estado |
|---|---|
| `AGENTS.md` / `CLAUDE.md` | **real** — 120 linhas; `CLAUDE.md` é só `@AGENTS.md` |
| `docs/decisoes/0001`…`0007` | **real** — sete ADRs; a 0007 nasceu durante esta auditoria |
| `docs/design-system.md` | **real, adiantado** — descreve modal e "Minha conta" que não existem |
| `docs/integracao-eventos.md` | **real** — respostas às 16 perguntas do documento de referência do Ciclo |
| `docs/migracao.md` | **real** — 7 das 8 fases marcadas "a fazer", honesto |
| `docs/tokens.json`, `docs/tokens-v2.7-original.css` | **referência** — não são código |
| `.github/workflows/ci.yml` | **real** — typecheck + test + build |
| `.github/workflows/migrations.yml` | **real, ocioso** — dispara em `supabase/migrations/**`, que está vazio |
| `.env.example` | **real** — 8 variáveis; `NEXT_PUBLIC_SITE_URL` documentada e nunca lida |
| `vercel.json` | **real** — 1 cron diário às 12h UTC |
| `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore` | **real** |

---

## 2. Typecheck e testes

Rodados duas vezes: no início (`332fb50`) e no fim (`e4e2daf`). Resultado
idêntico.

```
$ npm run typecheck
> tsc --noEmit
(sem saída — nenhum erro)

$ npm test
 ✓ tests/dinheiro.test.ts     (6 tests)
 ✓ tests/permissoes.test.ts   (4 tests)
 ✓ tests/transformar.test.ts  (6 tests)
 ✓ tests/cpf.test.ts          (6 tests)

 Test Files  4 passed (4)
      Tests  22 passed (22)
   Duration  766ms
```

`npm run build` e `npm run dev` não foram executados (fora do recorte).

**Contexto que o verde esconde.** O `tsc` cobre `**/*.ts` e `**/*.tsx`
(`tsconfig.json:31-37`), inclusive `scripts/`. Mas os 22 testes cobrem só
funções puras: CPF, dinheiro, transformação e matriz. **Nada** testa `proxy.ts`,
`cripto.ts`, `auth.ts`, `consulta.ts`, `tema.ts`, nem as 716 linhas de
`ui.tsx` + `Modal.tsx`. O Ciclo tem **18** arquivos de teste, com
`cripto.test.ts`, `consulta.test.ts` e `middleware.test.ts` entre eles — os
três módulos que este documento reporta com defeito (§3.3, §3.7, §5.2) são
justamente os que lá têm teste e aqui não. Não é coincidência: é o teste que
prende a decisão.

O mesmo vale para a matriz. `tests/permissoes.test.ts` existe, passa, e ainda
assim 12 das 23 capacidades do Ciclo sumiram sem que nada ficasse vermelho
(§3.2) — porque o teste guarda o que ninguém ia mudar por engano, e não o que
foi transcrito à mão.

---

## 3. Contradições

### 3.1 Schema por módulo × prefixo em `public` — **RESOLVIDA em `e4e2daf`**

Era a contradição mais cara, porque bloqueava qualquer migração.

**Como estava:**

- `AGENTS.md` (na versão `8cd93fa`, linhas 60-62): "Schema `public`: o que é comum
  … Schema `eventos`: o domínio de eventos. **Outros módulos, outros schemas.**"
- `/home/user/sistema-ciclo-novo/docs/SNICONECTA-FUNDACAO.md:63-66`:
  "**Recomendo prefixo.** Não é mais bonito, mas é o que tem menos atrito com a
  plataforma"; e `:193` já contava o risco — "erro de transcrição em 54 tabelas".
- `docs/estudo/README.md:98-103` registrava a decisão desta sessão como
  "**Schema por módulo** (`ciclo.*`, `eventos.*`)", ou seja, contra a
  recomendação do Ciclo.

**Como ficou.** A ADR 0007 não escolheu nenhum dos dois lados: escolheu o eixo
certo. O fato técnico que decidiu está em
`docs/decisoes/0007-onde-moram-as-tabelas-de-cada-modulo.md:10-18` — o
PostgREST envia `Accept-Profile` com **um** schema por requisição, e as
consultas aninhadas do Ciclo (`turmas(edicoes(localidades(nome)))`) precisam
embutir `pessoas`, que fica em `public`. Logo:

| Modo de acesso | Onde a tabela mora |
|---|---|
| cliente Supabase (PostgREST) — `ciclo` | `public` com prefixo `ciclo_` |
| Postgres direto pelo pooler — `eventos` | schema próprio `eventos.*`, não exposto |
| plataforma | `public` sem prefixo |

`AGENTS.md:65-71` foi reescrito de acordo, e o rascunho
`supabase/rascunhos/eventos_schema.sql` **continua valendo como está**
(`0007…md:58-59`).

**Resíduo a corrigir.** `docs/estudo/README.md:98-103` ainda descreve a decisão
antiga ("`ciclo.*`"); e `supabase/migrations/README.md:8-12` ainda manda o
schema comum vir "do módulo `ciclo`… com o prefixo de data original", o que a
ADR 0007 §"Consequência" e o plano de refundação (`SNICONECTA-FUNDACAO.md:196-200`)
substituíram por migração consolidada com verificação por `pg_dump`.

### 3.2 A matriz de capacidades: 20 nomes aqui, 23 lá, e a MATRIZ invertida

Duas divergências independentes.

**(a) A forma da estrutura de dados está invertida.**

| | Ciclo (`2f07f6a`) | Esqueleto |
|---|---|---|
| Tipo | `Record<Capacidade, readonly TipoPapel[]>` (`sistema-ciclo-novo/src/lib/permissoes.ts:82`) | `Record<TipoPapel, readonly Capacidade[]>` (`src/lib/permissoes.ts:52`) |
| Lê-se | "esta capacidade pertence a estes papéis" (`…/permissoes.ts:74`) | "este papel alcança estas capacidades" |
| `pode()` | função pura sobre um array de papéis (`…/permissoes.ts:174`) | método fechado sobre a sessão (`src/lib/auth.ts:65`) |
| Escopo nacional | `p.tipo === "sede"` no código (`…/permissoes.ts:195`) | conjunto `PAPEIS_NACIONAIS` (`src/lib/permissoes.ts:76`) |

A inversão do esqueleto é a que permite `PAPEIS_NACIONAIS`, e é a que suporta
papéis nacionais de outro módulo (`eventos_admin`) — a forma do Ciclo trata
"nacional" como sinônimo de "sede", o que já não vale. **A forma do esqueleto
é a certa; o conteúdo dela é que está errado.**

O Ciclo também exporta quatro coisas que o esqueleto perdeu e que serão
necessárias: `NOME_PAPEL` (`…/permissoes.ts:157`), `papelPrincipal`
(`…:229`), `localidadesDosPapeis` (`…:209`) e `PAPEIS_LOCAIS` (`…:151`). Sem
`NOME_PAPEL`, `src/componentes/Painel.tsx:18-22` improvisa o rótulo do papel
com `p.tipo.replace(/_/g, " ")` — a barra lateral escreve "presidente uap" em
vez de "Presidente de UAP".

**(b) Comparação item a item das 23 capacidades do Ciclo.**

O comentário `src/lib/permissoes.ts:34` admite ser "resumo". Comparando com
`/home/user/sistema-ciclo-novo/src/lib/permissoes.ts:45-71`:

| # | Ciclo (`2f07f6a`) | No esqueleto | Papéis no Ciclo | Papéis no esqueleto | Divergência |
|---|---|---|---|---|---|
| 1 | `estrutura.gerir` | `ciclo.estrutura.gerir` | sede | sede | **prefixo errado**: é capacidade de plataforma (`SNICONECTA-FUNDACAO.md:150`) |
| 2 | `tipos.gerir` | — | sede | — | **ausente** |
| 3 | `ciclo.gerir` | — | sede | — | **ausente**; e o nome colide com o prefixo do módulo |
| 4 | `importacao.executar` | — | sede | — | **ausente** |
| 5 | `auditoria.ver` | `auditoria.ver` | sede | sede | ok (virou plataforma) |
| 6 | `prova.gerir` | — | sede | — | **ausente** |
| 7 | `politica_desconto.gerir` | — | sede | — | **ausente** |
| 8 | `configuracao.gerir` | `configuracao.gerir` | sede | sede | ok |
| 9 | `lgpd.decidir` | — | sede | — | **ausente** — e é obrigação legal (art. 18, VI) |
| 10 | `acesso.gerir` | `acesso.gerir` | sede | sede | ok |
| 11 | `edicao.gerir` | `ciclo.edicao.gerir` | sede, coordenador | sede, coordenador | ok |
| 12 | `turma.gerir` | — | sede, coordenador | — | **ausente** |
| 13 | `grade.gerir` | — | sede, coordenador, orientador | — | **ausente** |
| 14 | `landing.editar` | — | sede, coordenador | — | **ausente** |
| 15 | `pessoa.gerir` | `pessoa.gerir` | sede, coordenador, **presidente_uap** | sede, **eventos_admin** | **coordenador e presidente_uap perdem a secretaria** |
| 16 | `papel.conceder` | `papel.conceder` | sede, **coordenador** | **só sede** | **coordenador perde** |
| 17 | `matricula.ver` | `ciclo.matricula.ver` | sede, coordenador, orientador, presidente_uap, **professor, aluno** | sede, coordenador, orientador, presidente_uap | **professor e aluno perdem** — o aluno deixa de ver a própria matrícula, contra §5.3 |
| 18 | `matricula.decidir` | `ciclo.matricula.decidir` | sede, coordenador | sede, coordenador | ok |
| 19 | `financeiro.ver` | `ciclo.financeiro.ver` | sede, coordenador, **presidente_uap** | sede, coordenador | **presidente_uap perde** |
| 20 | `desconto.autorizar` | — | sede, coordenador | — | **ausente** — e §7.4 do MD é explícito sobre ela |
| 21 | `prerequisito.dispensar` | — | sede, **orientador** | — | **ausente** — era a única capacidade distintiva do orientador (§6.3) |
| 22 | `presenca.lancar` | `ciclo.presenca.lancar` | sede, coordenador, **orientador**, professor | sede, coordenador, professor | **orientador perde** |
| 23 | `certificado.emitir` | `ciclo.certificado.emitir` | sede, coordenador | sede, coordenador | ok |

**Contagem.** 23 capacidades no Ciclo → 7 sobreviveram com prefixo `ciclo.`,
4 viraram plataforma sem prefixo, **12 sumiram**. O esqueleto acrescentou
8 de `eventos` e 1 comum (`pessoa.gerir` para `eventos_admin`), fechando em 20.

**Os papéis perdem alcance em 6 pontos.** O `orientador` fica com uma única
capacidade (`ciclo.matricula.ver`, `src/lib/permissoes.ts:67`) e perde as duas
que o definem (dispensar pré-requisito e lançar presença). O `aluno` fica com
**zero** (`src/lib/permissoes.ts:70`) e não consegue ver a própria matrícula.

O teste `tests/permissoes.test.ts:20-23` afirma proteger a "minimização LGPD",
mas verifica só que `coordenador` não tem `eventos.inscricoes.ver` e que
`eventos_admin` não tem `ciclo.financeiro.ver`. **Nenhum teste guarda o que os
papéis do Ciclo perderam** — é por isso que a perda passou silenciosa.

Contradição adicional com o plano do cliente: `SNICONECTA-FUNDACAO.md:150-155`
diz que `estrutura.gerir` **vira plataforma** (sem prefixo). O esqueleto a
prefixou como `ciclo.estrutura.gerir`. `docs/estudo/README.md:110-114` já havia
registrado a forma correta; o código ainda não a reflete.

### 3.3 `cripto.ts` — os dois SÃO intercambiáveis (com uma ressalva)

É a comparação decisiva, porque credencial cifrada por um lado precisa abrir do
outro. **Resultado: compatíveis.**

| | Esqueleto (`src/lib/cripto.ts`) | Ciclo (`…/src/lib/cripto.ts`) | Igual? |
|---|---|---|---|
| Algoritmo | `aes-256-gcm` (`:26`) | `aes-256-gcm` (`:30`) | sim |
| Versão | `"v1"` (`:14`) | `"v1"` (`:29`) | sim |
| Variável de ambiente | `CREDENCIAIS_ENCRYPTION_KEY` (`:17`) | `CREDENCIAIS_ENCRYPTION_KEY` (`:42`) | sim |
| Derivação da chave | `sha256(segredo)` (`:21`) | `sha256(bruta)` (`:53`) | sim |
| Tamanho do IV | 12 bytes (`:25`) | 12 bytes (`:31`, `:67`) | sim |
| Codificação | `base64url` nas 3 partes (`:29`) | `base64url` nas 3 partes (`:73-75`) | sim |
| Formato de saída | `v1.<iv>.<tag>.<corpo>` (`:30`) | `v1.<iv>.<tag>.<corpo>` (`:71-76`) | **sim** |
| Mínimo da chave | `< 32` **sem `trim`** (`:18`) | `< 32` **com `.trim()`** (`:42`, `:48`) | **NÃO** |
| Validação na leitura | 4 campos verdadeiros, aceita partes extras (`:35`) | exatamente 4 partes (`:81`) | quase |
| `cifragemDisponivel()` | não existe | existe (`:57`) | falta no esqueleto |

**Verificado empiricamente**, não por leitura: com
`CREDENCIAIS_ENCRYPTION_KEY` de 40 caracteres sem espaços, cada implementação
decifra o texto da outra nos dois sentidos. Com a mesma chave cercada de um
espaço e uma quebra de linha (` aaa…a\n`), o Ciclo aplica `trim()`, o esqueleto
não, as chaves derivadas divergem e a decifragem falha com
`Unsupported state or unable to authenticate data`.

**O risco real.** Uma variável de ambiente colada com espaço à direita na
Vercel é o acidente mais banal que existe, e o sintoma seria "a senha do SMTP
parou de abrir" sem nenhuma pista da causa. **Adotar a versão do Ciclo**
(com `trim()`, com `cifragemDisponivel()` e com a checagem estrita de 4 partes)
resolve os três pontos de uma vez, e não invalida nada já cifrado.

### 3.4 `tema.ts` × `Tema.tsx` — mesma chave, vocabulários incompatíveis

| | Esqueleto (`src/lib/tema.ts`) | Ciclo (`…/src/components/Tema.tsx`) |
|---|---|---|
| Chave do `localStorage` | `"sni-tema"` (`:7`) | `"sni-tema"` (`:7`) — **a mesma** |
| Valores gravados | `"claro"` / `"escuro"` / `"sistema"` (`:4`) | `"light"` / `"dark"` (`:38`) |
| Atributo no `<html>` | `data-theme="light"`/`"dark"` (`:17`) | `data-theme="light"`/`"dark"` (`:18`) — igual |
| Sem nada guardado | cai em `"claro"` — ignora o SO (`:16`) | cai na preferência do SO (`:18`, `!e && matchMedia`) |
| Escopo | `localStorage` + "cópia na conta" prometida (`:3`) | só `localStorage` |
| Controle na tela | **não existe** | `BotaoTema` (`:28`) |

**A chave é a mesma e os valores não.** Um `"dark"` gravado pelo Ciclo é lido
pelo script do esqueleto (`tema.ts:15-17`), não casa com `"escuro"` nem com
`"sistema"`, e a tela abre **clara**. O inverso também: `"escuro"` gravado
pelo esqueleto não é `'dark'` para o Ciclo e não é ausência, então a tela abre
clara. Nos dois sentidos, a preferência por tema escuro se perde em silêncio.
Enquanto os dois sistemas conviverem no mesmo domínio, isto acontece a cada
troca de aba.

Duas consequências menores: o esqueleto **não honra `prefers-color-scheme` por
padrão** (só no modo `"sistema"`), e o `tokens.css` não tem bloco
`@media (prefers-color-scheme: dark)` — o tema escuro depende inteiramente do
script inline. E ninguém escuta mudança de tema do SO durante a sessão.

### 3.5 `ui.tsx` e `Modal` — **buraco fechado em `dcd0193`**, mas por reescrita

Este item mudou de conclusão no meio da auditoria. Fica registrado nos dois
estados porque a razão pela qual não dava para copiar continua valendo para
todo o resto do porte.

**O que o esqueleto tinha (até `e4e2daf`).** 226 linhas, 18 primitivos, sem
`Modal`. Faltavam `Acao`, `AcaoLink`, `Chave`, `Etiqueta`, `Linha`, e as props
`acao`/`voltar` de `TituloPagina`, `detalhe`/`tom`/`icone`/`alerta` de
`Metrica`, `descricao`/`tom`/`acao` de `CardCabecalho`.

**Por que não era "copiar do Ciclo".** As duas implementações não
compartilham tecnologia:

- **Ciclo**: utilitários Tailwind com tokens de um `tailwind.config.ts` de 176
  linhas — `bg-accent`, `rounded-pill`, `min-h-tap`, `text-body`, `vidro`,
  `shadow-btn` (`…/src/components/ui.tsx:37-59`). Tailwind **3**.
- **Esqueleto**: classes CSS próprias `.sni-*` (`src/componentes/ui.tsx:39-48`)
  sobre `componentes.css`. Tailwind **4**, que nem tem `tailwind.config.ts`.

**Nenhum primitivo do Ciclo compila aqui sem reescrita.** "Portar `ui.tsx` como
superconjunto" (`docs/estudo/README.md:152`) significava reescrever 551 linhas
de utilitário em classes — foi o que `dcd0193` fez.

**O que existe agora.** `ui.tsx` (541 linhas, 24 primitivos) + `Modal.tsx`
(175 linhas, 4). A cobertura sobre o Ciclo é **total**, e a estratégia de
compatibilidade está declarada no cabeçalho (`ui.tsx:23-26`): "o que as telas
do módulo `ciclo` já passavam continua aceito com o mesmo nome, e os nomes
desta plataforma convivem como sinônimo. Porte de tela não deve virar caça a
renomeação de prop."

| Primitivo | Ciclo (`2f07f6a`) | Esqueleto (`dcd0193`) | Situação |
|---|---|---|---|
| `Botao`/`BotaoLink`/`BotaoIcone` | 5 variantes, 3 tamanhos | **8 variantes, 5 tamanhos** + prop `icone` (`ui.tsx:36-48`) | superconjunto |
| `Acao` / `AcaoLink` | `…:123`, `…:133` | `ui.tsx:110`, `:119` — ganharam prop `icone` | superconjunto |
| `Chave` | `…:145` | `ui.tsx:129` sobre a classe `.sw` que já existia | equivalente (ver §5.18) |
| `Input`/`Select`/`Textarea` | `…:180-190` | `ui.tsx:151-159` | equivalente |
| `Campo` | só embrulha em `<label>` (`…:192`) | **os dois modos**: com `htmlFor` solto, sem ele embrulhando (`ui.tsx:212-231`); aceita `dica` **e** `hint` (`:183-185`) | superconjunto |
| `Badge` | 7 tons (`…:247`) | **9 tons**, `navy`→`dark`, + `tamanho` (`ui.tsx:237-249`) | superconjunto |
| `Etiqueta` | `…:269` | `ui.tsx:272` | equivalente |
| `Alerta` | ícone vem do tipo (`…:304`) | **ícone vem do tipo, `icone` sobrescreve** (`ui.tsx:282-296`) | superconjunto — resolveu o defeito antigo |
| `Card` | `div` (`…:338`) | `div`, com prop `como` para `section`/`article` (`ui.tsx:318-325`) | superconjunto |
| `CardCabecalho` | `titulo`,`subtitulo`,`descricao`,`tom`,`acao` (`…:348`) | os cinco (`ui.tsx:331`) | equivalente |
| `Metrica` | `rotulo`,`valor`,`detalhe`,`tom`,`icone`,`alerta` (`…:387`) | os seis + `semCard` (`ui.tsx:372-388`) | superconjunto |
| `Num`, `Entidade` | `…:321`, `…:332` | `ui.tsx:362`, `:412` | equivalente |
| `TituloPagina` | `titulo` (`…:423`) | **`titulo` ou `children`** + `descricao`,`acao`,`voltar` (`ui.tsx:422-432`) | superconjunto |
| `TituloSecao` | régua (`…:456`) | régua (`ui.tsx:454`) | equivalente |
| `Tabela` | `cabecalho` obrigatório (`…:468`) | **`cabecalho` opcional** (`ui.tsx:494`) | superconjunto |
| `Linha` | `…:490` | `ui.tsx:515`, com `...ComponentProps<"tr">` | superconjunto |
| `Celula` | `forte`,`dado` (`…:498`) | `forte`,`dado`,`alinhar` (`ui.tsx:524`) | superconjunto |
| `Vazio` | `…:524` | `ui.tsx:464` | equivalente |
| `Modal`/`ModalCorpo`/`ModalAcoes`/`ModalCadastro` | `Modal.tsx:26,104,109,123` | `Modal.tsx:23,85,90,101` | equivalente, e **melhor**: `useId()` em vez do `id="modal-titulo"` literal do Ciclo (`Modal.tsx:39-40`), que anunciaria o título errado com dois modais na mesma página |

A regra de `AGENTS.md:105` e `docs/design-system.md:204` — cadastro em modal,
Esc e clique fora não fecham — está cumprida: `<dialog>` nativo com
`onCancel={(e) => e.preventDefault()}` (`Modal.tsx:65`) e sem
`onClick` no backdrop.

**Sobra uma pendência de porte**, não de código: a nomenclatura das classes de
`Campo` divergia (`dica` × `hint`) e agora aceita as duas. Isso é bom para o
porte e ruim para a manutenção — vale marcar `hint` como obsoleto num
comentário e remover quando as telas do Ciclo estiverem todas migradas.

### 3.6 `pessoas.email` e `cod_sni`: anuláveis aqui, `not null` lá

| Coluna | Ciclo (`…/supabase/migrations/0002_pessoas.sql`) | Esqueleto |
|---|---|---|
| `email` | `citext not null unique` (`:18`) | `string \| null` (`src/lib/supabase/tipos.ts:14`); ADR 0004 exige anulável |
| `cod_sni` | `text not null unique` + `check (cod_sni ~ '^[0-9]+$')` (`:16`, `:27`) | `string \| null` (`tipos.ts:11`) |
| `cpf` | `text not null unique` + `check (cpf ~ '^[0-9]{11}$')` (`:15`, `:26`) | `string` (`tipos.ts:10`) — **concordam** |
| `endereco` | `text` (`:21`) | **ausente do contrato** |
| `legado_id` | **não existe** | usado em `scripts/migrar-mysql.ts:74,79` |
| `migracao_extras` | **não existe** | usado em `scripts/migrar-mysql.ts:74,77` |

A divergência de `email`/`cod_sni` é **decidida e justificada**
(`docs/decisoes/0004-pessoas-email-e-cpf.md:8-18`): a base de eventos tem
milhares de pessoas sem e-mail, e o `check (auth_user_id is null or email is
not null)` mantém a garantia onde ela importa. Não é conflito a resolver, é
mudança a aplicar — e o esqueleto está certo.

Já `legado_id`, `endereco` e `migracao_extras` são conflito de verdade: o
script de migração escreve em três colunas que **nenhum dos dois esquemas tem**,
e faz `on conflict (legado_id)` (`migrar-mysql.ts:79`), que exige um índice
único inexistente. Ver §5.5.

Duas notas sobre `cod_sni`: o `check` do Ciclo aceita só dígitos, mas
`scripts/lib/transformar.ts:80` deixa passar CodSNI com letra apenas com aviso —
essa linha seria **recusada pelo banco**, não pelo script. E o
`docs/estudo/README.md:59-63` registra que o cliente confirmou que todas as 16
mil pessoas têm CodSNI, enquanto o checkout público cadastra gente sem — a
coluna precisa continuar anulável, como o esqueleto propõe.

### 3.7 `exigirCapacidade` e `exigir`: duas semânticas, ambas defensáveis

**`exigirCapacidade`:**

| | Esqueleto (`src/lib/auth.ts:80`) | Ciclo (`…/src/lib/auth.ts:104`) |
|---|---|---|
| Sem sessão | `redirect("/login")` (`:82`) | `throw new SemPermissao(cap)` (`:109`) |
| Sem permissão | `redirect("/painel?erro=…")` (`:84`) | `throw new SemPermissao(cap, escopo)` (`:112`) |
| Numa rota de API | **redireciona** — devolve HTML onde se espera JSON | lança — o handler responde 403 |

A forma do esqueleto **quebra exatamente o caso que o próprio `proxy.ts:5-9`
identifica como armadilha conhecida**: "Já aconteceu de um cron receber a
página de login com status 200". O proxy tira as rotas de API do caminho para
que possam recusar com 401/503, e aí `exigirCapacidade` as redireciona por
dentro. `docs/estudo/README.md:120-121` já decidiu o certo: lançar
`SemPermissao`, com um invólucro que redireciona nas páginas e 403 nas rotas.

**`exigir`:**

| | Esqueleto (`src/lib/supabase/consulta.ts:9`) | Ciclo (`…/src/lib/supabase/consulta.ts:30`) |
|---|---|---|
| Com `error` | lança `Error` (`:13`) | lança `ErroConsulta` tipada, com a causa (`:34`) |
| Com `data === null` | **lança** "resposta vazia" (`:16-18`) | **devolve `null`** |
| Tipo do parâmetro | `data: T \| null` | `data: T` |

A diferença muda o comportamento de todo `maybeSingle()` do Ciclo: lá
"não achei" é resultado legítimo e passa; aqui vira exceção. É por isso que
`src/lib/auth.ts:41-47` precisa de um desvio manual, com comentário explicando
por que não usa `exigir()` ali. Ao portar as consultas do Ciclo, **cada
`maybeSingle()` envolvido em `exigir()` passa a estourar** onde antes seguia.
O Ciclo ainda tem `tests/consulta.test.ts`; o esqueleto não testa `exigir()`.

### 3.8 `pessoaAtual`: `service_role` + `cache()` aqui, sessão sob RLS lá

| | Esqueleto (`src/lib/auth.ts:34`) | Ciclo (`…/src/lib/auth.ts:43`) |
|---|---|---|
| Cliente para `pessoas`/`papeis` | `criarClienteServico()` — **ignora RLS** (`:40`) | cliente da sessão — **sob RLS** (`:44`) |
| Memoização | `cache()` do React, por requisição (`:34`) | nenhuma — relê a cada chamada |
| Filtro `papeis.ativo` | **NÃO FILTRA** (`:53-57`) | `.eq("ativo", true)` (`…:68`) |
| Retorno | `id`, `nome`, `email`, `papeis`, `pode`, `podeEm` | + `papelPrincipal`, `rotuloPapel`, `localidades`, `capacidades`, `isSede` |
| `email` | `string \| null` (`:18`) | `string` (`…:20`) |

Três consequências:

1. **`ativo` não é respeitado.** `papeis.ativo` existe no Ciclo
   (`0002_pessoas.sql:81`) e é como se revoga um papel sem apagar o histórico.
   O esqueleto lê todos os papéis, ativos ou não — **quem teve o papel revogado
   continua com as capacidades**. Pior: `PapelRow` (`src/lib/supabase/tipos.ts:22-29`)
   nem tem a coluna, então nem dá para filtrar sem mexer no contrato. É o
   defeito de segurança mais concreto do esqueleto.
2. **O `service_role` é defensável, mas por um motivo diferente do escrito.**
   O comentário `auth.ts:30-32` justifica: "as policies dessas tabelas dependem
   de `app.current_pessoa_id()`, e é aqui que a identidade nasce". A função
   `app.current_pessoa_id()` existe no Ciclo
   (`…/supabase/migrations/0010_funcoes_autorizacao.sql:14`) e **não existe
   neste repositório** — não há migração nenhuma. O comentário descreve um
   sistema que ainda não está aqui.
3. **O `cache()` é um ganho real** e o Ciclo não tem: `Painel.tsx:12` e
   `painel/page.tsx:11` chamam `pessoaAtual()` na mesma requisição e pagam uma
   consulta só. Manter.

### 3.9 `proxy.ts` × `middleware.ts`

| | Esqueleto (`src/proxy.ts`) | Ciclo (`…/src/lib/supabase/middleware.ts`) |
|---|---|---|
| Nome / lugar | `src/proxy.ts`, exporta `proxy` (Next 16) | `src/middleware.ts` → `atualizarSessao` (Next 14) |
| `rotaDeApi` | `startsWith("/api/")` (`:20`) | `=== "/api"` **ou** `startsWith("/api/")` (`:40`) — cobre `/api` cru |
| Públicas exatas | `/`, `/login`, `/politicas` (`:12`) | — |
| Públicas por prefixo | `/e/`, `/comprar`, `/certificado/`, `/l/`, `/descadastro`, `/r/` (`:13`) | `/login`, `/l/`, `/certificado/`, `/politicas`, `/auth` (`:44-52`) |
| `/login/sair` | **NÃO é pública** — ver §5.2 | pública (prefixo `/login`) |
| `/politicas/*` | **NÃO é pública** (só o exato) | pública (prefixo) |
| `/auth/*` | **ausente** — callback de OAuth/magic link ficaria protegido | pública |
| Prazo | 3 s, `Promise.race`, resolve `null` (`:23-25`, `:47-51`) | 3 s, rejeita e **registra no log** (`:99-107`, `:120`) |
| Falha do Auth | silenciosa | `console.error("[middleware] falha ao verificar a sessão")` (`:105`) |
| Parâmetro de volta | `?voltar=` (`:56`) | `?redirect=` (`:112`) |
| Matcher | exclui também `.webp`, `.woff2`, `icon.png` (`:63`) | menos exclusões (`…/src/middleware.ts:13`) |

O esqueleto acertou em três pontos (matcher mais completo, lista pública
explícita, `/e/` e `/comprar` já previstos para eventos) e regrediu em quatro
(`/login/sair`, `/politicas/*`, `/auth/*`, e o silêncio no estouro do prazo).
O parâmetro mudou de nome (`redirect` → `voltar`), o que é legítimo mas precisa
constar no porte: `login/actions.ts:53` já lê `voltar`.

### 3.10 Fila de notificações: o contrato do stub não cabe na tabela do Ciclo

| | Esqueleto (`src/lib/comunicacao/fila.ts`) | Ciclo |
|---|---|---|
| Campo do destino | `destinatario` (`:17`) | `destino` (`…/0022_notificacoes.sql:26`) |
| `template` | **não existe no contrato** | `text **not null**` (`…:25`), sem default |
| `variaveis` | não existe | `jsonb not null default '[]'` (`…:27`) |
| `corpo` | obrigatório (`:19`) | `text not null` (`…:29`) — mas gerado por `renderizar()` (`…/comunicacao/index.ts:167`) |
| Assinatura de `enfileirar` | objeto achatado (`:24`) | `PedidoNotificacao` com `template` + `variaveis` (`…/index.ts:165`) |
| Retorno de `processarFila` | `{ processadas, falhas }` (`:29`) | `{ enviadas, falhas, ignoradas }` (`…/index.ts:195-199`) |

O contrato do esqueleto **não é gravável** na tabela do Ciclo: `template` é
`not null` sem default. E o `route.ts:19` já devolve `{processadas, falhas}` ao
cron, formato que a implementação real não produz.
`docs/estudo/README.md:127-128` registra o caminho: fila única, `template`
opcional, `corpo` obrigatório, cada módulo registrando os próprios templates.

### 3.11 Nomenclatura de pastas e de arquivos

| Conceito | Esqueleto | Ciclo |
|---|---|---|
| Componentes | `src/componentes/` | `src/components/` |
| Middleware | `src/proxy.ts` (exporta `proxy`) | `src/middleware.ts` |
| Tema | `src/lib/tema.ts` (lógica) | `src/components/Tema.tsx` (componente) |
| Módulos | `src/modulos/<modulo>/` | não existe |

O português do esqueleto é o que `AGENTS.md:112` manda ("Tudo em português").
`src/proxy.ts` é imposição do Next 16, não escolha. O porte precisa renomear
todos os `@/components/...` do Ciclo — mecânico, mas atinge todos os arquivos.
Uma ponta solta ficou: `componentes.css:17` já cita "`components/Modal.tsx`",
na grafia errada.

---

## 4. O que falta para o esqueleto rodar de fato

Hoje o esqueleto **sobe e mostra a tela de login**. Depois do login, quebra na
primeira consulta.

### 4.1 Variáveis de ambiente

As oito de `.env.example` estão corretas e completas para o que o código lê
(verificado: todo `process.env.X` do `src/` e `scripts/` tem entrada, exceto
`NODE_ENV`). `NEXT_PUBLIC_SITE_URL` está documentada e **nunca é lida** —
o Ciclo a usa (`…/src/lib` em 1 lugar, com queda para
`VERCEL_PROJECT_PRODUCTION_URL`), então ela entra com o porte.

Faltarão, quando as camadas do Ciclo e de eventos entrarem:
`RESEND_API_KEY`, `EMAIL_REMETENTE`, `WHATSAPP_CLOUD_API_TOKEN`,
`WHATSAPP_PHONE_NUMBER_ID`, `CIELO_MODO`, `BUNNY_STREAM_LIBRARY_ID`,
`BUNNY_TOKEN_AUTH_KEY` (todas presentes no Ciclo `2f07f6a`).

### 4.2 Tabelas — nenhuma existe

`supabase/migrations/` tem só o `README.md`. Faltam, para o esqueleto
**como está**:

- `public.pessoas` — lida em `auth.ts:44`, `login/actions.ts:38`
- `public.papeis` — lida em `auth.ts:54`; **precisa da coluna `ativo`**
- `public.notificacoes` — a rota do cron depende dela
- as funções `app.*` que `auth.ts:31` cita (`app.current_pessoa_id()` etc.)

E, para o que os documentos prometem: `auditoria`, `configuracoes`,
`unidades`, `organizacoes`, `regionais`, `localidades`, `consentimentos_lgpd`,
mais as 18 tabelas do rascunho de eventos e as ~54 do Ciclo.

Além disso, três colunas usadas pelo migrador não existem em esquema nenhum:
`pessoas.legado_id` (com índice único), `pessoas.endereco`,
`pessoas.migracao_extras` (`scripts/migrar-mysql.ts:74-83`).

### 4.3 Buckets de Storage

Nenhum criado, e três documentos já dependem deles: logos e banners de
promotor e evento (`eventos_schema.sql:41`, `:78-79`), foto de orientador
(`:50`), e a regra geral em `src/modulos/eventos/README.md:37` ("Logos e
banners em base64 vão para o Supabase Storage") e `docs/migracao.md:47`.
Falta decidir nome, política de acesso (público de leitura para banner de
landing; privado para o resto) e as policies.

### 4.4 Cron

`vercel.json:3` agenda `/api/notificacoes/processar` às 12h UTC (9h em
São Paulo, casando com o cron atual de eventos, `docs/integracao-eventos.md:39`).
O porteiro está correto. Mas: (a) a fila é um stub, (b) `CRON_SECRET` precisa
existir na Vercel senão a rota devolve 503 por projeto
(`route.ts:12-14` — o que é a falha na direção certa), e (c) o plano Hobby dá
**um** cron por dia, e `docs/integracao-eventos.md:72-74` já recomenda Pro
antes da virada por causa do limite de tempo de função.

### 4.5 CSS estrutural — **corrigido durante esta auditoria**

`docs/estudo/ui-design-system.md` reportou que `componentes.css` veio só da
metade "override" do `globals.css` de eventos e que faltavam as propriedades de
layout em 76 seletores. **Confirmado**, e agora resolvido.

**Medição em `332fb50`** (script sobre o CSS, contando blocos-base — sem
`:hover`, `:focus`, `::` nem `[data-theme]`): 151 blocos no arquivo, **7
declarações de layout no total**. 105 blocos-base sem nenhuma propriedade de
layout; **59 deles tinham `padding`/`gap`/`width`/`height` sem `display`,
`position` ou `flex`** — ou seja, aparência sem esqueleto. Os mais críticos:

| Seletor | O que faltava | Efeito |
|---|---|---|
| `.sni-app-shell` | `display: flex` | barra lateral e conteúdo empilhados |
| `.sni-sidebar` | `position`, `height`, `flex-direction` | não flutuava, não rolava |
| `.sni-content`, `.sni-page-wide`, `.sni-field`, `.sni-sidebar-user-info` | **não existiam** | conteúdo sem largura, campos sem espaçamento |
| `.sni-topbar` | `display: flex`, `position: sticky` | barra superior desmontada |
| `.sni-btn` | `display: inline-flex`, `align-items` | ícone e texto desalinhados em todo botão |
| `.sni-mobile-toggle` / `.sni-sidebar-backdrop` | `display: none` + media query | **menu do celular não abria** |
| `.sni-badge`, `.sni-alert`, `.sni-card-header`, `.sni-card-icon` | `display: flex` | ícone fora do lugar |
| `.sni-table` | `width`, `border-collapse` | tabela sem largura |
| `.sni-spinner` | `width`/`height`/`animation` | invisível |

**Estado em `e4e2daf`.** O commit `ffd2e4c` inseriu uma "CAMADA ESTRUTURAL"
de 140 linhas no topo do arquivo (`componentes.css:20-140`), com um comentário
que explica a causa (`:22-35`) e a regra para o futuro: "layout aqui, aparência
lá". Os quatro seletores inexistentes foram criados
(`componentes.css:41,42,43,66`), o menu móvel ganhou a media query
(`:82-93`), e verifiquei por script que **nenhuma classe usada em `.tsx` fica
sem definição em CSS**. A duplicação de seletor (`.sni-btn` aparece na camada
estrutural e no bloco de aparência) é intencional e funciona: o segundo bloco
não redefine `display`.

O commit `dcd0193` completou o serviço: `.sni-modal*` ganhou a camada
estrutural e as larguras (`componentes.css:726-728`), e nasceram as classes dos
primitivos novos — `.sni-acao` (`:668`), `.sni-metric*` (`:684-693`),
`.sni-page-head*` (`:641-647`), `.sni-voltar` (`:651`), `.sni-section-head`
(`:661`), `.sni-so-leitor` (`:700`), `.empty-acao` (`:696`),
`.sni-table td.forte` (`:706`). Verifiquei por script: **toda classe usada em
`.tsx` tem definição em CSS**, e toda `var(--x)` resolve. Sobra só `.sni-menu*`
sem uso — o popover ainda não tem componente.

### 4.6 Rotas que o menu promete e não existem

`src/modulos/registro.ts` declara 11 itens; **os 11 dão 404**: `/ciclo`,
`/eventos` e mais 6, `/admin/pessoas`, `/admin/auditoria`. O `AppShell.tsx:74`
ainda liga para `/minha-conta`, que também não existe — e é justamente onde
`docs/design-system.md:20` diz que a pessoa escolhe o tema.

---

## 5. Qualidade — achados com arquivo:linha

### 5.1 `src/lib/db.ts:32` — a conexão é criada ao importar o módulo

```ts
export const sql = globalParaDb.sql ?? criar();
```

`criar()` (`db.ts:19-21`) lança `"Sem DATABASE_URL"`. Como a chamada está no
corpo do módulo, **importar `db.ts` sem a variável derruba o processo** — e o
`build` do CI (`ci.yml:22-25`) só define as duas `NEXT_PUBLIC_*`. Hoje passa
porque **ninguém importa `db.ts`** (verificado). A primeira página de eventos
que o importar quebra o build, com uma mensagem que aponta para a variável e
não para a importação. Trocar por criação preguiçosa (`function obterSql()`)
custa cinco linhas.

### 5.2 `src/proxy.ts:12` × `src/app/login/sair/route.ts:4-5` — comentário falso e rota semiquebrada

O comentário da rota afirma:

> "Fica fora do proxy de sessão como toda rota de login."

**É falso.** `PUBLICAS_EXATAS` (`proxy.ts:12`) tem `"/login"` **exato**, e
`PUBLICAS_PREFIXO` (`:13`) não inclui `/login`. Verifiquei executando a função:
`rotaPublica("/login/sair")` → `false`. Consequência: um POST de logout com a
sessão já expirada recebe `NextResponse.redirect` (307, que **preserva o
método**) para `/login`, e o navegador faz POST numa página sem handler de POST.
O Ciclo não tem o problema porque usa `startsWith("/login")`
(`…/middleware.ts:47`). Mesma causa atinge `/politicas/privacidade` e qualquer
`/auth/*`.

### 5.3 `src/lib/auth.ts:53-57` — papel revogado continua valendo

A consulta não filtra `ativo`, e o Ciclo filtra (`…/src/lib/auth.ts:68`).
`papeis.ativo` é a coluna com que se tira acesso de alguém sem apagar
histórico (`…/0002_pessoas.sql:81`). Como está, **revogar um papel não revoga
nada**. Agravante: `PapelRow` (`src/lib/supabase/tipos.ts:22-29`) não declara a
coluna, então o defeito está também no contrato. É o achado de segurança mais
sério do esqueleto.

### 5.4 `src/proxy.ts:23-25,47-51` — o prazo de 3 s falha em silêncio

```ts
return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
```

Estourado o prazo, a função devolve `null` e a pessoa vai para o login **sem
uma linha de log**. Um Auth lento vira "o sistema me desloga sozinho", sem
nenhum rastro. O Ciclo registra (`…/middleware.ts:105`). O `setTimeout` também
nunca é limpo quando a promessa ganha a corrida.

### 5.5 `scripts/migrar-mysql.ts:74-83` — escreve em colunas que não existem

O `insert` usa `legado_id`, `endereco` e `migracao_extras`, e faz
`on conflict (legado_id)`, que exige índice único. Nenhuma das três colunas
existe no esquema do Ciclo (`…/0002_pessoas.sql:13-28`) nem em qualquer
migração deste repositório. O comentário `:69-72` reconhece que
`migracao_extras` é provisório — mas nada registra que a coluna precisa ser
criada. A fase única implementada não roda contra esquema nenhum.

Detalhe adicional: `PessoaDestino` (`scripts/lib/transformar.ts:36-39`) separa
`endereco`, `bairro`, `cidade`, `estado`, e o `insert` os concatena numa única
coluna `endereco` (`migrar-mysql.ts:76`) — o dado estruturado é achatado na
gravação, sem que nenhum comentário diga que foi de propósito.

### 5.6 `scripts/lib/transformar.ts:101` — data inválida lança em vez de rejeitar

```ts
criado_em: p.createdAt ? new Date(p.createdAt).toISOString() : null,
```

`new Date("0000-00-00").toISOString()` lança `RangeError: Invalid time value`
(verificado). Datas zeradas são comuns em `DATETIME` legado de MySQL. Isso
contradiz o contrato que o próprio teste enuncia
(`tests/transformar.test.ts:23-24`): "toda rejeição é um MOTIVO tipado, nunca
uma exceção". A função `dataIso` logo acima (`:59-64`) já faz a guarda certa
com `isNaN` — basta usá-la.

Risco adjacente: `dataIso` usa `toISOString().slice(0,10)`. Num servidor com
fuso a leste de UTC, uma data de nascimento à meia-noite local retrocede um
dia. O ambiente de execução precisa estar em UTC ou em São Paulo — e nada no
script garante isso.

### 5.7 `src/lib/db.ts:27-28` — comentário que descreve outra coisa

```ts
// Datas do banco chegam como timestamptz; nada de string sem fuso.
transform: { undefined: null },
```

`transform.undefined` converte `undefined` de JS em `NULL` de SQL. Não tem
relação com datas nem com fuso. `AGENTS.md:113` manda o comentário explicar a
decisão; este explica uma decisão que não está ali.

### 5.8 `src/lib/auth.ts:30-32` — comentário sobre funções que não existem aqui

Justifica o `service_role` com "as policies dessas tabelas dependem de
`app.current_pessoa_id()`". Essa função existe no Ciclo
(`…/0010_funcoes_autorizacao.sql:14`) e **não neste repositório**, que não tem
migração alguma. O comentário descreve um estado futuro como se fosse presente.

### 5.9 `src/design/componentes.css:16` — caminho na pasta errada

> `.modal .dimlayer → .sni-modal .dimlayer (components/Modal.tsx)`

Desde `dcd0193` o `Modal.tsx` existe — mas em `src/componentes/`, que é a pasta
deste repositório (`AGENTS.md:23`). O mapa de nomes no cabeçalho do CSS
continua apontando para `components/`, na grafia do Ciclo. Uma palavra.
(`componentes.css:711` já escreve certo, só "Modal.tsx", sem pasta.)

### 5.10 `src/design/componentes.css:62` — `aria-current` que ninguém emite

A camada estrutural adicionou `.sni-sidebar-item[aria-current="page"]` com o
comentário "Aceitar os dois evita que uma tela pinte um e anuncie o outro".
Mas `AppShell.tsx:63` só aplica a classe `active` — **nenhum componente emite
`aria-current`**. A regra CSS está pronta e o leitor de tela continua sem
anunciar o item ativo.

### 5.11 `next.config.ts:3-4` — comentário justifica ausência de CSP por scripts que não existem

> "Sem CSP rígida por enquanto: os scripts de analytics das páginas públicas são inline."

Não há nenhum script de analytics no repositório. O único inline é o do tema
(`layout.tsx:38`), que se resolve com um `nonce`. A justificativa é herdada do
sistema de eventos e ainda não vale aqui. (Os seis cabeçalhos configurados,
incluindo HSTS com `preload`, estão corretos.)

### 5.12 `supabase/migrations/README.md:15` — referência quebrada

Cita `docs/decisoes/0004-pessoas.md`; o arquivo é
`docs/decisoes/0004-pessoas-email-e-cpf.md`.

### 5.13 `src/app/login/actions.ts:60-64` — Server Action morta e exposta

`sair()` não é chamada por ninguém: o logout usa `POST /login/sair`
(`AppShell.tsx:81`). Num arquivo `"use server"`, toda função exportada vira
endpoint. Apagar.

### 5.14 `src/app/painel/page.tsx:17-21` — texto de erro vindo da URL

O `?erro=` é renderizado dentro de `<Alerta>`. O React escapa, então não é XSS;
mas qualquer pessoa monta `/painel?erro=<mensagem convincente>` e o sistema
exibe como se fosse dele. Vale trocar por um código de erro traduzido no
servidor. Mesma observação para `/login?erro=` (`login/actions.ts:57`).

### 5.15 `src/design/tokens.css:255` — `.entidade` usa `text-transform`

```css
.entidade { text-transform: uppercase; white-space: nowrap; }
```

`docs/design-system.md:107` é explícito: "Escrever a caixa alta **no conteúdo**,
não via `text-transform`. Assim a grafia sobrevive a copiar e colar, a
exportação em PDF e a troca de estilo." O `ui.tsx:178` faz certo (escreve
maiúsculo no conteúdo), mas o `text-transform` no CSS torna a regra
inverificável: qualquer texto que receba a classe passa a "obedecer" sem estar
escrito certo. Manter só o `white-space: nowrap`.

### 5.16 Nomenclatura institucional — **sem violações**

Varri o repositório inteiro: nenhuma ocorrência de "do Brasil" em caixa mista
fora das próprias regras que a proíbem (`AGENTS.md:107`,
`docs/design-system.md:103`, `docs/tokens.json:169`). `AppShell.tsx:54` usa
"Seicho-No-Ie" sozinho, que `AGENTS.md:108` autoriza. `SNI Conecta` está
sempre correto. Este ponto está limpo.

### 5.17 CSS declarado e nunca usado

Depois de `dcd0193` a lista encolheu bastante: `.sni-modal*`, `.sw`,
`.sni-table-wrap` e `.sni-acao` passaram a ter componente. Sem contar as
classes montadas dinamicamente (`sni-btn-${tamanho}`, `sni-badge-${tom}`,
`sni-alert-${tipo}`, `sni-modal-${largura}` — todas usadas), seguem mortas:
`.sni-menu*` (3 regras, sem popover), `.sni-dimlayer`, `.sni-spinner*`,
`.sni-divider*`, `.sni-icon-btn`, `.sni-sidebar-badge`, `.sni-trend-*`,
`.sni-form-grid`, e de `tokens.css`: `.seg`, `.pull`, `.serif*`, `.solid`,
`.navy`, `.dimlayer`, `.t-card`, `.t-body`, `.t-screen`. Não é defeito — é a
antecipação de primitivos que virão.

**Duas duplicações merecem decisão**, e sobreviveram a `dcd0193`:
`.t-page` (`tokens.css:257`) × `.sni-page-title` (`componentes.css:391`), e
`.t-metric` (`tokens.css:270`) × `.sni-metric-value` (`componentes.css:304`).
Definem a mesma coisa em dois arquivos; o `ui.tsx` usa `.t-page` e
`.sni-metric-value`, ou seja, uma de cada par. Duas fontes da verdade para o
mesmo tamanho de fonte é como um título muda de tamanho sozinho seis meses
depois. Também há `.sni-section-eyebrow` definido duas vezes dentro do próprio
`componentes.css` (`:129` na camada estrutural e `:402` na de aparência) — esse
é o padrão novo e está certo, mas convém não confundir com o caso acima.

### 5.18 `src/componentes/ui.tsx:136-145` — `Chave` anuncia o estado duas vezes

```tsx
role="switch"
aria-checked={ligado}
aria-pressed={ligado}
```

`role="switch"` usa `aria-checked`; `aria-pressed` pertence a `role="button"`.
Os dois juntos são redundantes e, em alguns leitores de tela, o estado é
anunciado duas vezes ("interruptor marcado, pressionado"). O Ciclo usa só
`aria-pressed` sem `role` (`…/src/components/ui.tsx:153`), o que também
funciona. Escolher um: com `role="switch"`, fica só `aria-checked`.

O CSS não ajuda a escolher: `tokens.css:334-335` pinta o estado ligado por
`.sw[aria-pressed="true"]`. Trocar para `[aria-checked="true"]` junto, ou o
botão fica correto para o leitor de tela e apagado na tela.

### 5.19 `src/componentes/Modal.tsx:151-160` — a Server Action que falha não diz nada

```tsx
iniciarEnvio(async () => {
  await acao(formData);
  setAberto(false);
});
```

O comentário logo acima (`:153-155`) mostra que o caso foi pensado: "Fecha só
DEPOIS que a ação termina. Fechar antes daria por gravado o que a validação
ainda pode recusar". Mas **não há tratamento da recusa**: se `acao` rejeitar, a
promessa estoura dentro da transição, `setAberto(false)` não roda (correto, o
modal fica aberto) e **a pessoa não vê nada** — nem mensagem, nem o botão
saindo de "Salvando…". Ela clica de novo.

Falta um `try/catch` com estado de erro renderizado dentro do `ModalCorpo`.
Enquanto não houver, toda Server Action usada por `ModalCadastro` precisa
tratar o erro por dentro e devolver normalmente — o que é frágil de garantir.
Nem o Ciclo resolve isso (`…/src/components/Modal.tsx:123` em diante tem a
mesma forma), então é dívida herdada, não regressão.

---

## 6. Recomendação, em ordem

### 6.1 Manter como está (não mexer)

1. `src/lib/dominio/cpf.ts` e `dinheiro.ts` — puros, testados, corretos.
2. `src/lib/cripto.ts` — **formato compatível com o do Ciclo**, provado. Só a
   ressalva do `trim()` (item 6.2.1).
3. O `cache()` em `pessoaAtual` (`auth.ts:34`) — ganho real sobre o Ciclo.
4. A inversão da `MATRIZ` para `Record<TipoPapel, Capacidade[]>` e o conjunto
   `PAPEIS_NACIONAIS` — é o que permite papéis nacionais fora da Sede.
5. `src/modulos/registro.ts` — resolve o que o Ciclo ainda tem como constante
   dentro do `Sidebar.tsx` (`SNICONECTA-FUNDACAO.md:122-124`).
6. `supabase/migrations/` vazio, de propósito, com o `README` explicando.
7. `src/design/tokens.css` — 383 linhas, todas as variáveis resolvem.
8. A camada estrutural de `componentes.css:20-140` recém-restaurada, e a regra
   que ela institui ("layout aqui, aparência lá").
9. **`src/componentes/ui.tsx` e `Modal.tsx` como estão** (`dcd0193`): cobrem
   todos os 24 primitivos do Ciclo, aceitam os nomes de prop das duas origens
   (`ui.tsx:23-26`) e corrigem dois defeitos do original — o ícone do `Alerta`
   passa a vir do tipo (`ui.tsx:282-296`) e o `aria-labelledby` do modal usa
   `useId()` em vez de um literal (`Modal.tsx:39-40`). Ressalvas em §5.18 e
   §5.19.
10. Os ADRs 0001–0009 e a decisão de `email`/`cod_sni` anuláveis.
11. `next.config.ts`, os dois workflows, `.env.example`, `vitest.config.ts`.

### 6.2 Ajustar (correções pontuais, alto retorno)

Em ordem de risco:

1. **`auth.ts:53-57`: filtrar `.eq("ativo", true)`** e acrescentar `ativo` a
   `PapelRow` (`tipos.ts:22-29`). Papel revogado não pode continuar valendo.
2. **`cripto.ts:17`: aplicar `.trim()`** antes de medir e derivar, importar
   `cifragemDisponivel()` do Ciclo e exigir exatamente 4 partes em `decifrar`.
   Sem isso, uma variável de ambiente com espaço torna as duas metades
   incompatíveis em silêncio.
3. **`proxy.ts:12-13`: `/login` por prefixo**, `/politicas` por prefixo,
   acrescentar `/auth`, e `rotaDeApi` aceitar `/api` cru. Escrever
   `tests/proxy.test.ts` — o Ciclo tem `middleware.test.ts` e por isso não tem
   este defeito.
4. **`proxy.ts:23-25`: registrar o estouro do prazo** e limpar o `setTimeout`.
5. **`db.ts:32`: criação preguiçosa da conexão**, antes que a primeira página de
   eventos derrube o build.
6. **`tema.ts`: decidir o vocabulário antes de qualquer porte.** Ou o esqueleto
   passa a gravar `"light"`/`"dark"`, ou muda a chave para `sni-tema-v2`. Chave
   igual com valores diferentes perde a preferência das duas pessoas.
7. **`transformar.ts:101`: usar `dataIso`** em vez de `new Date(...).toISOString()`.
8. **Comentários que descrevem o que não existe**: `db.ts:27`, `auth.ts:31`,
   `login/sair/route.ts:4`, `componentes.css:60-63`, `next.config.ts:3`.
9. **`supabase/migrations/README.md:15`**: corrigir o nome do ADR; e atualizar
   o §"Ordem combinada" para a migração consolidada da ADR 0007.
10. **`tokens.css:255`**: tirar o `text-transform` de `.entidade`.
11. **Apagar `sair()`** de `login/actions.ts:60`.
12. **`docs/estudo/README.md:98-103`**: registrar que a decisão 1 (schema por
    módulo) foi substituída pela ADR 0007.

### 6.3 Refazer (o trabalho de verdade)

1. **`src/lib/permissoes.ts` inteiro.** Não é ajuste: é substituir o resumo de
   7 capacidades pelas 23 reais, com a divisão plataforma × módulo de
   `SNICONECTA-FUNDACAO.md:150-155` (`estrutura.gerir` **sem** prefixo), os
   papéis dos 6 pontos de perda restaurados (§3.2), e `NOME_PAPEL`,
   `papelPrincipal`, `PAPEIS_LOCAIS`, `localidadesDosPapeis` trazidos junto.
   Escrever um teste que trave, capacidade a capacidade, quem tem o quê — é a
   ausência dele que deixou 12 capacidades sumirem sem ninguém notar.
2. **`exigirCapacidade` passa a lançar `SemPermissao`** (`auth.ts:80-86`), com
   um invólucro que redireciona nas páginas e devolve 403 nas rotas. Como está,
   contradiz o motivo pelo qual `proxy.ts:5-9` tira a API do caminho.
3. **`exigir()`: escolher uma semântica** (`consulta.ts:16-18`). Recomendo a do
   Ciclo (`null` passa, erro lança) mais `ErroConsulta` tipada — senão cada
   `maybeSingle()` portado vira exceção. Se ficar a do esqueleto, revisar
   **todas** as chamadas ao portar, uma a uma.
4. ~~Reescrever os primitivos do Ciclo em classes `.sni-*`.~~ **FEITO em
   `dcd0193`** (§3.5). Resta o que a reescrita não cobre: erro visível no
   `ModalCadastro` (§5.19), `Chave` com um único atributo de estado (§5.18), e
   um teste de renderização para os primitivos — hoje 716 linhas de UI sem
   nenhuma asserção.
5. **`src/lib/comunicacao/fila.ts`: o contrato, antes da implementação.**
   `template` opcional com `corpo` obrigatório, `destino` no lugar de
   `destinatario`, e `processarFila` devolvendo `{enviadas, falhas, ignoradas}` —
   ajustando `route.ts:19` junto.
6. **`src/lib/supabase/tipos.ts`: substituir por `supabase gen types`** assim
   que a primeira migração existir, como o próprio arquivo manda (`tipos.ts:4-7`).
7. **`scripts/migrar-mysql.ts`: só depois do esquema.** As colunas
   `legado_id`, `endereco` e `migracao_extras` precisam nascer numa migração
   antes de a fase `pessoas` ser executável.
8. **Trazer do Ciclo, na ordem do plano**: `acesso.ts`, `endereco.ts`,
   `configuracao/*`, `diagnostico/*`, `comunicacao/*`, `Tema`, `Modal`.

### 6.4 Apagar

1. `sair()` em `src/app/login/actions.ts:60-64` — código morto exposto como
   endpoint.
2. O `text-transform` de `tokens.css:255`.
3. A duplicação `.t-page` × `.sni-page-title` e `.t-metric` ×
   `.sni-metric-value` — escolher uma de cada par (o `ui.tsx` já usa `.t-*`).
4. Os comentários falsos listados em 6.2.8 — apagar ou corrigir, nunca deixar
   descrevendo o que não existe.

**Não apagar** o CSS ainda não usado (`.sni-modal*`, `.seg`, `.sw`,
`.serif*`…): é a antecipação dos primitivos de 6.3.4, e apagá-lo agora só
obriga a reescrevê-lo em duas semanas.

---

## 7. O que este documento não resolveu

- **A migração consolidada.** ADR 0007 decidiu *onde* as tabelas moram; ninguém
  ainda escreveu o `0001` da plataforma nem provou o diff de `pg_dump` contra
  as 24 migrations do Ciclo (`SNICONECTA-FUNDACAO.md:196-200`).
- ~~**`papeis` com escopo genérico.**~~ Resolvido pelas ADRs 0008 e 0009,
  escritas no fim desta sessão: `papeis(pessoa_id, tipo, unidade_id, ativo)`
  com `unidade_id` nulo = nacional, mais um catálogo `tipos_papel(codigo,
  nome, modulo, escopo)` como **dado** — papel de módulo novo entra por
  `INSERT`, não por migração
  (`docs/decisoes/0009-papeis-escopo-e-catalogo.md:18-32`). Isso resolve os
  três defeitos da tabela do Ciclo (`check` fixo nos 6 tipos e FK `edicao_id`
  para tabela de módulo, `…/0002_pessoas.sql:78-80`). **Duas consequências
  para este documento:** a coluna `ativo` está mantida na decisão, o que
  confirma §5.3 como defeito a corrigir; e o `escopo_tipo`/`escopo_id` que
  `docs/estudo/README.md:106-108` propunha foi recusado
  (`0009…md:40-43`), então `PapelRow` (`src/lib/supabase/tipos.ts:22-29`)
  precisa virar `(pessoa_id, tipo, unidade_id, ativo)` — hoje tem
  `localidade_id` e `edicao_id`, que a ADR 0009 elimina.
- **Pessoa sem CPF** — venda de balcão a menor ou estrangeiro. Pendência da
  Sede desde `docs/decisoes/0004-pessoas-email-e-cpf.md:20-22`.
- **Se `pessoa.gerir` do esqueleto (só sede + eventos_admin) ou do Ciclo
  (sede + coordenador + presidente_uap) é a certa.** Não é bug de transcrição:
  é decisão de quem faz secretaria na plataforma unificada.
