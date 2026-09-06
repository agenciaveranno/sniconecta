# Módulo Ciclo — esquema do banco (estudo para a reescrita)

Estudo exaustivo do esquema Postgres/Supabase do **Ciclo de Estudos da
Prosperidade** (`/home/user/sistema-ciclo`), escrito para servir de base à
reescrita como módulo `ciclo` do SNI Conecta. Tudo aqui foi lido dos arquivos
e conferido mecanicamente; onde algo não foi encontrado, está dito.

## 0. Fontes, método e números

| Fonte | Caminho | Linhas |
|---|---|---|
| Migrations 0001–0023 | `/home/user/sistema-ciclo/supabase/migrations/*.sql` | 2.665 |
| Bundle gerado | `/home/user/sistema-ciclo/supabase/bundle.sql` | 2.667 (concatenação literal das 23 + registro em `supabase_migrations.schema_migrations`, linhas 2619-2632) |
| Incremental 0016–0022 | `/home/user/sistema-ciclo/supabase/incremental-0016-0022.sql` | 735 (mesmo conteúdo das migrations 0016-0022, para bancos que já tinham 0001-0015) |
| Config CLI | `/home/user/sistema-ciclo/supabase/config.toml` | 32 |
| Harness de RLS | `/home/user/sistema-ciclo/scripts/testar-rls.sh` | 233 |
| Primeiro acesso da Sede | `/home/user/sistema-ciclo/scripts/criar-sede.sql` | 90 |
| Plano de fundação | `/root/.claude/uploads/.../1accfd11-SNICONECTAFUNDACAO.md` | — |

**Método.** Além da leitura, subi um Postgres 16 descartável com o mesmo stub
do Supabase que `testar-rls.sh:38-49` usa (papéis `anon`/`authenticated`/
`service_role bypassrls`, `auth.users`, `auth.uid()`), apliquei as 23
migrations em ordem com `ON_ERROR_STOP` e extraí do catálogo o estado
**final**: colunas, constraints, índices, policies, privilégios efetivos por
papel, funções, view, sequence, triggers e comentários. Tudo o que está nas
seções 1 a 3 reflete esse estado final, não a intenção declarada em cada
arquivo — quando as duas coisas divergem, a divergência está apontada (§8).

**Números verificados (estado final após 0023):**

| O quê | Quantidade |
|---|---|
| Tabelas em `public` | **50** (todas com RLS habilitado) |
| Views | 1 (`pessoa_funcao_atual`, `security_invoker = true`) |
| Policies | 84 |
| Funções `app.*` | 12 |
| Funções `public.*` próprias | 4 (`tg_set_atualizado_em`, `dispensar_prerequisito`, `recusar_prerequisito`, `proximo_numero_certificado`) |
| Sequences | 1 (`certificado_seq`) |
| Triggers | 4 (todos `tg_set_atualizado_em`) |
| Comentários (`comment on`) | 10 |
| Chaves estrangeiras | 72 |
| Extensões | `pgcrypto`, `citext` (0001:7-8) |
| Schemas próprios | `app` (0010:11) |

**Divergências entre o plano de fundação e este checkout** (para ninguém
procurar o que não está aqui):

- O plano (§4) fala em "24 migrations" e "54 tabelas". O checkout tem **23**
  migrations e **50** tabelas.
- O plano (§1.3) lista `configuracao_email` entre as tabelas compartilhadas.
  **Não existe** em nenhuma migration nem no código: a configuração de e-mail
  e WhatsApp do Ciclo vem de variáveis de ambiente (`RESEND_API_KEY`,
  `EMAIL_REMETENTE`, `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  em `src/lib/comunicacao/index.ts`).
- O plano (§2.1) cita `src/lib/cripto.ts` no Ciclo. Não existe em
  `/home/user/sistema-ciclo/src/lib` (existe no esqueleto do SNI Conecta,
  `src/lib/cripto.ts`, escrito pela sessão de eventos).
- Conclusão provável: o plano descreve um estado do repositório do Ciclo
  posterior a este checkout (uma 24ª migration com `configuracao_email` e
  credencial cifrada). Quem for consolidar deve conferir o `main` remoto
  antes de fechar a lista.

## 1. Visão geral e convenções

### 1.1 Convenções que valem para todo o esquema

| Convenção | Onde está fixada |
|---|---|
| Chave primária `uuid default gen_random_uuid()` em toda tabela de entidade; tabelas de ligação usam PK composta | todas as migrations |
| Dinheiro **sempre em centavos, `integer`**; percentuais em `numeric(5,2)`; MDR em `numeric(5,3)` | 0001:75-79, 0004, 0005, 0023:89-93 |
| `citext` para e-mail (`pessoas.email`, `locais.email`) | 0001:8, 0001:51, 0002:18 |
| `text` + `check (... in (...))` em vez de enum, em todo campo de status/tipo | 0001:82-83, 0002:79-80, 0004:14,53-54, 0005:24,28,30-31,48, 0007:39-40, 0009:12-13,45, 0015:95,192-193, 0020, 0022:24,31-32, 0023:87-88,114-115,151-152 |
| Listas configuráveis viram **tabela, não enum** (`funcoes_doutrinarias`, `tipos_turma`) | 0002:34-35, 0003:6 |
| `criado_em timestamptz not null default now()`; `atualizado_em` só onde há trigger | ver §3.4 |
| RLS habilitado em **todas** as 50 tabelas | 0011:16-51, 0015:217-227, 0020:42,84,117, 0022:47, 0023:167-168 |
| `anon` sem privilégio em tabela alguma; público é servido pelo servidor com `service_role` | 0014:16-19, 63-66 |
| Funções de autorização no schema `app`, `security definer` + `stable`, `set search_path = public` | 0010:5-8 |
| Escrita administrativa via Server Action com `service_role` + linha em `auditoria` | 0011:10-12 |
| `create table if not exists` / `add column if not exists` só a partir da 0020 (antes, `create table` seco) | 0020, 0021, 0022, 0023 |

### 1.2 Mapa das migrations (o que cada uma cria ou muda)

| # | Arquivo | Cria | Altera / desfaz |
|---|---|---|---|
| 0001 | `extensions_e_organizacao` | extensões; `regionais`, `localidades`, `localidade_regionais`, `locais`, `local_fotos`, `edicoes` | — |
| 0002 | `pessoas` | `pessoas`, `funcoes_doutrinarias`, `pessoa_funcao_hist`, view `pessoa_funcao_atual`, `papeis`, função `tg_set_atualizado_em`, trigger em `pessoas` | — |
| 0003 | `turmas_prerequisitos` | `tipos_turma`, `tipo_turma_prereq`, `equivalencias`, `turmas`, `turma_professores` | — |
| 0004 | `matriculas_descontos` | `regras_desconto`, `matriculas` (+trigger), `dispensas_prereq` | — |
| 0005 | `pagamentos` | `localidade_credenciais_cielo`, `pagamentos` (+trigger), `split_registros`, `webhooks_cielo` | — |
| 0006 | `aulas_video_progresso` | `aulas`, `progresso_video` | **inteira desfeita pela 0015** (as duas tabelas são dropadas) |
| 0007 | `presenca_provas_certificados` | `presencas`, `provas`, `questoes`, `tentativas`, `certificados` | `presencas` dropada e recriada na 0015 |
| 0008 | `landing_pages` | `landing_pages`, `landing_versoes` | — |
| 0009 | `importacao_auditoria` | `importacoes`, `importacao_conflitos`, `historico_turma`, `auditoria`, `consentimentos_lgpd` | — |
| 0010 | `funcoes_autorizacao` | schema `app`; 8 funções | — |
| 0011 | `rls_policies` | RLS em 35 tabelas + ~70 policies | policies de `aulas`/`progresso_video`/`presencas` somem com as tabelas na 0015 |
| 0012 | `seed_referencias` | seeds de `funcoes_doutrinarias`, `tipos_turma`, `tipo_turma_prereq`, `equivalencias` | — |
| 0013 | `view_security_invoker` | — | recria `pessoa_funcao_atual` com `security_invoker` (corrige 0002) |
| 0014 | `grants_explicitos` | GRANTs, default privileges, revoke de `anon` | — |
| 0015 | `apostila_e_grade` | `ciclo_anos`, `apostilas`, `apostila_etapas`, `apostila_aulas`, `aulas_complementares`, `grades`, `grade_etapas`, `grade_etapa_orientadores`, `grade_aulas`; recria `presencas`, `progresso_video` | **drop** `presencas`, `progresso_video`, `aulas` (0015:181-183) |
| 0016 | `permissoes_por_papel` | `app.tem_papel_na_localidade`, `app.pode_coordenar`, `app.pode_orientar`, `app.pode_conduzir` | reescreve 6 policies de escrita da 0011 |
| 0017 | `dispensa_prerequisito` | `public.dispensar_prerequisito`, `public.recusar_prerequisito` | troca o check de `matriculas.status` (+`aguardando_prerequisito`) |
| 0018 | `presenca` | índice `idx_matriculas_turma_status` | reescreve `presencas_write` (0015) para `pode_conduzir` |
| 0019 | `progresso_video_somente_leitura` | policies `progresso_select`, `progresso_select_equipe` | **drop** `progresso_self` (0015); revoke escrita de `authenticated` |
| 0020 | `provas` | `questao_gabarito`, `respostas`, `criterios_aprovacao`; colunas em `provas` e `tentativas` | reescreve `questoes_select`/`questoes_write` (0011); revoke escrita em `respostas` |
| 0021 | `certificados` | `certificado_seq`, `public.proximo_numero_certificado`; 8 colunas em `certificados`; índice único `numero` | recria `certificados_select` (igual à 0011); revoke escrita |
| 0022 | `notificacoes` | `notificacoes` | — |
| 0023 | `configuracoes` | `configuracoes` (singleton, com a linha 1 inserida), `solicitacoes_exclusao`; 4 colunas de override em `localidades` | — |

### 1.3 Modelo de privilégios (estado final, verificado)

| Papel | Schema `public` | Schema `app` | Tabelas | Funções |
|---|---|---|---|---|
| `anon` | `USAGE` (0014:31) | `USAGE` (0010:91) | **nenhum privilégio** em nenhuma das 50 tabelas nem na view (0014:63-66 + revokes locais) | `EXECUTE` em todas as `app.*` (0010:92, 0016:59, e o `PUBLIC` padrão nunca foi revogado); **sem** `EXECUTE` nas 3 funções `public` de negócio |
| `authenticated` | `USAGE` | `USAGE` | `SELECT, INSERT, UPDATE, DELETE` em **47** tabelas e na view; **só `SELECT`** em `certificados`, `progresso_video`, `respostas` | `EXECUTE` em todas as `app.*`; em `dispensar_prerequisito`, `recusar_prerequisito` |
| `service_role` | `USAGE` | — (não recebeu `USAGE` explícito em `app`; `bypassrls` torna irrelevante) | tudo (`arwdDxt`) em todas | `EXECUTE` em `proximo_numero_certificado` (única) |

Default privileges registrados em `pg_default_acl` (0014:50-57): tabelas →
`authenticated=arwd`, `service_role=arwdDxt`; sequences → `authenticated`,
`service_role` = `rU`. **Não há** default privilege para `anon`.

⚠️ A consequência prática, que aparece várias vezes no inventário: como o
default privilege dá `INSERT/UPDATE/DELETE` a `authenticated` em toda tabela
nova, um `grant select on X to authenticated` posterior **não restringe nada**
— só os `revoke` explícitos (0019:45, 0020:97, 0021:86) restringem. Nas demais
tabelas "só leitura", a escrita pelo cliente é barrada exclusivamente pela
**ausência de policy** de escrita (RLS nega por padrão). Ver §8.

## 2. Inventário completo das tabelas

Legenda das seções de acesso, usada em toda tabela:

- **RLS** — policies no estado final (nome · comando · papéis · `using` / `with check`). Todas são `PERMISSIVE` e `to authenticated`; `anon` e `service_role` nunca aparecem em policy (o primeiro não tem GRANT, o segundo tem `bypassrls`).
- **GRANT efetivo** — o que `information_schema.role_table_grants` devolve após a 0023. `SIUD` = `SELECT, INSERT, UPDATE, DELETE`. `service_role` tem sempre tudo e `anon` nunca tem nada; por isso só o `authenticated` é listado.
- **Efeito líquido para `authenticated`** — o cruzamento GRANT × policy: o que o navegador consegue de fato.
- **Classificação** — PLATAFORMA (sem prefixo) ou MÓDULO CICLO (nome futuro com prefixo `ciclo_`), conforme plano §1.3/§2 e AGENTS.md do SNI Conecta. Casos discutíveis estão em §4.2.
- **Uso no app** — contagem de `.from("tabela")` em `/home/user/sistema-ciclo/src` (grep), para distinguir esqueleto de regra viva.

### 2.1 Estrutura institucional

#### `regionais` — PLATAFORMA (`regionais`)

**Origem:** 0001:14-20. **Finalidade:** estrutura administrativa acima da localidade. Relação N:N com localidades, "fixa no tempo, sem versionamento" (0001:12).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `nome` | text | não | — | |
| `uf` | char(2) | não | — | sem check de formato |
| `ativo` | boolean | não | `true` | |
| `criado_em` | timestamptz | não | `now()` | |

FKs: nenhuma. Índices: só PK. Triggers: nenhum.

**RLS:** `ref_select_regionais` · SELECT · `using (true)` (0011:57-58); `ref_write_regionais` · ALL · `app.is_sede()` / `app.is_sede()` (0011:59-60).
**GRANT efetivo:** `authenticated` SIUD (0014:34-36). **Efeito líquido:** todo autenticado lê; só Sede escreve.
**Uso no app:** 4 refs.

#### `localidades` — PLATAFORMA (`localidades`) com 4 colunas do módulo (ver §5)

**Origem:** 0001:22-30; colunas de override na 0023:112-119. **Finalidade:** unidade operacional do Ciclo (as "35 localidades"). Carrega o `slug` da landing pública e, desde a 0023, os overrides de política de pagamento.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `nome` | text | não | — | |
| `slug` | text | não | — | `UNIQUE (localidades_slug_key)`; `slug_formato check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')` (0001:29) |
| `ativo` | boolean | não | `true` | |
| `criado_em` | timestamptz | não | `now()` | |
| `max_parcelas` | integer | sim | — | `check (max_parcelas is null or max_parcelas between 1 and 24)` (0023:112-113); comentário: NULO herda `configuracoes.max_parcelas_padrao` |
| `modo_pagamento` | text | sim | — | `check (null or in ('split','centralizado'))` (0023:114-115) |
| `mdr_percent` | numeric(5,3) | sim | — | `check (null or (>= 0 and < 100))` (0023:116-117) |
| `tarifa_fixa_centavos` | integer | sim | — | `check (null or >= 0)` (0023:118-119) |

FKs: nenhuma. Índices: PK, `localidades_slug_key`. Triggers: nenhum (não tem `atualizado_em`).

**RLS:** `ref_select_localidades` · SELECT · `true` (0011:62-63); `ref_write_localidades` · ALL · `app.is_sede()` (0011:64-65). Nota: os overrides de pagamento são escritos por essa mesma policy — **só a Sede** define `max_parcelas` da localidade, nunca o coordenador (confirmado em `testar-rls.sh:211-215`).
**GRANT efetivo:** SIUD. **Efeito líquido:** todos leem (inclusive `mdr_percent` e `tarifa_fixa_centavos`, que são termos comerciais); só Sede escreve.
**Uso no app:** 13 refs.

#### `localidade_regionais` — PLATAFORMA (`localidade_regionais`)

**Origem:** 0001:32-38. **Finalidade:** ligação N:N localidade ↔ regional.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `localidade_id` | uuid | não | — | FK → `localidades(id)` **on delete cascade**; parte da PK |
| `regional_id` | uuid | não | — | FK → `regionais(id)` **on delete restrict**; parte da PK |

PK composta `(localidade_id, regional_id)`. Índice `idx_localidade_regionais_regional (regional_id)`.

**RLS:** `ref_select_localidade_regionais` · SELECT · `true`; `ref_write_localidade_regionais` · ALL · `app.is_sede()` (0011:67-70).
**GRANT efetivo:** SIUD. **Efeito líquido:** todos leem; só Sede escreve.
**Uso no app:** 3 refs.

#### `locais` — PLATAFORMA (`locais`) — ver ressalva em §4.2

**Origem:** 0001:43-54. **Finalidade:** "Locais (hotéis) — entidade separada e reutilizável" (0001:41). Referenciada por `edicoes.local_id`.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `nome` | text | não | — | |
| `endereco` | text | sim | — | |
| `cep` | text | sim | — | sem check |
| `cidade` | text | sim | — | |
| `uf` | char(2) | sim | — | |
| `telefone` | text | sim | — | |
| `email` | citext | sim | — | |
| `observacoes` | text | sim | — | |
| `criado_em` | timestamptz | não | `now()` | |

FKs: nenhuma. Índices: só PK. Triggers: nenhum.

**RLS:** `ref_select_locais` · SELECT · `true`; `ref_write_locais` · ALL · `app.is_sede()` (0011:72-76).
**GRANT efetivo:** SIUD. **Efeito líquido:** todos leem; só Sede escreve.
**Uso no app:** 4 refs (`src/app/admin/locais/*`, `src/app/admin/localidades/[id]/page.tsx:71`).

#### `local_fotos` — PLATAFORMA (junto de `locais`)

**Origem:** 0001:56-63. **Finalidade:** fotos do local em Supabase Storage (0001:59).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `local_id` | uuid | não | — | FK → `locais(id)` on delete cascade |
| `storage_path` | text | não | — | caminho no Storage |
| `ordem` | integer | não | `0` | |

Índice `idx_local_fotos_local (local_id, ordem)`.

**RLS:** `ref_select_local_fotos` · SELECT · `true`; `ref_write_local_fotos` · ALL · `app.is_sede()` (0011:78-81).
**GRANT efetivo:** SIUD.
**Uso no app:** **0 refs** — tabela nunca lida nem escrita; não há bucket de Storage configurado em migration nem em código (`grep storage src` vazio).

### 2.2 Pessoas, identidade, função doutrinária e papéis

#### `pessoas` — PLATAFORMA (`pessoas`)

**Origem:** 0002:13-31; trigger 0002:112-114. **Finalidade:** cadastro único identificado por CPF; `auth_user_id` liga à conta do Supabase Auth (nulo até criar acesso).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `cpf` | text | não | — | `UNIQUE (pessoas_cpf_key)`; `cpf_11_digitos check (cpf ~ '^[0-9]{11}$')` (0002:26). DV validado só na aplicação/importador (0002:8) e em `criar-sede.sql:31-54` |
| `cod_sni` | text | não | — | `UNIQUE (pessoas_cod_sni_key)`; `cod_sni_digitos check (cod_sni ~ '^[0-9]+$')` (0002:27). "TEXT, somente dígitos, SEM limite — nunca numérico" (0002:9) |
| `nome` | text | não | — | |
| `email` | citext | não | — | `UNIQUE (pessoas_email_key)` |
| `nascimento` | date | sim | — | |
| `telefone` | text | sim | — | |
| `endereco` | text | sim | — | texto livre, um campo só |
| `auth_user_id` | uuid | sim | — | `UNIQUE (pessoas_auth_user_id_key)`; FK → `auth.users(id)` **on delete set null** |
| `criado_em` | timestamptz | não | `now()` | |
| `atualizado_em` | timestamptz | não | `now()` | mantido pelo trigger |

Índices: PK, 4 unique (`cpf`, `cod_sni`, `email`, `auth_user_id`), `idx_pessoas_auth_user (auth_user_id)` (redundante com o unique), `idx_pessoas_nome (nome)` (btree simples; não serve a busca `ilike`).
Trigger: `trg_pessoas_atualizado before update … tg_set_atualizado_em()`.

**RLS:** `pessoas_select_self` · SELECT · `app.is_sede() or auth_user_id = auth.uid()` (0011:122-127); `pessoas_update_self` · UPDATE · `auth_user_id = auth.uid() or app.is_sede()` nos dois lados (0011:129-132). **Não há policy de INSERT nem DELETE**: cadastro e exclusão só pelo servidor. Apesar do comentário em 0011:119-120 ("admin vê pessoas com papel/matrícula na sua localidade"), a policy **não** dá isso ao coordenador — a listagem administrativa é feita via `service_role`.
**GRANT efetivo:** SIUD. **Efeito líquido:** a pessoa lê e atualiza a própria linha (qualquer coluna, inclusive `cpf` e `cod_sni` — o `with check` não limita colunas); Sede lê e atualiza todas; ninguém insere/apaga pelo cliente.
**Uso no app:** 18 refs (a mais usada).

#### `funcoes_doutrinarias` — PLATAFORMA (`funcoes_doutrinarias`)

**Origem:** 0002:37-42. **Finalidade:** progressão hierárquica doutrinária, configurável; `ordem` define a hierarquia.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `nome` | text | não | — | UNIQUE |
| `ordem` | integer | não | — | UNIQUE |
| `ativo` | boolean | não | `true` | |

Seed em 0012:10-22 (11 linhas, §3.6).

**RLS:** `ref_select_funcoes` · SELECT · `true`; `ref_write_funcoes` · ALL · `app.is_sede()` (0011:83-86).
**GRANT efetivo:** SIUD. **Uso no app:** 3 refs.

#### `pessoa_funcao_hist` — PLATAFORMA (`pessoa_funcao_hist`)

**Origem:** 0002:46-55. **Finalidade:** histórico datado da função doutrinária; a "atual" é a de vigência mais recente.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `pessoa_id` | uuid | não | — | FK → `pessoas(id)` on delete cascade |
| `funcao_id` | uuid | não | — | FK → `funcoes_doutrinarias(id)` on delete restrict |
| `vigencia_inicio` | date | não | — | |
| `registrado_por` | uuid | sim | — | FK → `pessoas(id)` on delete set null |
| `criado_em` | timestamptz | não | `now()` | |

Índice `idx_pessoa_funcao_hist_pessoa (pessoa_id, vigencia_inicio desc)`. Não há unique `(pessoa_id, vigencia_inicio)`: duas linhas na mesma data são desempatadas por `criado_em desc` na view.

**RLS:** `funcao_hist_select` · SELECT · `app.is_sede() or pessoa_id = app.current_pessoa_id()` (0011:137-139); `funcao_hist_write` · ALL · `app.is_sede()` (0011:140-141).
**GRANT efetivo:** SIUD. **Efeito líquido:** a própria pessoa e a Sede leem; só a Sede escreve. Coordenador **não** vê a função doutrinária de quem se matricula na localidade dele (o motor de desconto lê via `service_role`, 0013:12-14).
**Uso no app:** 5 refs.

#### View `pessoa_funcao_atual` — PLATAFORMA

**Origem:** 0002:58-67; recriada em 0013:17-29 com `with (security_invoker = true)`. Definição final:

```sql
select distinct on (h.pessoa_id)
       h.pessoa_id, h.funcao_id, f.nome as funcao_nome, f.ordem as funcao_ordem, h.vigencia_inicio
from pessoa_funcao_hist h join funcoes_doutrinarias f on f.id = h.funcao_id
order by h.pessoa_id, h.vigencia_inicio desc, h.criado_em desc;
```

Colunas: `pessoa_id uuid`, `funcao_id uuid`, `funcao_nome text`, `funcao_ordem integer`, `vigencia_inicio date` (todas anuláveis, como em qualquer view).
**Acesso:** não tem policy própria; com `security_invoker` aplica o RLS de `pessoa_funcao_hist` e `funcoes_doutrinarias` de quem consulta. `authenticated` recebeu SIUD na view pelo `grant … on all tables` da 0014:34-36 (o `all tables` inclui views) — inócuo, a view não é atualizável (`distinct on`).
**Uso no app:** 1 ref (`src/app/l/[slug]/matricula/actions.ts:246`, com `service_role`).

#### `papeis` — PLATAFORMA (`papeis`) — com FK para tabela de módulo (ver §4.2 e §6)

**Origem:** 0002:74-100. **Finalidade:** papéis acumuláveis por pessoa; chave conceitual pessoa + localidade + edição + tipo. `sede` é nacional (localidade e edição nulas).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `pessoa_id` | uuid | não | — | FK → `pessoas(id)` on delete cascade |
| `localidade_id` | uuid | sim | — | FK → `localidades(id)` on delete cascade |
| `edicao_id` | uuid | sim | — | FK → **`edicoes(id)`** on delete cascade — tabela do módulo |
| `tipo` | text | não | — | `papeis_tipo_check`: `in ('sede','coordenador','orientador','presidente_uap','professor','aluno')` (0002:79-80) |
| `ativo` | boolean | não | `true` | |
| `criado_em` | timestamptz | não | `now()` | |

Constraint `escopo_papel check ((tipo = 'sede' and localidade_id is null) or (tipo <> 'sede' and localidade_id is not null))` (0002:85-88).
Índices únicos **parciais** (0002:92-96): `uq_papel_sede (pessoa_id, tipo) where tipo = 'sede'`; `uq_papel_local (pessoa_id, localidade_id, coalesce(edicao_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo) where tipo <> 'sede'` — o `coalesce` existe porque `NULL` não colide em unique.
Índices parciais `where ativo`: `idx_papeis_pessoa (pessoa_id)`, `idx_papeis_localidade (localidade_id)`, `idx_papeis_edicao (edicao_id)` (0002:98-100).

**RLS:** `papeis_select` · SELECT · `app.is_sede() or pessoa_id = app.current_pessoa_id() or (localidade_id is not null and localidade_id in (select app.admin_localidade_ids()))` (0011:147-153); `papeis_write` · ALL · `app.is_sede()` (0011:154-155). Nota: a matriz de `permissoes.ts:115` dá `papel.conceder` ao coordenador, mas a policy só deixa a Sede escrever — a concessão pelo coordenador passa por `service_role` na Server Action (`src/app/admin/papeis/actions.ts`).
**GRANT efetivo:** SIUD. **Efeito líquido:** a pessoa vê os seus; admin local vê os da localidade; só Sede escreve pelo cliente.
**Uso no app:** 5 refs. **`edicao_id` nunca é escrita pelo app** (grep de `edicao_id` em contexto de papel: 0 ocorrências); `criar-sede.sql:82-83` insere `null`. Coluna vestigial da ideia "papel por edição" (0002:71).

### 2.3 Auditoria, LGPD, notificações e configuração (plataforma)

#### `auditoria` — PLATAFORMA (`auditoria`)

**Origem:** 0009:59-72. **Finalidade:** trilha de ações sensíveis (Sede agindo por localidade, acesso a dado pessoal, estornos…).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `ator_id` | uuid | sim | — | FK → `pessoas(id)` on delete set null |
| `acao` | text | não | — | livre; valores usados pelo app e pelo SQL em §7.5 |
| `entidade` | text | não | — | nome da tabela (`'matriculas'`, `'pessoas'`, `'papeis'`, `'importacoes'`) |
| `entidade_id` | uuid | sim | — | |
| `motivo` | text | sim | — | |
| `antes_jsonb` | jsonb | sim | — | |
| `depois_jsonb` | jsonb | sim | — | |
| `criado_em` | timestamptz | não | `now()` | |

Índices: `idx_auditoria_entidade (entidade, entidade_id)`, `idx_auditoria_ator (ator_id, criado_em desc)`.

**RLS:** `auditoria_select_sede` · SELECT · `app.is_sede()` (0011:358-359). Sem policy de escrita.
**GRANT efetivo:** SIUD (0014). **Efeito líquido:** Sede lê; nenhuma escrita pelo cliente (barrada por ausência de policy, não por revoke). As funções `dispensar_prerequisito`/`recusar_prerequisito` (security definer) inserem aqui (0017:85-86, 114-115).
**Uso no app:** 7 refs (todos `insert` via `service_role`).

#### `consentimentos_lgpd` — PLATAFORMA (`consentimentos_lgpd`)

**Origem:** 0009:78-87. **Finalidade:** base legal explícita: data, versão do texto, IP, user-agent.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `pessoa_id` | uuid | não | — | FK → `pessoas(id)` on delete cascade |
| `versao_texto` | text | não | — | |
| `ip` | inet | sim | — | |
| `user_agent` | text | sim | — | |
| `criado_em` | timestamptz | não | `now()` | |

Índice `idx_consentimentos_pessoa (pessoa_id, criado_em desc)`.

**RLS:** `consentimento_select` · SELECT · `app.is_sede() or pessoa_id = app.current_pessoa_id()` (0011:362-364). Sem policy de escrita.
**GRANT efetivo:** SIUD. **Efeito líquido:** própria pessoa e Sede leem; escrita só pelo servidor.
**Uso no app:** 1 ref.

#### `notificacoes` — PLATAFORMA (`notificacoes`)

**Origem:** 0022:21-41. **Finalidade:** fila de e-mail/WhatsApp com idempotência e trilha de custo (0022:4-18).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `pessoa_id` | uuid | sim | — | FK → `pessoas(id)` on delete set null |
| `canal` | text | não | — | `check in ('email','whatsapp')` |
| `template` | text | não | — | livre; app usa `'matricula_confirmada'`, `'certificado_liberado'` |
| `destino` | text | não | — | e-mail ou telefone E.164 |
| `variaveis` | jsonb | não | `'[]'` | |
| `assunto` | text | sim | — | |
| `corpo` | text | não | — | |
| `status` | text | não | `'pendente'` | `check in ('pendente','enviada','falhou','cancelada')` |
| `tentativas` | integer | não | `0` | |
| `ultimo_erro` | text | sim | — | |
| `chave_unica` | text | sim | — | UNIQUE (`notificacoes_chave_unica_key`); app usa `matricula:<id>`, `certificado:<matricula_id>` |
| `criado_em` | timestamptz | não | `now()` | |
| `enviado_em` | timestamptz | sim | — | |

Índices: `idx_notificacoes_pendentes (status, criado_em) where status = 'pendente'`, `idx_notificacoes_pessoa (pessoa_id)`. Comentário na tabela (0022:68-71).

**RLS:** `notificacoes_select` · SELECT · `app.is_sede() or pessoa_id = app.current_pessoa_id() or exists (matrícula da pessoa numa turma cuja localidade `app.pode_conduzir`)` (0022:52-62). Sem policy de escrita.
**GRANT efetivo:** **SIUD** — a 0022:64 concede só `select`, mas o default privilege da 0014 já tinha dado SIUD na criação e nada foi revogado. **Efeito líquido:** leitura pela pessoa, pela equipe que conduz a localidade dela e pela Sede; escrita barrada só pela ausência de policy.
**Uso no app:** 4 refs.

#### `configuracoes` — PLATAFORMA (`configuracoes`) — com 4 colunas de padrão de pagamento do módulo (ver §5)

**Origem:** 0023:46-107. **Finalidade:** singleton nacional (`check (id = 1)`) com controlador, DPO, políticas públicas e padrões de pagamento. A linha `id = 1` é inserida pela própria migration (0023:107).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | smallint | não | `1` | PK; `configuracoes_id_check check (id = 1)` |
| `controlador_razao_social` | text | sim | — | |
| `controlador_cnpj` | text | sim | — | sem check |
| `controlador_endereco` | text | sim | — | |
| `controlador_email` | text | sim | — | |
| `dpo_nome` | text | sim | — | |
| `dpo_email` | text | sim | — | |
| `dpo_telefone` | text | sim | — | |
| `politica_retencao` | text | não | texto de 5 frases (0023:62-67) | |
| `politica_cancelamento` | text | não | texto com CDC art. 49 (0023:69-76) | |
| `prazo_arrependimento_dias` | integer | não | `7` | `check (>= 0)` |
| `max_parcelas_padrao` | integer | não | `12` | `check (between 1 and 24)` |
| `modo_pagamento_padrao` | text | não | `'centralizado'` | `check in ('split','centralizado')` |
| `mdr_percent_padrao` | numeric(5,3) | não | `0` | `check (>= 0 and < 100)` |
| `tarifa_fixa_centavos_padrao` | integer | não | `0` | `check (>= 0)` |
| `atualizado_em` | timestamptz | não | `now()` | **sem trigger** — o app grava à mão |
| `atualizado_por` | uuid | sim | — | FK → `pessoas(id)` on delete set null |

Comentário na tabela (0023:101-102).

**RLS:** `configuracoes_select` · SELECT · `true` (0023:175-176); `configuracoes_write` · ALL · `app.is_sede()` (0023:179-181).
**GRANT efetivo:** SIUD (0023:194). **Efeito líquido:** todo autenticado lê (inclusive MDR); só Sede escreve. Verificado em `testar-rls.sh:205-216`.
**Uso no app:** 5 refs; leitura sempre via `service_role` em `src/lib/configuracao/index.ts:46-51`.

#### `solicitacoes_exclusao` — PLATAFORMA (`solicitacoes_exclusao`)

**Origem:** 0023:140-162. **Finalidade:** pedido de eliminação (LGPD art. 18, VI) registrado com decisão; **não executa** a exclusão (0023:130-138).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `pessoa_id` | uuid | sim | — | FK → `pessoas(id)` on delete set null |
| `nome_informado` | text | não | — | sobrevive à exclusão da pessoa |
| `email_informado` | text | não | — | |
| `cpf_informado` | text | sim | — | sem check de formato |
| `motivo` | text | sim | — | |
| `status` | text | não | `'recebida'` | `check in ('recebida','em_analise','atendida','recusada')` |
| `decisao` | text | sim | — | |
| `decidido_por` | uuid | sim | — | FK → `pessoas(id)` on delete set null |
| `decidido_em` | timestamptz | sim | — | |
| `origem_ip` | inet | sim | — | |
| `criado_em` | timestamptz | não | `now()` | |

Índice `idx_solicitacoes_exclusao_status (status, criado_em)`.

**RLS:** `solicitacoes_exclusao_sede` · ALL · `app.is_sede()` (0023:187-189). O titular **não** lê o próprio pedido (0023:183-185).
**GRANT efetivo:** SIUD (0023:195). **Uso no app:** 4 refs.

### 2.4 Catálogo nacional do Ciclo (Sede escreve, todos leem)

#### `tipos_turma` — MÓDULO CICLO → `ciclo_tipos_turma`

**Origem:** 0003:8-13. **Finalidade:** tipos de turma como DADO (Uniclass, Especial ativos; Níveis 1-4 históricos inativos).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `nome` | text | não | — | UNIQUE |
| `ordem` | integer | não | — | **não** é unique (diferente de `funcoes_doutrinarias.ordem`) |
| `ativo` | boolean | não | `true` | |

Seed em 0012:25-32 (§3.6).
**RLS:** `ref_select_tipos_turma` · SELECT · `true`; `ref_write_tipos_turma` · ALL · `app.is_sede()` (0011:88-91). **GRANT:** SIUD. **Uso:** 6 refs.

#### `tipo_turma_prereq` — MÓDULO CICLO → `ciclo_tipo_turma_prereq`

**Origem:** 0003:17-22. **Finalidade:** pré-requisito explícito e editável entre tipos (permite cadeias não lineares).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `tipo_id` | uuid | não | — | FK → `tipos_turma(id)` on delete cascade; PK |
| `tipo_prerequisito_id` | uuid | não | — | FK → `tipos_turma(id)` on delete restrict; PK |

Constraint `nao_autorreferente check (tipo_id <> tipo_prerequisito_id)`. Seed: Especial exige Uniclass (0012:35-39).
**RLS:** `ref_select_prereq` · `true`; `ref_write_prereq` · `app.is_sede()` (0011:93-96). **GRANT:** SIUD. **Uso:** 1 ref.

#### `equivalencias` — MÓDULO CICLO → `ciclo_equivalencias`

**Origem:** 0003:27-31. **Finalidade:** nome histórico ("Nível 3") → tipo atual; `tipo_turma_id` nulo = ainda não mapeado pela Sede.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `nome_original` | text | não | — | UNIQUE |
| `tipo_turma_id` | uuid | sim | — | FK → `tipos_turma(id)` on delete set null |

Seed: Nível 1..4 com destino `null` (0012:45-50).
**RLS:** `ref_select_equivalencias` · `true`; `ref_write_equivalencias` · `app.is_sede()` (0011:98-101). **GRANT:** SIUD. **Uso:** 2 refs (importador e motor de pré-requisito).

#### `ciclo_anos` — MÓDULO CICLO → `ciclo_anos` (já tem o prefixo; manter)

**Origem:** 0015:28-35. **Finalidade:** ano do Ciclo com tema-central configurável pela Sede.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `ano` | integer | não | — | UNIQUE |
| `tema_central` | text | não | — | |
| `descricao` | text | sim | — | |
| `ativo` | boolean | não | `true` | |
| `criado_em` | timestamptz | não | `now()` | |

⚠️ Não há FK entre `edicoes.ano` / `regras_desconto.edicao_ano` (inteiros) e `ciclo_anos.ano`: a ligação edição ↔ ano do Ciclo é por valor, não por chave.
**RLS:** `ciclo_anos_select` · `true`; `ciclo_anos_write` · `app.is_sede()` (0015:231-234). **GRANT:** SIUD (0015:346-350 + default). **Uso:** 7 refs.

#### `apostilas` — MÓDULO CICLO → `ciclo_apostilas`

**Origem:** 0015:40-50. **Finalidade:** apostila por ano e por tipo de turma.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `ciclo_ano_id` | uuid | não | — | FK → `ciclo_anos(id)` on delete cascade |
| `tipo_turma_id` | uuid | não | — | FK → `tipos_turma(id)` on delete restrict |
| `observacoes` | text | sim | — | |
| `criado_em` | timestamptz | não | `now()` | |

UNIQUE `apostila_unica_por_ano_e_tipo (ciclo_ano_id, tipo_turma_id)`. Índice `idx_apostilas_ano (ciclo_ano_id)`.
**RLS:** `apostilas_select` · `true`; `apostilas_write` · `app.is_sede()` (0015:236-239). **GRANT:** SIUD. **Uso:** 5 refs.

#### `apostila_etapas` — MÓDULO CICLO → `ciclo_apostila_etapas`

**Origem:** 0015:54-65. **Finalidade:** etapa da apostila (padrão 5, não fixo no código).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `apostila_id` | uuid | não | — | FK → `apostilas(id)` on delete cascade |
| `numero` | integer | não | — | `check (numero > 0)` |
| `tema` | text | não | — | |
| `livros_texto` | text | sim | — | |
| `criado_em` | timestamptz | não | `now()` | |

UNIQUE `etapa_numero_unico (apostila_id, numero)`; índice `idx_etapas_apostila (apostila_id, numero)` (redundante com o unique).
**RLS:** `etapas_select` · `true`; `etapas_write` · `app.is_sede()` (0015:241-244). **GRANT:** SIUD. **Uso:** 6 refs.

#### `apostila_aulas` — MÓDULO CICLO → `ciclo_apostila_aulas`

**Origem:** 0015:68-81. **Finalidade:** aula presencial da apostila, com página.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `etapa_id` | uuid | não | — | FK → `apostila_etapas(id)` on delete cascade |
| `numero` | integer | não | — | `check (numero > 0)` |
| `titulo` | text | não | — | |
| `pagina` | integer | sim | — | `check (pagina is null or pagina > 0)` |
| `criado_em` | timestamptz | não | `now()` | |

UNIQUE `apostila_aula_numero_unico (etapa_id, numero)` — nome explícito porque `aula_numero_unico` ainda pertencia à `aulas` da 0006 no momento da criação (0015:76-78). Índice `idx_apostila_aulas_etapa (etapa_id, numero)`.
**RLS:** `apostila_aulas_select` · `true`; `apostila_aulas_write` · `app.is_sede()` (0015:246-249). **GRANT:** SIUD. **Uso:** 5 refs.

#### `aulas_complementares` — MÓDULO CICLO → `ciclo_aulas_complementares`

**Origem:** 0015:89-108 (herda a decisão "provider + external_id, nunca URL" da 0006:8-9). **Finalidade:** conteúdo em vídeo, nacional, por ano, igual para todos os tipos de turma.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `ciclo_ano_id` | uuid | não | — | FK → `ciclo_anos(id)` on delete cascade |
| `numero` | integer | não | — | `check (numero > 0)` |
| `titulo` | text | não | — | |
| `descricao` | text | sim | — | |
| `video_provider` | text | sim | — | `check in ('vimeo','bunny')` |
| `video_external_id` | text | sim | — | |
| `duracao_segundos` | integer | sim | — | `check (null or >= 0)` |
| `liberada` | boolean | não | `false` | |
| `criado_em` | timestamptz | não | `now()` | |

UNIQUE `complementar_numero_unico (ciclo_ano_id, numero)`; `complementar_video_par_completo check ((provider null and external null) or (ambos not null))`. Índice `idx_complementares_ano (ciclo_ano_id, numero)`.
**RLS:** `complementares_select` · `true`; `complementares_write` · `app.is_sede()` (0015:251-254). **GRANT:** SIUD. **Uso:** 7 refs.

#### `criterios_aprovacao` — MÓDULO CICLO → `ciclo_criterios_aprovacao`

**Origem:** 0020:106-115. **Finalidade:** critério nacional por ano do Ciclo (o certificado é do Ciclo, não da localidade).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `ciclo_ano_id` | uuid | não | — | PK; FK → `ciclo_anos(id)` on delete cascade |
| `presenca_minima_percentual` | numeric(5,2) | não | `75` | `check (0..100)` |
| `nota_minima` | numeric(5,2) | não | `70` | `check (0..100)` |
| `video_minimo_percentual` | numeric(5,2) | não | `0` | `check (0..100)` |
| `atualizado_em` | timestamptz | não | `now()` | **sem trigger**; `src/app/admin/provas/actions.ts:150` grava à mão no upsert |

⚠️ 0020:104 diz "a linha nasce com o padrão" — mas **não há trigger nem seed** que crie a linha ao criar um `ciclo_anos`; quem cria é o upsert do app (`onConflict: "ciclo_ano_id"`).
**RLS:** `criterios_select` · `true`; `criterios_write` · `app.is_sede()` (0020:120-123). **GRANT:** SIUD (0020:152). **Uso:** 3 refs.

#### `regras_desconto` — MÓDULO CICLO → `ciclo_regras_desconto`

**Origem:** 0004:9-31. **Finalidade:** política anual nacional de desconto; não cumulativa (aplica-se a de maior valor absoluto em reais).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `edicao_ano` | integer | não | — | política anual/nacional; sem FK para `ciclo_anos` |
| `nome` | text | não | — | |
| `tipo` | text | não | — | `check in ('percentual','valor')` |
| `valor_percentual` | numeric(5,2) | sim | — | `check (null or 0..100)` |
| `valor_centavos` | integer | sim | — | `check (null or >= 0)` |
| `condicao_jsonb` | jsonb | não | `'{}'` | formato em `src/lib/dominio/desconto.ts:25-30`: `{perfil:'jovem', idadeMax}` · `{perfil:'preletor', ordemMinima?}` · `{perfil:'conjuge'}` · `{formaPagamento:'a_vista'}` · `{perfil:'todos'}` (⚠️ chaves camelCase no TS, exemplos snake_case no SQL 0004:17-18 — o TS é a verdade) |
| `compete_a_vista` | boolean | não | `false` | 1 ref no app; a competição à vista já cai da regra do máximo (desconto.ts:14-17) |
| `ativo` | boolean | não | `true` | |
| `criado_em` | timestamptz | não | `now()` | |

Constraint `valor_coerente_com_tipo check ((tipo='percentual' and valor_percentual is not null) or (tipo='valor' and valor_centavos is not null))`. Índice parcial `idx_regras_desconto_ano (edicao_ano) where ativo`.
**RLS:** `ref_select_regras_desconto` · `true`; `ref_write_regras_desconto` · `app.is_sede()` (0011:103-106). **GRANT:** SIUD. **Uso:** 4 refs.

### 2.5 Edição, turmas e matrícula

#### `edicoes` — MÓDULO CICLO → `ciclo_edicoes`

**Origem:** 0001:69-92. **Finalidade:** instância anual do Ciclo numa localidade, com preço vigente, valor da Sede e piso (tudo em centavos).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `localidade_id` | uuid | não | — | FK → `localidades(id)` on delete **restrict** |
| `ano` | integer | não | — | |
| `local_id` | uuid | sim | — | FK → `locais(id)` on delete set null |
| `preco_centavos` | integer | não | — | `check (>= 0)` |
| `valor_sede_centavos` | integer | não | — | `check (>= 0)` |
| `piso_centavos` | integer | não | — | `check (>= 0)`; `piso_cobre_sede check (piso_centavos >= valor_sede_centavos)` |
| `status` | text | não | `'rascunho'` | `check in ('rascunho','inscricoes_abertas','em_andamento','encerrada')` |
| `prerequisito_ativo` | boolean | não | `true` | 8 refs no app |
| `criado_em` | timestamptz | não | `now()` | |

UNIQUE `edicao_unica_por_ano (localidade_id, ano)`. Índices `idx_edicoes_localidade (localidade_id)`, `idx_edicoes_ano (ano)`. Sem `atualizado_em`.
**RLS:** `edicoes_select` · SELECT · `true` (0011:111-112); `edicoes_write` · ALL · `app.pode_coordenar(localidade_id)` (0016:64-68; antes `pode_admin_localidade`, 0011:113-116). **GRANT:** SIUD. **Efeito líquido:** todos leem preço/piso/valor da Sede de todas as localidades; escreve Sede ou coordenador da localidade (`testar-rls.sh:143-147`). **Uso:** 8 refs.

#### `turmas` — MÓDULO CICLO → `ciclo_turmas`

**Origem:** 0003:34-43.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `edicao_id` | uuid | não | — | FK → `edicoes(id)` on delete cascade |
| `tipo_turma_id` | uuid | não | — | FK → `tipos_turma(id)` on delete restrict |
| `nome` | text | não | — | |
| `capacidade` | integer | sim | — | `check (null or > 0)`; não é imposta por trigger |
| `criado_em` | timestamptz | não | `now()` | |

Índice `idx_turmas_edicao (edicao_id)`. Não há unique `(edicao_id, nome)`.
**RLS:** `turmas_select` · SELECT · `app.is_sede() or app.edicao_localidade(edicao_id) in (select app.admin_localidade_ids()) or id in (select app.professor_turma_ids()) or id in (select turma_id from matriculas where pessoa_id = app.current_pessoa_id())` (0011:160-168 — a subconsulta em `matriculas` dispara o RLS de `matriculas`, que passa por `pode_ver_matricula`, sem recursão porque as funções são definer); `turmas_write` · ALL · `app.pode_coordenar(app.edicao_localidade(edicao_id))` (0016:73-77). **GRANT:** SIUD. **Uso:** 5 refs.

#### `turma_professores` — MÓDULO CICLO → `ciclo_turma_professores`

**Origem:** 0003:46-52. **Finalidade:** professores por turma (é o que `app.professor_turma_ids()` lê; **não** exige linha em `papeis` com tipo `professor`).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `turma_id` | uuid | não | — | FK → `turmas(id)` on delete cascade; PK |
| `pessoa_id` | uuid | não | — | FK → `pessoas(id)` on delete cascade; PK |

Índice `idx_turma_professores_pessoa (pessoa_id)`.
**RLS:** `turma_prof_select` · `app.is_sede() or pessoa_id = app.current_pessoa_id() or app.turma_localidade(turma_id) in (select app.admin_localidade_ids())` (0011:174-180); `turma_prof_write` · `app.pode_coordenar(app.turma_localidade(turma_id))` (0016:79-83). **GRANT:** SIUD. **Uso:** 2 refs.

#### `matriculas` — MÓDULO CICLO → `ciclo_matriculas`

**Origem:** 0004:34-69; check de status trocado em 0017:15-25; índice extra 0018:46. **Finalidade:** congela o que não pode mudar retroativamente (função, preço, desconto, valor da Sede).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `pessoa_id` | uuid | não | — | FK → `pessoas(id)` on delete **restrict** |
| `turma_id` | uuid | não | — | FK → `turmas(id)` on delete **restrict** |
| `funcao_snapshot_id` | uuid | sim | — | FK → `funcoes_doutrinarias(id)` on delete set null; snapshot da função na data (0004:39-41) |
| `preco_bruto_centavos` | integer | não | — | `check (>= 0)` |
| `desconto_centavos` | integer | não | `0` | `check (>= 0)` |
| `regra_desconto_id` | uuid | sim | — | FK → `regras_desconto(id)` on delete set null |
| `valor_sede_centavos` | integer | não | — | `check (>= 0)` |
| `desconto_autorizado_por` | uuid | sim | — | FK → `pessoas(id)` on delete set null; **0 refs no app** |
| `desconto_motivo` | text | sim | — | |
| `status` | text | não | `'pendente'` | `matriculas_status_check`: `in ('aguardando_prerequisito','pendente','ativa','cancelada','concluida','reprovada','desistente')` (0017:16-25); comentário na coluna (0017:27-30) |
| `criado_em` | timestamptz | não | `now()` | |
| `atualizado_em` | timestamptz | não | `now()` | trigger `trg_matriculas_atualizado` (0004:67-69) |

Constraints: `matricula_unica unique (pessoa_id, turma_id)`; `respeita_piso check (preco_bruto_centavos - desconto_centavos >= valor_sede_centavos)` (0004:61 — o piso do banco é o **valor da Sede**, não `edicoes.piso_centavos`; o piso com margem Braspag é aplicado na aplicação).
Índices: `idx_matriculas_pessoa (pessoa_id)`, `idx_matriculas_turma (turma_id)`, `idx_matriculas_turma_status (turma_id, status)` (0018:46).
**RLS:** `matriculas_select` · SELECT · `app.pode_ver_matricula(pessoa_id, turma_id)` (0011:189-191); `matriculas_write` · ALL · `app.pode_coordenar(app.turma_localidade(turma_id))` (0016:89-93). Aluno não insere a própria matrícula pelo cliente — a inscrição pública roda com `service_role` (`src/app/l/[slug]/matricula/actions.ts`). **GRANT:** SIUD. **Uso:** 16 refs.

#### `dispensas_prereq` — MÓDULO CICLO → `ciclo_dispensas_prereq`

**Origem:** 0004:73-81. **Finalidade:** dispensa de pré-requisito autorizada pelo Orientador, com quem/quando/por quê.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `matricula_id` | uuid | não | — | FK → `matriculas(id)` on delete cascade |
| `autorizado_por` | uuid | não | — | FK → `pessoas(id)` on delete **restrict** |
| `motivo` | text | não | — | |
| `criado_em` | timestamptz | não | `now()` | |

Índice `idx_dispensas_matricula (matricula_id)`. Não há unique por matrícula (pode haver mais de uma dispensa).
**RLS:** `dispensas_select` · `exists (matrícula com app.pode_ver_matricula)` (0011:197-202); `dispensas_write` · ALL · `exists (matrícula cuja localidade `app.pode_orientar`)` (0016:98-108; antes `pode_admin_localidade`, 0011:203-212). **GRANT:** SIUD. **Uso:** **0 refs diretas** — só é escrita pela função `dispensar_prerequisito` (0017:79-80), chamada por `rpc` em `src/app/admin/dispensas/actions.ts:34`.

### 2.6 Pagamento (estruturas da Fase 1; integração Cielo não implementada no app)

#### `localidade_credenciais_cielo` — MÓDULO CICLO → `ciclo_localidade_credenciais_cielo` (ver §5)

**Origem:** 0005:10-17. **Finalidade:** MerchantId/MerchantKey do subestabelecimento, cifrados; PK é a própria localidade (1:1).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `localidade_id` | uuid | não | — | PK; FK → `localidades(id)` on delete cascade |
| `merchant_id_cipher` | bytea | não | — | ciphertext |
| `merchant_key_cipher` | bytea | não | — | ciphertext |
| `subordinado_id` | text | sim | — | id no marketplace, quando homologado |
| `homologado` | boolean | não | `false` | |
| `atualizado_em` | timestamptz | não | `now()` | **sem trigger** |

**RLS:** `cred_cielo_sede` · ALL · `app.is_sede()` (0011:234-235). **GRANT efetivo:** **SIUD para `authenticated`** — a Sede logada no navegador alcança o ciphertext. Diverge da regra do SNI Conecta (AGENTS.md: "Segredo … em tabela sem GRANT para anon/authenticated"). **Uso no app:** **0 refs**; não há código de cifra no Ciclo (sem `cripto.ts`) — tabela nunca preenchida.

#### `pagamentos` — MÓDULO CICLO → `ciclo_pagamentos`

**Origem:** 0005:20-41.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `matricula_id` | uuid | não | — | FK → `matriculas(id)` on delete **restrict** |
| `meio` | text | não | — | `check in ('pix','cartao_avista','cartao_parcelado')` (boleto excluído, 0005:23) |
| `parcelas` | integer | não | `1` | `check (>= 1)`; o teto (`max_parcelas`) é só da aplicação |
| `valor_total_centavos` | integer | não | — | `check (>= 0)` |
| `modo` | text | não | `'centralizado'` | `check in ('split','centralizado')` |
| `cielo_payment_id` | text | sim | — | **0 refs no app** |
| `status` | text | não | `'pendente'` | `check in ('pendente','autorizado','pago','negado','estornado','cancelado')` |
| `criado_em` | timestamptz | não | `now()` | |
| `atualizado_em` | timestamptz | não | `now()` | trigger `trg_pagamentos_atualizado` (0005:39-41) |

Índices `idx_pagamentos_matricula (matricula_id)`, `idx_pagamentos_cielo (cielo_payment_id)`. Não há unique em `cielo_payment_id`.
**RLS:** `pagamentos_select` · SELECT · `exists (matrícula com app.pode_ver_matricula)` (0011:218-223). **Sem policy de escrita.** **GRANT:** SIUD. **Efeito líquido:** leitura por quem vê a matrícula; escrita só pelo servidor (barrada por ausência de policy). **Uso:** 2 refs.

#### `split_registros` — MÓDULO CICLO → `ciclo_split_registros`

**Origem:** 0005:45-53. **Finalidade:** uma linha por participante do split (Braspag / Sede / Localidade — três fatias, 0005:44).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `pagamento_id` | uuid | não | — | FK → `pagamentos(id)` on delete cascade |
| `participante` | text | não | — | `check in ('braspag','sede','localidade')` |
| `valor_centavos` | integer | não | — | **sem** `check (>= 0)` (única coluna monetária sem check; permite ajuste negativo) |
| `mdr_centavos` | integer | não | `0` | |

Índice `idx_split_pagamento (pagamento_id)`.
**RLS:** `split_select` · SELECT · `exists (pagamento → matrícula onde app.is_sede() or app.pode_admin_localidade(app.turma_localidade(m.turma_id)))` (0011:225-232) — o **aluno não vê** o split da própria matrícula. Sem policy de escrita. **GRANT:** SIUD. **Uso:** 1 ref.

#### `webhooks_cielo` — MÓDULO CICLO → `ciclo_webhooks_cielo`

**Origem:** 0005:56-62. **Finalidade:** idempotência dos reenvios da Cielo.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `idempotency_key` | text | não | — | UNIQUE |
| `payload` | jsonb | não | — | |
| `processado_em` | timestamptz | sim | — | |
| `recebido_em` | timestamptz | não | `now()` | |

**RLS:** habilitado (0011:37), **nenhuma policy** (0011:366-367) → nega tudo a `authenticated`. **GRANT efetivo:** `authenticated` tem SIUD (0014:34-36 concedeu "em todas as tabelas") — o privilégio existe, o RLS é a única barreira. É a **única tabela sem policy alguma**. **Uso no app:** **0 refs** — não há rota de webhook implementada no Ciclo.

### 2.7 Grade local, presença e progresso de vídeo

#### `grades` — MÓDULO CICLO → `ciclo_grades`

**Origem:** 0015:113-123. **Finalidade:** uma grade por tipo de turma dentro da edição; aponta para a apostila nacional do ano/tipo. ⚠️ Várias turmas do mesmo tipo na mesma edição compartilham a grade (0018:52-55).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `edicao_id` | uuid | não | — | FK → `edicoes(id)` on delete cascade |
| `tipo_turma_id` | uuid | não | — | FK → `tipos_turma(id)` on delete restrict |
| `apostila_id` | uuid | não | — | FK → `apostilas(id)` on delete restrict |
| `criado_em` | timestamptz | não | `now()` | |

UNIQUE `grade_unica_por_edicao_e_tipo (edicao_id, tipo_turma_id)`. Índice `idx_grades_edicao (edicao_id)`. ⚠️ Nada garante que `apostilas.tipo_turma_id = grades.tipo_turma_id` nem que o ano da apostila seja o ano da edição — coerência só na aplicação.
**RLS:** `grades_select` · `true`; `grades_write` · ALL · `app.pode_admin_localidade(app.edicao_localidade(edicao_id))` (0015:258-263 — **ainda `pode_admin_localidade`**, inclui presidente de UAP; a 0016 não reescreveu as policies de grade). **GRANT:** SIUD. **Uso:** 3 refs.

#### `grade_etapas` — MÓDULO CICLO → `ciclo_grade_etapas`

**Origem:** 0015:126-141. **Finalidade:** data e horário local de cada etapa da apostila.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `grade_id` | uuid | não | — | FK → `grades(id)` on delete cascade |
| `apostila_etapa_id` | uuid | não | — | FK → `apostila_etapas(id)` on delete restrict |
| `data` | date | sim | — | |
| `hora_inicio` | time | sim | — | |
| `hora_fim` | time | sim | — | `horario_coerente check (hora_inicio is null or hora_fim is null or hora_fim > hora_inicio)` |
| `criado_em` | timestamptz | não | `now()` | |

UNIQUE `grade_etapa_unica (grade_id, apostila_etapa_id)`. Índice `idx_grade_etapas_grade (grade_id)`.
**RLS:** `grade_etapas_select` · `true`; `grade_etapas_write` · ALL · `exists (grades g … app.pode_admin_localidade(app.edicao_localidade(g.edicao_id)))` (0015:265-276). **GRANT:** SIUD. **Uso:** 3 refs.

#### `grade_etapa_orientadores` — MÓDULO CICLO → `ciclo_grade_etapa_orientadores`

**Origem:** 0015:145-151. **Finalidade:** orientadores da etapa (até 6 — limite só na aplicação, 0015:143-144).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `grade_etapa_id` | uuid | não | — | FK → `grade_etapas(id)` on delete cascade; PK |
| `pessoa_id` | uuid | não | — | FK → `pessoas(id)` on delete **restrict**; PK |

Índice `idx_grade_orientadores_pessoa (pessoa_id)`.
**RLS:** `grade_orientadores_select` · `true`; `grade_orientadores_write` · ALL · `exists (grade_etapas ge join grades g … app.pode_admin_localidade(app.edicao_localidade(g.edicao_id)))` (0015:278-293). **GRANT:** SIUD. **Uso:** 3 refs.

#### `grade_aulas` — MÓDULO CICLO → `ciclo_grade_aulas`

**Origem:** 0015:156-170. **Finalidade:** qual orientador conduz qual aula da etapa; `orientador_id` nulo = não atribuída. É o alvo de `presencas`.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `grade_etapa_id` | uuid | não | — | FK → `grade_etapas(id)` on delete cascade |
| `apostila_aula_id` | uuid | não | — | FK → `apostila_aulas(id)` on delete restrict |
| `orientador_id` | uuid | sim | — | FK → `pessoas(id)` on delete set null |
| `atualizado_em` | timestamptz | não | `now()` | trigger `trg_grade_aulas_atualizado` (0015:168-170) |

UNIQUE `grade_aula_unica (grade_etapa_id, apostila_aula_id)`. Índice `idx_grade_aulas_etapa (grade_etapa_id)`. Não há `criado_em`.
**RLS:** `grade_aulas_select` · `true`; `grade_aulas_write` · ALL · mesmo `exists` de `grade_etapa_orientadores` (0015:295-310). **GRANT:** SIUD. **Uso:** 5 refs.

#### `presencas` — MÓDULO CICLO → `ciclo_presencas`

**Origem:** versão final 0015:185-198 (a da 0007:9-23 apontava para `aulas` e foi dropada em 0015:181). **Finalidade:** presença por matrícula × aula da grade; `origem` distingue presencial/EAD/importação; a chave única dá idempotência ao upsert da fila offline (0018:62-66).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `matricula_id` | uuid | não | — | FK → `matriculas(id)` on delete cascade |
| `grade_aula_id` | uuid | não | — | FK → `grade_aulas(id)` on delete cascade |
| `presente` | boolean | não | `false` | |
| `registrado_por` | uuid | sim | — | FK → `pessoas(id)` on delete set null |
| `registrado_em` | timestamptz | não | `now()` | |
| `origem` | text | não | `'presencial'` | `check in ('presencial','ead','importacao')` |

UNIQUE `presenca_unica (matricula_id, grade_aula_id)`; índice `idx_presencas_aula (grade_aula_id)`. ⚠️ Nada garante que a `grade_aula` pertença à grade da turma da matrícula — coerência só na aplicação.
**RLS:** `presencas_select` · SELECT · `exists (matrícula com app.pode_ver_matricula)` (0015:314-319); `presencas_write` · ALL · `exists (matrícula onde m.turma_id in (select app.professor_turma_ids()) or app.pode_conduzir(app.turma_localidade(m.turma_id)))` (0018:28-42; antes `pode_admin_localidade`, 0015:320-333). **GRANT:** SIUD. **Efeito líquido:** professor da turma, coordenador, orientador e Sede gravam pelo cliente (upsert `onConflict: "matricula_id,grade_aula_id"` em `src/app/admin/chamada/[id]/Chamada.tsx:113`). **Uso:** 3 refs.

#### `progresso_video` — MÓDULO CICLO → `ciclo_progresso_video`

**Origem:** versão final 0015:200-212 (a da 0006:34-46 apontava para `aulas`, dropada em 0015:182). **Finalidade:** progresso por pessoa × aula complementar (heartbeat 20-30 s). Comentário na tabela (0019:47-49): escrita exclusiva do servidor após validação do §9.4.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `pessoa_id` | uuid | não | — | FK → `pessoas(id)` on delete cascade |
| `aula_complementar_id` | uuid | não | — | FK → `aulas_complementares(id)` on delete cascade |
| `segundos_assistidos` | integer | não | `0` | `check (>= 0)` |
| `percentual` | numeric(5,2) | não | `0` | `check (0..100)` |
| `ultima_posicao` | integer | não | `0` | `check (>= 0)` |
| `atualizado_em` | timestamptz | não | `now()` | **sem trigger**; o upsert do servidor grava |

UNIQUE `progresso_unico (pessoa_id, aula_complementar_id)`; índice `idx_progresso_pessoa (pessoa_id)`.
**RLS:** `progresso_select` · SELECT · `app.is_sede() or pessoa_id = app.current_pessoa_id()` (0019:28-30); `progresso_select_equipe` · SELECT · `exists (matriculas m where m.pessoa_id = progresso_video.pessoa_id and (m.turma_id in professor_turma_ids or app.pode_conduzir(app.turma_localidade(m.turma_id))))` (0019:34-41 — nota: não filtra por ano/edição: quem conduz uma turma onde a pessoa **já** se matriculou vê o progresso dela em qualquer aula complementar de qualquer ano). A `progresso_self` (0015:336-339, `for all`) foi dropada em 0019:24.
**GRANT efetivo:** `authenticated` **só SELECT** (`revoke insert, update, delete` 0019:45). **Uso:** 6 refs; escrita em `src/app/api/video/progresso/route.ts:101` com `service_role`.

### 2.8 Provas e certificados

#### `provas` — MÓDULO CICLO → `ciclo_provas`

**Origem:** 0007:26-32; colunas de 0020:14-17. **Finalidade:** prova de uma edição, cronômetro validado no servidor.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `edicao_id` | uuid | não | — | FK → `edicoes(id)` on delete cascade |
| `titulo` | text | não | — | |
| `duracao_minutos` | integer | não | — | `check (> 0)` |
| `criado_em` | timestamptz | não | `now()` | |
| `publicada` | boolean | não | `false` | comentário 0020:19-21 |
| `tentativas_max` | integer | não | `2` | `check (> 0)`; não imposto por trigger |
| `embaralhar` | boolean | não | `true` | |

Sem índice em `edicao_id` (único sem índice de FK entre as tabelas filhas de `edicoes`).
⚠️ Contradição de modelo: a prova é **por edição** (local), mas o gabarito e as questões são "conteúdo nacional, só a Sede" (0020:44-46, 142-144). O coordenador cria a prova (`provas_write`) mas não consegue criar questões nela.
**RLS:** `provas_select` · `true` (0011:277-278 — aluno vê provas não publicadas de todas as edições; o filtro `publicada` é da aplicação); `provas_write` · ALL · `app.pode_admin_localidade(app.edicao_localidade(edicao_id))` (0011:279-282, **não** reescrita pela 0016). **GRANT:** SIUD. **Uso:** 6 refs.

#### `questoes` — MÓDULO CICLO → `ciclo_questoes`

**Origem:** 0007:35-45.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `prova_id` | uuid | não | — | FK → `provas(id)` on delete cascade |
| `enunciado` | text | não | — | |
| `tipo` | text | não | `'multipla_escolha'` | `check in ('multipla_escolha','verdadeiro_falso','dissertativa')` |
| `alternativas_jsonb` | jsonb | não | `'[]'` | array de strings (ex.: `["3","4","5"]`, `testar-rls.sh:98`); **sem** a resposta certa |
| `ordem` | integer | sim | — | |

Índice `idx_questoes_prova (prova_id)`. Sem unique `(prova_id, ordem)`.
**RLS:** `questoes_select` · SELECT · `app.is_sede() or exists (tentativas t join matriculas m where t.prova_id = questoes.prova_id and m.pessoa_id = app.current_pessoa_id())` (0020:128-140 — o aluno só lê depois de **iniciar** uma tentativa; professor/coordenador **não leem** o enunciado pelo cliente); `questoes_write` · ALL · `app.is_sede()` (0020:142-144). Substituíram 0011:286-297. **GRANT:** SIUD. **Uso:** 6 refs.

#### `questao_gabarito` — MÓDULO CICLO → `ciclo_questao_gabarito`

**Origem:** 0020:35-40. **Finalidade:** resposta certa em tabela separada, porque RLS é por linha e não por coluna (0020:24-33).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `questao_id` | uuid | não | — | PK; FK → `questoes(id)` on delete cascade |
| `resposta` | text | não | — | |
| `explicacao` | text | sim | — | **0 refs no app** |
| `criado_em` | timestamptz | não | `now()` | |

**RLS:** `gabarito_sede` · ALL · `app.is_sede()` (0020:47-49). Verificado em `testar-rls.sh:185-203`: aluno, coordenador e orientador não leem. **GRANT:** SIUD (0020:149-150). **Uso:** 1 ref.

#### `tentativas` — MÓDULO CICLO → `ciclo_tentativas`

**Origem:** 0007:48-57; colunas de 0020:54-57. **Finalidade:** tentativa de prova; `iniciada_em`/`prazo_em` ancoram o cronômetro no servidor.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `prova_id` | uuid | não | — | FK → `provas(id)` on delete cascade |
| `matricula_id` | uuid | não | — | FK → `matriculas(id)` on delete cascade |
| `iniciada_em` | timestamptz | não | `now()` | |
| `finalizada_em` | timestamptz | sim | — | |
| `nota` | numeric(5,2) | sim | — | `check (null or 0..100)` |
| `ordem_questoes` | uuid[] | sim | — | comentário 0020:64-66 |
| `prazo_em` | timestamptz | sim | — | comentário 0020:59-62 |
| `acertos` | integer | sim | — | |
| `total_questoes` | integer | sim | — | |

Índice `idx_tentativas_matricula (matricula_id)`. Sem índice em `prova_id`. **Sem limite de `tentativas_max` no banco** (contado na aplicação). ⚠️ Nada garante que `tentativas.prova_id` seja da mesma edição da turma da matrícula.
**RLS:** `tentativas_select` · SELECT · `exists (matrícula com app.pode_ver_matricula)` (0011:299-304); `tentativas_insert` · INSERT · `with check exists (matriculas m where m.id = matricula_id and m.pessoa_id = app.current_pessoa_id())` (0011:305-310 — o aluno inicia a tentativa pelo cliente, e nada no `with check` exige `provas.publicada`). Sem policy de UPDATE/DELETE. **GRANT:** SIUD. **Efeito líquido:** aluno insere (qualquer `prazo_em`/`ordem_questoes` que quiser — a proteção depende de o servidor sobrescrever); finalização e nota só pelo servidor. **Uso:** 8 refs.

#### `respostas` — MÓDULO CICLO → `ciclo_respostas`

**Origem:** 0020:71-82.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `tentativa_id` | uuid | não | — | FK → `tentativas(id)` on delete cascade |
| `questao_id` | uuid | não | — | FK → `questoes(id)` on delete cascade |
| `resposta` | text | não | `''` | |
| `correta` | boolean | sim | — | nulo nas dissertativas até correção humana |
| `respondido_em` | timestamptz | não | `now()` | |

UNIQUE `resposta_unica (tentativa_id, questao_id)`; índice `idx_respostas_tentativa (tentativa_id)`.
**RLS:** `respostas_select` · SELECT · `exists (tentativa → matrícula com app.pode_ver_matricula)` (0020:87-93). **GRANT efetivo:** `authenticated` **só SELECT** (`revoke` 0020:97). **Uso:** 1 ref (upsert `onConflict: "tentativa_id,questao_id"` com `service_role`, `src/app/provas/actions.ts:206`).

#### `certificados` — MÓDULO CICLO → `ciclo_certificados`

**Origem:** 0007:60-68; colunas de 0021:28-43; índice 0021:45; comentário 0021:47-49. **Finalidade:** documento com número nacional sequencial `CICLO-<ano>-<6 dígitos>`, QR público e snapshot do que era verdade na emissão.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `matricula_id` | uuid | não | — | FK → `matriculas(id)` on delete cascade; UNIQUE `certificado_unico_por_matricula` |
| `codigo_validacao` | text | não | — | UNIQUE; aleatório, sem significado (comentário) |
| `emitido_em` | timestamptz | não | `now()` | |
| `pdf_path` | text | sim | — | **0 refs no app** (PDF gerado sob demanda, não guardado) |
| `numero` | text | sim | — | índice **único** `idx_certificados_numero (numero)` (0021:45) |
| `sequencial` | bigint | sim | — | **0 refs no app** — nunca preenchido; o número vem de `proximo_numero_certificado()` |
| `nome_snapshot` | text | sim | — | |
| `localidade_snapshot` | text | sim | — | |
| `tipo_turma_snapshot` | text | sim | — | |
| `ano_snapshot` | integer | sim | — | |
| `presenca_snapshot` | numeric(5,2) | sim | — | |
| `nota_snapshot` | numeric(5,2) | sim | — | |

⚠️ `matricula_id … on delete cascade`: apagar a matrícula apaga o certificado — em tensão com o raciocínio de 0023:130-134 (o certificado é documento público). Como `matriculas.pessoa_id` é `restrict`, hoje a pessoa não é apagável enquanto tiver matrícula, o que na prática protege o certificado.
**RLS:** `certificados_select` · SELECT · `exists (matrícula com app.pode_ver_matricula)` (0021:76-82, idêntica à 0011:312-317). **GRANT efetivo:** `authenticated` **só SELECT** (0021:86). Validação pública é servida via `service_role` (0021:71-74). **Uso:** 6 refs.

### 2.9 Landing pages

#### `landing_pages` — MÓDULO CICLO → `ciclo_landing_pages`

**Origem:** 0008:10-18. **Finalidade:** conteúdo estruturado por campos; só o editável pela localidade fica aqui, o travado pela Sede é template no código (`src/lib/landing.ts:26-40`, `TEMPLATE_SEDE`).

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `localidade_id` | uuid | não | — | FK → `localidades(id)` on delete cascade; UNIQUE (1:1) |
| `campos_jsonb` | jsonb | não | `'{}'` | chaves em `landing.ts:17-22`: `datas_horarios`, `local_hotel`, `contato_coordenador`, `observacoes_locais` |
| `publicado` | boolean | não | `false` | |
| `travado_pela_sede` | boolean | não | `false` | 9 refs no app |
| `atualizado_em` | timestamptz | não | `now()` | **sem trigger** |

**RLS:** `landing_select` · SELECT · `true` (0011:324-325); `landing_update` · **ALL** · `app.pode_coordenar(localidade_id)` (0016:113-117). A versão da 0011:326-335 era `for update` e respeitava `not travado_pela_sede`; a 0016 **removeu a checagem de trava do RLS** e passou o comando para `all` (coordenador agora também insere e apaga a landing da sua localidade pelo cliente). A trava só vale na aplicação. **GRANT:** SIUD. **Uso:** 8 refs.

#### `landing_versoes` — MÓDULO CICLO → `ciclo_landing_versoes`

**Origem:** 0008:21-29.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `landing_id` | uuid | não | — | FK → `landing_pages(id)` on delete cascade |
| `campos_jsonb` | jsonb | não | — | |
| `autor_id` | uuid | sim | — | FK → `pessoas(id)` on delete set null |
| `criado_em` | timestamptz | não | `now()` | |

Índice `idx_landing_versoes_landing (landing_id, criado_em desc)`.
**RLS:** `landing_versoes_select` · SELECT · `exists (landing_pages lp … app.is_sede() or lp.localidade_id in (select app.admin_localidade_ids()))` (0011:336-342). Sem policy de escrita. **GRANT:** SIUD. **Uso:** 4 refs.

### 2.10 Importação XLSX e histórico legado

#### `importacoes` — MÓDULO CICLO → `ciclo_importacoes` (ver §4.2)

**Origem:** 0009:8-18. **Finalidade:** importador em duas fases (prévia → efetivada/cancelada); `resumo_jsonb` guarda contagens.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `arquivo` | text | não | — | |
| `status` | text | não | `'previa'` | `check in ('previa','efetivada','cancelada')` |
| `resumo_jsonb` | jsonb | não | `'{}'` | |
| `criado_por` | uuid | sim | — | FK → `pessoas(id)` on delete set null |
| `criado_em` | timestamptz | não | `now()` | |
| `efetivado_em` | timestamptz | sim | — | |

Sem índices além da PK.
**RLS:** `importacoes_sede` · ALL · `app.is_sede()` (0011:348-349). **GRANT:** SIUD. **Uso:** 3 refs.

#### `importacao_conflitos` — MÓDULO CICLO → `ciclo_importacao_conflitos`

**Origem:** 0009:22-35.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `importacao_id` | uuid | não | — | FK → `importacoes(id)` on delete cascade |
| `linha` | integer | não | — | |
| `tipo` | text | não | — | **sem check**; valores documentados em 0009:26-27: `cpf_codsni_divergente`, `cpf_invalido`, `email_invalido`, `tipo_turma_desconhecido`, `orfao`, `duplicata`; o app grava só os 3 primeiros |
| `dados_jsonb` | jsonb | não | — | |
| `resolvido` | boolean | não | `false` | |
| `resolvido_por` | uuid | sim | — | FK → `pessoas(id)` on delete set null; **0 refs no app** |
| `criado_em` | timestamptz | não | `now()` | |

Índice parcial `idx_conflitos_importacao (importacao_id) where not resolvido`.
**RLS:** `conflitos_sede` · ALL · `app.is_sede()` (0011:350-351). **GRANT:** SIUD. **Uso:** 1 ref.

#### `historico_turma` — MÓDULO CICLO → `ciclo_historico_turma`

**Origem:** 0009:39-53. **Finalidade:** histórico importado com o **nome original** do tipo de turma; equivalência resolvida à parte.

| Coluna | Tipo | Nulo | Default | Regras |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `pessoa_id` | uuid | não | — | FK → `pessoas(id)` on delete cascade |
| `localidade_nome` | text | sim | — | texto livre do arquivo, sem FK |
| `ano` | integer | sim | — | |
| `tipo_turma_original` | text | não | — | "Nível 3" etc., sem conversão |
| `situacao` | text | sim | — | `check in ('concluido','desistente','reprovado')` |
| `nota` | numeric(5,2) | sim | — | sem check de faixa |
| `percentual_presenca` | numeric(5,2) | sim | — | sem check de faixa |
| `observacao` | text | sim | — | |
| `importacao_id` | uuid | sim | — | FK → `importacoes(id)` on delete set null |
| `criado_em` | timestamptz | não | `now()` | |

Índice `idx_historico_pessoa (pessoa_id)`. Sem unique (reimportar duplica).
**RLS:** `historico_select` · SELECT · `app.is_sede() or pessoa_id = app.current_pessoa_id()` (0011:353-355). Sem policy de escrita. **GRANT:** SIUD. **Uso:** 2 refs (importador grava; motor de pré-requisito lê, ambos `service_role`).

## 3. Funções, view, sequence, triggers e seeds

### 3.1 Schema `app` — funções de autorização (base do RLS)

Todas `language sql`, `stable`, `set search_path = public`; `grant execute on all functions in schema app to authenticated, anon` (0010:92, repetido em 0016:59). ACL final de todas: `{=X, postgres=X, authenticated=X, anon=X}` — o `EXECUTE` de `PUBLIC` (`=X`) é o padrão do Postgres para funções e **nunca foi revogado**.

| Função | Assinatura | Definer? | Corpo (resumo) | Origem |
|---|---|---|---|---|
| `app.current_pessoa_id()` | `→ uuid` | sim | `select id from pessoas where auth_user_id = auth.uid()` | 0010:14-18 |
| `app.is_sede()` | `→ boolean` | sim | existe `papeis` ativo com `tipo = 'sede'` para a pessoa do `auth.uid()` | 0010:21-31 |
| `app.admin_localidade_ids()` | `→ setof uuid` | sim | `localidade_id` dos papéis ativos `in ('coordenador','orientador','presidente_uap')` da pessoa | 0010:34-43 |
| `app.professor_turma_ids()` | `→ setof uuid` | sim | `turma_id` de `turma_professores` da pessoa (não consulta `papeis`) | 0010:46-53 |
| `app.edicao_localidade(p_edicao uuid)` | `→ uuid` | sim | `localidade_id` de `edicoes` | 0010:56-60 |
| `app.turma_localidade(p_turma uuid)` | `→ uuid` | sim | `edicoes.localidade_id` via `turmas` | 0010:63-70 |
| `app.pode_admin_localidade(p_loc uuid)` | `→ boolean` | **não** | `app.is_sede() or p_loc in (select app.admin_localidade_ids())` | 0010:73-77 |
| `app.pode_ver_matricula(p_pessoa uuid, p_turma uuid)` | `→ boolean` | **não** | Sede · dono · professor da turma · admin da localidade da turma | 0010:81-89 |
| `app.tem_papel_na_localidade(p_tipos text[], p_loc uuid)` | `→ boolean` | sim | papel ativo com `tipo = any(p_tipos)` e `localidade_id is not distinct from p_loc` | 0016:24-35 |
| `app.pode_coordenar(p_loc uuid)` | `→ boolean` | não | `is_sede() or tem_papel_na_localidade(array['coordenador'], p_loc)` | 0016:38-42 |
| `app.pode_orientar(p_loc uuid)` | `→ boolean` | não | `is_sede() or tem_papel_na_localidade(array['orientador'], p_loc)` | 0016:45-49 |
| `app.pode_conduzir(p_loc uuid)` | `→ boolean` | não | `is_sede() or tem_papel_na_localidade(array['coordenador','orientador'], p_loc)` | 0016:52-57 |

Observações:
- As quatro funções "pode_*" não são definer porque só compõem as definer (0016:20).
- `is_sede()` e `admin_localidade_ids()` filtram por `p.ativo`; `professor_turma_ids()` não tem noção de ativo.
- `tem_papel_na_localidade` com `p_loc = null` casa papel `sede` (`null is not distinct from null`) — hoje nenhuma policy chama assim.
- Nenhuma função verifica `edicao_id` do papel: o escopo por edição não existe no RLS.

### 3.2 Schema `public` — funções próprias

| Função | Assinatura | Definer | Volatilidade | ACL final | Origem |
|---|---|---|---|---|---|
| `tg_set_atualizado_em()` | `→ trigger`, plpgsql | não | volatile | padrão | 0002:105-110 |
| `dispensar_prerequisito(p_matricula uuid, p_motivo text)` | `→ void`, plpgsql | **sim** | volatile | `postgres`, `authenticated` (revogado de `public`, `anon`: 0017:121-124) | 0017:43-88 |
| `recusar_prerequisito(p_matricula uuid, p_motivo text)` | `→ void`, plpgsql | **sim** | volatile | `postgres`, `authenticated` | 0017:91-117 |
| `proximo_numero_certificado(p_ano integer)` | `→ text`, sql | **sim** | volatile | **só `postgres`, `service_role`** (0021:64-66) | 0021:58-62 |

**`dispensar_prerequisito`** (0017:43-88), a única porta que tira a matrícula de `aguardando_prerequisito`:
1. `p_motivo` vazio/branco → `raise 'A dispensa exige motivo (§6.3).'`
2. lê `app.turma_localidade(m.turma_id)` e `status`; não achou → `'Matrícula não encontrada.'`
3. `not app.pode_orientar(v_loc)` → `'Apenas o Orientador Responsável da localidade dispensa pré-requisito (§6.3).'`
4. `status <> 'aguardando_prerequisito'` → `'Esta matrícula não está aguardando dispensa (status atual: %).'`
5. `app.current_pessoa_id()` nulo → `'Sessão sem pessoa correspondente.'`
6. `insert into dispensas_prereq (matricula_id, autorizado_por, motivo)`; `update matriculas set status = 'pendente'`; `insert into auditoria (ator_id, acao='dispensa_prerequisito', entidade='matriculas', entidade_id, motivo)`.

**`recusar_prerequisito`** (0017:91-117): mesmas checagens 2-3 (sem exigir motivo, sem checar status); `update … set status = 'cancelada' where … and status = 'aguardando_prerequisito'` (silencioso se o status for outro); auditoria `acao='recusa_prerequisito'` com `coalesce(trim(p_motivo), '')`. ⚠️ Não verifica `v_autor is null`.

**`proximo_numero_certificado(p_ano)`** (0021:58-62): `'CICLO-' || p_ano || '-' || lpad(nextval('certificado_seq')::text, 6, '0')`. Sequência contínua entre anos (0021:24-25). Chamada por `rpc` em `src/lib/certificado/emitir.ts:188` com `service_role`.

### 3.3 View

`pessoa_funcao_atual` — §2.2. Única view. `security_invoker = true` desde a 0013.

### 3.4 Sequence

`certificado_seq` (0021:26): `bigint`, start 1, increment 1, cache 1. Sem `grant usage` explícito a `authenticated` — coberto pelo default privilege da 0014:56-57 (`rU`), e de qualquer forma só `service_role` executa a função que a usa. **Não há outra sequence**: todas as PKs são uuid.

### 3.5 Triggers

Todos `before update … for each row execute function tg_set_atualizado_em()`:

| Tabela | Trigger | Origem |
|---|---|---|
| `pessoas` | `trg_pessoas_atualizado` | 0002:112-114 |
| `matriculas` | `trg_matriculas_atualizado` | 0004:67-69 |
| `pagamentos` | `trg_pagamentos_atualizado` | 0005:39-41 |
| `grade_aulas` | `trg_grade_aulas_atualizado` | 0015:168-170 |

Tabelas com `atualizado_em` **sem** trigger (o app grava à mão, ou ninguém grava): `localidade_credenciais_cielo`, `progresso_video`, `landing_pages`, `criterios_aprovacao`, `configuracoes`.

### 3.6 Seeds (0012 e 0023)

`funcoes_doutrinarias (nome, ordem)` — 0012:10-22, `on conflict (nome) do nothing`; todas `ativo = true`:

| ordem | nome |
|---|---|
| 1 | Simpatizante |
| 2 | Adepto |
| 3 | Divulgador |
| 4 | Divulgador Autorizado |
| 5 | Líder da Iluminação |
| 6 | Preletor em grau Aspirante |
| 7 | Preletor em grau Júnior |
| 8 | Preletor em grau Sênior |
| 9 | Preletor em grau Máster |
| 10 | Aspirante a Preletor da Sede Internacional |
| 11 | Preletor da Sede Internacional |

(`src/lib/dominio/desconto.ts:62`: "Preletor" para desconto = ordem ≥ 6.)

`tipos_turma (nome, ordem, ativo)` — 0012:25-32:

| nome | ordem | ativo |
|---|---|---|
| Uniclass | 1 | true |
| Especial | 2 | true |
| Nível 1 | 101 | false |
| Nível 2 | 102 | false |
| Nível 3 | 103 | false |
| Nível 4 | 104 | false |

`tipo_turma_prereq` — 0012:35-39: **Especial exige Uniclass**.

`equivalencias (nome_original, tipo_turma_id)` — 0012:45-50: `Nível 1`, `Nível 2`, `Nível 3`, `Nível 4`, todas com destino `null` (regra a fechar pela Sede).

`configuracoes` — 0023:107: `insert (id) values (1)`; a linha nasce com os defaults: `prazo_arrependimento_dias = 7`, `max_parcelas_padrao = 12`, `modo_pagamento_padrao = 'centralizado'`, `mdr_percent_padrao = 0.000`, `tarifa_fixa_centavos_padrao = 0`, textos de política (0023:62-76).

`criar-sede.sql` (fora das migrations, roda à mão): valida CPF (11 dígitos, não repetido, DV — linhas 31-54) e CodSNI (dígitos, 56-58), exige `auth.users` já criado com o e-mail (61-66), cria/reaproveita `pessoas` por CPF (69-78) e concede `papeis (tipo='sede', localidade_id null, edicao_id null)` (81-87).

### 3.7 Configuração do projeto (`config.toml`)

`[api] schemas = ["public"]` (linha 8) — o schema `app` **não é exposto** pelo PostgREST; por isso `dispensar_prerequisito`/`recusar_prerequisito` vivem em `public` (0017:119-120). `extra_search_path = ["public","extensions"]`, `max_rows = 1000`. `[db] major_version = 15` (view com `security_invoker` exige 15+). `[auth] enable_signup = false`, `enable_confirmations = false`, `jwt_expiry = 3600`; `[auth.email] enable_signup = false`, `double_confirm_changes = true`.

## 4. Classificação: plataforma × módulo Ciclo

### 4.1 Tabela resumo (50 tabelas + 1 view)

| Tabela atual | Classe | Nome no SNI Conecta | Nota |
|---|---|---|---|
| `regionais` | PLATAFORMA | `regionais` | |
| `localidades` | PLATAFORMA | `localidades` (ou unidade institucional, §5) | 4 colunas de pagamento saem para o módulo |
| `localidade_regionais` | PLATAFORMA | `localidade_regionais` | some se localidade virar filha de regional (§5) |
| `locais` | PLATAFORMA | `locais` | plano §1.3; ressalva §4.2 |
| `local_fotos` | PLATAFORMA | `local_fotos` | nunca usada |
| `pessoas` | PLATAFORMA | `pessoas` | ADR 0004: `email` e `cod_sni` viram anuláveis |
| `funcoes_doutrinarias` | PLATAFORMA | `funcoes_doutrinarias` | |
| `pessoa_funcao_hist` | PLATAFORMA | `pessoa_funcao_hist` | |
| `pessoa_funcao_atual` (view) | PLATAFORMA | `pessoa_funcao_atual` | |
| `papeis` | PLATAFORMA | `papeis` | `edicao_id` → FK para tabela de módulo; ver §4.2 |
| `auditoria` | PLATAFORMA | `auditoria` | |
| `consentimentos_lgpd` | PLATAFORMA | `consentimentos_lgpd` | |
| `notificacoes` | PLATAFORMA | `notificacoes` | |
| `configuracoes` | PLATAFORMA | `configuracoes` | 4 colunas `*_padrao` de pagamento são do módulo |
| `solicitacoes_exclusao` | PLATAFORMA | `solicitacoes_exclusao` | |
| `tipos_turma` | MÓDULO | `ciclo_tipos_turma` | |
| `tipo_turma_prereq` | MÓDULO | `ciclo_tipo_turma_prereq` | |
| `equivalencias` | MÓDULO | `ciclo_equivalencias` | |
| `ciclo_anos` | MÓDULO | `ciclo_anos` | já prefixada |
| `apostilas` | MÓDULO | `ciclo_apostilas` | |
| `apostila_etapas` | MÓDULO | `ciclo_apostila_etapas` | |
| `apostila_aulas` | MÓDULO | `ciclo_apostila_aulas` | |
| `aulas_complementares` | MÓDULO | `ciclo_aulas_complementares` | |
| `criterios_aprovacao` | MÓDULO | `ciclo_criterios_aprovacao` | |
| `regras_desconto` | MÓDULO | `ciclo_regras_desconto` | |
| `edicoes` | MÓDULO | `ciclo_edicoes` | |
| `turmas` | MÓDULO | `ciclo_turmas` | |
| `turma_professores` | MÓDULO | `ciclo_turma_professores` | |
| `matriculas` | MÓDULO | `ciclo_matriculas` | |
| `dispensas_prereq` | MÓDULO | `ciclo_dispensas_prereq` | |
| `localidade_credenciais_cielo` | MÓDULO | `ciclo_localidade_credenciais_cielo` | candidata a virar credencial de pagamento da plataforma (§4.2) |
| `pagamentos` | MÓDULO | `ciclo_pagamentos` | |
| `split_registros` | MÓDULO | `ciclo_split_registros` | |
| `webhooks_cielo` | MÓDULO | `ciclo_webhooks_cielo` | candidata a plataforma (§4.2) |
| `grades` | MÓDULO | `ciclo_grades` | |
| `grade_etapas` | MÓDULO | `ciclo_grade_etapas` | |
| `grade_etapa_orientadores` | MÓDULO | `ciclo_grade_etapa_orientadores` | |
| `grade_aulas` | MÓDULO | `ciclo_grade_aulas` | |
| `presencas` | MÓDULO | `ciclo_presencas` | |
| `progresso_video` | MÓDULO | `ciclo_progresso_video` | |
| `provas` | MÓDULO | `ciclo_provas` | |
| `questoes` | MÓDULO | `ciclo_questoes` | |
| `questao_gabarito` | MÓDULO | `ciclo_questao_gabarito` | |
| `tentativas` | MÓDULO | `ciclo_tentativas` | |
| `respostas` | MÓDULO | `ciclo_respostas` | |
| `certificados` | MÓDULO | `ciclo_certificados` | |
| `landing_pages` | MÓDULO | `ciclo_landing_pages` | |
| `landing_versoes` | MÓDULO | `ciclo_landing_versoes` | |
| `importacoes` | MÓDULO | `ciclo_importacoes` | ver §4.2 |
| `importacao_conflitos` | MÓDULO | `ciclo_importacao_conflitos` | |
| `historico_turma` | MÓDULO | `ciclo_historico_turma` | |

Contagem: 14 tabelas + 1 view de plataforma; 36 tabelas de módulo.

Funções: `app.current_pessoa_id`, `app.is_sede`, `app.tem_papel_na_localidade` → plataforma. `app.admin_localidade_ids`, `app.pode_admin_localidade`, `app.pode_coordenar`, `app.pode_orientar`, `app.pode_conduzir` → plataforma **se** os tipos de papel do Ciclo continuarem em `papeis.tipo` (hoje estão fixos no `check`); caso contrário viram `app.ciclo_*`. `app.professor_turma_ids`, `app.edicao_localidade`, `app.turma_localidade`, `app.pode_ver_matricula`, `public.dispensar_prerequisito`, `public.recusar_prerequisito`, `public.proximo_numero_certificado`, `certificado_seq` → módulo (`ciclo_`). `tg_set_atualizado_em` → plataforma.

### 4.2 Casos que exigem decisão

1. **`papeis.tipo` e `papeis.edicao_id`.** O `check` fixa os seis tipos do Ciclo (0002:79-80) e a FK `edicao_id → edicoes` liga a tabela de plataforma a uma tabela de módulo. O esqueleto do SNI Conecta já acrescenta `eventos_admin`/`eventos_operador` (`src/lib/permissoes.ts:15-25`). Para `papeis` ser plataforma de verdade: `tipo` sem check fixo (ou catálogo `tipos_papel` com coluna `modulo`), e `edicao_id` removida (nunca é escrita) ou substituída por um `escopo_jsonb`/tabela de escopo por módulo.
2. **`locais`.** O plano lista como plataforma, mas o esquema a descreve como "hotéis" do Ciclo (0001:41) e o módulo `eventos` traz o próprio `eventos.locais` (`supabase/rascunhos/eventos_schema.sql:22-33`, PK inteira, `legado_id`). Ou os dois convergem numa `locais` comum (uuid + `legado_id`), ou `locais` do Ciclo vira `ciclo_locais`.
3. **`configuracoes`.** Singleton de plataforma com quatro colunas de padrão de pagamento (`max_parcelas_padrao`, `modo_pagamento_padrao`, `mdr_percent_padrao`, `tarifa_fixa_centavos_padrao`) que só o Ciclo lê. Ou ficam como "padrão nacional de pagamento" reaproveitável por eventos (que também parcela: `ingresso_tipos.max_parcelas` no rascunho), ou saem para `ciclo_configuracoes`.
4. **`localidade_credenciais_cielo` / `webhooks_cielo`.** Eventos já tem `eventos.contas_cielo` com `merchant_key_cifrada` via `cripto.ts` e webhook em produção. A credencial Cielo é a mesma tecnologia nos dois módulos; a integração deveria ser uma só, de plataforma (`docs/integracao-eventos.md`, "O que o módulo de eventos traz para a plataforma"). A tabela do Ciclo está vazia e sem código: pode ser descartada em favor do modelo de eventos.
5. **`importacoes` / `importacao_conflitos`.** O importador XLSX é do Ciclo, mas "deduplicação de pessoas por CPF com prévia e revisão" é capacidade que eventos também traz. Se a plataforma ganhar importação de pessoas, a fila de conflitos por CPF/CodSNI é dela; o histórico de turma continua do Ciclo.
6. **`tipos_turma` e `funcoes_doutrinarias` na mesma capacidade.** `permissoes.ts:48` (`tipos.gerir`) cobre as duas; no SNI Conecta a primeira é `ciclo.tipos.gerir` e a segunda fica em capacidade de plataforma (`estrutura.gerir` ou nova `funcao_doutrinaria.gerir`).
7. **`notificacoes.template`** carrega nomes do Ciclo (`matricula_confirmada`, `certificado_liberado`); a fila é comum, então o template precisa de namespace (`ciclo.matricula_confirmada`) ou de coluna `modulo`.
8. **`auditoria.entidade`** guarda o nome da tabela (`'matriculas'`); com o prefixo, as funções da 0017 passam a gravar `'ciclo_matriculas'` — decidir se `entidade` é nome físico ou lógico.

## 5. Se "localidade" passar a ser uma unidade da estrutura institucional

O cliente descreve a hierarquia Sede Central > Regionais Doutrinárias > Núcleos e Associações Locais (com Organizações atravessando). O Ciclo modela só `regionais` ↔ `localidades` N:N, sem núcleo, associação, organização, país nem endereço. A referência antiga (`/home/user/sni-conecta/db/migrations/0000_initial.sql:95-151`) tem `regional` (com `pais`, `idioma_primario`, `fuso_horario`, endereço, `slug`, soft delete) e `associacao_local` (`regional_id not null`, `slug` único por regional, `organizacao_id` na 0004:12-14).

### 5.1 O que em `localidades` é institucional e o que é do Ciclo

| Coluna | Natureza | Destino |
|---|---|---|
| `id` | institucional | PK da unidade (regional / núcleo / associação local) |
| `nome` | institucional | unidade |
| `ativo` | institucional | unidade |
| `criado_em` | institucional | unidade |
| `slug` | **do Ciclo** (0001:25: "slug usado na landing page pública") | `ciclo_landing_pages.slug` (unique) — ou slug institucional da unidade, se a plataforma quiser URL por unidade; nesse caso a landing herda |
| `max_parcelas` | do Ciclo (0023:112) | `ciclo_politicas_localidade` (ou colunas em `ciclo_edicoes`) |
| `modo_pagamento` | do Ciclo (0023:114) | idem |
| `mdr_percent` | do Ciclo (0023:116) | idem |
| `tarifa_fixa_centavos` | do Ciclo (0023:118) | idem |

Tabelas 1:1 com localidade que são inteiramente do módulo e passam a apontar para a unidade: `landing_pages.localidade_id` (unique), `localidade_credenciais_cielo.localidade_id` (PK).

### 5.2 O que muda no esquema

1. **`localidades` deixa de ser tabela própria.** `edicoes.localidade_id`, `papeis.localidade_id`, `landing_pages.localidade_id`, `localidade_credenciais_cielo.localidade_id` passam a referenciar a tabela da unidade (`unidades`, ou diretamente `associacoes_locais`/`nucleos`). Se a plataforma tiver tabelas separadas por nível, o Ciclo precisa de **uma** FK polimórfica controlada (`unidade_tipo + unidade_id`) ou de uma tabela `unidades` única com `tipo in ('regional','nucleo','associacao_local')` e `pai_id` — a segunda é a que mantém as policies simples (`app.tem_papel_na_localidade(p_tipos, p_loc)` continua igual, só muda o alvo da FK).
2. **`localidade_regionais` some.** A relação vira `unidades.pai_id` (1:N, uma regional por unidade) em vez de N:N. Se a N:N for real (uma localidade do Ciclo atendendo duas regionais), ela é um fato do Ciclo, não da estrutura, e vira `ciclo_edicao_regionais` ou some.
3. **Overrides de pagamento saem para o módulo.** Nova `ciclo_politicas_localidade (unidade_id pk, max_parcelas, modo_pagamento, mdr_percent, tarifa_fixa_centavos)` com os mesmos `check`s da 0023:112-119 e a mesma semântica "NULO herda o nacional" (`src/lib/configuracao/politica.ts:170-201`). A policy de escrita muda de "só Sede em `localidades`" para "só Sede em `ciclo_politicas_localidade`" — mantém `testar-rls.sh:211-215`.
4. **`slug`.** Se ficar na unidade: o `check slug_formato` e o unique vão com ele, e a landing pública `/l/[slug]` resolve unidade → landing. Se ficar na landing: `ciclo_landing_pages.slug unique` + check, e a unidade não precisa de slug.
5. **Papéis com escopo.** `papeis.localidade_id` vira `unidade_id`. O `escopo_papel` (0002:85-88) continua: `sede` sem unidade, os demais com unidade. Papéis de regional (presidente da regional, que eventos quer avisar por e-mail) passam a caber sem coluna nova: unidade do tipo `regional`.
6. **Funções `app.*`.** `admin_localidade_ids`, `pode_admin_localidade`, `tem_papel_na_localidade`, `pode_coordenar/orientar/conduzir`, `edicao_localidade`, `turma_localidade` só trocam a coluna/alvo; a assinatura pode ficar (`p_loc uuid`). Se houver hierarquia, decidir se papel na regional vale nas unidades filhas (hoje não existe herança: `localidade_id is not distinct from p_loc`, 0016:33). Herança exigiria `p_loc in (select id from unidades where … ancestral)` — mudança de semântica, não só de nome.
7. **`historico_turma.localidade_nome`** continua texto livre (é o que vem da planilha); pode ganhar `unidade_id` opcional resolvido depois.
8. **`certificados.localidade_snapshot`** continua texto (é snapshot; não muda).
9. **Endereço, cidade, UF, país.** O Ciclo não tem nada disso na localidade; a landing usa `campos_jsonb.local_hotel` e `edicoes.local_id → locais`. Ao entrar na estrutura institucional, esses campos vêm da unidade e o `local` (hotel) continua sendo o local do evento anual, do módulo.
10. **`edicao_unica_por_ano (localidade_id, ano)`** vira `(unidade_id, ano)`; sem outra mudança.

## 6. Arqueologia entre migrations e forma consolidada

### 6.1 Dependências que só existem por história

| Migration | Depende de / desfaz | O que sobra no estado final |
|---|---|---|
| **0006** `aulas`, `progresso_video` | inteiramente desfeita pela **0015:181-183** (`drop table aulas`, `drop table progresso_video`) | nada da 0006 existe; só a decisão "provider + external_id" reaparece em `aulas_complementares` |
| **0007** `presencas` (→ `aulas`) | dropada em **0015:181**, recriada apontando para `grade_aulas` | a `presencas` final é a da 0015 |
| **0011** policies de `aulas`, `progresso_video`, `presencas` (0011:240-275) | somem com as tabelas na 0015 | recriadas em 0015:314-339 |
| **0013** recria `pessoa_funcao_atual` | corrige a view da **0002:58-67** (sem `security_invoker`) | só a versão da 0013 existe |
| **0014** GRANTs + default privileges | pressupõe "expose new tables" desligado; tudo depois dela **precisa** de grant explícito ou do default | ver §1.3 |
| **0015** `apostila_aula_numero_unico` | nome escolhido porque `aula_numero_unico` ainda existia (0015:76-78) | nome pode voltar a `aula_numero_unico` na consolidada — ou não, para não colidir com nada |
| **0016** reescreve 6 policies de escrita da 0011 (`edicoes_write`, `turmas_write`, `turma_prof_write`, `matriculas_write`, `dispensas_write`, `landing_update`) | `drop policy if exists` + `create policy` | só a versão 0016 existe; a 0011 deixou `grades_*`, `provas_write`, `split_select`, `pode_admin_localidade` em outras policies **sem** reescrever |
| **0017** troca `matriculas_status_check` | `drop constraint … add constraint` sobre 0004:53-54 | check com 7 valores |
| **0018** reescreve `presencas_write` da 0015 | `pode_admin_localidade` → `pode_conduzir` | só a 0018 existe |
| **0019** `drop policy progresso_self` da 0015:336-339; `revoke` | desfaz a escrita pelo cliente que a 0015 (e antes a 0011:248-251) dava | duas policies de SELECT, sem escrita |
| **0020** reescreve `questoes_select`/`questoes_write` da 0011:286-297; `add column if not exists` em `provas`, `tentativas` | | |
| **0021** recria `certificados_select` (idêntica à 0011:312-317) e `revoke` | o `drop/create` é redundante; o `revoke` é o que importa | |
| **0022**, **0023** | `create table if not exists` + `drop policy if exists`: escritas para serem reaplicáveis, diferente das 0001-0011 | |
| **0023** `alter table localidades add column` ×4 | altera a 0001 | 9 colunas em `localidades` |

Outros vestígios: `local_fotos` (0001) e `localidade_credenciais_cielo`, `webhooks_cielo` (0005) nunca receberam código; `papeis.edicao_id` (0002) nunca é escrita; `certificados.sequencial`, `certificados.pdf_path`, `questao_gabarito.explicacao`, `matriculas.desconto_autorizado_por`, `importacao_conflitos.resolvido_por`, `pagamentos.cielo_payment_id` (0 refs no app) são colunas que a consolidada pode manter (custo zero) ou cortar (decisão, não arqueologia).

### 6.2 Como ficaria uma migration consolidada

Uma `0001_fundacao` da plataforma e uma `0002_ciclo` do módulo (ou uma só, dividida em seções), escritas do estado final e não da história:

**Bloco A — extensões e schema `app`**: `pgcrypto`, `citext`; `create schema app`; `grant usage on schema app to authenticated, anon` (decidir se `anon` precisa mesmo: hoje só serve para o PostgREST não falhar em `auth`, 0014:29-30).

**Bloco B — plataforma** (na ordem de dependência): `regionais` → unidade institucional (§5) → `locais`, `local_fotos` → `pessoas` (com os ajustes da ADR 0004: `email` anulável, `check (auth_user_id is null or email is not null)`, `cod_sni` anulável) → `funcoes_doutrinarias`, `pessoa_funcao_hist`, view `pessoa_funcao_atual` já com `security_invoker` → `papeis` (sem `edicao_id`, `tipo` sem check fixo ou com os tipos dos dois módulos) → `auditoria`, `consentimentos_lgpd`, `notificacoes`, `configuracoes` (+ `insert id=1`), `solicitacoes_exclusao` → `tg_set_atualizado_em` + triggers → funções `app.current_pessoa_id`, `is_sede`, `tem_papel_na_localidade`, `admin_localidade_ids`, `pode_admin_localidade`, `pode_coordenar`, `pode_orientar`, `pode_conduzir` → RLS + policies finais → seed de `funcoes_doutrinarias`.

**Bloco C — módulo Ciclo** (todas com prefixo `ciclo_`): `tipos_turma`, `tipo_turma_prereq`, `equivalencias`, `ciclo_anos`, `apostilas`, `apostila_etapas`, `apostila_aulas`, `aulas_complementares`, `criterios_aprovacao`, `regras_desconto` → `edicoes`, `turmas`, `turma_professores`, `matriculas` (já com o check de 7 status), `dispensas_prereq` → `politicas_localidade` (novo, §5.2-3), `credenciais_cielo`/`pagamentos`/`split_registros`/`webhooks_cielo` (ou o modelo de eventos, §4.2-4) → `grades`, `grade_etapas`, `grade_etapa_orientadores`, `grade_aulas`, `presencas`, `progresso_video` → `provas` (já com `publicada`, `tentativas_max`, `embaralhar`), `questoes`, `questao_gabarito`, `tentativas` (já com as 4 colunas), `respostas`, `certificados` (já com as 8 colunas + índice único em `numero`), `certificado_seq` → `landing_pages`, `landing_versoes` → `importacoes`, `importacao_conflitos`, `historico_turma` → funções `app.professor_turma_ids`, `edicao_localidade`, `turma_localidade`, `pode_ver_matricula`, `public.dispensar_prerequisito`, `recusar_prerequisito`, `proximo_numero_certificado` → RLS + policies **na versão final** (0016/0018/0019/0020/0021, não 0011) → seeds de `tipos_turma`, `tipo_turma_prereq`, `equivalencias`.

**Bloco D — privilégios, uma vez só e no fim**: `grant usage on schema public`; `grant SIUD on all tables to authenticated`; `grant all … to service_role`; `revoke insert, update, delete` em `certificados`, `progresso_video`, `respostas` (e, se a regra "sem GRANT para segredo" valer, `revoke all` em credenciais e `webhooks`); `alter default privileges` como na 0014; `revoke all on all tables from anon`; `revoke execute on all functions in schema app from public` (hoje não feito); grants das funções `public` como na 0017/0021.

**Verificação mecânica** (plano §4): subir Postgres A com as 23 migrations e Postgres B com a consolidada, `pg_dump --schema-only` dos dois, normalizar `ciclo_` e comparar. O harness deste estudo (stub do `testar-rls.sh:38-49` + `pg_dump -n public -n app`) já faz o lado A; o diff só é "limpo" nas diferenças **intencionais** listadas aqui (prefixo, `papeis.edicao_id`, colunas de `localidades`, revokes novos), que devem estar num arquivo de exceções, não na cabeça de quem compara.

O que a consolidação **perde** de propósito: os comentários de decisão dos cabeçalhos (0016:2-21, 0017:2-13, 0018:2-19, 0019:2-22, 0020:2-9, 0021:2-22, 0022:2-19, 0023:2-37). Eles são o "porquê" de metade das policies; a consolidada deve carregá-los como comentário junto de cada objeto, ou o SNI Conecta perde a memória que o plano §5 chama de "cicatriz acumulada".

## 7. Constraints de negócio embutidas no SQL

Lista do que o banco impõe sozinho (a reescrita precisa reproduzir cada item ou decidir conscientemente que não).

### 7.1 Identidade

| Regra | Onde |
|---|---|
| CPF único, `text`, exatamente 11 dígitos (`'^[0-9]{11}$'`); DV **não** validado no banco | `pessoas.cpf_11_digitos` 0002:26; DV em `criar-sede.sql:31-54` e no app |
| CodSNI único, `text`, só dígitos, sem limite de tamanho (`'^[0-9]+$'`) | `pessoas.cod_sni_digitos` 0002:27 |
| E-mail único, case-insensitive (`citext`), **obrigatório** | `pessoas.email` 0002:18 (ADR 0004 do SNI Conecta muda para anulável) |
| Uma conta Auth por pessoa e vice-versa; apagar a conta não apaga a pessoa | `pessoas.auth_user_id unique … on delete set null` 0002:22 |
| Slug de localidade: `'^[a-z0-9]+(-[a-z0-9]+)*$'`, único | `localidades.slug_formato` 0001:29 |

### 7.2 Papéis e escopo

| Regra | Onde |
|---|---|
| Seis tipos fixos de papel | `papeis_tipo_check` 0002:79-80 |
| `sede` sem localidade; qualquer outro com localidade | `escopo_papel` 0002:85-88 |
| Um `sede` por pessoa; um papel (pessoa, localidade, edição-ou-zero, tipo) | índices parciais `uq_papel_sede`, `uq_papel_local` 0002:92-96 |
| Professor de turma é quem está em `turma_professores`, não quem tem papel `professor` | `app.professor_turma_ids` 0010:46-53 |
| Coordenador: preço/status da edição, turmas, professores, matrículas, landing | `app.pode_coordenar` + policies 0016 |
| Orientador: dispensa de pré-requisito | `app.pode_orientar` 0016:45-49, `dispensas_write` 0016:98-108, `dispensar_prerequisito` 0017:66-68 |
| Coordenador + orientador: presença | `app.pode_conduzir`, `presencas_write` 0018:28-42 |
| Coordenador + orientador + presidente de UAP: grade, provas (escrita), leitura ampla da localidade | `app.pode_admin_localidade` 0010:73-77 em `grades_*` 0015:258-310, `provas_write` 0011:279-282, `split_select` 0011:225-232 |
| Só a Sede: estrutura, catálogo nacional, funções doutrinárias, gabarito, critérios, configuração, importação, LGPD, credenciais Cielo, overrides de pagamento da localidade | policies `ref_write_*` 0011:57-106, 0015:231-254, 0020:47-49,120-123,142-144, 0023:179-189, 0011:234-235,348-351 |

### 7.3 Dinheiro e desconto

| Regra | Onde |
|---|---|
| Todo valor monetário é `integer` em centavos, `>= 0` | `edicoes` 0001:76-79; `regras_desconto.valor_centavos` 0004:16; `matriculas` 0004:44-47; `pagamentos.valor_total_centavos` 0005:26; `configuracoes.tarifa_fixa_centavos_padrao` 0023:94-95; `localidades.tarifa_fixa_centavos` 0023:118-119 |
| Exceção: `split_registros.valor_centavos` sem check de sinal | 0005:49 |
| Piso da edição ≥ valor da Sede | `piso_cobre_sede` 0001:88 |
| Preço bruto − desconto ≥ valor da Sede (congelados na matrícula) | `respeita_piso` 0004:61 |
| Desconto: percentual 0..100 **ou** valor em centavos, coerente com `tipo` | `regras_desconto` 0004:15-16, 25-28 |
| Uma edição por localidade e ano | `edicao_unica_por_ano` 0001:87 |
| Uma matrícula por pessoa e turma | `matricula_unica` 0004:59 |
| Snapshot congelado na matrícula: função doutrinária, preço bruto, desconto, regra, valor da Sede | 0004:39-47 (`on delete set null` nas FKs de `funcao_snapshot_id` e `regra_desconto_id`: apagar a regra não descongela o valor) |
| MDR em `numeric(5,3)` percentual, `>= 0 and < 100`; parcelas 1..24 (nacional e override) | 0023:85-95, 112-117 |
| Parcelas de pagamento ≥ 1; meio ∈ pix/cartão à vista/parcelado (sem boleto); modo ∈ split/centralizado | 0005:24-28 |

### 7.4 Curso, presença, vídeo, prova, certificado

| Regra | Onde |
|---|---|
| Tipo de turma não é pré-requisito de si mesmo | `nao_autorreferente` 0003:21 |
| Capacidade de turma nula ou > 0 (não imposta na matrícula) | 0003:39 |
| Uma apostila por (ano, tipo); etapa/aula numeradas > 0 e únicas por pai; página > 0 | 0015:47, 57, 62, 71-73, 78 |
| Aula complementar: provider ∈ vimeo/bunny; provider e id andam juntos; duração ≥ 0; única por (ano, número) | 0015:95-105 |
| Uma grade por (edição, tipo); uma etapa da apostila por grade; uma aula por etapa da grade; `hora_fim > hora_inicio` | 0015:120, 135-138, 163 |
| Presença única por (matrícula, aula da grade); origem ∈ presencial/ead/importacao | 0015:192-195 |
| Progresso único por (pessoa, aula complementar); segundos/posição ≥ 0; percentual 0..100; **só o servidor escreve** | 0015:203-209; 0019:45 |
| Prova: duração > 0; `tentativas_max` > 0 (não imposto); `publicada` filtra só no app | 0007:30, 0020:14-17 |
| Questão: tipo ∈ múltipla escolha/V-F/dissertativa; gabarito em tabela separada só da Sede | 0007:39-40, 0020:35-49 |
| Tentativa: nota nula ou 0..100; aluno insere a própria; uma resposta por (tentativa, questão); **respostas só pelo servidor** | 0007:54, 0011:305-310, 0020:79, 97 |
| Critério de aprovação nacional por ano: presença ≥ 75 %, nota ≥ 70, vídeo ≥ 0 % (defaults), todos 0..100 | 0020:106-115 |
| Certificado: um por matrícula; `codigo_validacao` único; `numero` único; número alocado por `nextval` no formato `CICLO-<ano>-<6 dígitos>`; **só o servidor emite**; snapshots de nome, localidade, tipo, ano, presença, nota | 0007:63-67, 0021:26-66, 86 |
| Matrícula: 7 status; `aguardando_prerequisito` só sai por `dispensar_prerequisito` (→ `pendente`) ou `recusar_prerequisito` (→ `cancelada`), com motivo e auditoria | 0017 |

### 7.5 Trilha, fila e LGPD

| Regra | Onde |
|---|---|
| `auditoria` só cresce; cliente só lê (Sede). `acao` gravadas: `dispensa_prerequisito`, `recusa_prerequisito` (SQL 0017:86,115); `pessoa.criada`, `papel.concedido`, `papel.revogado`, `importacao.previa`, `importacao.efetivada`, `acesso.email_alterado`, `concluido` (app) | 0011:358-359 |
| Notificação: canal ∈ email/whatsapp; status ∈ pendente/enviada/falhou/cancelada; `chave_unica` única (idempotência); só o servidor escreve | 0022:24-37 |
| Consentimento: versão do texto obrigatória, IP `inet`; só leitura pelo titular e Sede | 0009:78-87 |
| Configuração: singleton `id = 1`, linha criada na migration; prazo de arrependimento ≥ 0 | 0023:47-48, 81-82, 107 |
| Pedido de exclusão: nome e e-mail informados obrigatórios (sobrevivem à exclusão); status ∈ recebida/em_analise/atendida/recusada; só Sede lê e decide | 0023:140-159, 187-189 |
| Importação: status ∈ previa/efetivada/cancelada; histórico com `situacao` ∈ concluido/desistente/reprovado | 0009:12-13, 45 |
| Webhook Cielo: `idempotency_key` única; nenhum acesso de cliente | 0005:58, 0011:366-367 |

### 7.6 Integridade referencial (ações de delete que codificam regra)

| `restrict` (impede apagar) | `cascade` (apaga junto) | `set null` (esquece a referência) |
|---|---|---|
| `localidade_regionais.regional_id`; `edicoes.localidade_id`; `pessoa_funcao_hist.funcao_id`; `tipo_turma_prereq.tipo_prerequisito_id`; `turmas.tipo_turma_id`; `matriculas.pessoa_id`, `matriculas.turma_id`; `dispensas_prereq.autorizado_por`; `pagamentos.matricula_id`; `apostilas.tipo_turma_id`; `grades.tipo_turma_id`, `grades.apostila_id`; `grade_etapas.apostila_etapa_id`; `grade_etapa_orientadores.pessoa_id`; `grade_aulas.apostila_aula_id` | tudo que é "filho" (matrícula → dispensas, tentativas, presenças, certificados; edição → turmas, grades, provas; pessoa → papéis, histórico, consentimentos, progresso; localidade → papéis, landing, credenciais) | `pessoas.auth_user_id`; todo `registrado_por` / `autor_id` / `criado_por` / `resolvido_por` / `decidido_por` / `atualizado_por` / `ator_id`; `matriculas.funcao_snapshot_id`, `regra_desconto_id`, `desconto_autorizado_por`; `edicoes.local_id`; `equivalencias.tipo_turma_id`; `grade_aulas.orientador_id`; `historico_turma.importacao_id`; `notificacoes.pessoa_id`; `solicitacoes_exclusao.pessoa_id` |

Consequência prática: uma pessoa com matrícula **não pode ser apagada** (`restrict`), e um `delete` em `pessoas` que passe (sem matrícula) leva junto papéis, histórico doutrinário, consentimentos e progresso, mas deixa auditoria, notificações e pedido de exclusão com `null`.

## 8. Achados da verificação mecânica (o que a leitura não mostra)

1. **`webhooks_cielo`: privilégio sem policy.** `authenticated` tem SIUD (0014:34-36) e a tabela não tem policy nenhuma; o acesso é negado só pelo RLS. Segura, mas contradiz a regra do SNI Conecta de "tabela de segredo sem GRANT".
2. **`localidade_credenciais_cielo`: ciphertext alcançável pelo navegador.** Policy `cred_cielo_sede` + GRANT SIUD: a Sede logada lê `merchant_key_cipher` via PostgREST. Sem código que use, hoje é vazio.
3. **`grant select` que não restringe.** `notificacoes` (0022:64), `questao_gabarito` (0020:149) e `criterios_aprovacao` (0020:152) recebem `grant select`/`grant SIUD` **depois** de já terem SIUD pelo default privilege da 0014:50-51; só `certificados`, `progresso_video` e `respostas` têm `revoke` de escrita. Nas outras 47 tabelas a escrita pelo cliente depende exclusivamente de haver ou não policy de escrita.
4. **`app.*` executáveis por `PUBLIC`.** Todas as 12 funções mantêm `=X` (padrão). São `security definer` e leem `papeis`/`pessoas` ignorando RLS; com `auth.uid()` nulo devolvem vazio/false, então não vazam — mas a consolidada deve revogar de `public`/`anon` por princípio.
5. **Policies que a 0016 não alcançou** e ainda usam `pode_admin_localidade` (inclui presidente de UAP): `grades_write`, `grade_etapas_write`, `grade_orientadores_write`, `grade_aulas_write` (0015:258-310), `provas_write` (0011:279-282), `split_select` (0011:225-232). A matriz de `permissoes.ts:119` dá `grade.gerir` só a sede/coordenador/orientador — o RLS é mais permissivo que a matriz nesse ponto.
6. **`landing_update` perdeu a trava.** A 0016:113-117 trocou `for update … and not travado_pela_sede` por `for all … pode_coordenar`: o coordenador pode inserir/apagar a landing e editar mesmo travada, pelo cliente. A trava só existe na aplicação.
7. **`tentativas_insert` sem checagem de `publicada`, `prazo_em` ou `ordem_questoes`.** O aluno insere a tentativa com quaisquer valores; a proteção é o servidor sobrescrever. Não há policy de UPDATE, então ele não altera depois — mas insere quantas quiser (`tentativas_max` não é imposto no banco).
8. **`questoes_select` para o aluno depende de existir tentativa**; professor e coordenador não leem enunciado pelo cliente (só a Sede). Qualquer tela de correção/acompanhamento de prova para o local precisa de `service_role`.
9. **`provas_select using (true)`**: qualquer autenticado lê título, duração e `publicada` de todas as provas de todas as edições.
10. **`edicoes_select using (true)`**: qualquer autenticado (inclusive aluno) lê `preco_centavos`, `valor_sede_centavos` e `piso_centavos` de todas as localidades; e `localidades` expõe `mdr_percent`/`tarifa_fixa_centavos` a todos. Se MDR negociado é confidencial, é vazamento de política comercial, não de dado pessoal.
11. **`progresso_select_equipe` sem escopo temporal**: quem conduz qualquer turma em que a pessoa já se matriculou vê o progresso de vídeo dela em qualquer ano.
12. **Coerência entre grade, turma e presença não é imposta**: `presencas.grade_aula_id` pode ser de outra grade que não a da turma da matrícula; `grades.apostila_id` pode ser de outro tipo/ano; `tentativas.prova_id` pode ser de outra edição. Tudo depende da aplicação.
13. **`criterios_aprovacao` não nasce com o `ciclo_anos`** apesar do comentário 0020:104; nasce no primeiro upsert da tela.
14. **`atualizado_em` sem trigger** em `localidade_credenciais_cielo`, `progresso_video`, `landing_pages`, `criterios_aprovacao`, `configuracoes`.
15. **Colunas nunca tocadas pelo app**: `papeis.edicao_id`, `certificados.sequencial`, `certificados.pdf_path`, `questao_gabarito.explicacao`, `matriculas.desconto_autorizado_por`, `importacao_conflitos.resolvido_por`, `pagamentos.cielo_payment_id`, `localidade_credenciais_cielo.*`, `local_fotos.*`, `webhooks_cielo.*`.
16. **`pessoas_update_self` deixa a pessoa alterar o próprio CPF, CodSNI e e-mail** pelo cliente (o `with check` só exige que continue sendo ela). A aplicação usa `service_role` para isso, mas a porta do PostgREST está aberta.
17. **`papeis_write` só Sede**, mas a matriz dá `papel.conceder` e `pessoa.gerir` ao coordenador: as telas de papel/pessoa do coordenador dependem de `service_role` e de `exigirCapacidade` — nada no banco impede um bug de Server Action de conceder papel em outra localidade.
18. **Índices redundantes**: `idx_pessoas_auth_user` (há unique), `idx_etapas_apostila`, `idx_apostila_aulas_etapa`, `idx_complementares_ano` (há unique com as mesmas colunas na mesma ordem). Índices ausentes: `provas(edicao_id)`, `tentativas(prova_id)`, `pagamentos(status)`, `pessoas(cpf)` já é unique; busca por nome com `ilike` não usa `idx_pessoas_nome`.
19. **`config.toml` fixa `major_version = 15`** e a view exige 15+; o harness deste estudo rodou em Postgres 16 sem diferença.
20. **`schema_migrations` do bundle** (`bundle.sql:2619-2632`) registra as 23 versões; um projeto novo com migration consolidada não deve importar esse registro.

