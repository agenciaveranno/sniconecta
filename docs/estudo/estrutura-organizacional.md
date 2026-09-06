# Estrutura organizacional da SEICHO-NO-IE DO BRASIL nos quatro sistemas

> Estudo de fundação do SNI Conecta · escrito em 06/09/2026.
> Recorte: **a estrutura institucional e como cada sistema a modela.** É a base
> da decisão mais importante da plataforma — tudo o que os módulos penduram na
> pessoa (matrícula, ingresso, cargo, reunião, livro) acaba precisando responder
> "de qual unidade essa pessoa é" e "quem enxerga a unidade dela".

## 0. Fontes lidas e método

Só entra aqui o que foi lido no arquivo, com `caminho:linha`. Onde a fonte não
diz, está escrito que não diz — não há inferência disfarçada de fato.

| Sigla | Repositório / commit | O que foi lido |
|---|---|---|
| **CICLO** | `/home/user/sistema-ciclo-novo` (`2f07f6a`, branch `claude/design-system-implementation-ics328`) | `supabase/migrations/0001_extensions_e_organizacao.sql`, `0002_pessoas.sql`, `0010_funcoes_autorizacao.sql`, `0011_rls_policies.sql`, `0012_seed_referencias.sql`; `ESPECIFICACAOCICLOPROSPERIDADE.md` §3, §4, §5; `src/lib/auth.ts`, `src/lib/permissoes.ts`; `src/app/admin/{regionais,localidades,papeis}/*`; `docs/PLATAFORMA-SNI-REFERENCIA.md` §15.3–15.4; `docs/SNICONECTA-FUNDACAO.md` |
| **EVENTOS** | `/home/user/sni-ciclo` (em produção, MySQL/Railway, +16 mil pessoas) | `server.js`, `src/app/api/migrate/route.ts`, `src/lib/constants.ts`, `src/lib/regional-emails.ts`, `src/lib/permissions.ts`, `src/app/admin/{regionais,organizacoes}/**`, `src/app/api/{regionais,organizacoes}/**`, `src/app/api/eventos/[id]/importar-convites/route.ts` |
| **CONECTA-D** | `/home/user/sni-conecta` (Drizzle, referência institucional antiga) | `db/schema/{organizacao,pessoa,cargos,enums,reunioes,eventos,misc,noticias}.ts`, `db/seed.ts`, `db/migrations/{0001_rls_triggers_views,0002_seeds,0004_hierarquia,0005_novos_cadastros}.sql`, `README.md` |
| **NOVOCONECTA** | `/home/user/novoconecta` (NestJS/Prisma/AWS, referência institucional antiga) | `CLAUDE.md`, `apps/api/prisma/schema.prisma` |
| **ESQUELETO** | `/home/user/sniconecta` (este repositório) | `AGENTS.md`, `docs/decisoes/0001..0006`, `docs/estudo/eventos-identidade.md` §3 e §6.4, `src/lib/permissoes.ts`, `src/modulos/registro.ts`, `scripts/migrar-mysql.ts`, `supabase/rascunhos/eventos_schema.sql` |
| **CLIENTE** | descrição verbal registrada no briefing desta sessão e em `docs/estudo/README.md:57-62` | hierarquia institucional |

**Aviso de escopo.** Nenhum dos quatro sistemas modela a hierarquia inteira que
o cliente descreveu. CICLO modela Regional + Localidade; EVENTOS guarda três
textos livres; CONECTA-D modela Regional + Associação Local + Organização;
NOVOCONECTA modela Regional + Associação Local. **"Núcleo" não existe como
entidade em sistema nenhum** (§1.4) e **"Sede Internacional" não existe como
entidade em sistema nenhum** (§1.1).

---

## 1. Glossário — o que cada fonte afirma

### 1.1 Sede Internacional

| Fonte | O que afirma | Onde |
|---|---|---|
| CLIENTE | Topo da hierarquia, **sem ingerência nossa**: `Sede Internacional > Sede Central no Brasil > Regionais Doutrinárias > Núcleos e Associações Locais` | briefing; `docs/estudo/README.md:57-60` |
| CICLO | **Não existe como entidade.** Aparece só como sufixo de duas funções doutrinárias: `Aspirante a Preletor da Sede Internacional` e `Preletor da Sede Internacional` | `supabase/migrations/0012_seed_referencias.sql:20-21`; `ESPECIFICACAOCICLOPROSPERIDADE.md:135-136` |
| EVENTOS | **Não aparece.** Nenhuma ocorrência no código | busca por `sede internacional` sem resultado |
| CONECTA-D | **Não aparece.** | idem |
| NOVOCONECTA | **Não aparece.** | idem |

**Leitura.** A Sede Internacional só existe hoje como *origem de um grau
doutrinário*. Nunca foi um nó de estrutura em nenhum banco. Colocá-la na árvore
seria decisão nova, não migração de dado existente (pergunta ao cliente §6-Q3).

### 1.2 Sede Central

| Fonte | O que afirma | Onde |
|---|---|---|
| CLIENTE | Segundo nível; **cuida também dos países ibero-americanos e da África latina** | briefing |
| CICLO | Não é linha de tabela: é **um valor de papel**. `papeis.tipo = 'sede'` com `localidade_id` e `edicao_id` **nulos**, garantido por `constraint escopo_papel` | `supabase/migrations/0002_pessoas.sql:74-89` |
| CICLO | Rótulo humano `"Sede Central"`; na tela de papéis, `"Sede Central (nacional)"` | `src/lib/permissoes.ts:158`; `src/app/admin/papeis/page.tsx:24` |
| CICLO | "Sede vê tudo" é princípio de autorização, implementado por `app.is_sede()` (SECURITY DEFINER) | `ESPECIFICACAOCICLOPROSPERIDADE.md:170`; `supabase/migrations/0010_funcoes_autorizacao.sql:21-31` |
| EVENTOS | Não é entidade. Aparece como rótulo de uma permissão: `{ key: "estornos", label: "Estornos (Sede Central)" }` | `src/lib/permissions.ts:18` |
| CONECTA-D | É um **nível de usuário**, valor do enum `nivel_usuario_enum`: `admin`, `sede_central`, `regional`, `associacao_local` | `db/schema/enums.ts:27-32` |
| CONECTA-D | Usuário de Sede Central pode ser **restringido a um subconjunto de Organizações** pela tabela `usuario_sede_central_organizacao(usuario_id, organizacao_id)` — chave composta | `db/schema/pessoa.ts:160-173`; função `app.user_organizacao_ids()` em `db/migrations/0001_rls_triggers_views.sql:300-310` |
| NOVOCONECTA | Não existe; o topo é `superadmin` no enum `NivelUsuario` | `apps/api/prisma/schema.prisma:105-116` |
| — | **Nenhuma fonte modela "países ibero-americanos" ou "África latina".** O mais próximo é `regional.pais char(2) default 'BR'` e `regional.idioma_primario default 'pt-BR'` em CONECTA-D, mais i18n pt-BR/es | `db/schema/organizacao.ts:56-57`; `README.md:25,157` |

**Leitura.** Em três dos quatro sistemas a Sede Central é *nível de acesso*, não
*unidade*. A afirmação do cliente de que ela cuida de outros países é o único
indício de que talvez precise ser uma unidade real (com filhos fora do Brasil).

### 1.3 Regional Doutrinária

| Fonte | O que afirma | Onde |
|---|---|---|
| CLIENTE | Terceiro nível, abaixo da Sede Central | briefing |
| CICLO | `regionais(id uuid, nome text, uf char(2), ativo boolean, criado_em)` — "estrutura administrativa"; **sem pai**, sem slug, sem endereço | `supabase/migrations/0001_extensions_e_organizacao.sql:14-20` |
| CICLO | Descrição na tela: "Estrutura administrativa. Cada Localidade reúne uma ou mais Regionais."; formulário pede só **Nome + UF** (placeholder `"Regional Sudeste"` / `"SP"`) | `src/app/admin/regionais/page.tsx:32,45-49` |
| CICLO | A Regional **não escopa acesso**: `papeis` referencia `localidade_id`, nunca `regional_id`; nenhuma função de `app.*` consulta `regionais` | `supabase/migrations/0002_pessoas.sql:74-89`; `0010_funcoes_autorizacao.sql` inteira |
| CICLO | RLS: leitura livre para `authenticated`, escrita só Sede | `supabase/migrations/0011_rls_policies.sql:57-60` |
| EVENTOS | `Regional(id INT AI, nome VARCHAR(255) NOT NULL UNIQUE, correspondeRegionalId INT NULL, createdAt)` — auto-referência **lógica, sem FK** | `src/app/api/migrate/route.ts:522-530`, coluna repetida em `:687` |
| EVENTOS | `correspondeRegionalId` **não é hierarquia**: é agregação de relatório. "As inscrições desta regional continuam nela no cadastro, mas são contabilizadas na regional correspondente no relatório Estatística" | `src/app/admin/regionais/page.tsx:338-340`; comentário em `api/migrate/route.ts:685-687` |
| EVENTOS | Resolução da correspondência é **em cadeia** (`while`), ou seja, já é um caminho de árvore percorrido em JavaScript | `src/lib/relatorio-estatistica-pdf.ts:100-141` (loop `while (correspondencia.has(atual))`, l.106-107), conforme `docs/estudo/eventos-identidade.md:371` |
| EVENTOS | Uma regional não pode corresponder a si mesma (guarda no PUT) | `src/app/api/regionais/[id]/route.ts:22-23` |
| EVENTOS | Apagar regional apaga os e-mails dela, mas **não** limpa `Participant.regional` (texto) nem o `correspondeRegionalId` de quem apontava para ela | `src/app/api/regionais/[id]/route.ts:48-53` |
| CONECTA-D | `regional` é entidade rica: `id uuid`, `numero varchar(10) unique`, `nome`, `slug unique`, **`pais char(2) default 'BR'`**, `idioma_primario`, `fuso_horario`, endereço completo, lat/long, telefone, e-mail, SEO (`meta_title`, `og_image_url`), `ativo`, `deleted_at` | `db/schema/organizacao.ts:49-87` |
| CONECTA-D | Regional **não tem pai**: é a raiz da árvore de duas alturas (`Nacional → Regional → AL`) | `README.md:14` |
| NOVOCONECTA | `Regional(id uuid, nome, uf char(2), slug unique, ativo, created_at, updated_at)` — igual ao CICLO mais slug/updatedAt | `apps/api/prisma/schema.prisma:19-32` |

**Divergência de forma.** CICLO e NOVOCONECTA usam `uf char(2)`; CONECTA-D usa
`pais char(2)` + endereço completo + `numero`. Só CONECTA-D comporta uma
regional fora do Brasil sem gambiarra.

### 1.4 Núcleo

| Fonte | O que afirma | Onde |
|---|---|---|
| CLIENTE | Quarto nível, ao lado das Associações Locais: "Núcleos e Associações Locais" | briefing |
| EVENTOS | A coluna **nasceu** `nucleo VARCHAR(255) NULL` e **foi renomeada** para `associacaoLocal` | `server.js:27`; `src/app/api/migrate/route.ts:198-203` (`ALTER TABLE Participant RENAME COLUMN nucleo TO associacaoLocal`) |
| EVENTOS | O template de importação usa a coluna `DescAssLocal` com valor de exemplo **`"Núcleo Central"`** — ou seja, na prática a mesma coluna recebe nome de núcleo | `src/app/api/participants/template/route.ts:17,34` (citado em `docs/estudo/eventos-identidade.md:284,375`) |
| CICLO | **Não existe.** Nenhuma ocorrência de "núcleo" fora de prosa ("núcleo do sistema") | busca em `*.sql`, `*.ts`, `*.tsx` |
| CONECTA-D | **Não existe** como entidade | busca; só "Núcleo operacional" como nome de fase no `README.md:244` |
| NOVOCONECTA | **Não existe** | busca |

**Leitura.** Núcleo é o conceito **mais frágil de todo o estudo**: existe só na
fala do cliente e como nome antigo de uma coluna de texto livre. Não há um único
registro estruturado de núcleo em lugar nenhum. Se o cliente confirmar que
Núcleo e Associação Local são níveis distintos (e não sinônimos regionais), o
modelo precisa de um nível a mais — e essa é justamente a pergunta que decide
entre árvore recursiva e tabelas por nível (§5, §6-Q1).

### 1.5 Associação Local (AL)

| Fonte | O que afirma | Onde |
|---|---|---|
| EVENTOS | `Participant.associacaoLocal VARCHAR(255) NULL` — **texto livre, sem cadastro e sem lista de valores válidos**; rótulo "Associação Local" no formulário | `server.js:27`; `src/app/api/migrate/route.ts:199`; ver `docs/estudo/eventos-identidade.md:373-375` |
| EVENTOS | **Não há vínculo entre a associação local e a regional** do participante | `docs/estudo/eventos-identidade.md:375` |
| CONECTA-D | `associacao_local(id uuid, **regional_id uuid not null references regional on delete restrict**, numero, nome, slug, endereço completo, lat/long, telefone, email, SEO, ativo, deleted_at)`, com `unique(regional_id, slug)` | `db/schema/organizacao.ts:92-128` |
| CONECTA-D | Depois ganhou `organizacao_id smallint` **anulável** ("mantemos nullable por compatibilidade com ALs já cadastradas; a UI exigirá Organização para novos cadastros") | `db/migrations/0004_hierarquia.sql:8-16` |
| NOVOCONECTA | `AssociacaoLocal(id, regional_id not null, nome, slug unique global, ativo)` | `apps/api/prisma/schema.prisma:34-48` |
| CICLO | **Não existe.** O nível operacional do CICLO é `localidades`, que é outra coisa (§1.7) | `supabase/migrations/0001_extensions_e_organizacao.sql:22-30` |

**Contradição a resolver.** Em CONECTA-D a AL tem **uma** Organização
(`associacao_local.organizacao_id`) — o que sugere que uma AL "é" de uma
organização doutrinária. Em EVENTOS a organização é atributo **da pessoa**, e a
associação local é outro atributo independente. As duas leituras não podem valer
ao mesmo tempo (§6-Q5).

### 1.6 Organização (doutrinária)

| Fonte | O que afirma | Onde |
|---|---|---|
| CLIENTE | "As Organizações atravessam todas as esferas" — transversais à hierarquia | briefing |
| CONECTA-D | `organizacao(id smallint PK, codigo varchar(2) unique, nome varchar(100), nome_curto varchar(30), logo_url, cor_tema varchar(7), ordem, ativo)`. **`id` é atribuído à mão no seed** (1..4), não é serial | `db/schema/organizacao.ts:21-30`; `db/seed.ts:21-31` |
| CONECTA-D | Organização é referenciada por: `cargo.organizacao_id` (anulável), `reuniao.organizacao_id` (**not null**), `tema.organizacao_id` (anulável), `evento.organizacao_id`, `associacao_local.organizacao_id`, `pessoa_nomeacao.organizacao_id`, `banner.organizacao_id`, `usuario_sede_central_organizacao` | `db/schema/cargos.ts:24-26`; `reunioes.ts:29-32,54-56`; `eventos.ts:47`; `db/migrations/0004_hierarquia.sql:11-13,22-23`; `0005_novos_cadastros.sql:80`; `db/schema/pessoa.ts:160-173` |
| CONECTA-D | **`pessoa` NÃO tem `organizacao_id`.** A pessoa se liga à organização indiretamente: pela AL (`al_vinculada_id → associacao_local.organizacao_id`) e pelas nomeações | `db/schema/pessoa.ts:21-80` (nenhuma coluna de organização) |
| CONECTA-D | Único ponto onde organização escopa acesso: `app.user_organizacao_ids()` lê `usuario_sede_central_organizacao` | `db/migrations/0001_rls_triggers_views.sql:300-310` |
| EVENTOS | `Organizacao(id INT AI, nome VARCHAR(255) UNIQUE, createdAt)` — **só nome**, sem código, sem ordem, sem cor | `src/app/api/migrate/route.ts:532-538` |
| EVENTOS | `Participant.organizacao VARCHAR(100) NULL` — **texto livre**; mas **obrigatória** no autocadastro do checkout e na compra de participantes adicionais | `server.js:26`; `docs/estudo/eventos-identidade.md:204-205` |
| EVENTOS | Tela `/admin/organizacoes` é um CRUD genérico de `{id, nome}` (`SimpleNameAdmin`); a API não grava auditoria | `src/app/admin/organizacoes/page.tsx:5-16`; `src/app/api/organizacoes/route.ts`; `[id]/route.ts` |
| EVENTOS | Na importação de convites, a lista canônica **não é a tabela**, é a constante `ORGANIZACOES` do código, casada por chave normalizada (`orgKey`: minúsculas, sem acento, `Assoc.`→`associacao`) | `src/app/api/eventos/[id]/importar-convites/route.ts:20,22-33,202` |
| NOVOCONECTA | `Pessoa.organizacao String? @db.VarChar(255)` — **texto livre na tabela central**, sem tabela de organização | `apps/api/prisma/schema.prisma:76` |
| CICLO | **Não existe.** Nenhuma tabela, coluna ou enum de organização doutrinária | `supabase/migrations/*.sql` |

### 1.7 Localidade (conceito do módulo CICLO)

| Fonte | O que afirma | Onde |
|---|---|---|
| CICLO | `localidades(id uuid, nome text, **slug text not null unique** com `check` de formato, ativo, criado_em)` — "unidade operacional onde a turma acontece"; slug usado na landing page pública | `supabase/migrations/0001_extensions_e_organizacao.sql:10-13,22-30` |
| CICLO | `localidade_regionais(localidade_id, regional_id)` — **N:N**, PK composta, `on delete cascade` do lado da localidade e `restrict` do lado da regional; índice por `regional_id` | `supabase/migrations/0001_extensions_e_organizacao.sql:32-38` |
| CICLO | "A **Localidade** é a unidade operacional onde a turma acontece. Cada Localidade **reúne uma ou mais Regionais** (muitos-para-muitos)." E: "O arranjo de Regionais em cada Localidade é **fixo** — não muda de um ano para outro. Não é necessário versionamento temporal dessa relação." | `ESPECIFICACAOCICLOPROSPERIDADE.md:71-73` |
| CICLO | A localidade é **a unidade de escopo do acesso**: `papeis.localidade_id`, `app.admin_localidade_ids()`, `app.pode_admin_localidade()` | `supabase/migrations/0002_pessoas.sql:74-100`; `0010_funcoes_autorizacao.sql:34-43,73-77` |
| CICLO | São **35** localidades previstas | `ESPECIFICACAOCICLOPROSPERIDADE.md:167`; `supabase/migrations/0011_rls_policies.sql:7`; `0023_configuracoes.sql:27` |
| CICLO | **Não há seed de localidades nem de regionais** — só de funções doutrinárias, tipos de turma e equivalências | `supabase/migrations/0012_seed_referencias.sql` inteira |
| Demais | Conceito **inexistente** nos outros três sistemas | — |

**A localidade inverte a hierarquia.** Na árvore institucional o filho tem um
pai. Aqui a "unidade operacional" **agrega várias Regionais** — é o nó de baixo
apontando para vários nós de cima. Não é um nível da árvore institucional: é um
agrupamento **do módulo** (§5.4).

### 1.8 Local (hotel / espaço físico)

| Fonte | O que afirma | Onde |
|---|---|---|
| CICLO | `locais(id, nome, endereco, cep, cidade, uf, telefone, email citext, observacoes)` + `local_fotos(local_id, storage_path, ordem)`. "Local é **entidade separada e reutilizável**. O mesmo hotel pode receber edições de anos diferentes" | `supabase/migrations/0001_extensions_e_organizacao.sql:40-63`; `ESPECIFICACAOCICLOPROSPERIDADE.md:96-102` |
| CICLO | `edicoes.local_id` é anulável, `on delete set null` | `supabase/migrations/0001_extensions_e_organizacao.sql:73` |
| EVENTOS | `Local(id, nome, endereco, bairro, cidade, estado, telefone, email, **contaCielo**, createdAt)` — mesma ideia, mais a conta de recebimento | `src/app/api/migrate/route.ts:31-46` |
| CONECTA-D | Não tem tabela `local`; o evento carrega `local_tipo` do enum `local_tipo_enum('regional','al','outro')` — ou seja, o "local" é a própria unidade institucional, ou texto solto | `db/schema/enums.ts:52`; `db/schema/eventos.ts:55` |
| CONECTA-D | Mais tarde criou `academia` (id, numero, nome, slug, país, endereço, lat/long) — "locais de evento independentes de AL/Regional" | `db/migrations/0005_novos_cadastros.sql:6,13-36` |

**Regra que já pode ser fixada:** Local é **recurso físico**, não unidade
institucional. Nunca deve entrar na mesma tabela que Regional/AL. CONECTA-D
tentou o contrário (`local_tipo_enum`) e teve de criar `academia` depois.

### 1.9 Função doutrinária

| Fonte | O que afirma | Onde |
|---|---|---|
| CICLO | `funcoes_doutrinarias(id uuid, nome text **unique**, ordem integer **unique**, ativo)`. Comentário: "**Tabela, não enum: a lista pode mudar.** `ordem` define a hierarquia" | `supabase/migrations/0002_pessoas.sql:33-42` |
| CICLO | `pessoa_funcao_hist(id, pessoa_id, funcao_id, **vigencia_inicio date not null**, registrado_por, criado_em)` + índice `(pessoa_id, vigencia_inicio desc)` | `supabase/migrations/0002_pessoas.sql:44-55` |
| CICLO | View `pessoa_funcao_atual` = `distinct on (pessoa_id) … order by vigencia_inicio desc, criado_em desc` | `supabase/migrations/0002_pessoas.sql:57-67` |
| CICLO | "**Histórico obrigatório, com data de cada mudança.**" E o aviso: "**A matrícula guarda uma cópia da função vigente na data.** Descontos dependem da função — uma promoção em julho não pode reescrever retroativamente o preço de uma matrícula de janeiro." | `ESPECIFICACAOCICLOPROSPERIDADE.md:137-143` |
| CONECTA-D | `pessoa.funcao_doutrinaria funcao_doutrinaria_enum **not null default 'Associado'`** — coluna única, **sem histórico próprio**; o comentário diz que é "**derivada das nomeações** (`pessoa_nomeacao`)", mas nada no schema faz essa derivação | `db/schema/pessoa.ts:48-50`; `db/schema/enums.ts:3-17` |
| NOVOCONECTA | `Pessoa.grau String? @db.VarChar(100)` — **texto livre**, sem lista | `apps/api/prisma/schema.prisma:151` |
| EVENTOS | **Não existe.** | — |

### 1.10 Nomeação

| Fonte | O que afirma | Onde |
|---|---|---|
| CONECTA-D | `pessoa_nomeacao(id, pessoa_id, **tipo varchar(50)**, data_nomeacao date not null, observacao, created_at)`. Comentário: "Histórico de nomeações (inscrição, divulgador, preletor em cada grau)" | `db/schema/pessoa.ts:107-127` |
| CONECTA-D | Depois ganhou `regional_id`, `organizacao_id`, `associacao_local_id`, todos anuláveis com `on delete set null` — a nomeação passa a dizer **em que unidade e organização** foi feita | `db/migrations/0004_hierarquia.sql:18-32` |
| CONECTA-D | `tipo` é **varchar livre**, não FK e não enum: nada garante que "Divulgador" da nomeação case com `'Divulgador'` do enum `funcao_doutrinaria_enum` | `db/schema/pessoa.ts:117` |
| CICLO | Não usa a palavra "nomeação". O equivalente funcional é `pessoa_funcao_hist` (§1.9) — que tem `vigencia_inicio` e `registrado_por`, mas **não** tem "onde" | `supabase/migrations/0002_pessoas.sql:44-53` |
| Demais | Inexistente | — |

**Leitura.** Nomeação (CONECTA-D) e histórico de função (CICLO) são o mesmo
fato visto por ângulos diferentes: CONECTA-D registra o **ato** (quando, onde,
por qual organização) e deriva o grau; CICLO registra o **estado** (grau a
partir de tal data) e não registra onde. O modelo unificado quer os dois
(§5.6).

### 1.11 Cargo

| Fonte | O que afirma | Onde |
|---|---|---|
| CONECTA-D | `cargo(id uuid, nome varchar(150), **nivel nivel_cargo_enum not null**, organizacao_id smallint anulável, ordem, **is_supervisor boolean**, ativo)` — é o **catálogo** de cargos, não a ocupação | `db/schema/cargos.ts:20-31` |
| CONECTA-D | `nivel_cargo_enum` tem só dois valores: `'regional'`, `'associacao_local'` — com o comentário "restrito aos escalões que **de fato têm ocupações nomeadas**" | `db/schema/enums.ts:34-41` |
| CONECTA-D | Ocupação vive em **duas tabelas espelhadas**, uma por nível: `cargo_regional_ocupacao` e `cargo_al_ocupacao`, ambas com `(gestao_id, escopo_id, cargo_id)` **unique**, `pessoa_id`, `data_inicio`, `data_fim` anulável, `observacao`, `deleted_at` | `db/schema/cargos.ts:49-76,81-108` |
| CONECTA-D | O `is_supervisor` tem semântica de "um ativo por gestão/escopo" ("vacância automática do Supervisor") | `README.md:124` |
| CONECTA-D | O seed criou `Supervisor AL`; a migração seguinte o **inativou**: "Supervisor AL não existe" | `db/seed.ts:92`; `db/migrations/0004_hierarquia.sql:41-45` |
| Demais | Inexistente. CICLO tem `papeis` (acesso), que é outra coisa (§1.13); EVENTOS e NOVOCONECTA não têm cargo institucional | — |

### 1.12 Gestão

| Fonte | O que afirma | Onde |
|---|---|---|
| CONECTA-D | `gestao(id uuid, nome varchar(100), **data_inicio date not null, data_fim date not null**, nivel nivel_cargo_enum, ativa boolean)` — é o **mandato/biênio** dentro do qual as ocupações valem | `db/schema/cargos.ts:36-44` |
| CONECTA-D | Toda ocupação referencia uma gestão (`gestao_id not null`, `on delete restrict`) e ainda carrega as próprias datas | `db/schema/cargos.ts:53-55,65-66` |
| CICLO | O análogo funcional é `edicoes` (instância **anual** por localidade, `unique(localidade_id, ano)`) — mas é do módulo, não da instituição | `supabase/migrations/0001_extensions_e_organizacao.sql:69-89` |
| Demais | Inexistente | — |

### 1.13 Papel (de acesso)

| Fonte | O que afirma | Onde |
|---|---|---|
| CICLO | `papeis(id, pessoa_id, localidade_id, **edicao_id**, tipo, ativo, criado_em)` com `check (tipo in ('sede','coordenador','orientador','presidente_uap','professor','aluno'))` | `supabase/migrations/0002_pessoas.sql:74-89` |
| CICLO | Escopo garantido por constraint: `sede` ⇒ `localidade_id is null`; qualquer outro ⇒ `localidade_id is not null` | `supabase/migrations/0002_pessoas.sql:85-88` |
| CICLO | Dois índices únicos parciais: um para `sede` (`pessoa_id, tipo`), outro para os locais (`pessoa_id, localidade_id, coalesce(edicao_id, uuid-zero), tipo`) | `supabase/migrations/0002_pessoas.sql:92-96` |
| CICLO | "Uma pessoa pode **acumular** papéis na mesma edição. O papel pertence à combinação **pessoa + localidade + edição + tipo**" | `ESPECIFICACAOCICLOPROSPERIDADE.md:159-163` |
| CICLO | Matriz de capacidades em `permissoes.ts` é a segunda camada; `pode()` × `podeNaLocalidade()`; `sede` vale em qualquer localidade | `src/lib/permissoes.ts:82-148,174-197` |
| ESQUELETO | Já registrou o defeito: `papeis` do CICLO tem FK `edicao_id` para tabela de módulo e `check` fixo nos 6 tipos — **não aceita** `eventos_admin`/`eventos_operador`; a tabela da plataforma precisa de escopo genérico | `docs/estudo/README.md:80-83`; `src/lib/permissoes.ts:15-25` |
| EVENTOS | Não tem papel com escopo: tem `Perfil(id, nome, isAdmin, permissoes TEXT)` e `User.perfilId`; permissão é **por tela** (20 chaves como `participantes`, `regionais`, `estornos`) | `src/app/api/migrate/route.ts:851-859,869`; `src/lib/permissions.ts:10-31` |
| EVENTOS | Fail-safe perigoso: contexto sem RBAC configurado ⇒ **acesso total** | `src/lib/permissions.ts:45-50` |
| CONECTA-D | Papel é o `nivel` do `usuario` (4 valores) **mais** o escopo derivado das **ocupações de cargo** — não há tabela de papel com escopo | `db/schema/pessoa.ts:132-155`; `db/migrations/0001_rls_triggers_views.sql:239-298` |
| NOVOCONECTA | `NivelUsuario: superadmin, admin_regional, admin_al, operador, leitura`; escopo prometido por atributos do Cognito (`custom:regional_id`) | `apps/api/prisma/schema.prisma:105-135`; `CLAUDE.md:250` |

### 1.14 UAP — "presidente_uap"

**Nenhum dos quatro repositórios expande a sigla.** Foi feita busca
insensível a maiúsculas por `uap` em `/home/user/sistema-ciclo-novo`,
`/home/user/sni-ciclo`, `/home/user/sni-conecta`, `/home/user/novoconecta` e
`/home/user/sniconecta`. Todas as ocorrências são a sigla crua:

| Onde aparece | O que diz |
|---|---|
| `sistema-ciclo-novo/ESPECIFICACAOCICLOPROSPERIDADE.md:92` | equipe da Edição: "coordenador, orientador, **presidente de UAP**, professores" |
| `sistema-ciclo-novo/ESPECIFICACAOCICLOPROSPERIDADE.md:153` | lista de papéis: "**Presidente de UAP** — por localidade" |
| `sistema-ciclo-novo/supabase/migrations/0002_pessoas.sql:80` | valor `'presidente_uap'` no `check` de `papeis.tipo` |
| `sistema-ciclo-novo/supabase/migrations/0010_funcoes_autorizacao.sql:42` | entra em `app.admin_localidade_ids()` junto com coordenador e orientador |
| `sistema-ciclo-novo/src/lib/permissoes.ts:161` | rótulo humano: `presidente_uap: "Presidente de UAP"` |
| `sistema-ciclo-novo/src/lib/permissoes.ts:19-23` | a única pista semântica do repositório inteiro: "**O Presidente de UAP enxerga o financeiro — responde institucionalmente — mas não concede desconto, para não haver duas portas para a mesma decisão.**" |
| `sistema-ciclo-novo/src/lib/permissoes.ts:122,137` | capacidades: `pessoa.gerir`, `matricula.ver`, `financeiro.ver` |
| `sistema-ciclo-novo/src/lib/permissoes.ts:151-155` | está em `PAPEIS_LOCAIS` — "papéis que administram uma localidade inteira" |
| `sniconecta/src/lib/permissoes.ts:20,68` | herdado no esqueleto, com só `ciclo.matricula.ver` |

**Conclusão honesta: não encontrei o significado da sigla em nenhuma fonte
deste estudo.** O que as fontes permitem afirmar:

1. É um cargo **institucional**, não operacional — "responde institucionalmente"
   (`permissoes.ts:21-22`), diferente do coordenador, que responde pela operação.
2. É **por localidade** (`ESPECIFICACAOCICLOPROSPERIDADE.md:153`), e localidade
   reúne uma ou mais Regionais — então o alcance dele cobre pelo menos uma
   Regional inteira.
3. Vê dinheiro mas não decide sobre dinheiro (`permissoes.ts:135-138`) — perfil
   de fiscalização/representação, não de execução.

Isso é **compatível** com "UAP = a unidade institucional local que preside"
(Regional, Associação Local ou Núcleo), mas **nenhuma fonte confirma**. É a
pergunta §6-Q7 — e ela importa: se UAP for o nome interno da Associação Local
ou do Núcleo, o papel `presidente_uap` do CICLO deixa de ser um papel de módulo
e vira **o cargo de presidente da unidade** na plataforma, ligando-se a
`cargos`/`gestoes` (§1.11) em vez de a `papeis`.

---

## 2. Tabela comparativa — como cada sistema modela cada conceito

Legenda das colunas: **tabela/coluna** · *tipo* · cardinalidade.

| Conceito | CICLO (`sistema-ciclo-novo`) | EVENTOS (`sni-ciclo`, produção) | CONECTA-D (`sni-conecta`) | NOVOCONECTA |
|---|---|---|---|---|
| **Sede Internacional** | — (só sufixo de 2 funções doutrinárias, `0012:20-21`) | — | — | — |
| **Sede Central** | valor `papeis.tipo='sede'`, escopo nulo (`0002:74-89`) | rótulo de permissão `estornos` (`permissions.ts:18`) | valor `nivel_usuario_enum='sede_central'` (`enums.ts:27-32`) + recorte por organização (`pessoa.ts:160-173`) | — (topo é `superadmin`) |
| **Regional** | `regionais(id uuid, nome, uf, ativo)` — sem pai (`0001:14-20`) | `Regional(id INT, nome UNIQUE, correspondeRegionalId)` — auto-ref **sem FK**, semântica de relatório (`migrate:522-530`) | `regional(id uuid, numero, nome, slug, pais, idioma, fuso, endereço, lat/long, SEO, ativo, deleted_at)` (`organizacao.ts:49-87`) | `Regional(id, nome, uf, slug, ativo)` (`schema.prisma:19-32`) |
| **Núcleo** | — | nome **antigo** da coluna de texto (`server.js:27` → `migrate:199`) | — | — |
| **Associação Local** | — | `Participant.associacaoLocal VARCHAR(255)` — texto livre, sem catálogo | `associacao_local(id, **regional_id NOT NULL**, numero, nome, slug, endereço, SEO, organizacao_id anulável)`; N:1 com regional (`organizacao.ts:92-128`, `0004:11-16`) | `AssociacaoLocal(id, **regional_id NOT NULL**, nome, slug, ativo)`; N:1 (`schema.prisma:34-48`) |
| **Organização doutrinária** | — | `Organizacao(id INT, nome UNIQUE)` (`migrate:532-538`) **+** lista fixa de 4 no código (`constants.ts:118-123`) | `organizacao(id smallint manual, codigo(2) unique, nome, nome_curto, logo, cor, ordem, ativo)` (`organizacao.ts:21-30`) | `Pessoa.organizacao varchar(255)` — texto livre, sem tabela (`schema.prisma:76`) |
| **Pessoa ↔ Organização** | — | `Participant.organizacao` *texto*, 1 por pessoa; **obrigatório no checkout** | **indireto**: via `associacao_local.organizacao_id` e via `pessoa_nomeacao.organizacao_id`. Direto só para usuário de Sede: `usuario_sede_central_organizacao` N:N (`pessoa.ts:160-173`) | `Pessoa.organizacao` *texto*, 1 por pessoa |
| **Localidade (Ciclo)** | `localidades(id, nome, slug unique, ativo)` (`0001:22-30`) | — | — | — |
| **Localidade ↔ Regional** | `localidade_regionais(localidade_id, regional_id)` **N:N**, PK composta, sem versionamento (`0001:32-38`; spec `:71-73`) | — | — | — |
| **Local físico** | `locais` + `local_fotos` (`0001:40-63`) | `Local(… , contaCielo)` (`migrate:31-46`) | `local_tipo_enum('regional','al','outro')` no evento (`enums.ts:52`) + `academia` depois (`0005:13-36`) | — |
| **Instância temporal** | `edicoes(localidade_id, ano, …)` `unique(localidade_id, ano)` (`0001:69-89`) | `Evento(nome, dataInicial, dataFinal, localId, promotorId)` (`migrate:53-63`) | `gestao(nome, data_inicio, data_fim, nivel, ativa)` (`cargos.ts:36-44`) | — |
| **Função doutrinária — catálogo** | **tabela** `funcoes_doutrinarias(nome unique, ordem unique, ativo)`, 11 linhas de seed (`0002:37-42`, `0012:10-22`) | — | **enum** `funcao_doutrinaria_enum`, 9 valores (`enums.ts:7-17`) | **texto livre** `Pessoa.grau varchar(100)` |
| **Função doutrinária — histórico** | `pessoa_funcao_hist(pessoa_id, funcao_id, vigencia_inicio, registrado_por)` + view `pessoa_funcao_atual` (`0002:44-67`) | — | `pessoa_nomeacao(tipo varchar, data_nomeacao, +regional/org/al)` — histórico do **ato**, não do grau (`pessoa.ts:110-127`, `0004:18-32`) | — |
| **Cargo (catálogo)** | — | — | `cargo(nome, nivel enum{regional,associacao_local}, organizacao_id, ordem, is_supervisor, ativo)` (`cargos.ts:20-31`) | — |
| **Cargo (ocupação)** | — | — | **duas tabelas espelhadas**: `cargo_regional_ocupacao`, `cargo_al_ocupacao` — `unique(gestao_id, escopo_id, cargo_id)`, `data_inicio/data_fim` (`cargos.ts:49-108`) | — |
| **Papel de acesso** | `papeis(pessoa_id, localidade_id, edicao_id, tipo)` — 6 tipos em `check`; acumulável (`0002:74-100`) | `Perfil(nome, isAdmin, permissoes TEXT)` + `User.perfilId`; 20 chaves por tela (`migrate:851-859`, `permissions.ts:10-31`) | `usuario.nivel` (4 valores) + escopo derivado de ocupação de cargo (`pessoa.ts:140`; `0001_rls:239-298`) | `Usuario.nivel` (5 valores) + `custom:regional_id` no Cognito |
| **Escopo do RLS** | por **localidade**: `app.admin_localidade_ids()`, `app.pode_admin_localidade()` (`0010:34-43,73-77`) | **nenhum** — domínio nacional; autorização só na aplicação (ADR 0003) | por **regional e AL**, derivado das ocupações; regional ⇒ todas as ALs por `JOIN` simples (`0001_rls:239-298`) | prometido "RLS para isolamento por regional" (`CLAUDE.md:103`), não visto no schema |
| **Pessoa ↔ unidade (atual)** | **não existe** — a pessoa não pertence a localidade; só o papel pertence | `Participant.regional`/`organizacao`/`associacaoLocal`: 3 textos livres | `pessoa.al_vinculada_id → associacao_local` (`on delete set null`) (`pessoa.ts:60-62`) | `Pessoa.regionalId` + `Pessoa.associacaoId` (ambos anuláveis) (`schema.prisma:74-75`) |
| **Pessoa ↔ unidade (histórico)** | — | — | `pessoa_al_vinculo(pessoa_id, associacao_local_id, data_inicio, data_fim, motivo_transferencia)` (`pessoa.ts:85-105`) | `VinculoAl(pessoa_id, associacao_id, tipo default 'membro', data_inicio, data_fim)` (`schema.prisma:137-152`) |
| **Escala prevista** | 35 localidades | +16 mil pessoas (real, em produção) | não declarada | **~500.000 pessoas** (`CLAUDE.md:12`) |

### 2.1 Três contradições estruturais entre as fontes

1. **A pessoa tem regional?** CICLO: **não** (só o papel tem localidade).
   EVENTOS e NOVOCONECTA: **sim, direto**. CONECTA-D: **não direto** — a regional
   da pessoa é derivada da AL (`aniversariantes_mes` faz exatamente esse
   `LEFT JOIN associacao_local al ON al.id = p.al_vinculada_id` para expor
   `al.regional_id`, `db/migrations/0001_rls_triggers_views.sql:169-172`).
2. **A organização é da pessoa ou da unidade?** EVENTOS/NOVOCONECTA: da pessoa
   (texto). CONECTA-D: da **AL** e da **nomeação**, nunca da pessoa.
3. **CodSNI é externo ou gerado?** CICLO/EVENTOS/CONECTA-D: **externo** (vem da
   base da SNI; `cod_sni text`, só dígitos). NOVOCONECTA: **gerado por
   sequence** no formato `SNI000001` e "nunca editável"
   (`CLAUDE.md:111,118-123,385`). Os dois modelos são incompatíveis; a
   plataforma segue o externo (ADR 0002, `docs/decisoes/0002-pessoa-no-centro.md`).

---

## 3. Seeds e listas conhecidas

### 3.1 Organizações doutrinárias — as duas listas divergem

**Fonte A — CONECTA-D** (`db/seed.ts:21-31`, idêntico a `db/migrations/0002_seeds.sql:9-15`):

| id | código | nome | nome curto | ordem |
|---|---|---|---|---|
| 1 | `CB` | Corpo de Cultura de Iluminação | CCI | 1 |
| 2 | `AM` | Associação Movimento Branco | AMB | 2 |
| 3 | `AS` | Assembleia de Seicho-No-Ie | ASNI | 3 |
| 4 | `JU` | Juventude Seicho-No-Ie | JUSNI | 4 |

Observação de forma: o código `CB` não é a inicial de "Corpo de Cultura de
Iluminação" (seria `CC`), e `AM` não é inicial de "Associação Movimento Branco"
(seria `AMB`, que está em `nome_curto`). Os códigos parecem herdados de um
sistema anterior, não derivados dos nomes.

**Fonte B — EVENTOS** (`src/lib/constants.ts:118-123`), sem código e sem ordem
explícita, na ordem literal do arquivo:

| # | nome |
|---|---|
| 1 | Associação da Prosperidade |
| 2 | Associação Fraternidade |
| 3 | Associação Pomba Branca |
| 4 | Associação dos Jovens |

Esta é a lista **canônica em produção**: é ela (não a tabela `Organizacao`) que
alimenta o formulário do painel, os filtros de `/participantes` e a validação da
importação de convites (`importar-convites/route.ts:20,33,202`;
`docs/estudo/eventos-identidade.md:352`). O template de planilha usa
`"Associação da Prosperidade"` como exemplo
(`src/app/api/participants/template/route.ts:33`).

**Fonte C — tabela `Organizacao` do MySQL de produção.** Existe
(`migrate:532-538`) e alimenta o **checkout público** via
`/api/comprar/listas`, mas **o conteúdo dela não é conhecido por este estudo** —
não há seed no código e o banco não foi consultado. `scripts/contagens.sql:28`
do esqueleto já prevê contar `COUNT(DISTINCT organizacao)` em `Participant`,
mas ainda **não foi executado**.

**Fonte D — NOVOCONECTA.** Texto livre, sem lista.

**Qual é o vocabulário atual — o que a evidência permite dizer.**

- **Não é possível mapear as duas listas com segurança.** As quatro entradas de
  cada lado não casam nem por nome, nem por código, nem confiavelmente por
  ordem.
- O **único par seguro** é `Associação dos Jovens` ↔ `Juventude Seicho-No-Ie`
  (`JU`, ordem 4 nos dois lados).
- Há um par **lexicalmente plausível mas não confirmado**: `Associação Pomba
  Branca` ↔ `Associação Movimento Branco` (`AM`). Reforça a plausibilidade o
  seed de categorias de notícia de CONECTA-D, que tem `Mulheres Brancas`
  (`db/seed.ts:120`) — sugerindo que essa é a organização feminina, chamada de
  dois jeitos. **Isso é indício, não prova.**
- Se o mapeamento fosse **posicional** (ordem 1↔1, 2↔2…), `Pomba Branca` casaria
  com `Assembleia de Seicho-No-Ie`, o que contradiz o par lexical acima.
  **Portanto a ordem não pode ser usada como chave de mapeamento.**
- Nenhum documento do cliente lido neste estudo (`docs/SNICONECTA-FUNDACAO.md`,
  `PLATAFORMA-SNI-REFERENCIA.md`) menciona os nomes das organizações.

**Indício adicional, forte, sobre o vocabulário de EVENTOS.** A tabela
`Promotor` de EVENTOS existe (`migrate:16-28`) e o comentário que justifica
`RegionalPromotorEmail` diz: *"o presidente da regional **PROSPERIDADE** não é o
mesmo de **JOVENS**"* (`migrate:1269-1274`; `src/lib/regional-emails.ts:5-9`).
Ou seja, **em produção os "promotores" de evento são nomeados como as
organizações doutrinárias** — Prosperidade, Jovens. Não há seed de `Promotor`
no código para confirmar a lista completa, mas o comentário torna muito provável
que `Promotor` (EVENTOS) e `Organizacao` (CONECTA-D) sejam **a mesma coisa
institucional**, batizada de dois jeitos por dois sistemas. Isso muda o porte do
módulo `eventos`: `Promotor` não seria cadastro do módulo, e sim uma referência
a `organizacoes` da plataforma (§6-Q6).

**Recomendação prática.** Nenhuma das listas deve entrar como seed da plataforma
antes da resposta do cliente. O que dá para fazer sem esperar: a tabela
`organizacoes` nasce com `codigo` e uma tabela/coluna de **apelidos**
(`nomes_legados`), para que as duas grafias apontem para a mesma linha, do jeito
que `docs/estudo/eventos-identidade.md:552` já propõe para regionais.

### 3.2 Funções doutrinárias — 11 (CICLO) × 9 (CONECTA-D), item a item

CICLO: tabela `funcoes_doutrinarias`, seed em
`supabase/migrations/0012_seed_referencias.sql:10-22`, lista idêntica à da
`ESPECIFICACAOCICLOPROSPERIDADE.md:124-136`.
CONECTA-D: enum `funcao_doutrinaria_enum`, `db/schema/enums.ts:7-17`.

| Ordem CICLO | CICLO (nome, `ordem`) | CONECTA-D (valor do enum, posição) | Situação |
|---|---|---|---|
| 1 | Simpatizante | — | **só no CICLO** |
| 2 | Adepto | — | **só no CICLO** |
| — | — | `Associado` (1) — é o **default** de `pessoa.funcao_doutrinaria` | **só no CONECTA-D** |
| 3 | Divulgador | `Divulgador` (2) | casa |
| 4 | Divulgador Autorizado | — | **só no CICLO** |
| 5 | Líder da Iluminação | `Lider_Iluminacao` (3) | casa (acento/underscore) |
| 6 | Preletor em grau Aspirante | `Preletor_Aspirante` (4) | casa |
| 7 | Preletor em grau Júnior | `Preletor_Junior` (5) | casa |
| 8 | Preletor em grau Sênior | `Preletor_Senior` (6) | casa |
| 9 | Preletor em grau Máster | `Preletor_Master` (7) | casa |
| 10 | Aspirante a Preletor da Sede Internacional | `Aspirante_Preletor_SI` (8) | casa |
| 11 | Preletor da Sede Internacional | `Preletor_SI` (9) | casa |

**Contagem:** 7 graus casam 1:1 e na mesma ordem relativa. CICLO tem **3**
exclusivos (Simpatizante, Adepto, Divulgador Autorizado); CONECTA-D tem **1**
exclusivo (Associado). 11 − 3 + 1 = 9. ✔

**O que isso significa.**
- O **topo** das duas escadas é idêntico e na mesma ordem — os graus de Preletor
  são consenso entre as duas fontes.
- A divergência está toda na **base**: onde CICLO distingue três degraus de
  entrada (Simpatizante → Adepto → Divulgador → Divulgador Autorizado),
  CONECTA-D tem um só (`Associado` → `Divulgador`). Uma lista provavelmente é
  refinamento da outra; **qual é a atual é pergunta ao cliente** (§6-Q8).
- **A forma do CICLO é a certa** e não depende dessa resposta: tabela com
  `ordem`, não enum. O próprio CICLO documenta o porquê: "*Armazenar como tabela
  configurável, não como enum no código. A lista pode mudar*"
  (`ESPECIFICACAOCICLOPROSPERIDADE.md:145`;
  `supabase/migrations/0002_pessoas.sql:34-35`). Migrar um `pgEnum` é `ALTER
  TYPE` numa migração; migrar uma linha é `UPDATE` numa tela.
- ⚠️ **Armadilha em CONECTA-D:** `pessoa_nomeacao.tipo` é `varchar(50)` livre
  (`db/schema/pessoa.ts:117`) enquanto `pessoa.funcao_doutrinaria` é enum
  (`:48-50`). O comentário promete que uma é "derivada" da outra
  (`db/schema/enums.ts:3-6`), mas **nada no schema garante isso** — os dois
  campos podem divergir em silêncio. O modelo unificado não deve repetir isso.

### 3.3 Tipos de cargo (só CONECTA-D)

`db/seed.ts:79-95` = `db/migrations/0002_seeds.sql:29-41`:

| nome | nivel | ordem | is_supervisor | situação |
|---|---|---|---|---|
| Presidente Regional | `regional` | 1 | não | ativo |
| Vice-Presidente Regional | `regional` | 2 | não | ativo |
| Secretário Regional | `regional` | 3 | não | ativo |
| Tesoureiro Regional | `regional` | 4 | não | ativo |
| Supervisor Regional | `regional` | 5 | **sim** | ativo |
| Presidente AL | `associacao_local` | 10 | não | ativo |
| Vice-Presidente AL | `associacao_local` | 11 | não | ativo |
| Secretário AL | `associacao_local` | 12 | não | ativo |
| Tesoureiro AL | `associacao_local` | 13 | não | ativo |
| Supervisor AL | `associacao_local` | 14 | **sim** | ⚠️ **desativado depois**: "Supervisor AL não existe" (`db/migrations/0004_hierarquia.sql:41-45`) |

Restam **9 cargos**: quatro pares idênticos (Presidente, Vice, Secretário,
Tesoureiro) em dois níveis, mais o Supervisor, que só existe no nível Regional.
Note que `cargo.organizacao_id` existe e é anulável (`db/schema/cargos.ts:24-26`)
— logo o modelo já previa "Presidente Regional **da Juventude**" distinto de
"Presidente Regional **da Assembleia**", mas o seed não usa isso.

O salto de ordem 5 → 10 entre os blocos é a marca de que a lista foi pensada
para crescer dentro de cada nível.

### 3.4 Níveis de usuário — as quatro listas

| Sistema | Valores | Onde |
|---|---|---|
| CICLO | `sede`, `coordenador`, `orientador`, `presidente_uap`, `professor`, `aluno` (6) | `supabase/migrations/0002_pessoas.sql:79-80`; `src/lib/permissoes.ts:33-39` |
| CONECTA-D | `admin`, `sede_central`, `regional`, `associacao_local` (4) | `db/schema/enums.ts:27-32` |
| NOVOCONECTA | `superadmin`, `admin_regional`, `admin_al`, `operador`, `leitura` (5) | `apps/api/prisma/schema.prisma:105-116` |
| EVENTOS | não tem níveis: `Perfil.isAdmin` + 20 chaves de permissão por tela | `src/lib/permissions.ts:10-31` |
| ESQUELETO (proposta atual) | os 6 do CICLO + `eventos_admin`, `eventos_operador` (8) | `src/lib/permissoes.ts:15-25` |

Duas famílias distintas: CONECTA-D e NOVOCONECTA nomeiam o **nível da árvore**
(`regional`, `associacao_local`, `admin_al`); CICLO nomeia a **função na
operação** (`coordenador`, `professor`, `aluno`). Só a segunda escala para
módulos novos, porque a primeira mistura "onde" com "o quê" numa coluna só —
exatamente o que a decisão 3 do `docs/estudo/README.md:96-102` já corrigiu ao
propor `papeis(pessoa_id, tipo, escopo_tipo, escopo_id)`.

### 3.5 A lista `REGIONAIS` de EVENTOS — 114 nomes, dois padrões

`src/lib/constants.ts:1-116`. **114 entradas** (linhas 2–115), ordenadas em
tempo de execução por `.sort()` (l.116). Alimentam o formulário de participante
e os filtros do painel (`ParticipantForm.tsx:195`,
`/participantes/page.tsx:217-224`) — **não** a tabela `Regional`.

Classificação por forma do nome (contagem feita sobre o arquivo):

| Padrão | Exemplo | Quantidade | Leitura |
|---|---|---|---|
| `UF-NOME [n] - Cidade` (contém `" - "`) | `SP-NORTE 1 - Campinas` | **27** | tem cara de **Regional Doutrinária**: nome de região + número de ordem + cidade-sede entre as suas |
| `UF-CIDADE` | `SP-CAMPINAS` | **87** | tem cara de **unidade local** (Associação Local / Núcleo), nomeada pela cidade ou pelo bairro |
| **Total** | | **114** | |

**As 27 do primeiro padrão, agrupadas por família regional** (15 famílias):

| Família | Entradas |
|---|---|
| DF-BRASÍLIA | `DF-BRASÍLIA 1 - Brasília` |
| GO-GOIÁS | `GO-GOIÁS - Goiânia` |
| MS-MATO GROSSO | `1 - Campo Grande`, `2 - Dourados` |
| PA-PARÁ | `PA-PARÁ - Belém` |
| PR-PARANÁ | `1 - Londrina`, `2 - Maringá`, `5 - Curitiba`, `6 - Umuarama` |
| SP-ABC | `SP-ABC - ABC` |
| SP-CENTRAL | `1 - São José dos Campos`, `2 - Mogi das Cruzes` |
| SP-NOROESTE | `1 - Araçatuba`, `2 - Bauru` |
| SP-NORTE | `1 - Campinas`, `2 - Atibaia` |
| SP-PAULISTA | `1 - Tupã` |
| SP-SANTOS | `1 - Santos` |
| SP-SÃO PAULO | `1 - Jabaquara`, `2 - Pinheiros`, `3 - Interlagos`, `4 - São Miguel Paulista`, `5 - Imirim`, `6 - Aricanduva` |
| SP-SÃO PAULO SUL | `SP-SÃO PAULO SUL - Registro` |
| SP-SOROCABANA | `1 - Presidente Prudente` |
| SP-SUDOESTE | `SP-SUDOESTE - Sorocaba` |

⚠️ **A numeração tem buracos**: existem `PR-PARANÁ 1, 2, 5, 6` — faltam 3 e 4.
Isso é evidência de que a lista de "regionais numeradas" é uma **carga parcial**
de um cadastro maior que existe fora deste sistema. A lista oficial da Sede tem
mais linhas do que estas 27.

**O cruzamento entre os dois padrões — a prova de que são níveis diferentes.**
Casando cada entrada `UF-NOME n - Cidade` com a entrada `UF-CIDADE` de mesma
cidade (comparação sem acento, caixa alta), **23 dos 27 têm par exato**:

| `UF-CIDADE` (padrão local) | `UF-NOME n - Cidade` (padrão regional) |
|---|---|
| DF-BRASÍLIA | DF-BRASÍLIA 1 - Brasília |
| GO-GOIÂNIA | GO-GOIÁS - Goiânia |
| MS-CAMPO GRANDE | MS-MATO GROSSO 1 - Campo Grande |
| MS-DOURADOS | MS-MATO GROSSO 2 - Dourados |
| PA-BELÉM | PA-PARÁ - Belém |
| PR-LONDRINA | PR-PARANÁ 1 - Londrina |
| PR-MARINGÁ | PR-PARANÁ 2 - Maringá |
| PR-CURITIBA | PR-PARANÁ 5 - Curitiba |
| PR-UMUARAMA | PR-PARANÁ 6 - Umuarama |
| SP-SÃO JOSÉ DOS CAMPOS | SP-CENTRAL 1 - São José dos Campos |
| SP-MOGI das CRUZES | SP-CENTRAL 2 - Mogi das Cruzes |
| SP-ARAÇATUBA | SP-NOROESTE 1 - Araçatuba |
| SP-BAURU | SP-NOROESTE 2 - Bauru |
| SP-CAMPINAS | SP-NORTE 1 - Campinas |
| SP-ATIBAIA | SP-NORTE 2 - Atibaia |
| SP-SANTOS | SP-SANTOS 1 - Santos |
| SP-JABAQUARA | SP-SÃO PAULO 1 - Jabaquara |
| SP-PINHEIROS | SP-SÃO PAULO 2 - Pinheiros |
| SP-INTERLAGOS | SP-SÃO PAULO 3 - Interlagos |
| SP-SÃO MIGUEL PAULISTA | SP-SÃO PAULO 4 - São Miguel Paulista |
| SP-ARICANDUVA | SP-SÃO PAULO 6 - Aricanduva |
| SP-PRESIDENTE PRUDENTE | SP-SOROCABANA 1 - Presidente Prudente |
| SP-SOROCABA | SP-SUDOESTE - Sorocaba |

As **4 sem par** são `SP-ABC - ABC`, `SP-PAULISTA 1 - Tupã`,
`SP-SÃO PAULO 5 - Imirim` e `SP-SÃO PAULO SUL - Registro` — nenhuma tem
`SP-TUPÃ`, `SP-IMIRIM`, `SP-REGISTRO` nem `SP-ABC` na lista simples.
E **64 das 87** entradas simples não têm nenhuma contraparte numerada (ex.:
`BA-BARRIS`, `BA-PITUBA`, `MG-BH CAIÇARA`, `RS-PASSO D'AREIA`,
`SP-VILA PRUDENTE`).

**Interpretação.** O par `SP-CAMPINAS` / `SP-NORTE 1 - Campinas` **não é
duplicata**: é a mesma cidade em **dois níveis** — a unidade local de Campinas e
a Regional Doutrinária "SP-NORTE 1", cuja sede fica em Campinas. Os 23 pares são
justamente as cidades onde a regional tem sede: por isso o mesmo topônimo
aparece nos dois padrões. Os 64 nomes simples sem par são unidades locais em
cidades e bairros que **não** são sede de regional
(`BA-BARRIS`, `BA-PITUBA`, `MG-BH CAIÇARA` são bairros de Salvador e Belo
Horizonte — nível claramente sub-municipal).

**Consequência séria para o dado de produção.** Como a coluna
`Participant.regional` é **texto** preenchido a partir dessa lista misturada,
os +16 mil participantes estão hoje classificados **em dois níveis diferentes na
mesma coluna** — parte apontando para uma Regional Doutrinária, parte para uma
unidade local. A migração não pode tratar essa coluna como "regional": tem de
resolver cada valor contra um catálogo que saiba de que nível ele é. É a
`nomes_legados` / tabela de apelidos já sugerida em
`docs/estudo/eventos-identidade.md:552`, agora com um campo a mais: **para qual
nível** o apelido aponta.

Distribuição por UF (24 UFs; `simples` × `com traço`):

| UF | simples | numerada | | UF | simples | numerada |
|---|---|---|---|---|---|---|
| AL | 1 | 0 | | PR | 8 | 4 |
| AM | 1 | 0 | | RJ | 3 | 0 |
| BA | 5 | 0 | | RN | 1 | 0 |
| CE | 1 | 0 | | RO | 2 | 0 |
| DF | 1 | 1 | | RS | 8 | 0 |
| ES | 1 | 0 | | SC | 4 | 0 |
| GO | 1 | 1 | | SE | 1 | 0 |
| MA | 2 | 0 | | **SP** | **33** | **18** |
| MG | 6 | 0 | | TO | 1 | 0 |
| MS | 2 | 2 | | | | |
| MT | 1 | 0 | | | | |
| PA | 1 | 1 | | | | |
| PB | 1 | 0 | | | | |
| PE | 1 | 0 | | | | |
| PI | 1 | 0 | | | | |

São Paulo concentra 51 das 114 entradas (45%) e **18 das 27** numeradas: a
estrutura de SP é mais profunda que a das outras UFs, o que reforça que um único
nível fixo não descreve a instituição inteira.

### 3.6 Três listas de regional em produção, e nenhuma manda

Já levantado em `docs/estudo/eventos-identidade.md:346-357`, repetido aqui
porque é decisivo para o modelo:

| Consumidor | Fonte da lista |
|---|---|
| Painel: cadastro e filtros de participante | constante `REGIONAIS` (114 nomes, `constants.ts`) |
| Checkout público `/comprar` | **tabela** `Regional` via `/api/comprar/listas` |
| Import de convites (organizações) | constante `ORGANIZACOES` (`importar-convites:20,202`) |
| Relatório, e-mails por regional, correspondência estatística | **tabela** `Regional` (`/api/regionais`) |

Como `Participant.regional` é texto e a ponte com `Regional` é o **nome**
(`src/lib/regional-emails.ts:11-15,88-95`), um participante cadastrado pelo
painel pode carregar um nome que **não existe** na tabela — e aí o aviso por
e-mail ao presidente da regional simplesmente não dispara. O próprio código
assume isso: *"Quem tiver um valor antigo que não bate com nenhuma regional
simplesmente não gera aviso — não é erro, é cadastro desatualizado"*
(`regional-emails.ts:13-15`).

---

## 4. Como cada sistema liga a pessoa à estrutura

### 4.1 Vínculo com a unidade

| Sistema | Vínculo atual | Histórico | Cardinalidade | Integridade |
|---|---|---|---|---|
| **CICLO** | **Nenhum.** `pessoas` não tem coluna de estrutura (`supabase/migrations/0002_pessoas.sql:13-28`). A pessoa alcança uma localidade **só através de um papel** | — | 0..N localidades, via papéis | FK forte (`papeis.localidade_id → localidades`) |
| **EVENTOS** | 3 colunas de **texto livre** em `Participant`: `regional VARCHAR(100)`, `organizacao VARCHAR(100)`, `associacaoLocal VARCHAR(255)` (`server.js:25-27`) | — | 1 valor por coluna | **nenhuma**: sem FK, sem catálogo para `associacaoLocal`, ponte por nome |
| **CONECTA-D** | `pessoa.al_vinculada_id → associacao_local` (`on delete set null`, `db/schema/pessoa.ts:60-62`); a regional é **derivada** por join | `pessoa_al_vinculo(pessoa_id, associacao_local_id, data_inicio, data_fim, motivo_transferencia)` (`pessoa.ts:85-105`) | 1 AL atual + N históricos | FK forte; `restrict` no histórico |
| **NOVOCONECTA** | `Pessoa.regionalId` **e** `Pessoa.associacaoId`, ambos anuláveis e independentes (`schema.prisma:74-75,90-91`) | `VinculoAl(pessoa_id, associacao_id, **tipo default 'membro'**, data_inicio default now, data_fim)` (`schema.prisma:137-152`) | 1 regional + 1 AL + N vínculos | FK, mas **redundante**: `regionalId` pode contradizer `associacao.regionalId` |

**O melhor de cada um.** CONECTA-D acerta em três pontos que devem ser
copiados: (a) um vínculo atual **só**, com a regional derivada, sem redundância;
(b) histórico com `data_inicio`/`data_fim`; (c) `motivo_transferencia` — a
transferência entre unidades é um ato institucional que precisa de justificativa
registrada. NOVOCONECTA acerta em ter `tipo` no vínculo (nem todo vínculo é
"membro"). CICLO acerta em **não** duplicar a estrutura dentro de `pessoas`.

**O erro a não repetir.** NOVOCONECTA guarda `regionalId` e `associacaoId` na
mesma linha, sem constraint amarrando um ao outro. Basta transferir a AL de
regional para o dado ficar mentindo, e nada avisa.

### 4.2 Vínculo com a função doutrinária

| Sistema | Como guarda | Vigência | Quem registrou | Onde foi |
|---|---|---|---|---|
| **CICLO** | `pessoa_funcao_hist` + view `pessoa_funcao_atual` (`0002:44-67`) | **sim** — `vigencia_inicio date not null`, atual = mais recente | **sim** — `registrado_por → pessoas(id)` | **não** |
| **CONECTA-D** | coluna enum `pessoa.funcao_doutrinaria` (estado) + `pessoa_nomeacao` (atos) | parcial — `data_nomeacao`, mas sem `data_fim` e sem derivação garantida | **não** | **sim** — `regional_id`, `organizacao_id`, `associacao_local_id` (`0004:18-32`) |
| **NOVOCONECTA** | `Pessoa.grau varchar(100)` | **não** | **não** | **não** |
| **EVENTOS** | — | — | — | — |

⚠️ **A regra que nenhum dos dois implementa e a plataforma precisa.** O CICLO já
diz o porquê: *"A matrícula guarda uma cópia da função vigente na data.
Descontos dependem da função — uma promoção em julho não pode reescrever
retroativamente o preço de uma matrícula de janeiro"*
(`ESPECIFICACAOCICLOPROSPERIDADE.md:141`). Isso significa que a função
doutrinária é ao mesmo tempo (a) um histórico vivo na plataforma e (b) uma
**cópia congelada** dentro do fato de cada módulo. Sem a cópia, recalcular um
desconto antigo dá outro número.

### 4.3 Como o escopo de acesso é derivado da estrutura

| Sistema | Caminho do escopo |
|---|---|
| **CICLO** | `auth.uid()` → `pessoas.auth_user_id` → `papeis(ativo)` → `localidade_id`. Três funções `SECURITY DEFINER STABLE`: `app.is_sede()`, `app.admin_localidade_ids()`, `app.pode_admin_localidade()` (`0010:21-31,34-43,73-77`). O comentário do arquivo explica por que são `SECURITY DEFINER`: sem isso, uma policy que consulta `papeis` dispararia o RLS de `papeis` e causaria **recursão infinita** (`0010:5-9`) |
| **CONECTA-D** | `auth.uid()` → `usuario` → (`nivel` OU `cargo_*_ocupacao` **com `data_fim` vigente**) → `regional_id` / `associacao_local_id`. `app.user_regional_ids()` é um `UNION` de 3 ramos; `app.user_al_ids()` também, e **um dos ramos desce a árvore**: `JOIN associacao_local al ON al.regional_id = cro.regional_id` — quem ocupa cargo regional alcança todas as ALs daquela regional (`0001_rls:239-298`) |
| **CONECTA-D** | Recorte extra por organização, só para Sede Central: `app.user_organizacao_ids()` (`0001_rls:300-310`) |
| **EVENTOS** | **Sem escopo de dado**: domínio nacional. A permissão é por tela, checada na aplicação (`requirePermissao`), com fail-safe que **abre tudo** se o perfil não estiver configurado (`src/lib/permissions.ts:45-50`). ADR 0003 já formalizou que fica assim (`docs/decisoes/0003-acesso-ao-banco.md`) |
| **NOVOCONECTA** | Prometido em `CLAUDE.md:103,250` (RLS por regional, `custom:regional_id` no Cognito), **não encontrado** no `schema.prisma` |

**A observação que decide o §5.7.** CONECTA-D consegue "subir e descer a árvore"
com um `JOIN` simples **porque a árvore tem altura fixa 2**. Se a plataforma
tiver `sede_central > regional > nucleo > associacao_local` (altura 4, e talvez
variável entre UFs, como sugere a concentração de SP em §3.5), esse `JOIN` vira
um `WITH RECURSIVE` — que continua barato, mas **precisa estar dentro de uma
função `SECURITY DEFINER STABLE`**, exatamente pelo motivo que o CICLO
documentou em `0010:5-9`.

---

## 5. Esboço de modelo unificado (sem SQL final)

O que segue é desenho, não migração. Nomes em português, como manda o
`AGENTS.md`. As quatro entidades da plataforma são **unidades**,
**organizações**, **vínculos** e **funções**; cargos/gestões vêm logo atrás.

### 5.1 Árvore de unidades

```
unidades
  id            uuid
  tipo          → tipos_unidade (catálogo, não enum)
  pai_id        → unidades  (nulo só na raiz)
  nome          texto
  codigo        texto, único quando presente   -- "SP-NORTE 1", número oficial
  slug          texto, único                   -- página pública, herdado do CONECTA-D
  uf / pais     -- pais para caber ibero-americanos e África latina
  endereço, contato, geo, SEO                   -- opcionais, como em CONECTA-D
  ativo, criado_em, atualizado_em
  nomes_legados text[]  (ou tabela unidade_apelidos)  -- casa os 114 textos de EVENTOS
```

```
tipos_unidade (catálogo com ordem — "é dado, não código")
  chave        'sede_internacional' | 'sede_central' | 'regional' | 'nucleo' | 'associacao_local'
  nome         "Regional Doutrinária", "Associação Local", …
  nivel        1..5 (para ordenar e validar pai)
  ativo
```

Por que catálogo e não `enum`: é a mesma lição de §3.2. Se o cliente disser
amanhã que existe "Distrito" entre Regional e Núcleo, um `INSERT` resolve; um
`ALTER TYPE` exige migração e deploy.

Invariante mínima: **`pai_id` só pode apontar para uma unidade de nível
menor**, validado por trigger contra `tipos_unidade.nivel`. E o pai nulo só é
aceito no tipo de nível 1.

### 5.2 Organizações transversais

```
organizacoes
  id, codigo (2 letras, único), nome, nome_curto, ordem, ativo
  cor_tema, logo   -- CONECTA-D já usava para identidade visual por organização
  nomes_legados    -- "Associação Pomba Branca" e "Associação Movimento Branco" na mesma linha
```

Elas **não** entram em `unidades` e **não** têm `pai_id`: atravessam a árvore, é
o que o cliente disse. O que precisa de decisão é **onde a organização se
prende** (§6-Q5); o modelo comporta as três respostas:

| Se a organização é… | Então |
|---|---|
| atributo da **pessoa** (EVENTOS, NOVOCONECTA) | `pessoa_organizacoes(pessoa_id, organizacao_id, principal boolean)` — N:N com uma marcada como principal |
| atributo da **unidade** (CONECTA-D: `associacao_local.organizacao_id`) | `unidade_organizacoes(unidade_id, organizacao_id)` — N:N |
| atributo do **vínculo** | coluna `organizacao_id` em `pessoa_unidade_vinculos` (§5.3) |

A terceira é a mais expressiva e engloba as outras duas ("Fulano é da Juventude
**na AL de Campinas**"); é a que eu recomendaria se o cliente não tiver
preferência. As duas primeiras podem ser derivadas dela por view.

### 5.3 Vínculo pessoa ↔ unidade, com histórico

```
pessoa_unidade_vinculos
  id, pessoa_id → pessoas
  unidade_id    → unidades
  organizacao_id → organizacoes (anulável; ver §5.2)
  tipo          'membro' | … (herdado do VinculoAl de NOVOCONECTA)
  data_inicio   date not null
  data_fim      date null          -- null = vigente
  motivo        text               -- transferência é ato institucional (CONECTA-D)
  registrado_por → pessoas
```

- Vínculo vigente = `data_fim is null`. Uma view `pessoa_unidade_atual` faz o
  `distinct on (pessoa_id)` como o CICLO já faz para função (`0002:57-67`).
- **`pessoas` não ganha `unidade_id`.** A redundância de NOVOCONECTA (§4.1) é o
  erro a não repetir. Se a leitura doer, materializa depois — o
  `PLATAFORMA-SNI-REFERENCIA.md:851-854` já é explícito: *"Materializar depois,
  **se** a consulta doer"*.
- Quantos vínculos vigentes uma pessoa pode ter ao mesmo tempo é **pergunta ao
  cliente** (§6-Q2). O schema comporta N; um índice único parcial
  (`where data_fim is null`) impõe 1 se a resposta for "uma só".

### 5.4 Onde a "localidade do Ciclo" se encaixa

**Não vira unidade.** É agrupamento operacional do módulo, e a relação com
Regional é **N:N** (`0001:32-38`, spec `:71-73`) — o oposto de uma árvore.
Fica no schema do módulo:

```
ciclo.localidades(id, nome, slug único, ativo)
ciclo.localidade_unidades(localidade_id, unidade_id)   -- era localidade_regionais
```

Duas ressalvas de porte:
1. A FK passa a apontar para `public.unidades` em vez de `public.regionais`, e
   convém restringir por trigger a `tipo = 'regional'` — a spec diz "reúne uma ou
   mais **Regionais**", não "uma ou mais unidades quaisquer".
2. O escopo de acesso do CICLO continua sendo a **localidade**
   (`papeis.escopo_tipo='ciclo.localidade'`), não a unidade. Trocar isso agora
   reescreveria as policies do módulo sem necessidade.

### 5.5 Onde "regional/organização do participante de eventos" se encaixa

| Coluna de hoje | Vira | Observação |
|---|---|---|
| `Participant.regional` (texto, 114 valores em 2 níveis) | `pessoa_unidade_vinculos.unidade_id` | resolvido por `unidades.nomes_legados`; o que não casar fica em `pessoas.migracao_extras` com motivo, como `scripts/migrar-mysql.ts:69-77` já faz |
| `Participant.organizacao` (texto, obrigatório no checkout) | `organizacao_id` do vínculo (§5.2) | **obrigatoriedade no checkout tem de virar validação de aplicação**, não `not null` no banco — a coluna precisa aceitar nulo para os cadastros históricos |
| `Participant.associacaoLocal` (texto, sem catálogo) | segundo vínculo, ou `unidade_id` de nível mais baixo | **depende de a Sede fornecer o catálogo**; sem ele, fica em `migracao_extras` |
| `Regional.correspondeRegionalId` | `eventos.regional_correspondencias(unidade_id, corresponde_unidade_id)` | é **regra do módulo**, não hierarquia (§1.3). Nunca virar `pai_id` |
| `RegionalPromotorEmail(regionalId, promotorId, email)` | `eventos.avisos_unidade(unidade_id, promotor_id, email)` | envio pela fila `notificacoes`, não dentro da requisição (`AGENTS.md`) |
| `Promotor` | possivelmente `organizacoes` (§3.1) | **só depois de o cliente confirmar** (§6-Q6) |

### 5.6 Funções doutrinárias, nomeações, cargos e gestões

```
funcoes_doutrinarias(id, nome único, ordem única, ativo)          -- forma do CICLO
pessoa_funcao_hist(pessoa_id, funcao_id, vigencia_inicio,
                   unidade_id?, organizacao_id?, registrado_por)  -- CICLO + o "onde" do CONECTA-D
view pessoa_funcao_atual                                          -- já existe no CICLO

tipos_cargo(id, nome, tipo_unidade → tipos_unidade, organizacao_id?, ordem, ativo)
gestoes(id, nome, data_inicio, data_fim, tipo_unidade?, ativa)
cargo_ocupacoes(gestao_id, unidade_id, tipo_cargo_id, pessoa_id,
                data_inicio, data_fim, observacao)
                unique(gestao_id, unidade_id, tipo_cargo_id)
```

Ganho sobre CONECTA-D: **uma** tabela de ocupação em vez de duas espelhadas
(`cargo_regional_ocupacao` + `cargo_al_ocupacao`, `db/schema/cargos.ts:49-108`).
Com a árvore, o nível vira `unidades.tipo` e o `nivel_cargo_enum` desaparece —
inclusive o problema de ele só admitir dois níveis
(`db/schema/enums.ts:34-41`) enquanto a instituição tem quatro ou cinco.

E a `pessoa_funcao_hist` ganha `unidade_id`/`organizacao_id` porque o CONECTA-D
provou que faz falta: a migração `0004_hierarquia.sql:18-32` existe exatamente
porque a nomeação sem "onde" não respondia às perguntas da tela.

### 5.7 Alternativa (A) árvore única × (B) tabelas por nível

**(A) `unidades(tipo, pai_id)` — árvore recursiva numa tabela.**

| | |
|---|---|
| ✅ | Nível novo (Distrito, país ibero-americano, Sede Internacional como raiz) é **um `INSERT` em `tipos_unidade`**, não uma migração |
| ✅ | **Uma** FK para "onde isso aconteceu" em todo módulo futuro. Comparar com CONECTA-D, que precisa de `regional_id` **e** `associacao_local_id` **em cada tabela** — `evento` (`db/schema/eventos.ts:40-46`), `noticia` (`noticias.ts:79-84`), `galeria_foto` (`misc.ts:27-44`), `banner` (`0005:79-80`) — e ainda de um `check` de exclusividade (`misc.ts:44`) para garantir que só um deles esteja preenchido |
| ✅ | Uma tabela de ocupação de cargo em vez de duas espelhadas (§5.6) |
| ✅ | Uma tela de estrutura, um CRUD, um conjunto de policies |
| ⚠️ | O RLS que "sobe a árvore" precisa de `WITH RECURSIVE` |
| ⚠️ | Nada no tipo impede `pai_id` inválido: precisa de trigger validando `tipos_unidade.nivel` |
| ⚠️ | Colunas específicas de um nível (ex.: `conta_cielo` de uma regional) ficam nulas nas outras — resolvível com `jsonb` de atributos por tipo, ou aceitando os nulos |

**(B) `sedes` / `regionais` / `nucleos` / `associacoes_locais` — uma tabela por nível.**

| | |
|---|---|
| ✅ | Cada tabela tem exatamente as colunas do seu nível; FK do pai é `not null` e não precisa de trigger |
| ✅ | Consulta de escopo é `JOIN`, sem recursão — é o que CONECTA-D faz hoje (`0001_rls:284-297`) |
| ❌ | **Nível novo = migração + código novo.** O cliente já avisou que "muitos módulos virão depois" e que Núcleo pode ou não ser nível próprio (§6-Q1) |
| ❌ | Todo módulo futuro repete N colunas de escopo + `check` de exclusividade, como CONECTA-D repetiu em 4 tabelas |
| ❌ | Ocupação de cargo, galeria, banner, notícia, evento: tudo em duplicata por nível |
| ❌ | A relação N:N da localidade do CICLO teria de apontar para uma tabela específica, travando o módulo a um nível |

**Recomendação: (A), árvore única `unidades` com `tipo` + `pai_id`.**

Os três motivos, na ordem em que pesam:

1. **A instituição não tem altura conhecida.** Três coisas já apontam para isso
   antes de o cliente responder qualquer coisa: (a) Núcleo existe na fala e em
   lugar nenhum no dado (§1.4); (b) a lista de EVENTOS mistura dois níveis na
   mesma coluna e São Paulo é visivelmente mais profunda que as outras UFs
   (§3.5); (c) o cliente disse que a Sede Central cuida de outros países, o que
   é um nível a mais ou uma raiz a mais (§1.2). Escolher (B) é apostar num
   número de níveis que ninguém confirmou — e o custo de errar em (B) é
   migração de schema com dado de produção em cima.
2. **RLS: a recursão é um custo real, mas pequeno e já pago.** A policy nunca
   consulta a árvore direto; ela chama uma função. O CICLO já tem exatamente
   esse padrão e já documentou por que ele é obrigatório: *"sem isso, uma policy
   que consulta `papeis` dispararia o RLS de `papeis`, causando recursão
   infinita"* (`supabase/migrations/0010_funcoes_autorizacao.sql:5-9`). A função
   nova, `app.unidades_no_escopo()`, é um `WITH RECURSIVE` de 8 linhas dentro de
   `SECURITY DEFINER STABLE` — mesma forma que `app.admin_localidade_ids()`
   (`0010:34-43`). O que muda é o corpo, não a arquitetura.
3. **Performance não é o gargalo aqui.** A ordem de grandeza da árvore é de
   centenas a poucos milhares de nós (114 nomes em EVENTOS, 35 localidades no
   CICLO, ~500 mil **pessoas** em NOVOCONECTA — pessoas, não unidades). Um
   `WITH RECURSIVE` sobre isso, marcado `STABLE`, é avaliado uma vez por
   comando e cabe inteiro em memória. Se algum dia doer, a saída conhecida é
   materializar o fecho transitivo numa tabela `unidade_ancestrais(unidade_id,
   ancestral_id, distancia)` mantida por trigger — e aí a policy vira um `IN`
   sem recursão nenhuma. **Isso é otimização, e a regra do projeto é medir
   antes** (`PLATAFORMA-SNI-REFERENCIA.md:853-854`).

**Duas condições para (A) não virar bagunça:**

- `tipos_unidade` é **catálogo com `nivel`**, e um trigger recusa `pai_id` cujo
  tipo não seja o nível imediatamente acima (ou acima, se a instituição
  permitir saltos — pergunta §6-Q1).
- A tabela nasce com **RLS ligada, policies, GRANT explícito e asserção no
  harness**, como o `AGENTS.md` exige. Leitura livre para autenticado (é
  referência, como no CICLO, `0011:57-60`), escrita só com `estrutura.gerir`.

**Onde (B) continua certo, e vai continuar:** `locais` (§1.8). Local é recurso
físico, não unidade institucional. CONECTA-D tentou enfiar os dois no mesmo
conceito com `local_tipo_enum('regional','al','outro')`
(`db/schema/enums.ts:52`) e teve de criar `academia` numa migração posterior
(`0005:13-36`). Não repetir.

### 5.8 Esboço em uma figura

```
                 tipos_unidade (catálogo, com nivel)
                        ▲
                        │ tipo
   organizacoes ····  unidades ──pai_id──┐        locais (recurso físico,
   (transversais)        ▲   ▲           │         FORA da árvore)
        ·                │   └───────────┘
        ·                │
        ·        pessoa_unidade_vinculos ──── pessoas ──── papeis(escopo_tipo, escopo_id)
        ·        (data_inicio/fim, motivo,       │              │
        ·         organizacao_id?)               │              └── capacidade (matriz)
        ·                                        │
        └···· cargo_ocupacoes ── gestoes         ├── pessoa_funcao_hist ── funcoes_doutrinarias
                    │                            │        (vigencia_inicio, unidade?, org?)
                    └── tipos_cargo              │
                                                 ├── ciclo.*   (localidades N:N unidades)
                                                 └── eventos.* (inscricoes, correspondencias)
```

---

## 6. Perguntas que só o cliente responde

Cada uma com o que **muda no schema** conforme a resposta. Estas são as que
travam a migration da plataforma; as de identidade (CPF, e-mail) já estão nos
ADRs 0002 e 0004.

**Q1 — Núcleo é um nível próprio? Se sim, filho de quem?**
Hoje "Núcleo" só existe na fala e como nome antigo de uma coluna de texto
(§1.4).
- *Núcleo = sinônimo regional de Associação Local* → 3 níveis abaixo da Sede
  Central; `tipos_unidade` ganha um apelido, não uma linha.
- *Núcleo é filho de Regional, irmão da AL* → 4 níveis, com dois tipos no mesmo
  `nivel`; o trigger de `pai_id` aceita os dois.
- *Núcleo é filho de Associação Local* → 5 níveis; a árvore fica mais funda que
  qualquer sistema existente, e a alternativa (B) do §5.7 fica inviável.

**Q2 — Uma pessoa pertence a quantas unidades ao mesmo tempo?**
- *Uma só* → índice único parcial em `pessoa_unidade_vinculos` (`where data_fim
  is null`); toda transferência **fecha** o vínculo anterior. É o modelo de
  CONECTA-D (`pessoa.al_vinculada_id`, um só).
- *Várias* (mora numa AL, participa da Juventude em outra) → sem índice único;
  a tela precisa de "vínculo principal" e todo relatório por unidade tem de
  dizer se conta por vínculo ou por pessoa.

**Q3 — A Sede Internacional entra na árvore?**
- *Fora* → raiz é a Sede Central (`nivel = 1`); nada muda no código.
- *Dentro, como raiz sem operação* → `tipos_unidade` ganha `sede_internacional`
  com `nivel = 1`, e toda função de escopo passa a ter um nó a mais para subir
  (custo zero em (A); em (B) seria tabela nova).

**Q4 — Países ibero-americanos e África latina: são "regionais" da Sede Central?**
- *Sim* → `unidades.pais` (char 2) como em CONECTA-D
  (`db/schema/organizacao.ts:56`), mais `idioma_primario` e `fuso_horario`; e a
  interface precisa de es-419 (CONECTA-D já tinha pt-BR/es, `README.md:25`).
- *Não, é outro tipo de unidade* → um `tipo` novo entre Sede Central e Regional.
- *Fora do escopo do SNI Conecta* → `uf char(2)` basta, como no CICLO
  (`0001:17`), e a plataforma nasce só-Brasil.

**Q5 — Organização é atributo da pessoa, da unidade ou do vínculo?**
As três respostas estão implementadas em algum sistema (§1.6), e são
incompatíveis entre si.
- *Da pessoa* (EVENTOS, NOVOCONECTA) → `pessoa_organizacoes` N:N, ou coluna
  única se for uma só.
- *Da unidade* (CONECTA-D, `associacao_local.organizacao_id`) → `unidade_organizacoes`.
- *Do vínculo* → coluna em `pessoa_unidade_vinculos`; engloba as outras duas.
Muda também o relatório de EVENTOS: hoje ele agrupa por
`Participant.organizacao` cru (`api/stats/route.ts:16-40`).

**Q6 — "Promotor" de EVENTOS é a Organização doutrinária?**
O comentário do código diz "o presidente da regional PROSPERIDADE não é o mesmo
de JOVENS" (`migrate:1269-1274`), e Prosperidade/Jovens são nomes de
organizações (§3.1).
- *Sim* → `Promotor` some como cadastro do módulo; vira FK para
  `public.organizacoes`, e `RegionalPromotorEmail` vira
  `avisos(unidade_id, organizacao_id, email)`.
- *Não, promotor é quem organiza o evento comercialmente* → continua tabela do
  módulo `eventos`, e a coincidência de nomes é acidente de cadastro.

**Q7 — O que significa UAP, e o Presidente de UAP é cargo institucional?**
Nenhum dos cinco repositórios expande a sigla (§1.14).
- *É o presidente de uma unidade* (Regional/AL/Núcleo) → sai de `papeis` e vira
  `tipos_cargo` + `cargo_ocupacoes` (§5.6); o acesso passa a ser **derivado** do
  cargo, como em CONECTA-D (`0001_rls:239-298`), e não concedido à mão.
- *É papel específico do Ciclo* → continua `papeis.tipo = 'presidente_uap'` com
  escopo `ciclo.localidade`, e some da plataforma.

**Q8 — Qual lista de funções doutrinárias vale: 11 (CICLO) ou 9 (CONECTA-D)?**
Os 7 graus de Preletor casam; a divergência é toda na base (§3.2).
- *11* → seed do CICLO entra como está.
- *9* → `Simpatizante`, `Adepto` e `Divulgador Autorizado` saem, e `Associado`
  entra na posição 1 — e é preciso um mapa para os históricos que já usem os
  nomes antigos.
- *Outra* → só o formato (tabela com `ordem`, não enum) fica decidido.

**Q9 — Quais nomes das quatro organizações são os atuais?**
CB/AM/AS/JU (CONECTA-D) ou Prosperidade/Fraternidade/Pomba Branca/Jovens
(EVENTOS)? São nomes diferentes, e só um par é seguro (§3.1). Precisa-se do
**mapa de-para**, não só da lista: os dois vocabulários já existem em dado
gravado.

**Q10 — Quem fornece o catálogo oficial de unidades, e em que nível está cada
um dos 114 nomes de EVENTOS?**
Sem isso, os +16 mil participantes ficam com a estrutura em
`migracao_extras` (`scripts/migrar-mysql.ts:69-77`) e nenhum relatório por
unidade funciona depois da virada. O que o cliente precisa entregar: a lista
oficial com **nível, pai e código**, e a confirmação de que a numeração das
regionais tem buracos de verdade (faltam `PR-PARANÁ 3` e `4`, §3.5) ou se a
lista de EVENTOS é que está incompleta.

**Q11 — A unidade tem página pública?**
CONECTA-D dá slug único, SEO, OG e galeria a Regional e AL
(`db/schema/organizacao.ts:55,72-74,113-115`); o CICLO dá slug só à localidade
(`0001:26`). Se a plataforma vai ter site público por unidade, `slug`,
`slug_redirect` (`db/schema/organizacao.ts:133-141`) e as colunas de SEO entram
já na migration — retrofitar slug depois quebra URL.

---

## 7. Riscos que este estudo deixa registrados

1. **A coluna `Participant.regional` mistura dois níveis** (§3.5). Migrar isso
   como se fosse "regional" corrompe todo relatório por unidade. Precisa de
   catálogo com nível antes da virada.
2. **Três listas de regional e duas de organização em produção**, nenhuma
   canônica (§3.6, §3.1). Renomear uma regional em EVENTOS hoje desliga o aviso
   por e-mail de todos os participantes com o nome antigo
   (`regional-emails.ts:88-95`).
3. **`associacaoLocal` não tem catálogo nenhum** em lugar nenhum (§1.5).
   É texto digitado. A qualidade desse dado é desconhecida — e `contagens.sql`
   ainda não conta valores distintos dessa coluna
   (`scripts/contagens.sql:28` conta só regional e organização).
4. **UAP sem significado documentado** (§1.14) e `presidente_uap` já gravado
   como `check` constraint no CICLO e como tipo no esqueleto
   (`sniconecta/src/lib/permissoes.ts:20`). Se for cargo institucional, isso é
   dívida desde o primeiro dia.
5. **`pessoa.funcao_doutrinaria` (enum) × `pessoa_nomeacao.tipo` (varchar) em
   CONECTA-D podem divergir em silêncio** (§3.2). Se algum dia esse dado for
   importado, os dois campos precisam ser reconciliados, não copiados.
6. **CodSNI gerado × CodSNI externo**: NOVOCONECTA gera `SNI000001` por
   sequence e chama de imutável (`CLAUDE.md:111,385`); os outros três recebem o
   número da SNI. Se alguém trouxer dado de NOVOCONECTA, os dois espaços de
   identificador colidem.
7. **Nenhum sistema modela Sede Internacional nem os países ibero-americanos**
   (§1.1, §1.2). Isso não é lacuna de implementação: é escopo que nunca foi
   pedido a nenhum deles. Entrar agora é decisão nova.

