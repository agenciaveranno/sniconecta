# Módulo Ciclo — domínio, rotas, regras e porte (estudo para a reescrita)

Recorte: o que o plano de fundação (`SNICONECTAFUNDACAO.md` §2.2) chama de
**módulo Ciclo** — todas as telas de `/admin/*` (menos `pessoas`, `papeis` e
`configuracoes`, que são plataforma), `/aulas`, `/provas`, `/meu-curso`,
`/l/[slug]`, `/certificado`, `/politicas`, a rota `/api/video/progresso` e as
libs `certificado/`, `prova/`, `presenca/`, `video/`, `pagamento/`,
`importacao/` e `dominio/{desconto,prerequisito,apostila}.ts`.

Este documento complementa `ciclo-esquema.md` (tabelas e RLS) e
`ciclo-plataforma.md` (auth, permissões, comunicação, configuração). Ele não
repete o que está lá: cita.

---

## 0. Fontes, método e o que NÃO foi encontrado

Fonte: `/home/user/sistema-ciclo` (Next 14.2 · React 18.3 · Tailwind 3.4 ·
Supabase JS 2.45 / SSR 0.5 · zod 3.23 · vitest 2). Tudo lido arquivo a
arquivo com `cat -n`; nada resumido de memória. Linhas citadas como
`arquivo:linha`.

| O que | Números |
|---|---|
| Especificação | `ESPECIFICACAOCICLOPROSPERIDADE.md`, 646 linhas, v1.0, 18 seções |
| Rotas do módulo (páginas + rotas de API) | 33 (20 admin, 10 público/aluno, 2 API, 1 manifest) |
| Arquivos `actions.ts` no recorte | 16, com **46 Server Actions exportadas** (37 do módulo; 8 de estrutura e 1 de políticas são plataforma) |
| Chamadas de `exigirCapacidade` nas actions do recorte | 36 (ver §1.8 — as que faltam) |
| Libs do módulo | `certificado/` 349 l · `prova/` 218 · `presenca/` 101 · `video/` 423 · `pagamento/` 139 · `importacao/` 395 · `dominio/{desconto,prerequisito,apostila}` 240 |
| Componentes de cliente (`"use client"`) | 14 arquivos no repositório; **9 pertencem ao módulo** (§3) |
| Testes do módulo | 6 arquivos, 69 casos `it()` (`desconto` 10, `prerequisito` 5, `previa` 8, `fila-presenca` 11, `prova` 24, `progresso-video` 11), mais `permissoes` (16) que valida a matriz |

**Procurei e NÃO existe no código** (afirmações do README/plano que o código não
sustenta — cada uma vira item de decisão no porte):

1. **Nenhuma chamada à Cielo.** `grep -rn "webhooks_cielo\|localidade_credenciais_cielo\|MERCHANT\|cripto\|cifrar" src` → zero. Não há rota de webhook, não há leitura de credencial, não há captura. `src/lib/pagamento/index.ts` só grava `pagamentos` com `status='pendente'` e as três fatias em `split_registros` (§2.2).
2. **`src/lib/cripto.ts` não existe** em `/home/user/sistema-ciclo/src/lib/` (o plano §2.1 o lista com ~90 linhas; a listagem real de `src/lib` não o tem). `CREDENCIAIS_ENCRYPTION_KEY` aparece só em `.env.example:23`. A tabela `localidade_credenciais_cielo` (0005) nasce e morre sem código. O `src/lib/cripto.ts` que existe é o do **sniconecta**, escrito pela sessão de eventos.
3. **Nenhuma tela para `tipos_turma`, `tipo_turma_prereq` e `equivalencias`** (capacidade `tipos.gerir` não é usada por nenhuma action). Só o seed `0012`. A equivalência "editável pela Sede" (§6.2) hoje é editável só por SQL.
4. **Nenhuma tela de desconto manual / isenção** (§7.4). As colunas `matriculas.desconto_autorizado_por` e `desconto_motivo` (0004:50-51) nunca são escritas; `desconto.autorizar` não é chamada por nenhuma action. A tela `/admin/descontos/concedidos` só LÊ `desconto_motivo` (`concedidos/page.tsx:36,133`).
5. **Nenhuma tela de aprovação/cancelamento/transferência de matrícula** (`matricula.decidir` não é chamada). A matrícula muda de status só por: `dispensar_prerequisito` / `recusar_prerequisito` (SQL), `emitirCertificado` (→ `concluida`). Nada leva `pendente → ativa` — ver §2.1.11.
6. **`landing.editar` não é conferida em lugar nenhum**: `salvarLanding` e `publicarLanding` (`localidades/[id]/landing/actions.ts:24-64`) não chamam `exigirCapacidade`; dependem só do RLS `landing_update` (0011:326) e do `isSede` para a trava.
7. **`importacao.executar` não é conferida via `exigirCapacidade`**: as duas actions usam `eu?.isSede` (`importacao/actions.ts:77,186`).
8. **Adaptadores de player no cliente (`ControlePlayer`) não existem**: a interface está em `video/tipos.ts:53-58`, mas `Player.tsx:17-22` diz explicitamente que estima a posição pelo tempo em tela porque o `postMessage` de cada provedor ainda não foi implementado.
9. **Tabela legada `aulas` (0006) e `presencas.aula_id` não são usados** — `grep 'from("aulas")\|aula_id'` (excluindo `grade_aula_id`, `aula_complementar_id`, `apostila_aula_id`) → zero. O código só fala com `aulas_complementares`, `grade_aulas` e `presencas.grade_aula_id`.
10. **`turma.gerir` é usada nas actions mas o guard do layout não a inclui** (`admin/layout.tsx:26-33`): um papel que só tivesse `turma.gerir` não entraria em `/admin`. Hoje não há tal papel (a matriz dá `turma.gerir` junto de `edicao.gerir`), mas é armadilha para a reescrita.
11. **Não há `matricula.ver` como guard de tela do aluno**: `/meu-curso`, `/aulas`, `/provas` só exigem sessão (`pessoaAtual`); o painel usa `matricula.ver` apenas para mostrar o atalho (`painel/page.tsx:60-74`).

---

## 1. Rotas → arquivo → Server Actions → capacidade → tabelas

### 1.1 Como a autorização acontece hoje (para ler as tabelas abaixo)

Três camadas, nem sempre as três presentes:

| Camada | Onde | O que faz |
|---|---|---|
| Layout `/admin` | `src/app/admin/layout.tsx:22-33` | `pessoaAtual()`; entra quem tem **qualquer** de `estrutura.gerir`, `ciclo.gerir`, `edicao.gerir`, `grade.gerir`, `pessoa.gerir`, `presenca.lancar`, `prerequisito.dispensar`. É filtro de navegação, não autorização (comentário l.18-19). |
| Guard da página | `if (!eu.pode("x")) redirect("/painel")` | Só nas páginas escritas na fase 4+ (`descontos/concedidos`, `dispensas`, `chamada`, `certificados`, `provas`). As da fase 2-3 (`regionais`, `localidades`, `locais`, `ciclos`, `apostilas`, `edicoes`, `grades`, `descontos`, `importacao`) **não têm guard próprio** — confiam no layout + RLS. |
| Server Action | `await exigirCapacidade("x"[, localidadeId])` na primeira linha | 36 chamadas no recorte (§1.8). Só `certificados/actions.ts:36` passa `localidadeId`. |
| RLS | policies em 0011/0015/0018/0019/0020/0021 | Última linha. Ver `ciclo-esquema.md` §3. |

Dois clientes Supabase: `criarClienteServidor()` (cookies → RLS vale) e
`criarClienteServico()` (`service_role`, ignora RLS). A coluna "Cliente" abaixo
diz qual a página/action usa, porque isso muda o que o porte precisa preservar.

### 1.2 Menu lateral e atalhos do painel (o que vira `src/modulos/registro.ts`)

`src/app/admin/Sidebar.tsx:36-74` — constante `SECOES`:

| Seção | Item | `href` | Capacidade |
|---|---|---|---|
| Estrutura | Regionais | `/admin/regionais` | `estrutura.gerir` |
| Estrutura | Localidades | `/admin/localidades` | `estrutura.gerir` |
| Estrutura | Locais | `/admin/locais` | `estrutura.gerir` |
| Minha localidade | Edições e turmas | `/admin/minha-localidade` | `edicao.gerir` |
| Minha localidade | Dispensas | `/admin/dispensas` | `prerequisito.dispensar` |
| Minha localidade | Chamada | `/admin/chamada` | `presenca.lancar` |
| Minha localidade | Certificados | `/admin/certificados` | `certificado.emitir` |
| Programa | Ciclo anual | `/admin/ciclos` | `ciclo.gerir` |
| Programa | Provas | `/admin/provas` | `prova.gerir` |
| Pessoas | Cadastro | `/admin/pessoas` | `pessoa.gerir` (plataforma) |
| Configuração | Descontos | `/admin/descontos` | `politica_desconto.gerir` |
| Configuração | Concedidos | `/admin/descontos/concedidos` | `financeiro.ver` |
| Configuração | Importação | `/admin/importacao` | `importacao.executar` |
| Configuração | Sistema e LGPD | `/admin/configuracoes` | `configuracao.gerir` (plataforma) |

`src/app/painel/page.tsx:27-83` — constante `ATALHOS` (por capacidade):
`/admin/localidades` (`estrutura.gerir`), `/admin/minha-localidade` ×2
(`edicao.gerir`, `prerequisito.dispensar`), `/meu-curso`, `/aulas`, `/provas`
(`matricula.ver`), `/admin/importacao` (`importacao.executar`).

`src/app/manifest.ts:18` — `start_url: "/admin/chamada"` (PWA instalado abre na
chamada).

### 1.3 Rotas administrativas

Legenda da coluna Cliente: **S** = `criarClienteServidor` (RLS), **Svc** =
`criarClienteServico`, **B** = `criarClienteBrowser` (no navegador). "Destino"
é a sugestão de rota no SNI Conecta (§5.1).

| # | Rota atual | Arquivo (linhas) | Guard da página | Server Actions → capacidade | Tabelas tocadas (L = lê, E = escreve) | Cliente | Destino |
|---|---|---|---|---|---|---|---|
| A1 | `/admin` (layout) | `admin/layout.tsx` (83) | ver §1.1 | — | L `pessoas`, `papeis` (via `pessoaAtual`) | S | `Painel.tsx` da plataforma |
| A2 | `/admin/regionais` | `admin/regionais/page.tsx` (83), `actions.ts` (43) | só layout | `criarRegional` → `estrutura.gerir` (l.18); `alternarAtivoRegional` → `estrutura.gerir` (l.37) | L/E `regionais` | S | **plataforma** `/admin/regionais` |
| A3 | `/admin/localidades` | `admin/localidades/page.tsx` (104), `actions.ts` (145) | só layout | `criarLocalidade` (l.18), `alternarAtivoLocalidade` (l.42) → `estrutura.gerir` | L `localidades`, `localidade_regionais`; E `localidades` | S | **plataforma** `/admin/localidades` |
| A4 | `/admin/localidades/[id]` | `admin/localidades/[id]/page.tsx` (259) | só layout | `vincularRegional` (l.51), `desvincularRegional` (l.62) → `estrutura.gerir`; `criarEdicao` (l.86), `alternarStatusEdicao` (l.138) → `edicao.gerir` | L `localidades`, `localidade_regionais(regionais)`, `regionais`, `locais`, `edicoes(locais)`; E `localidade_regionais`, `edicoes` | S | ficha da localidade é **plataforma**; o bloco "Edições anuais" (l.164-256) vira **`/ciclo/localidades/[id]`** ou bloco do módulo na ficha |
| A5 | `/admin/localidades/[id]/landing` | `admin/localidades/[id]/landing/page.tsx` (168), `actions.ts` (106) | só layout | `salvarLanding` (l.24) → **nenhuma**; `publicarLanding` (l.57) → **nenhuma**; `alternarTravaLanding` (l.67) → `isSede`; `reverterLanding` (l.79) → `isSede` | L `localidades`, `landing_pages`, `landing_versoes(pessoas)`; E `landing_pages`, `landing_versoes` | S | `/ciclo/localidades/[id]/landing`, cap `ciclo.landing.editar` |
| A6 | `/admin/locais` | `admin/locais/page.tsx` (76), `actions.ts` (65), `CamposLocal.tsx` (57) | só layout | `criarLocal` (l.35), `atualizarLocal` (l.51) → `estrutura.gerir` | L/E `locais` | S | **plataforma** (ver `ciclo-esquema.md` §4.2 sobre `locais`) |
| A7 | `/admin/minha-localidade` | `admin/minha-localidade/page.tsx` (78) | `isSede` → `/admin/localidades`; 0 localidades → `/painel`; 1 → `/admin/localidades/[id]`; N → seletor | — | L `localidades` (`in eu.localidades`) | S | `/ciclo/minha-localidade` (seletor de contexto §5.2) |
| A8 | `/admin/ciclos` | `admin/ciclos/page.tsx` (100), `actions.ts` (167) | só layout | `criarCicloAno` (l.18) → `ciclo.gerir` | L `ciclo_anos(apostilas, aulas_complementares)`; E `ciclo_anos` | S | `/ciclo/anos` |
| A9 | `/admin/ciclos/[id]` | `admin/ciclos/[id]/page.tsx` (237) | só layout | `atualizarCicloAno` (l.39), `criarApostila` (l.61), `criarAulaComplementar` (l.118), `alternarLiberadaComplementar` (l.159) → `ciclo.gerir` | L `ciclo_anos`, `apostilas(tipos_turma, apostila_etapas)`, `tipos_turma`, `aulas_complementares`; E `ciclo_anos`, `apostilas`, `apostila_etapas`, `apostila_aulas`, `aulas_complementares` | S | `/ciclo/anos/[id]` |
| A10 | `/admin/apostilas/[id]` | `admin/apostilas/[id]/page.tsx` (185), `actions.ts` (130) | só layout | `atualizarEtapa` (l.15), `atualizarAulaApostila` (l.44), `adicionarEtapa` (l.72), `adicionarAula` (l.108) → `ciclo.gerir` | L `apostilas(tipos_turma, ciclo_anos)`, `apostila_etapas(apostila_aulas)`; E `apostila_etapas`, `apostila_aulas` | S | `/ciclo/apostilas/[id]` |
| A11 | `/admin/edicoes/[id]` | `admin/edicoes/[id]/page.tsx` (258), `actions.ts` (78) + `grades/actions.ts:17` | só layout | `criarTurma` (l.17), `vincularProfessor` (l.43), `desvincularProfessor` (l.66) → `turma.gerir`; `criarGrade` (`grades/actions.ts:17`) → `grade.gerir` | L `edicoes(localidades)`, `tipos_turma`, `turmas(tipos_turma, turma_professores(pessoas))`, `grades(tipos_turma, grade_etapas)`, `apostilas(tipos_turma, ciclo_anos!inner)`, `pessoas` (por CPF); E `turmas`, `turma_professores`, `grades`, `grade_etapas`, `grade_aulas` | S | `/ciclo/edicoes/[id]` |
| A12 | `/admin/grades/[id]` | `admin/grades/[id]/page.tsx` (287), `grades/actions.ts` (186) | só layout | `definirEtapa` (l.84), `adicionarOrientador` (l.109), `removerOrientador` (l.149), `atribuirAula` (l.173) → `grade.gerir` | L `grades(tipos_turma, edicoes(localidades), apostilas(ciclo_anos))`, `grade_etapas(apostila_etapas, grade_etapa_orientadores(pessoas), grade_aulas(apostila_aulas))`, `pessoas` (por CPF); E `grade_etapas`, `grade_etapa_orientadores`, `grade_aulas` | S | `/ciclo/grades/[id]` |
| A13 | `/admin/descontos` | `admin/descontos/page.tsx` (107), `actions.ts` (89), `NovaRegra.tsx` (108) | só layout | `criarRegraDesconto` (l.37), `alternarAtivoRegra` (l.82) → `politica_desconto.gerir` | L/E `regras_desconto` | S | `/ciclo/descontos` |
| A14 | `/admin/descontos/concedidos` | `admin/descontos/concedidos/page.tsx` (145) | `financeiro.ver` (l.28) | — | L `matriculas(regras_desconto, turmas(edicoes(localidades)))` com `desconto_centavos > 0`, limit 500 | S | `/ciclo/descontos/concedidos` |
| A15 | `/admin/dispensas` | `admin/dispensas/page.tsx` (159), `actions.ts` (69) | `prerequisito.dispensar` (l.36) | `dispensarPrerequisito` (l.22) → `prerequisito.dispensar` → `rpc dispensar_prerequisito`; `recusarPrerequisito` (l.47) → idem → `rpc recusar_prerequisito` | L `matriculas(pessoas, turmas(tipos_turma, edicoes(localidades)))` status `aguardando_prerequisito`; E (dentro do RPC, 0017) `dispensas_prereq`, `matriculas`, `auditoria` | S | `/ciclo/dispensas` |
| A16 | `/admin/chamada` | `admin/chamada/page.tsx` (94) | `presenca.lancar` (l.21) | — | L `grade_aulas(apostila_aulas, grade_etapas(grades(edicoes(localidades), tipos_turma)))` limit 300 | S | `/ciclo/chamada` |
| A17 | `/admin/chamada/[id]?turma=` | `admin/chamada/[id]/page.tsx` (149), `Chamada.tsx` (253) | `presenca.lancar` (l.29) | **nenhuma Server Action**: `Chamada.tsx:111-113` faz `upsert` em `presencas` direto do navegador (`onConflict: "matricula_id,grade_aula_id"`) | L `grade_aulas(...)`, `turmas`, `matriculas(pessoas)` status `pendente/ativa`, `presencas`; E `presencas` (navegador, RLS `presencas_write` 0018:29) | S + **B** | `/ciclo/chamada/[id]` — ver §5.6 |
| A18 | `/admin/certificados` | `admin/certificados/page.tsx` (133), `actions.ts` (45) | `certificado.emitir` (l.29) | `emitir` (l.18) → lê localidade via Svc e **depois** `exigirCapacidade("certificado.emitir", localidadeId)` (l.36) → `emitirCertificado` | L `matriculas(pessoas, turmas(tipos_turma, edicoes(localidades)))` (S, limit 200), `certificados` (Svc), `presencas`, `tentativas`, `progresso_video`, `ciclo_anos`, `criterios_aprovacao` (Svc, por matrícula); E `certificados`, `matriculas.status`, `notificacoes` | S + Svc | `/ciclo/certificados` |
| A19 | `/admin/provas` | `admin/provas/page.tsx` (173), `actions.ts` (154) | `prova.gerir` (l.24) | `criarProva` (l.21), `alternarPublicacao` (l.38), `salvarCriterio` (l.137) → `prova.gerir` | L `edicoes(localidades)`, `provas(edicoes(localidades))`, `ciclo_anos`, `criterios_aprovacao`, `questoes` (count); E `provas`, `criterios_aprovacao` | S | `/ciclo/provas` |
| A20 | `/admin/provas/[id]` | `admin/provas/[id]/page.tsx` (121) | `prova.gerir` (l.28) | `criarQuestao` (`provas/actions.ts:71`) → `prova.gerir` | L `provas`, `questoes(questao_gabarito)`; E `questoes`, `questao_gabarito` | S | `/ciclo/provas/[id]` |
| A21 | `/admin/importacao` | `admin/importacao/page.tsx` (19), `actions.ts` (297), `ImportadorCliente.tsx` (170) | só `pessoaAtual` (l.7) | `gerarPreviaImportacao` (l.75) → `isSede`; `efetivarImportacao` (l.184) → `isSede` | L `pessoas` (paginado 1000), `tipos_turma`, `equivalencias`, `importacoes`, `funcoes_doutrinarias`, `pessoa_funcao_hist` (count); E `importacoes`, `importacao_conflitos`, `auditoria`, `pessoas` (upsert por CPF), `pessoa_funcao_hist`, `historico_turma` | Svc | `/ciclo/importacao` — decidir se é plataforma (importa `pessoas`) ou módulo (importa `historico_turma`); ver §5.7 |

### 1.4 Rotas públicas e do aluno

| # | Rota atual | Arquivo (linhas) | Sessão / guard | Server Actions → capacidade | Tabelas tocadas | Cliente | Destino |
|---|---|---|---|---|---|---|---|
| P1 | `/` | `app/page.tsx` (39) | pública; lê `auth.getUser()` só para trocar o botão | — | — | S | plataforma |
| P2 | `/painel` | `app/painel/page.tsx` (162) | `pessoaAtual` | `sair` (plataforma) | L `pessoas`, `papeis` | S | plataforma (hub) |
| P3 | `/meu-curso` | `app/meu-curso/page.tsx` (179) | `pessoaAtual` (l.29), sem capacidade | — | L `matriculas(turmas(tipos_turma, edicoes(localidades)))` do `pessoa_id`, `certificados`, e por matrícula `presencas`, `tentativas`, `matriculas`, `progresso_video`, `ciclo_anos`, `criterios_aprovacao` | Svc | `/ciclo/meu-curso` |
| P4 | `/aulas` | `app/aulas/page.tsx` (143) | `pessoaAtual` (l.21) | — | L `ciclo_anos` (último ano), `aulas_complementares`, `progresso_video` | Svc | `/ciclo/aulas` |
| P5 | `/aulas/[id]` | `app/aulas/[id]/page.tsx` (92), `Player.tsx` (119) | `pessoaAtual` (l.22) + `liberarAula` | — | L `aulas_complementares`, `matriculas`, `pagamentos`, `progresso_video` | Svc | `/ciclo/aulas/[id]` |
| P6 | `POST /api/video/progresso` | `app/api/video/progresso/route.ts` (115) | `pessoaAtual` (l.38) → 401 | — (rota) | L `aulas_complementares`, `progresso_video`; E `progresso_video` (upsert `pessoa_id,aula_complementar_id`) | Svc | `/api/ciclo/video/progresso` |
| P7 | `/provas` | `app/provas/page.tsx` (104), `actions.ts` (220) | `pessoaAtual` (l.14) | `iniciarTentativa` (l.32) → sessão + matrícula ativa na edição | L `matriculas(turmas)`, `provas` (`publicada`, `in edicao_id`), `tentativas`; action: L `provas`, `matriculas!inner turmas`, `tentativas`, `questoes`; E `tentativas` | Svc | `/ciclo/provas` |
| P8 | `/provas/[id]/tentativa/[tid]` | `app/provas/[id]/tentativa/[tid]/page.tsx` (127), `Cronometro.tsx` (56) | `pessoaAtual` + dono da tentativa (l.49) | `enviarProva` (`provas/actions.ts:115`) → sessão + dono | L `tentativas(matriculas, provas)`, `questoes`; action: L `tentativas(...)`, `questoes(questao_gabarito)`; E `respostas` (upsert), `tentativas` | Svc | `/ciclo/provas/[id]/tentativa/[tid]` |
| P9 | `/provas/[id]/resultado/[tid]` | `app/provas/[id]/resultado/[tid]/page.tsx` (80) | `pessoaAtual` + dono (l.45) | — | L `tentativas(matriculas, provas)` | Svc | `/ciclo/provas/[id]/resultado/[tid]` |
| P10 | `/l/[slug]` | `app/l/[slug]/page.tsx` (159) | pública (middleware libera `/l/`) | — | L `localidades` (por slug, `ativo`), `landing_pages` (`publicado`), `edicoes` (`inscricoes_abertas`, mais recente) | Svc | `/l/[slug]` (mantém, plano §3.2) |
| P11 | `/l/[slug]/matricula` | `app/l/[slug]/matricula/page.tsx` (97), `MatriculaForm.tsx` (173), `actions.ts` (387) | pública | `inscrever` (l.42) → **nenhuma** (é o fluxo público); validação toda no servidor | página: L `localidades`, `edicoes`, `turmas(tipos_turma)`, `configuracoes` + `localidades` (política). action: ver §2.1 — L `turmas(edicoes)`, `configuracoes`, `localidades`, `pessoas`, `matriculas`, `tipo_turma_prereq`, `historico_turma`, `equivalencias`, `tipos_turma`, `regras_desconto`, view `pessoa_funcao_atual`; E `pessoas`, `consentimentos_lgpd`, `matriculas`, `pagamentos`, `split_registros`, `notificacoes` | Svc | `/l/[slug]/matricula` |
| P12 | `/certificado/[codigo]` | `app/certificado/[codigo]/page.tsx` (90) | pública | — | L `certificados` (por `codigo_validacao`) | Svc | `/certificado/[codigo]` (mantém) |
| P13 | `GET /certificado/[codigo]/pdf` | `app/certificado/[codigo]/pdf/route.ts` (57) | pública | — | L `certificados` | Svc | idem |
| P14 | `/politicas` | `app/politicas/page.tsx` (143), `actions.ts` (90), `FormExclusao.tsx` (63) | pública | `solicitarExclusao` (l.27) → **nenhuma** (POST aberto, comentário l.11-17) | L `configuracoes`, `solicitacoes_exclusao`; E `solicitacoes_exclusao` | Svc | **plataforma** (`configuracao.gerir` / `lgpd.decidir`); o texto do consentimento do Ciclo aponta para cá (`MatriculaForm.tsx:149-156`) |
| P15 | `POST /api/notificacoes/processar` | `app/api/notificacoes/processar/route.ts` (36) | `Bearer CRON_SECRET` (l.20-31) | — | fila `notificacoes` | Svc | **plataforma** (já existe no sniconecta) |
| P16 | `/manifest.webmanifest` | `app/manifest.ts` (30) | pública | — | — | — | `start_url` passa a `/ciclo/chamada` |

Rotas públicas no middleware (`src/lib/supabase/middleware.ts:18-27`): `/`,
`/login*`, `/l/*`, `/certificado/*`, `/politicas*`, `/auth*`. Teste em
`tests/middleware.test.ts:4-34`. O `proxy.ts` do sniconecta já cobre `/l/`,
`/certificado/` e `/politicas` (`src/proxy.ts:12-13`).

### 1.5 Detalhe das 46 Server Actions do recorte (validação, redirecionamento, escrita)

Padrão comum (fase 2-3): `zod.safeParse` → erro vira
`redirect(\`${back}?erro=${encodeURIComponent(msg)}\`)`; sucesso →
`revalidatePath(back)` + `redirect(back)`. Código `23505` (unique) é traduzido
em mensagem humana em `criarLocalidade:34`, `criarEdicao:130`,
`criarCicloAno:32`, `criarApostila:80`, `criarAulaComplementar:152`,
`vincularProfessor:59`, `adicionarOrientador:142`, `criarGrade:50`. As actions
de fase 4+ (`dispensas`, `provas`, `certificados`) e as públicas devolvem
objeto (`RespostaInscricao`, `RespostaPrevia`) em vez de redirecionar.

**Estrutura (plataforma, listadas para completude)**
- `regionais/actions.ts` — `criarRegional` (schema l.12-15: nome ≥ 2, UF `^[A-Z]{2}$`), `alternarAtivoRegional`.
- `locais/actions.ts` — `criarLocal`, `atualizarLocal` (schema l.10-19; `email` vazio → `null` l.43,60).
- `localidades/actions.ts` — `criarLocalidade` (slug = `slugify(slug || nome)` l.26), `alternarAtivoLocalidade`, `vincularRegional`, `desvincularRegional`.

**Edição (módulo)** — `localidades/actions.ts:76-145`
- `criarEdicao` (l.85): schema l.76-83 (`ano` 2000-2100, `local_id` uuid ou vazio, `preco`, `valor_sede`, `margem_taxas` opcional, `prerequisito_ativo` checkbox). Converte com `reaisParaCentavos`; **piso = valor_sede + margem** (l.114); recusa `preco < piso` (l.115-117); insere `edicoes` com `piso_centavos` e `prerequisito_ativo = (=== "on")`.
- `alternarStatusEdicao` (l.137): grava o `status` que veio do form sem validar transição; a tela manda o `PROXIMO_STATUS` (`[id]/page.tsx:41-46`: rascunho → inscricoes_abertas → em_andamento → encerrada → rascunho). Check do banco: `0001:83` (4 valores).

**Ciclo anual, apostila, aulas complementares** — `ciclos/actions.ts`, `apostilas/[id]/actions.ts`
- `criarCicloAno` (l.18; schema l.12-16), `atualizarCicloAno` (l.39).
- `criarApostila` (l.61): insere `apostilas(ciclo_ano_id, tipo_turma_id)`, depois `ETAPAS_PADRAO` (5) etapas `Etapa N` e `AULAS_POR_ETAPA_PADRAO` (6) aulas `Aula N` por etapa (l.87-101). Redireciona para `/admin/apostilas/[id]`.
- `criarAulaComplementar` (l.118): schema l.109-116 (`video_provider` ∈ `"", "vimeo", "bunny"`); provider e id **andam juntos** (l.138-140, espelha o check `complementar_video_par_completo` 0015:102).
- `alternarLiberadaComplementar` (l.159).
- `atualizarEtapa` (l.15; `livros_texto` vazio → null), `atualizarAulaApostila` (l.44; `pagina` numérico positivo ou null), `adicionarEtapa` (l.72; próximo número = max+1; **6 aulas hard-coded** l.96, não usa a constante), `adicionarAula` (l.108; próximo número na etapa).

**Turmas e grade** — `edicoes/[id]/actions.ts`, `grades/actions.ts`
- `criarTurma` (l.17): schema l.10-15; `capacidade` 0/vazio → null.
- `vincularProfessor` (l.43): CPF só dígitos (l.47) → `pessoas.id`; "Nenhuma pessoa com esse CPF. Cadastre-a antes." (l.53); insere `turma_professores`.
- `desvincularProfessor` (l.66).
- `criarGrade` (l.17): busca `apostilas.tipo_turma_id`, insere `grades(edicao_id, tipo_turma_id, apostila_id)`; espelha cada `apostila_etapas` em `grade_etapas` e cada `apostila_aulas` em `grade_aulas` (l.56-77, um insert por etapa). Redireciona para `/admin/grades/[id]`.
- `definirEtapa` (l.84): `data`, `hora_inicio`, `hora_fim`; recusa `fim <= inicio` (l.94).
- `adicionarOrientador` (l.109): CPF validado (`cpfValido`), conta `grade_etapa_orientadores` e recusa se `>= MAX_ORIENTADORES` (6) (l.122-131), busca `pessoas` por CPF, insere.
- `removerOrientador` (l.149): antes de apagar, zera `grade_aulas.orientador_id` das aulas dele na etapa (l.157-161).
- `atribuirAula` (l.173): `orientador_id` vazio = desatribuir.

**Descontos** — `descontos/actions.ts`
- `criarRegraDesconto` (l.37): schema l.11-19 (`condicao` ∈ jovem/preletor/conjuge/a_vista/todos; `tipo` ∈ percentual/valor). `montarCondicao` (l.22-35) produz o `condicao_jsonb` que o motor lê: `{perfil:"jovem", idadeMax}` (padrão 25), `{perfil:"preletor", ordemMinima?}`, `{perfil:"conjuge"}`, `{formaPagamento:"a_vista"}`, `{perfil:"todos"}`. Percentual 0<x≤100 (l.57); valor via `reaisParaCentavos`. Grava `compete_a_vista = (condicao === "a_vista")` (l.75).
- `alternarAtivoRegra` (l.82).

**Dispensas** — `dispensas/actions.ts`: `dispensarPrerequisito` (l.22), `recusarPrerequisito` (l.47); schema l.9-12 (`motivo` ≥ 5). Ambos delegam ao SQL (0017:43-117) — ver §2.1.6.

**Certificados** — `certificados/actions.ts:18` `emitir` — ver §2.5.

**Provas (Sede)** — `provas/actions.ts`
- `criarProva` (l.21): schema l.14-19 (`duracao_minutos` 5-480, `tentativas_max` 1-10; formulário sugere 60 e 2).
- `alternarPublicacao` (l.38): ao publicar, exige ≥ 1 questão (l.47-55).
- `criarQuestao` (l.71): schema l.63-69; alternativas uma por linha (l.84-90), múltipla escolha exige ≥ 2 (l.92); objetiva exige gabarito (l.97); gabarito de múltipla escolha tem de ser idêntico a uma alternativa (l.100-104); insere `questoes` e, se houver gabarito, `questao_gabarito` (l.121-123).
- `salvarCriterio` (l.137): upsert `criterios_aprovacao` por `ciclo_ano_id` (l.148-150).

**Provas (aluno)** — `provas/actions.ts` (raiz de `app/provas`): `iniciarTentativa` (l.32), `enviarProva` (l.115) — ver §2.4.

**Importação** — `importacao/actions.ts`: `gerarPreviaImportacao` (l.75), `efetivarImportacao` (l.184) — ver §2.7.

**Landing** — `localidades/[id]/landing/actions.ts`: `salvarLanding` (l.24), `publicarLanding` (l.57), `alternarTravaLanding` (l.67), `reverterLanding` (l.79) — ver §2.8.

**Inscrição pública** — `l/[slug]/matricula/actions.ts`: `inscrever` (l.42) → `processarInscricao` (l.62) — ver §2.1.

**Políticas (plataforma)** — `politicas/actions.ts:27` `solicitarExclusao`.

### 1.6 Funções exportadas das libs do módulo

| Arquivo | Exports | Quem usa |
|---|---|---|
| `lib/dominio/desconto.ts` (155) | tipos `FormaPagamento`, `CondicaoDesconto`, `RegraDesconto`, `ContextoDesconto`, `ResultadoDesconto`; `regraAplica` (l.71), `valorRegraCentavos` (l.92), `calcularDesconto` (l.108), `idadeEm` (l.148) | `matricula/actions.ts:8-13`, testes |
| `lib/dominio/prerequisito.ts` (66) | `HistoricoConclusao`, `EntradaPrerequisito`, `ResultadoPrerequisito`, `avaliarPrerequisito` (l.48) | `matricula/actions.ts:14` |
| `lib/dominio/apostila.ts` (19) | `ETAPAS_PADRAO`=5, `AULAS_POR_ETAPA_PADRAO`=6, `MAX_ORIENTADORES`=6 | `ciclos/actions.ts:9`, `grades/actions.ts:9`, `grades/[id]/page.tsx:20` |
| `lib/pagamento/tipos.ts` (52) | `FormaPagamento`, `ModoPagamento`, `IntencaoPagamento`, `ResultadoPagamento`, `estimarBraspagCentavos` (l.36), `calcularSplit` (l.45) | `pagamento/index.ts` |
| `lib/pagamento/index.ts` (87, `server-only`) | `modoPermitidoPeloAmbiente` (l.21), `modoAtual` (l.26, compat), `registrarIntencaoPagamento` (l.39) | `matricula/actions.ts:15` |
| `lib/presenca/fila.ts` (101, puro) | `Marcacao`, `Lote`, `consolidar` (l.46), `agruparPorAula` (l.57), `removerEnviadas` (l.77), `pendencias` (l.92) | `Chamada.tsx:13-19` |
| `lib/prova/dominio.ts` (218, puro) | `embaralharCom` (l.25), `TOLERANCIA_ENVIO_SEGUNDOS`=30, `JanelaProva`, `prazoFinal` (l.57), `dentroDoPrazo` (l.68), `segundosRestantes` (l.73), `TipoQuestao`, `QuestaoParaCorrigir`, `Correcao`, `corrigir` (l.110), `CRITERIO_PADRAO` (l.157), `CriterioAprovacao`, `DesempenhoAluno`, `Veredito`, `avaliarAprovacao` (l.182), `percentualPresenca` (l.215) | `provas/actions.ts`, `certificado/emitir.ts`, `admin/provas/page.tsx`, `admin/certificados/page.tsx`, `meu-curso/page.tsx` |
| `lib/certificado/emitir.ts` (243, `server-only`) | `Desempenho`, `levantarDesempenho` (l.36), `criterioVigente` (l.96), `ResultadoEmissao`, `emitirCertificado` (l.135) | `certificados/actions.ts`, `certificados/page.tsx`, `meu-curso/page.tsx` |
| `lib/certificado/pdf.ts` (106, `server-only`) | `DadosCertificado`, `gerarPdfCertificado` (l.30) — `pdf-lib` + `qrcode` | `certificado/[codigo]/pdf/route.ts` |
| `lib/video/tipos.ts` (64) | `Provedor`, `OpcoesEmbed`, `ProvedorVideo`, `ControlePlayer` (sem implementação), `RefVideo` | `provedores.ts`, `acesso.ts` |
| `lib/video/provedores.ts` (112, `server-only`) | `ProvedorBunny` (l.32), `ProvedorVimeo` (l.67), `ProvedorIndisponivel` (l.87), `provedorDe` (l.103) | `acesso.ts:4` |
| `lib/video/acesso.ts` (138, `server-only`) | `MotivoNegado`, `AcessoConcedido`, `AcessoNegado`, `explicar` (l.45), `liberarAula` (l.56) | `aulas/[id]/page.tsx:6` |
| `lib/video/progresso.ts` (109, puro) | `EstadoProgresso`, `Batimento`, `ResultadoProgresso`, `aplicarBatimento` (l.57), `percentual` (l.92), `PERCENTUAL_PARA_CONCLUIR`=90, `concluiu` (l.107) | `api/video/progresso/route.ts`, `aulas/page.tsx`, `aulas/[id]/page.tsx` |
| `lib/importacao/tipos.ts` (99) | `LinhaImport`, `TipoConflito`, `TipoErro`, `Conflito`, `ErroValidacao`, `PessoaNormalizada`, `HistoricoNormalizado`, `BaseExistente`, `PreviaResultado` | `parse.ts`, `previa.ts`, `importacao/actions.ts` |
| `lib/importacao/parse.ts` (106) | `ResultadoParse`, `parseXlsx` (l.69) — SheetJS `xlsx` | `importacao/actions.ts:6` |
| `lib/importacao/previa.ts` (190, puro) | `gerarPrevia` (l.43) | `importacao/actions.ts:7`, testes |
| `lib/landing.ts` (45) | `CampoLocal`, `CAMPOS_LOCAIS` (4 campos), `CamposLanding`, `TEMPLATE_SEDE`, `lerCampos` | landing admin e pública, matrícula |

Dependências de plataforma que o módulo importa (ficam onde estão, só mudam de
caminho): `pessoaAtual`, `exigirCapacidade` (`lib/auth.ts`), `criarClienteServidor`,
`criarClienteServico`, `criarClienteBrowser`, `exigir`, `ErroConsulta`
(`lib/supabase/*`), `enfileirar` + templates `matricula_confirmada` e
`certificado_liberado` (`lib/comunicacao`), `configuracaoVigente`,
`politicaDaLocalidade`, `parcelasPermitidas`, `precoParaEntradaTardia`
(`lib/configuracao`), `normalizarCpf`, `cpfValido`, `formatarCpf`,
`normalizarCodSni`, `codSniValido`, `reaisParaCentavos`, `formatarCentavos`,
`percentualDeCentavos`, `slugify` (`lib/dominio`).

### 1.7 Variáveis de ambiente que o módulo lê

`grep -rno "process.env.[A-Z_]*" src` → do módulo: `BUNNY_STREAM_LIBRARY_ID`,
`BUNNY_TOKEN_AUTH_KEY` (`video/provedores.ts:105-106`), `CIELO_MODO`
(`pagamento/index.ts:22`), `NEXT_PUBLIC_SITE_URL` (`certificado/emitir.ts:227`,
`certificado/[codigo]/pdf/route.ts:38` — monta a URL do QR; **sem retaguarda
`VERCEL_PROJECT_PRODUCTION_URL`**, ao contrário do que o plano §5.3 afirma para
`endereco.ts`, arquivo que também não existe neste repositório). Declaradas no
`.env.example` mas **não lidas por código**: `CIELO_MARKETPLACE_MERCHANT_ID`,
`CIELO_MARKETPLACE_MERCHANT_KEY`, `CREDENCIAIS_ENCRYPTION_KEY`,
`BUNNY_STREAM_API_KEY`, `VIMEO_ACCESS_TOKEN`.

### 1.8 Divergências entre matriz, código e RLS (o porte precisa fechar)

| Capacidade (matriz `permissoes.ts:82-148`) | Quem tem | Onde é conferida em código | Observação |
|---|---|---|---|
| `tipos.gerir` | sede | **nenhum lugar** | sem tela (§0-3) |
| `landing.editar` | sede, coordenador | **nenhum lugar** | RLS `landing_update` decide; trava/reversão por `isSede` |
| `importacao.executar` | sede | `isSede` (não `exigirCapacidade`) | menu usa a capacidade |
| `matricula.ver` | todos os 6 papéis | só para mostrar atalhos no painel | telas do aluno checam só sessão |
| `matricula.decidir` | sede, coordenador | **nenhum lugar** | não há tela de decisão de matrícula |
| `financeiro.ver` | sede, coordenador, presidente_uap | guard de `/admin/descontos/concedidos` | |
| `desconto.autorizar` | sede, coordenador | **nenhum lugar** | não há desconto manual |
| `turma.gerir` | sede, coordenador | 3 actions | não está no guard do layout |
| `certificado.emitir` | sede, coordenador | action com `localidadeId` | única checagem com escopo |
| `presenca.lancar` | sede, coordenador, orientador, professor | guard das 2 páginas de chamada | escrita real é RLS 0018 (professor da turma ou `pode_conduzir`) |
| `prerequisito.dispensar` | sede, orientador | guard + 2 actions | SQL `dispensar_prerequisito` confere `app.pode_orientar` de novo (0017:66) — nota: `pode_orientar` no SQL e `["sede","orientador"]` na matriz batem |

---

## 2. Regras de negócio — cada uma com onde está

### 2.1 Matrícula (`src/app/l/[slug]/matricula/actions.ts`, 387 linhas)

Fluxo de `processarInscricao` (l.62-337), na ordem em que acontece:

| # | Regra | Onde | Detalhe |
|---|---|---|---|
| 1 | Entrada validada no servidor, não no formulário | l.73-83 | `turma_id` obrigatório; `cpfValido`; nome ≥ 2; e-mail regex `EMAIL_RE` (l.28); `forma_pagamento` ∈ pix / cartao_avista / cartao_parcelado; `consentimento === "on"` obrigatório |
| 2 | Só edição com `status = 'inscricoes_abertas'` aceita inscrição | l.111-113 | a página pública já escolhe essa edição (`matricula/page.tsx:24-33`, mais recente por ano) |
| 3 | **Teto de parcelas conferido no servidor** (§18-#3) | l.115-122 | `politicaDaLocalidade(edicao.localidade_id)` → `parcelasPermitidas(parcelas, politica, meio !== "cartao_parcelado")`: à vista força 1; parcelado é **corrigido** (clamp), não recusado (`configuracao/politica.ts:94-102`). Padrão nacional 12, absoluto 24 (`politica.ts:43-52`). O `<select>` só oferece "parcelado" se `maxParcelas > 1` (`MatriculaForm.tsx:119`) |
| 4 | Pessoa por CPF: reaproveita ou cria | l.124-159 | existente → `update` de nome/e-mail/telefone/nascimento (l.134-137); nova → `insert` com **CodSNI provisório `"9" + cpf`** (l.141); e-mail duplicado (23505) → "E-mail já cadastrado para outra pessoa." (l.155) |
| 5 | **Consentimento LGPD versionado**, com IP e user-agent | l.19-27, l.161-168 | `VERSAO_CONSENTIMENTO = "v2-2026"`; grava `consentimentos_lgpd(pessoa_id, versao_texto, ip, user_agent)`; IP = primeiro `x-forwarded-for`. **Mudou o texto (em `MatriculaForm.tsx:146-158`), muda a constante** (CLAUDE.md §3) |
| 6 | Uma matrícula por (pessoa, turma) | l.170-181 + `matricula_unica` (0004:59) | leitura com `exigir`: falha de consulta não vira "não está matriculado" |
| 7 | **Pré-requisito** (§6.2) só se `edicao.prerequisito_ativo` | l.183-218 | lê `tipo_turma_prereq` do tipo da turma; `tiposConcluidos()` (l.340-378) junta `historico_turma` (situação `concluido`, nome original resolvido por `equivalencias` **ou** por nome igual em `tipos_turma`, l.368-372) com `matriculas.status='concluida'` (l.373-376); `avaliarPrerequisito` (`dominio/prerequisito.ts:48`): sem prereq → liberado; `temDispensa` → liberado; faltantes = prereqs não concluídos. **Equivalência**: `historico` sem `tipoTurmaId` resolvido não conta (`tests/prerequisito.test.ts:36-43`) |
| 8 | Barrado **não é recusado**: a inscrição fica `aguardando_prerequisito` | l.209-217, l.273 | motivo no comentário l.210-213 (0017: "não se dispensa o pré-requisito de um fantasma") |
| 9 | **Desconto não cumulativo, comparado em centavos, limitado pelo piso** (§7.2, §7.3) | l.220-260; `dominio/desconto.ts:108-145` | regras ativas de `regras_desconto` com `edicao_ano = edicao.ano`; contexto = idade em **1º de janeiro do ano da edição** (l.254), `funcao_ordem` da view `pessoa_funcao_atual`, forma de pagamento, `conjugeElegivel: false` sempre (l.257). Motor: filtra `ativo` + `regraAplica`, converte cada regra em centavos (`valorRegraCentavos`: percentual via `percentualDeCentavos`; valor fixo limitado ao preço, l.96-97), escolhe o **maior** com desempate estável (l.129-131), e apara pelo piso `descontoMaximo = preco - piso` (l.133-136). À vista compete no mesmo pote (comentário l.14-17; teste `desconto.test.ts:70-76`). Preletor = `funcaoOrdem >= (ordemMinima ?? 6)` (l.66,80-83) |
| 10 | **Snapshots congelados** (§4.3, §7.1, §8.2) | l.262-276 | `matriculas` recebe `funcao_snapshot_id`, `preco_bruto_centavos`, `desconto_centavos`, `regra_desconto_id`, `valor_sede_centavos`; check `respeita_piso` (0004:61) garante `preco - desconto >= valor_sede` no banco |
| 11 | Status inicial `pendente` (ou `aguardando_prerequisito`) | l.273 | **Não há código que leve `pendente → ativa`**: nem webhook, nem tela. `liberarAula` aceita `ativa`/`concluida` (`video/acesso.ts:90`), `iniciarTentativa` idem (`provas/actions.ts:55`), chamada aceita `pendente`/`ativa` (`chamada/[id]/page.tsx:109`), certificados lista `ativa`/`concluida` (`certificados/page.tsx:37`). Ou seja: **aluno recém-inscrito consegue ir à chamada mas não vê vídeo nem prova** até alguém mudar o status por SQL |
| 12 | Barrado **não gera cobrança** | l.282-295 | retorna `aguardandoPrerequisito: true` com `faltantes` por nome (`nomesTipos`, l.380-387) |
| 13 | Intenção de pagamento registrada (ver §2.2) | l.297-304 | `valorTotalCentavos = resultado.valorFinalCentavos` |
| 14 | Confirmação vai para a **fila**, nunca envio síncrono | l.306-328 | `enfileirar({ template: "matricula_confirmada", variaveis: [nome, tipoTurma, localidade, ano], chaveUnica: "matricula:<id>" })`; nomes por extenso (comentário l.309-310) |
| 15 | Falha de infraestrutura vira mensagem "nada foi cobrado nem registrado" | l.42-60 | `ErroConsulta` capturado em `inscrever`; outros erros sobem |
| 16 | **Entrada tardia paga integral, sem pró-rata** (§18-#6) | `configuracao/politica.ts:104-120` `precoParaEntradaTardia` | decisão do cliente em 01/09/2026; a função existe para nomear a decisão. **Não é chamada por `processarInscricao`** (o preço usado é `edicao.preco_centavos` direto, l.260) — a regra está cumprida por omissão, e o porte deve decidir se passa a chamá-la para deixar rastro |
| 17 | Matrícula de cônjuges "em transação única" (§7.2) | l.257 | **não implementada**: `conjugeElegivel` é sempre `false`; a regra `{perfil:"conjuge"}` pode ser cadastrada mas nunca se aplica |

Testes: `tests/desconto.test.ts` (10 casos: moeda única, não cumulativo, à vista
como fallback, piso, cônjuge, inativa, ordem de preletor, `idadeEm`),
`tests/prerequisito.test.ts` (5), `tests/politica.test.ts` (resolução nacional +
override, plataforma).

### 2.2 Pagamento (`src/lib/pagamento/`)

| # | Regra | Onde |
|---|---|---|
| 1 | **Chave de modo** `split` / `centralizado`: o ambiente é **teto**, a localidade escolhe dentro dele | `pagamento/index.ts:21-23` (`CIELO_MODO === "split"` senão `centralizado`) e l.44-50 (`modo = ambiente === "split" && politica.modo === "split" ? "split" : "centralizado"`) |
| 2 | Registrar intenção = inserir `pagamentos(matricula_id, meio, parcelas, valor_total_centavos, modo, status='pendente')` | l.52-63 |
| 3 | No modo `split`, grava as **três fatias** em `split_registros`: `braspag` (MDR + tarifa), `sede` (fixo congelado), `localidade` (resto) | `pagamento/tipos.ts:45-52` `calcularSplit`; `estimarBraspagCentavos` (l.36-38) com `mdrPercent` e `tarifaFixaCentavos` da **política da localidade** (`index.ts:74-78`), padrão 0 |
| 4 | Credenciais por localidade cifradas (§8.5) | **não implementado** (§0-1, §0-2). Só a tabela existe (0005:10) |
| 5 | Webhook idempotente (§8.5) | **não implementado**. Tabela `webhooks_cielo.idempotency_key unique` (0005:58) sem rota |
| 6 | Status de pagamento possíveis | check 0005:31: `pendente, autorizado, pago, negado, estornado, cancelado`. O código escreve só `pendente`; lê `pendente`/`recusado` em `video/acesso.ts:112` — **`recusado` não existe no check** (é `negado`), então essa comparação nunca é verdadeira |
| 7 | "Sem cobrança registrada não bloqueia" (modo centralizado corre fora do sistema) | `video/acesso.ts:107-114` |

### 2.3 Presença (`src/lib/presenca/fila.ts`, `admin/chamada/[id]/Chamada.tsx`, `public/sw.js`, 0018)

| # | Regra | Onde |
|---|---|---|
| 1 | **Quem registra é o professor** (decisão do §18-#7) | `0018_presenca.sql:4-18`; policy `presencas_write` (0018:29-42): professor da turma (`app.professor_turma_ids()`) **ou** `app.pode_conduzir(localidade)` (coordenador + orientador) |
| 2 | Chamada precisa de **duas coordenadas**: aula da grade + turma (a grade é por edição+tipo; várias turmas compartilham) | `chamada/[id]/page.tsx:12-18, 59-100` (seleciona por `?turma=`; uma turma só → direto) |
| 3 | Só matrículas `pendente`/`ativa` entram na chamada | `chamada/[id]/page.tsx:102-110` |
| 4 | **Gravar primeiro, enviar depois**: marcação vai ao `localStorage` (`ciclo:fila-presenca`, `Chamada.tsx:28`) antes de qualquer rede | `Chamada.tsx:144-151` `marcar()` |
| 5 | Reenviar é seguro: upsert em `(matricula_id, grade_aula_id)` | `Chamada.tsx:111-113`; constraint `presenca_unica` (0015:195) |
| 6 | **A última marcação vence** (por `marcadoEm`) | `fila.ts:46-54` `consolidar`; `agruparPorAula` (l.57) monta um lote por aula |
| 7 | Só limpa da fila o que o servidor confirmou, **preservando correção feita durante o envio** | `fila.ts:77-89` `removerEnviadas` (compara momento, não só chave); `Chamada.tsx:117-120` |
| 8 | Sincroniza ao voltar a conexão (`online`) e ao marcar quando online; botão "Enviar agora" | `Chamada.tsx:128-142, 150, 182-193` |
| 9 | Ao abrir, a fila local **sobrepõe** o que veio do servidor (disco é mais recente) | `Chamada.tsx:77-91` |
| 10 | Service worker: estático cache-first, navegação network-first com fallback; **não intercepta escritas** | `public/sw.js:8-21, 44-79`; registrado só no layout admin (`components/RegistrarSW.tsx:5-11`, `admin/layout.tsx:59`) |
| 11 | Presença em % conta só aulas com chamada lançada (denominador) | `prova/dominio.ts:214-218` `percentualPresenca`; `certificado/emitir.ts:47-50` |
| 12 | `origem` gravada como `'presencial'` pelo cliente | `Chamada.tsx:109`; check `origem in ('presencial','ead','importacao')` (0015:193) — `ead` e `importacao` sem escritor |

Testes: `tests/fila-presenca.test.ts` (11 casos).

### 2.4 Provas (`src/lib/prova/dominio.ts`, `src/app/provas/actions.ts`, 0020)

| # | Regra | Onde |
|---|---|---|
| 1 | Prova pertence a uma **edição**; nasce `publicada=false`; `tentativas_max` padrão 2; `embaralhar` padrão true | `admin/provas/actions.ts:14-19`; 0020:14-17 |
| 2 | Não publica sem questão | `admin/provas/actions.ts:47-55` |
| 3 | **Gabarito em tabela separada** (`questao_gabarito`), só a Sede lê | `admin/provas/actions.ts:121-123`; policy `gabarito_sede` (0020:47); comentário `admin/provas/[id]/page.tsx:15-17` |
| 4 | Aluno só inicia se tem matrícula `ativa`/`concluida` na edição da prova | `provas/actions.ts:49-60` (`turmas!inner(edicao_id)`) |
| 5 | Tentativa aberta → volta para ela (F5 não cria nem zera) | `provas/actions.ts:71-74` |
| 6 | Limite de tentativas conta abertas + finalizadas | `provas/actions.ts:76-79` (`usadas = anteriores.length`) |
| 7 | **Prazo congelado no servidor** em `tentativas.prazo_em = agora + duracao` | `provas/actions.ts:88-95` |
| 8 | **Ordem sorteada uma vez** e gravada em `ordem_questoes` (semente `prova:matricula:agora`), determinística | `provas/actions.ts:97-101`; `embaralharCom` (`dominio.ts:25-43`, Fisher-Yates + LCG, hash FNV) |
| 9 | Tela do aluno lê `questoes` sem gabarito, na ordem congelada; `Cronometro` é só visual e auto-submete ao zerar | `tentativa/[tid]/page.tsx:52-68`; `Cronometro.tsx:7-16, 25-28` |
| 10 | Envio: dono da tentativa (`matriculas.pessoa_id === eu.id`), não finalizada | `provas/actions.ts:142-146` |
| 11 | **Cronômetro validado no servidor** com tolerância de 30 s de latência | `dentroDoPrazo` (`dominio.ts:50-70`); `provas/actions.ts:148-155` (usa `iniciada_em` + `duracao_minutos`, não `prazo_em`) |
| 12 | Fora do prazo: grava respostas, **nota zero**, `?fora_do_prazo=1` | `provas/actions.ts:182-186, 219` |
| 13 | Correção: só objetivas com gabarito; comparação sem caixa; dissertativa → `pendentesDeCorrecao`; questão sem gabarito não conta; não respondida = erro; nota 0-100 com 2 casas | `corrigir` (`dominio.ts:110-132`); testes `prova.test.ts:66-106` |
| 14 | `respostas.correta` = null para dissertativa/sem gabarito; escrita só por `service_role` | `provas/actions.ts:192-206`; 0020:97 |
| 15 | Resultado mostra nota e acertos, **nunca** quais errou nem gabarito (tentativas múltiplas) | `resultado/[tid]/page.tsx:9-15` |
| 16 | **Não há correção humana de dissertativa** em tela nenhuma | procurado; `pendentesDeCorrecao` só volta no objeto e é ignorado em `provas/actions.ts:184-186` |

Testes: `tests/prova.test.ts` (24 casos).

### 2.5 Certificados (`src/lib/certificado/`, `admin/certificados/`, `/certificado/[codigo]`, 0021)

| # | Regra | Onde |
|---|---|---|
| 1 | **Critério de aprovação nacional, E (presença ≥ 75 E nota ≥ 70), vídeo 0 %** (decisão do §18-#8) | `prova/dominio.ts:138-162` `CRITERIO_PADRAO`; editável por ciclo em `criterios_aprovacao` (`admin/provas/actions.ts:137`); `criterioVigente(ano)` (`emitir.ts:96-119`) cai no padrão se não houver linha |
| 2 | Desempenho: presença = presentes / aulas com chamada; **nota = melhor tentativa finalizada**; vídeo = média dos percentuais de `progresso_video` da pessoa | `emitir.ts:36-93` `levantarDesempenho` (todas via `service_role`) |
| 3 | Matrícula `cancelada`/`desistente` não recebe certificado | `emitir.ts:175-177` |
| 4 | Emissão **idempotente**: já existe → devolve o existente | `emitir.ts:138-153`; `certificado_unico_por_matricula` (0007:67) |
| 5 | **Número** `CICLO-<ano>-<seq 6 dígitos>` por `proximo_numero_certificado(p_ano)` (sequence global `certificado_seq`, só `service_role`) | 0021:58-66; `emitir.ts:188-194` |
| 6 | **Código do QR aleatório e sem significado** (`randomBytes(9).base64url`, 12 chars) | `emitir.ts:196-198` |
| 7 | Snapshots na emissão: nome, localidade, tipo de turma, ano, presença, nota | `emitir.ts:200-210` |
| 8 | Emitir muda `matriculas.status → 'concluida'` | `emitir.ts:213` |
| 9 | Aviso ao aluno pela fila (`certificado_liberado`, chave `certificado:<matricula>`) com link `NEXT_PUBLIC_SITE_URL/certificado/<codigo>` | `emitir.ts:215-240` |
| 10 | Action confere a capacidade **na localidade da matrícula** | `certificados/actions.ts:18-36` |
| 11 | Tela mostra veredito e pendências antes; botão só para aptos | `certificados/page.tsx:61-69, 114-126` |
| 12 | **Validação pública**: nome, curso, turma, localidade, ano, número, data; **nunca CPF nem nota**; 404 se código não existe | `certificado/[codigo]/page.tsx:9-23, 40-50` |
| 13 | PDF sob demanda, A4 paisagem, modelo único nacional, assinatura "Sede Central", QR para a URL de validação; `Content-Disposition: inline` | `certificado/pdf.ts:30-106`; `pdf/route.ts:19-57` |
| 14 | Leitura de `certificados` por RLS só para quem `pode_ver_matricula`; escrita revogada de `authenticated` | 0021:77-86 |

### 2.6 Vídeo (`src/lib/video/`, `/aulas`, `/api/video/progresso`, 0015, 0019)

| # | Regra | Onde |
|---|---|---|
| 1 | **Banco guarda `video_provider` + `video_external_id`, nunca URL** | `video/tipos.ts:5-7`; check `complementar_video_par_completo` (0015:102-104); `criarAulaComplementar:138-140` |
| 2 | Duas interfaces em vez de uma (§9.2): `ProvedorVideo` (servidor, assina) e `ControlePlayer` (navegador) | `video/tipos.ts:9-26, 44-58` |
| 3 | Bunny: token `sha256(chave + id + expira)`, `expires`, `autoplay`, `preload=false`, `t=` para retomar; URL `iframe.mediadelivery.net/embed/<lib>/<id>` | `provedores.ts:32-57` |
| 4 | Vimeo: sem token; `external_id` aceita `"id/hash"` (não listado); `dnt=1`; `#t=` | `provedores.ts:67-85` |
| 5 | **Validade do link 12 h** | `provedores.ts:18` |
| 6 | Provedor sem env → `ProvedorIndisponivel` (nunca monta link sem assinatura) | `provedores.ts:87-111` |
| 7 | **Ordem de liberação**: aula existe e `liberada` → tem vídeo → pessoa tem matrícula → alguma `ativa`/`concluida` → pagamento em dia (nenhum `pendente`) → retoma de `ultima_posicao` → assina | `acesso.ts:56-138` `liberarAula`; motivos e textos l.18-47 |
| 8 | Aulas complementares são **nacionais por ano** (`ciclo_anos` mais recente), iguais para todos os tipos de turma | `aulas/page.tsx:12-18, 25-33`; `acesso.ts:77-78` |
| 9 | **Heartbeat** a cada 25 s, só com aba visível; corpo = `{aula_complementar_id, posicao}`; **sem timestamp do cliente** | `Player.tsx:7, 42-63`; `route.ts:15-19, 24-35` |
| 10 | Posição estimada pelo tempo em tela (sem `postMessage` dos players) | `Player.tsx:17-22, 45` |
| 11 | **Validação no servidor**: crédito ≤ `decorrido × 2 + 5 s`; voltar não credita; pular não credita o trecho; assistido ≤ duração; posição acompanha o player | `progresso.ts:23-26, 57-89` `aplicarBatimento`; `route.ts:80-90` |
| 12 | Escrita de `progresso_video` só por `service_role` (RLS 0019:45); leitura pelo dono, Sede e equipe da turma | 0019:24-45 |
| 13 | **Concluída = 90 %** | `progresso.ts:105-109`; `aulas/page.tsx:7,82`; **duplicado como literal** em `Player.tsx:38` |
| 14 | Percentual a 2 casas, 0 se duração desconhecida | `progresso.ts:92-96` |

Testes: `tests/progresso-video.test.ts` (11 casos, inclui os ataques).

### 2.7 Importação XLSX em duas fases (`src/lib/importacao/`, `admin/importacao/`)

| # | Regra | Onde |
|---|---|---|
| 1 | Só a Sede (`isSede`) | `actions.ts:77, 186` |
| 2 | Lê a **primeira planilha**; cabeçalho casado por chave normalizada (sem acento/caixa/pontuação) contra `ALIASES`; colunas desconhecidas ignoradas e listadas | `parse.ts:12-60, 69-106` |
| 3 | 15 campos lógicos: `cpf, codSni, nome, email, nascimento, telefone, funcao, endereco, localidade, ano, tipoTurmaOriginal, situacao, nota, presenca, observacao` | `tipos.ts:6-26`; aliases `parse.ts:22-38` |
| 4 | **Fase 1 — prévia pura**, nada gravado no cadastro: erros (`sem_cpf`, `cpf_invalido`, `codsni_invalido`, `email_invalido`), conflitos (`cpf_codsni_divergente` interno ao arquivo e contra a base, `email_duplicado`), pessoa nova × atualizada, histórico a criar, tipos desconhecidos, órfãos | `previa.ts:43-190` `gerarPrevia`; contagens l.177-189 |
| 5 | **Conflito CPF × CodSNI nunca resolvido automaticamente** (§12.4) | `previa.ts:86-117` |
| 6 | Consolidação: várias linhas do mesmo CPF viram uma pessoa (última não vazia vence por campo) | `previa.ts:134-148` |
| 7 | Histórico guarda **nome original** do tipo de turma; conhecido = existe em `tipos_turma.nome` ou `equivalencias.nome_original` | `previa.ts:152-175`; base carregada em `actions.ts:62-66` |
| 8 | Órfão = histórico cujo CPF não é pessoa válida no arquivo nem na base | `previa.ts:155-156` |
| 9 | A prévia é **persistida** em `importacoes(status='previa', resumo_jsonb{...resumo, payload:{pessoas, historico}})` + `importacao_conflitos` + `auditoria('importacao.previa')` | `actions.ts:100-157` |
| 10 | **Fase 2** só se `status === 'previa'`; upsert `pessoas` por CPF em lotes de 500; `pessoa_funcao_hist` criado quando informado e a pessoa ainda não tem (vigência = hoje); `historico_turma` sem órfãos em lotes; `importacoes.status='efetivada'`; `auditoria('importacao.efetivada')` | `actions.ts:184-297` |
| 11 | Conflitos e erros **não impedem** a efetivação: as linhas ficam fora e na fila | `ImportadorCliente.tsx:161-164`; `previa.ts` (`continue` em cada caso) |
| 12 | **Não há tela de resolução da fila** `importacao_conflitos` (`resolvido`, `resolvido_por` nunca escritos) | procurado |
| 13 | Upload por Server Action com `bodySizeLimit: "10mb"` | `next.config.mjs:4-9` |
| 14 | Base atual carregada paginada de 1000 em 1000 (`pessoas.cpf, cod_sni, email`) | `actions.ts:42-60` |

Testes: `tests/previa.test.ts` (8 casos).

### 2.8 Landing page versionada (`src/lib/landing.ts`, `localidades/[id]/landing/*`, `/l/[slug]`, 0008)

| # | Regra | Onde |
|---|---|---|
| 1 | Conteúdo por campos, não WYSIWYG: 4 campos locais (`datas_horarios`, `local_hotel`, `contato_coordenador`, `observacoes_locais`) | `landing.ts:17-22` |
| 2 | Travado pela Sede como **constante** (`TEMPLATE_SEDE`: título, subtítulo, descrição, texto doutrinário) — "pode virar tabela depois" | `landing.ts:26-40` |
| 3 | Uma landing por localidade (`localidade_id unique`), criada sob demanda | 0008:12; `garantirLanding` (`actions.ts:9-22`) |
| 4 | Cada salvamento grava o estado e **uma versão** (`landing_versoes` com `autor_id`) | `actions.ts:40-51` |
| 5 | Trava da Sede impede edição da localidade (não da Sede) | `actions.ts:31-33`; botão só faz efeito com `isSede` (l.67-69) |
| 6 | Reversão restaura `campos_jsonb` **e grava nova versão** (mantém rastro); só Sede | `actions.ts:79-106` |
| 7 | Publicar/despublicar é flag; a página pública só mostra campos se `publicado` | `actions.ts:57-64`; `l/[slug]/page.tsx:49, 99-126` |
| 8 | Página pública: localidade `ativo`, senão 404; botão de inscrição só com edição `inscricoes_abertas`; mostra preço bruto | `l/[slug]/page.tsx:38, 51-60, 77-85, 128-147` |
| 9 | Histórico mostra as 10 últimas versões | `landing/page.tsx:47-54` |
| 10 | Slug gerado do nome se vazio | `localidades/actions.ts:26` `slugify` |

### 2.9 Apostilas e grade (`ciclos/`, `apostilas/`, `edicoes/`, `grades/`, 0015)

| # | Regra | Onde |
|---|---|---|
| 1 | `ciclo_anos` é único por ano e carrega o tema-central | 0015:30; `ciclos/actions.ts:12-16` |
| 2 | **Uma apostila por (ano, tipo de turma)**; nasce com 5 etapas × 6 aulas; a contagem é padrão, não limite | 0015:47; `ciclos/actions.ts:57-105`; `dominio/apostila.ts:6-16` |
| 3 | Etapa tem tema e livros-texto; aula tem título e página | `apostilas/[id]/actions.ts:10-13, 39-42` |
| 4 | **Uma grade por (edição, tipo de turma)**, ligada a uma apostila **do mesmo ano** da edição; espelha etapas e aulas | 0015:120; `edicoes/[id]/page.tsx:50-55, 58-59`; `grades/actions.ts:17-81` |
| 5 | Etapa da grade: data, hora início/fim (`fim > inicio`); check `horario_coerente` no banco | `grades/actions.ts:90-96`; 0015:136 |
| 6 | **Até 6 orientadores por etapa**, vinculados por CPF, precisam existir em `pessoas` | `grades/actions.ts:109-147`; `MAX_ORIENTADORES` |
| 7 | Cada aula da grade tem no máximo um orientador (`grade_aulas.orientador_id`), escolhido entre os da etapa; remover orientador desatribui suas aulas | `grades/actions.ts:149-186`; tela `grades/[id]/page.tsx:224-280` |
| 8 | Turmas: tipo (ativo), nome, capacidade opcional; professores por CPF em `turma_professores` (unique) | `edicoes/[id]/actions.ts:10-78` |
| 9 | Aulas complementares (vídeo) são do **ano**, não da edição, e são as únicas com vídeo ("as aulas da apostila são presenciais e não têm vídeo") | `ciclos/[id]/page.tsx:153-163` |
| 10 | Escrita de apostila/ano/complementares só Sede (`app.is_sede()`); grade por quem administra a localidade da edição | 0015:231-254 vs 0015:258-310 |

### 2.10 Regras transversais que o módulo aplica

- **Dinheiro em centavos** em todas as colunas `*_centavos`; entrada por `reaisParaCentavos` (`dominio/dinheiro.ts:8-19`) e saída por `formatarCentavos`. `MatriculaForm.tsx:17-21` tem um `formatarBRL` **duplicado** porque é componente de cliente.
- **Consulta que falhou não é consulta vazia**: `exigir()` em toda leitura decisória (CLAUDE.md §3); as páginas da fase 2-3 (`regionais`, `localidades`, `locais`, `ciclos`, `apostilas`, `edicoes`, `grades`, `descontos`) **ainda leem `{ data }` sem `exigir`** — inconsistência a corrigir no porte.
- **Modal para todo cadastro** (`components/Modal.tsx`); exceções conscientes: editor da landing, inscrição pública, importação (CLAUDE.md §1).
- **Decisão em aberto vira dado, não `if`**: matriz, critério de aprovação, política de parcelas, templates.

---

## 3. Componentes de cliente do módulo

`grep -rl '"use client"' src` → 14 arquivos. Plataforma (fora deste
documento): `components/Modal.tsx`, `admin/Sidebar.tsx`,
`admin/pessoas/[id]/DefinirSenha.tsx`, `admin/papeis/ProvisionarAcesso.tsx`,
`login/page.tsx`, `lib/supabase/client.ts`. Os **nove** do módulo (incluindo
`RegistrarSW` e `FormExclusao`, que o módulo usa):

| Arquivo (linhas) | O que faz | Hooks / APIs de navegador | Importa de `ui.tsx` / `Modal.tsx` | O que precisa dos primitivos do sniconecta |
|---|---|---|---|---|
| `admin/chamada/[id]/Chamada.tsx` (253) | chamada offline: fila em `localStorage`, upsert direto em `presencas`, barra de estado, botões presente/ausente | `useState`, `useEffect`, `useCallback`, `useMemo`; `localStorage`; `navigator.onLine`; eventos `online`/`offline`; `criarClienteBrowser` | `Botao` | `Botao` (variante `secondary`→`glass`, `tamanho="sm"`); **precisa de novo primitivo**: barra de estado fixa (`sticky`) com tom success/warning e ícone, e botão-toggle de presença (par ✓/✗ com `aria-pressed`) — hoje são `<button>` com classes Tailwind à mão (l.220-245) |
| `admin/descontos/NovaRegra.tsx` (108) | modal de regra com campos dependentes da condição | `useState`, `useTransition` | `Botao`, `Campo`, `Input`, `Select`; `Modal`, `ModalAcoes`, `ModalCorpo` | **`Modal`/`ModalCorpo`/`ModalAcoes` não existem no sniconecta** (`src/componentes/` só tem `ui.tsx`, `AppShell.tsx`, `Painel.tsx`) — precisa portar `Modal.tsx` (205 l.) para `src/componentes/Modal.tsx` sobre `<dialog>` com as regras do AGENTS.md ("Esc e clique fora não fecham") |
| `admin/importacao/ImportadorCliente.tsx` (170) | upload XLSX, chama `gerarPreviaImportacao`, mostra métricas/conflitos, confirma `efetivarImportacao` | `useState`, `useTransition`; `FormData` manual (`onSubmit`) | `Alerta`, `Badge`, `Botao`, `Card`, `Celula`, `Linha`, `Metrica`, `Tabela`, `TituloSecao` | `Linha` **não existe** (usar `<tr>`); `Tabela` do sniconecta não aceita `cabecalho` (recebe `children` com `<thead>` manual); `Metrica` do sniconecta não tem `alerta` nem `detalhe`; `Badge` sem `tamanho`; **input de arquivo** estilizado à mão (l.75-81) — precisa de primitivo `InputArquivo` |
| `aulas/[id]/Player.tsx` (119) | iframe com URL assinada, heartbeat 25 s, barra de progresso | `useState`, `useEffect`, `useRef`, `useCallback`; `fetch` POST; `visibilitychange`; `setInterval` | nenhum (tudo em Tailwind) | precisa de primitivo **barra de progresso** (`role="progressbar"`) e moldura 16:9 — hoje classes à mão (l.79-107); o `90` literal (l.38) deve vir de `PERCENTUAL_PARA_CONCLUIR` |
| `provas/[id]/tentativa/[tid]/Cronometro.tsx` (56) | contador visual `mm:ss`, aviso ≤ 5 min, `requestSubmit` ao zerar | `useState`, `useEffect`; `setInterval`; `document.getElementById("form-prova")` | nenhum | precisa de primitivo **contador/`role="timer"`** com dois tons (info/danger) e `.num` (Plex Mono) no número |
| `l/[slug]/matricula/MatriculaForm.tsx` (173) | formulário público de inscrição, `useFormState(inscrever)`, campo de parcelas condicional, tela de sucesso | `useFormState`, `useFormStatus` (**`react-dom`**, depreciados no React 19 → `useActionState` de `react`), `useState` | `Alerta`, `Campo`, `Input`, `Select` | botão de envio à mão (l.23-35) → `Botao tamanho="lg"` com `pending`; checkbox de consentimento à mão (l.140-159) → precisa de primitivo **`Checkbox`** (não existe no sniconecta); bloco de sucesso → `Alerta tipo="success"` + `Num` para valores |
| `politicas/FormExclusao.tsx` (63) | pedido de exclusão LGPD, `useFormState(solicitarExclusao)` | `useFormState`, `useFormStatus` | `Alerta`, `Campo`, `Input`, `Textarea` | igual ao anterior (é plataforma, mas o Ciclo aponta para ele) |
| `components/RegistrarSW.tsx` (21) | registra `/sw.js` | `useEffect`; `navigator.serviceWorker` | — | nenhum; **`public/sw.js` precisa ir junto** e o `CACHE = "ciclo-v1"` (sw.js:24) virar nome da plataforma; cuidado com `ESTATICO` (`/_next/static/`, `/icone-`, `/favicon`) — o sniconecta serve `icon.png` (`proxy.ts:63`) |
| `admin/Sidebar.tsx` (176) — plataforma, listado porque carrega `SECOES` do módulo | menu por capacidade | `usePathname` | — | substituído por `AppShell.tsx` + `src/modulos/registro.ts` (já existe); os 12 itens de §1.2 viram o bloco `ciclo` do `MODULOS` |

### 3.1 Primitivos: o que o módulo usa hoje × o que o sniconecta oferece

`sistema-ciclo/src/components/ui.tsx` (426 l.) exporta 18 primitivos;
`sniconecta/src/componentes/ui.tsx` (226 l.) exporta 19. Diferença que quebra
o porte "copiar e colar":

| Primitivo (ciclo) | Uso no módulo | No sniconecta | O que muda |
|---|---|---|---|
| `Botao` variantes `primary/secondary/ghost/success/danger/dark`, tamanhos `xl/lg/md/sm/xs` | em toda tela | variantes `primary/glass/ghost/success/danger`, tamanhos `lg/md/sm`, prop `icone` | `secondary` → `glass`; `dark` e `xl`/`xs` não existem (`page.tsx:31` usa `xl`; `ImportadorCliente:153` usa `lg`) |
| `BotaoLink` | `voltar`, links de ação | existe | idem variantes |
| `BotaoIcone` | não usado pelo módulo | existe | — |
| `Campo({label, hint, erro, obrigatorio})` | todos os formulários | `Campo({label, htmlFor, dica, erro, obrigatorio})` | **`hint` → `dica`**; o do sniconecta usa `<label htmlFor>` em vez de envolver o controle |
| `Input`, `Select`, `Textarea` | idem | existem | iguais (`className` passa) |
| `Badge({tom, ponto, tamanho})` tons `blue/success/warning/danger/gray/dark/outline` | status, contagens | `Badge({tom, ponto})` tons `blue/success/warning/danger/info/gray` | **sem `tamanho`**, sem `dark`/`outline` (usados em `localidades/[id]/page.tsx:39`, `painel/page.tsx:120`) |
| `Etiqueta({ativo})` | regionais, localidades, regras, complementares | **não existe** | criar (é `Badge` success/gray com ponto) |
| `Alerta({tipo})` | todas | `Alerta({tipo, icone})` | igual; o do sniconecta não põe ícone sozinho |
| `Card({className})` | todas | `Card` = `<section>` com `...rest` | igual |
| `CardCabecalho({titulo, subtitulo/descricao, icone, tom, acao})` | provas, meu-curso | `CardCabecalho({icone, titulo, subtitulo})` | sem `tom`/`acao`/`descricao` |
| `Metrica({rotulo, valor, detalhe, tom, icone, alerta})` | concedidos, importação, meu-curso, resultado | `Metrica({valor, rotulo})` | **sem `detalhe`/`alerta`** (usados em `concedidos:80-84`, `ImportadorCliente:109-111`, `meu-curso:117-131`) |
| `TituloPagina({titulo, descricao, acao, voltar})` | todas | `TituloPagina({children, descricao})` | **sem `acao` e sem `voltar`** — `acao` é usada em 13 telas (é onde mora o `ModalCadastro` de criação); `voltar` em 14 |
| `TituloSecao` | várias | existe | igual |
| `Tabela({cabecalho})`, `Linha`, `Celula({forte, className})` | 11 telas | `Tabela({children})`, `Celula({dado, alinhar})` | cabeçalho vira `<thead>` manual; `Linha` não existe; `forte` → `<strong>` (o CSS `.sni-table td strong` existe, `componentes.css:237`) |
| `Vazio({children, icone})` | todas | `Vazio({icone, titulo, children, acao})` | **`titulo` é obrigatório** no sniconecta |
| `Modal`, `ModalCorpo`, `ModalAcoes`, `ModalCadastro` | 11 telas admin + `NovaRegra` | **não existem** | portar `Modal.tsx` inteiro |
| — | — | `Num`, `Entidade` (novos) | usar `Num` em nota, presença, preço, contador, número de certificado; `Entidade` onde hoje está "Seicho-No-Ie do Brasil" (`certificado/[codigo]/page.tsx:61,85`, `pdf.ts:33,58,84`, `landing.ts:32`, `l/[slug]/page.tsx`, `manifest.ts:17`) — **AGENTS.md proíbe a grafia com "do Brasil" em minúsculas** |

Classes de `globals.css` do Ciclo usadas nas telas do módulo (`t-h1`, `t-h2`,
`t-h3`, `t-display`, `t-metric`, `section-title`) → equivalentes do sniconecta:
`.t-page`, `.t-section`, `.t-metric`, `.sni-page-title`, `.sni-page-subtitle`,
`.sni-section-eyebrow` (`src/design/componentes.css:246-268`). Não há `t-h3`
nem `t-display` lá; o design v2.7 manda Platypi em título e Plex Mono em
número (`docs/design-system.md`).

---

## 4. Itens em aberto da especificação (§18) e decisões provisórias no código

### 4.1 Os 11 itens do §18 (`ESPECIFICACAOCICLOPROSPERIDADE.md:625-646`)

| # | Item | Bloqueia fase | Estado no código | Valor/decisão atual e onde |
|---|---|---|---|---|
| 1 | Matriz detalhada de permissões | 2 | **decidido provisoriamente** | `src/lib/permissoes.ts:82-148`, 23 capacidades × 6 papéis, cabeçalho l.5-24 "ESTA MATRIZ É UMA PROPOSTA, NÃO UMA LEI"; testada em `tests/permissoes.test.ts`. Regras vindas do MD: §7.4 coordenador autoriza desconto, §6.3 orientador dispensa, §5.3 escopos |
| 2 | Subdomínio vs. path nas landings | 3 | **decidido por path** | `/l/[slug]` (`middleware.ts:22`); plano §3.2 mantém |
| 3 | Número máximo de parcelas | 3 | **provisório: 12** nacional, override por localidade, absoluto 24 | `configuracao/politica.ts:43-52`; `0023` (ver `ciclo-plataforma.md` §5); aplicado em `matricula/actions.ts:121-122` |
| 4 | Split na 1ª parcela ou proporcional | 3 | **em aberto** — nada implementado; `calcularSplit` divide o total, sem noção de parcela | `pagamento/tipos.ts:45-52` |
| 5 | Política de cancelamento e reembolso | 3 | **texto editável pela Sede**, publicado em `/politicas`; `prazo_arrependimento_dias` padrão 7; **nenhum fluxo de cancelamento** | `configuracao/index.ts:23-25, 65`; `politicas/page.tsx:103-105` |
| 6 | Matrícula com ciclo em andamento | 3 | **decidido: valor integral, sem pró-rata** (cliente, 01/09/2026) | `configuracao/politica.ts:104-120` `precoParaEntradaTardia` (não chamada — §2.1.16) |
| 7 | Quem registra presença | 4 | **decidido: professor faz a chamada** (esquema aceita os dois) | `0018_presenca.sql:4-18`; policy 0018:29-42 |
| 8 | Critério de aprovação | 6 | **decidido: nacional; presença ≥ 75 % E nota ≥ 70; vídeo 0 %; editável por ciclo** | `prova/dominio.ts:138-162`; `criterios_aprovacao` (0020:106-123); tela `admin/provas/page.tsx:141-170` |
| 9 | Modelo e assinatura do certificado | 7 | **decidido: modelo único nacional, assina "Sede Central — Seicho-No-Ie do Brasil", numeração `CICLO-<ano>-NNNNNN`** | `certificado/pdf.ts:75-84`; `0021:58-62` |
| 10 | Textos dos templates de WhatsApp | 8 | **provisórios em código** (4 templates, categoria UTILITY, sem nome da instituição) | `comunicacao/templates.ts:53-136`; `docs/TEMPLATES-WHATSAPP.md` |
| 11 | Responsável por proteção de dados | — | **campo editável**, publicado em `/politicas`; vazio mostra "ainda está sendo indicado" | `configuracao/index.ts:20-22`; `politicas/page.tsx:69-97` |

### 4.2 Outras decisões provisórias e constantes com valor atual

| Decisão / constante | Valor | Onde | Por que importa no porte |
|---|---|---|---|
| Versão do consentimento LGPD | `"v2-2026"` | `l/[slug]/matricula/actions.ts:27` | texto em `MatriculaForm.tsx:146-158`; se o texto mudar ao entrar no SNI Conecta (nome do produto, política comum), **vira v3** |
| CodSNI provisório em inscrição pública | `"9" + cpf` (12 dígitos) | `matricula/actions.ts:139-141` | choca com decisão 0004 do sniconecta (`cod_sni` **anulável**): no porte, gravar `null` e não inventar código |
| MDR e tarifa fixa Braspag | 0 % / 0 centavos | `politica.ts:46-47`; `pagamento/tipos.ts:36` | piso da edição = `valor_sede + margem` informada à mão (`localidades/actions.ts:114`) |
| Modo de pagamento | `CIELO_MODO` ≠ `"split"` → `centralizado`; nacional padrão `centralizado` | `pagamento/index.ts:22`; `politica.ts:45` | |
| Ano de referência para descontos | idade em `1º/01/<ano da edição>` | `matricula/actions.ts:254` | |
| Ano padrão do formulário de regra | `ANO_ATUAL = 2026` **hard-coded** | `admin/descontos/page.tsx:17` | trocar por `ciclo_anos` mais recente ou `new Date()` |
| Ordem mínima para "preletor" | 6 (Preletor em grau Aspirante) | `dominio/desconto.ts:65-66` | depende do seed de `funcoes_doutrinarias` (0012) |
| Idade máxima padrão "jovem" | 25 | `descontos/actions.ts:25`; `NovaRegra.tsx:65` | |
| Apostila padrão | 5 etapas × 6 aulas; máx. 6 orientadores/etapa | `dominio/apostila.ts:13-19`; literal `6` em `apostilas/[id]/actions.ts:96` | |
| Prova: duração, tentativas | form sugere 60 min e 2; check 5-480 min, 1-10 tentativas; `embaralhar` default true | `admin/provas/page.tsx:99,102`; `actions.ts:17-18`; 0020:15-17 | |
| Tolerância de envio da prova | 30 s | `prova/dominio.ts:50` | |
| Cronômetro fica vermelho | ≤ 300 s | `Cronometro.tsx:39` | |
| Vídeo: validade do link | 12 h | `video/provedores.ts:18` | |
| Vídeo: heartbeat | 25 s | `Player.tsx:7` | |
| Vídeo: teto de crédito | `decorrido × 2 + 5 s` | `progresso.ts:23-26` | |
| Vídeo: concluída | 90 % | `progresso.ts:105`; literal em `Player.tsx:38` | |
| Certificado: código | `randomBytes(9)` base64url | `emitir.ts:198` | |
| Certificado: nota considerada | melhor tentativa finalizada | `emitir.ts:61-66` | |
| Presença: matrículas na chamada | `pendente`, `ativa` | `chamada/[id]/page.tsx:109` | |
| Chamada: limite de aulas listadas | 300 | `chamada/page.tsx:30` | |
| Certificados: limite de matrículas listadas | 200 | `certificados/page.tsx:38` | |
| Concedidos: limite e alertas | 500 matrículas; alerta > 30 % geral, > 40 % por localidade | `concedidos/page.tsx:40, 87, 110` | |
| Landing: versões exibidas | 10 | `landing/page.tsx:53` | |
| Importação: lote | 500; paginação da base 1000 | `importacao/actions.ts:43, 212` | |
| Upload | `bodySizeLimit: "10mb"` | `next.config.mjs:7` | |
| Fila de presença no navegador | chave `ciclo:fila-presenca` | `Chamada.tsx:28` | renomear para `sni:ciclo:fila-presenca` ou manter — migração de fila local não existe |
| Service worker | cache `ciclo-v1` | `sw.js:24` | |
| PWA | `start_url: "/admin/chamada"`, `theme_color #0F2B7A` | `manifest.ts:18-22` | |
| E-mail de confirmação/certificado | templates `matricula_confirmada`, `certificado_liberado` | `templates.ts:54-74, 114-135` | textos dizem "Ciclo de Estudos", nunca a instituição (l.14-19) |

---

## 5. Checklist de porte para o SNI Conecta

### 5.1 Rotas: de `/admin/...` para `/ciclo/...`

| Hoje | Depois | Observação |
|---|---|---|
| `/admin/regionais`, `/admin/localidades`, `/admin/locais` | `/admin/...` (plataforma) | ficam; `estrutura.gerir` é de plataforma (plano §3.1) |
| `/admin/localidades/[id]` bloco "Edições anuais" | `/ciclo/localidades/[id]` (ou bloco `ciclo` na ficha da localidade) | `criarEdicao`/`alternarStatusEdicao` saem de `localidades/actions.ts` para `src/modulos/ciclo/edicoes/actions.ts` |
| `/admin/localidades/[id]/landing` | `/ciclo/localidades/[id]/landing` | |
| `/admin/minha-localidade` | `/ciclo/minha-localidade` | |
| `/admin/ciclos`, `/admin/ciclos/[id]` | `/ciclo/anos`, `/ciclo/anos/[id]` | evita `/ciclo/ciclos` |
| `/admin/apostilas/[id]` | `/ciclo/apostilas/[id]` | |
| `/admin/edicoes/[id]` | `/ciclo/edicoes/[id]` | |
| `/admin/grades/[id]` | `/ciclo/grades/[id]` | |
| `/admin/descontos`, `/admin/descontos/concedidos` | `/ciclo/descontos`, `/ciclo/descontos/concedidos` | |
| `/admin/dispensas` | `/ciclo/dispensas` | |
| `/admin/chamada`, `/admin/chamada/[id]` | `/ciclo/chamada`, `/ciclo/chamada/[id]` | `manifest.ts start_url` acompanha |
| `/admin/certificados` | `/ciclo/certificados` | |
| `/admin/provas`, `/admin/provas/[id]` | `/ciclo/provas/gerir`, `/ciclo/provas/gerir/[id]` | **colide** com `/provas` do aluno se ambos virarem `/ciclo/provas`; separar (`gerir/` ou `/ciclo/aluno/provas`) |
| `/admin/importacao` | `/ciclo/importacao` (ver §5.7) | |
| `/meu-curso`, `/aulas`, `/aulas/[id]`, `/provas/*` | `/ciclo/meu-curso`, `/ciclo/aulas`, `/ciclo/aulas/[id]`, `/ciclo/provas/*` | `login?redirect=` (`aulas/page.tsx:21` etc.) vira `?voltar=` (`proxy.ts:56`) |
| `/l/[slug]`, `/l/[slug]/matricula`, `/certificado/[codigo]`, `/certificado/[codigo]/pdf` | mantêm | já públicas no `proxy.ts:13` |
| `/politicas` | mantém (plataforma) | |
| `/api/video/progresso` | `/api/ciclo/video/progresso` | continua fora do proxy (`rotaDeApi`) e continua exigindo sessão por conta própria |
| `/api/notificacoes/processar` | já existe no sniconecta | trazer a implementação real de `processarFila` (o do sniconecta é stub, `lib/comunicacao/fila.ts:24-32`) |
| `/painel` ATALHOS, `Sidebar SECOES` | `src/modulos/registro.ts` bloco `ciclo` | 12 itens de §1.2 + os 3 atalhos do aluno |

Todo `redirect("/admin/x?erro=")`, `revalidatePath("/admin/x")`, `href` e
`voltar` das 20 telas trocam de prefixo — `grep -rn '"/admin/\|\`/admin/' src/app`
(excluindo `pessoas`, `papeis`, `configuracoes`, `Sidebar`) lista **120
ocorrências**; o `redirect("/painel")` dos guards continua.

### 5.2 Capacidades: prefixo `ciclo.*`

Tabela do plano §3.1, com o que o código realmente confere (§1.8):

| Hoje | Depois | Papéis (matriz atual) | Onde trocar |
|---|---|---|---|
| `tipos.gerir` | `ciclo.tipos.gerir` | sede | só na matriz (sem uso) |
| `ciclo.gerir` | `ciclo.programa.gerir` (ou `ciclo.ano.gerir`) — `ciclo.gerir` sozinho é ambíguo com o prefixo | sede | 9 actions (`ciclos/`, `apostilas/`), layout |
| `edicao.gerir` | `ciclo.edicao.gerir` | sede, coordenador | 2 actions, layout, sidebar, painel |
| `turma.gerir` | `ciclo.turma.gerir` | sede, coordenador | 3 actions; **incluir no guard do layout/registro** |
| `grade.gerir` | `ciclo.grade.gerir` | sede, coordenador, orientador | 5 actions, layout |
| `landing.editar` | `ciclo.landing.editar` | sede, coordenador | **passar a conferir** em `salvarLanding`/`publicarLanding` com `localidadeId` |
| `matricula.ver` | `ciclo.matricula.ver` | 6 papéis | painel; **passar a conferir** em `/ciclo/meu-curso`, `/ciclo/aulas`, `/ciclo/provas`? — atenção: o aluno recém-inscrito **não tem papel** (`inscrever` não cria `papeis`), então exigir capacidade aqui bloqueia todo aluno; decidir se a inscrição cria o papel `aluno` (edicao_id) ou se essas telas continuam por sessão |
| `matricula.decidir` | `ciclo.matricula.decidir` | sede, coordenador | sem uso; precisa de tela nova (§5.8) |
| `financeiro.ver` | `ciclo.financeiro.ver` | sede, coordenador, presidente_uap | guard de concedidos |
| `desconto.autorizar` | `ciclo.desconto.autorizar` | sede, coordenador | sem uso |
| `politica_desconto.gerir` | `ciclo.politica_desconto.gerir` | sede | 2 actions |
| `prerequisito.dispensar` | `ciclo.prerequisito.dispensar` | sede, orientador | guard + 2 actions; o SQL 0017 confere `app.pode_orientar` — manter os dois em sincronia |
| `presenca.lancar` | `ciclo.presenca.lancar` | sede, coordenador, orientador, professor | 2 guards; RLS 0018 é a autorização real |
| `certificado.emitir` | `ciclo.certificado.emitir` | sede, coordenador | 1 action com escopo |
| `prova.gerir` | `ciclo.prova.gerir` | sede | 4 actions + 2 guards |
| `importacao.executar` | `ciclo.importacao.executar` (ou plataforma, §5.7) | sede | trocar `isSede` por `exigirCapacidade` |

O `src/lib/permissoes.ts` do sniconecta hoje tem só 7 capacidades `ciclo.*`
(l.35-41) e diz "a lista completa vem com o módulo" (l.34) — substituir pela
lista acima. `tests/permissoes.test.ts` do Ciclo (16 casos) vem junto com os
nomes trocados; o do sniconecta tem o teste de minimização entre módulos.

`exigirCapacidade` do sniconecta **redireciona** (`lib/auth.ts:80-86`) em vez
de lançar `SemPermissao` (`ciclo/lib/auth.ts:104-115`). Consequência: actions
que devolvem objeto (`inscrever`, `gerarPreviaImportacao`) não podem depender
de exceção para responder `{ok:false}`.

### 5.3 Tabelas: prefixo `ciclo_`

Ver `ciclo-esquema.md` §4.1 para a lista completa. O que muda em código, por
string literal de `.from("...")`:

| Tabela hoje | Depois | Ocorrências em `src` (arquivos) |
|---|---|---|
| `tipos_turma`, `tipo_turma_prereq`, `equivalencias` | `ciclo_tipos_turma`, `ciclo_tipo_turma_prereq`, `ciclo_equivalencias` | ciclos/[id], edicoes/[id], matricula/actions, importacao/actions, provas |
| `ciclo_anos`, `apostilas`, `apostila_etapas`, `apostila_aulas`, `aulas_complementares`, `criterios_aprovacao`, `regras_desconto` | `ciclo_anos` (mantém), `ciclo_apostilas`, `ciclo_apostila_etapas`, `ciclo_apostila_aulas`, `ciclo_aulas_complementares`, `ciclo_criterios_aprovacao`, `ciclo_regras_desconto` | ciclos/*, apostilas/*, grades/actions, aulas/*, api/video, emitir.ts, provas admin, descontos/*, matricula/actions |
| `edicoes`, `turmas`, `turma_professores`, `matriculas`, `dispensas_prereq` | `ciclo_edicoes`, `ciclo_turmas`, `ciclo_turma_professores`, `ciclo_matriculas`, `ciclo_dispensas_prereq` | quase todas as telas; `papeis.edicao_id` (plataforma) passa a referenciar `ciclo_edicoes` — FK de plataforma para módulo (`ciclo-esquema.md` §4.2) |
| `pagamentos`, `split_registros`, `webhooks_cielo`, `localidade_credenciais_cielo` | `ciclo_pagamentos`, `ciclo_split_registros`, `ciclo_webhooks_cielo`, `ciclo_localidade_credenciais_cielo` | pagamento/index, video/acesso |
| `grades`, `grade_etapas`, `grade_etapa_orientadores`, `grade_aulas`, `presencas`, `progresso_video` | `ciclo_grades`, `ciclo_grade_etapas`, `ciclo_grade_etapa_orientadores`, `ciclo_grade_aulas`, `ciclo_presencas`, `ciclo_progresso_video` | grades/*, chamada/*, `Chamada.tsx:112` (**cliente do navegador**), api/video, emitir.ts |
| `provas`, `questoes`, `questao_gabarito`, `tentativas`, `respostas`, `certificados` | `ciclo_provas`, `ciclo_questoes`, `ciclo_questao_gabarito`, `ciclo_tentativas`, `ciclo_respostas`, `ciclo_certificados` | provas/*, certificados/*, meu-curso, emitir.ts, certificado/[codigo]/* |
| `landing_pages`, `landing_versoes` | `ciclo_landing_pages`, `ciclo_landing_versoes` | landing/*, l/[slug] |
| `importacoes`, `importacao_conflitos`, `historico_turma` | `ciclo_importacoes`, `ciclo_importacao_conflitos`, `ciclo_historico_turma` | importacao/actions, matricula/actions |
| view `pessoa_funcao_atual`, `pessoas`, `pessoa_funcao_hist`, `funcoes_doutrinarias`, `localidades`, `regionais`, `localidade_regionais`, `locais`, `consentimentos_lgpd`, `auditoria`, `notificacoes`, `configuracoes`, `solicitacoes_exclusao` | sem prefixo (plataforma) | — |
| RPC `dispensar_prerequisito`, `recusar_prerequisito`, `proximo_numero_certificado` | `ciclo_dispensar_prerequisito`… (ou schema `ciclo` se a decisão §1.3 do plano mudar) | dispensas/actions, emitir.ts |

Os selects aninhados do PostgREST usam o **nome da relação** (ex.:
`turmas(edicoes(localidades(nome)))`, `matriculas!inner`, `ciclo_anos!inner`,
`pessoas:autor_id(nome)` em `landing/page.tsx:50`) — todos mudam junto. São
dezenas; conferir com `grep -rn "select(" src/modulos/ciclo`.

O `Database` de `src/lib/supabase/tipos.ts` do sniconecta só conhece `pessoas`
e `papeis` (l.33-44); as consultas do módulo hoje são não tipadas (`as unknown
as`). Gerar tipos (`supabase gen types`) depois da migração consolidada.

### 5.4 Next 14 → 16 (verificado em `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`)

| Mudança | Onde bate no módulo |
|---|---|
| **`params` e `searchParams` são `Promise`** (síncrono removido) | 14 páginas com `params: { id }`: `localidades/[id]`, `.../landing`, `ciclos/[id]`, `apostilas/[id]`, `edicoes/[id]`, `grades/[id]`, `chamada/[id]`, `provas/[id]` (admin), `aulas/[id]`, `provas/[id]/tentativa/[tid]`, `provas/[id]/resultado/[tid]`, `l/[slug]`, `l/[slug]/matricula`, `certificado/[codigo]`; e **18 páginas** que leem `searchParams.erro/ok/ano/turma/fora_do_prazo` (`grep -rl searchParams src/app --include=page.tsx`). Codemod `next-async-request-api`; ou `PageProps<'/ciclo/...'>` via `next typegen` |
| **`cookies()` e `headers()` assíncronos** | `headers().get("x-forwarded-for")` em `matricula/actions.ts:162,167` e `politicas/actions.ts:68` → `(await headers()).get(...)`; `criarClienteServidor` já é `async` no sniconecta (`server.ts:10-11`) → **todo `criarClienteServidor()` do recorte vira `await criarClienteServidor()`** (58 chamadas em `src/app`, contadas com `grep -rn "criarClienteServidor()"`) |
| **Route handler**: `{ params }: { params: Promise<{codigo}> }` | `certificado/[codigo]/pdf/route.ts:19-22` |
| **`middleware.ts` → `proxy.ts`**, export `proxy` | já feito no sniconecta (`src/proxy.ts`); `tests/middleware.test.ts` do Ciclo testa `rotaPublica`/`comPrazo` de `lib/supabase/middleware.ts` — reapontar para `@/proxy` (`rotaPublica`, `rotaDeApi` exportados) |
| **`experimental.serverActions.bodySizeLimit`** continua em `experimental` (docs `serverActions.md:27-41`) | `next.config.ts` do sniconecta não tem; adicionar `experimental: { serverActions: { bodySizeLimit: "10mb" } }` para a importação |
| `next lint` removido → ESLint CLI | `package.json` do sniconecta já usa `eslint` |
| Turbopack padrão | sem `webpack` custom nos dois projetos; nada a fazer |
| `next/font` | `layout.tsx` do sniconecta já carrega Figtree + Platypi + Plex Mono (`docs/design-system.md`) |
| React 19: `useFormState` (react-dom) → **`useActionState`** (react), que devolve `[state, action, pending]` | `MatriculaForm.tsx:4,47`, `FormExclusao.tsx:3,25`; `useFormStatus` continua em `react-dom` |
| `export const dynamic = "force-dynamic"` | 21 arquivos do recorte; continua válido (`migrating-to-cache-components.md:138-153`); sem `cacheComponents` ligado nada muda |
| `revalidatePath` | 43 chamadas; continua; caminhos mudam de prefixo |
| **zod 3.23 → 4.5** | `z.string().uuid()` e `.email()` estão `@deprecated` (usar `z.uuid()`, `z.email()`); `parsed.error.issues[0].message` continua; `z.coerce.number()` continua; `z.enum` continua. 14 arquivos de actions |
| **@supabase/ssr 0.5 → 0.12** | assinatura `cookies: { getAll, setAll }` mantida (`createServerClient.d.ts:22-37`); `createBrowserClient` idem |
| vitest 2 → 3 | `vitest.config.ts` do sniconecta já resolve `@` e `server-only` (l.9-16); os 7 testes do módulo rodam sem mudança de API |
| `manifest.ts` | continua (`01-metadata/manifest.md`) |

### 5.5 Tailwind 3 → 4 e o design system v2.7

O Ciclo escreve **utilitários Tailwind com tokens `sni-*`** em todas as telas
(`tailwind.config.ts:11-71` define `sni-blue-*`, `sni-gray-*`, `sni-success`,
raios, sombras). O sniconecta **não tem `tailwind.config`**: `globals.css` faz
`@import "tailwindcss"` + `tokens.css` + `componentes.css` e diz "Tailwind entra
só como utilitário de layout (flex, grid, espaçamento). Cor, raio, sombra e
tipografia vêm dos tokens, nunca de classe do Tailwind" (`src/app/globals.css:5-6`).

Consequência prática por tela:

1. **Toda classe `bg-sni-*`, `text-sni-*`, `border-sni-*`, `shadow-sm/md/lg`, `rounded-sm/md/lg/xl`, `t-h1/h2/h3`, `t-display`, `t-metric`, `section-title` do módulo deixa de existir.** Não há `@theme` no `tokens.css` que as republique como utilitários; o caminho é classe `.sni-*`/`.t-*` de `componentes.css` ou `style={{ color: "var(--txt-2)" }}` (como `painel/page.tsx` do sniconecta faz).
2. Elementos montados à mão que precisam de primitivo novo em `ui.tsx` (AGENTS.md: "Precisou de algo que não existe: crie o primitivo em `ui.tsx`"): botão-toggle de presença, barra de estado sticky (`Chamada.tsx`), barra de progresso (`Player.tsx`, `aulas/page.tsx:117-124`), `role="timer"` (`Cronometro.tsx`), input de arquivo (`ImportadorCliente.tsx:75-81`), checkbox (`MatriculaForm.tsx:141-145`, `localidades/[id]/page.tsx:204-209`), "chip" removível com `<form>` dentro (`localidades/[id]/page.tsx:114-129`, `edicoes/[id]/page.tsx:211-229`, `grades/[id]/page.tsx:180-198`), cartão-link de lista (`chamada/page.tsx:72-88`, `minha-localidade:55-72`, `aulas/page.tsx`), cabeçalho "hero" em gradiente das páginas públicas (`l/[slug]`, `matricula`, `politicas`, `painel`, `page.tsx`) — o v2.7 usa `--navy-*` para bloco institucional escuro, nunca `--sni-blue-800`.
3. `Modal.tsx` usa `backdrop:bg-sni-blue-900/40 backdrop:backdrop-blur-[6px]` (l.69) — reescrever com `.dimlayer`/`.lg` do design (vidro só em modal e barra, `docs/design-system.md` "duas camadas").
4. `has-[:checked]:` e `accent-sni-blue-600` (`tentativa/[tid]/page.tsx:102,108`) — Tailwind 4 mantém `has-[...]`, mas a cor precisa vir de token.
5. Tipografia: número (nota, presença, preço, contador, nº de certificado) em `<Num>`; títulos em `.t-page`/`.t-section` (Platypi ≥ 16 px); **nada abaixo de 13 px** — o módulo tem `text-[9px]`, `text-[10px]`, `text-[11px]` e `text-[12px]` em dezenas de lugares (ex.: `Sidebar.tsx:118,128`, `Tabela th` 10 px em `ui.tsx:380`, `Badge sm` 10 px). Tudo sobe.
6. Tema escuro: as telas públicas usam `bg-white` e `bg-sni-page` explícitos; no sniconecta os tokens já cobrem os dois temas — remover fundos literais.
7. Caixa alta em rótulo pequeno (`uppercase tracking-[.12em]` em `localidades/[id]/page.tsx:167`, `edicoes/[id]/page.tsx:77`, `ciclos/[id]/page.tsx:96`, `certificado/[codigo]/page.tsx:69` …) é **proibida** no v2.7; vira `.sni-section-eyebrow`.
8. `SEICHO-NO-IE DO BRASIL` sempre em caixa alta via `<Entidade />`; ocorrências com "do Brasil" em minúsculas listadas em §3.1.

### 5.6 Decisões de arquitetura que o porte precisa tomar (não são renomeação)

1. **Escrita de `presencas` pelo navegador** (`Chamada.tsx:99-114`, `criarClienteBrowser`). Decisão 0003 do sniconecta admite cliente Supabase com RLS para o `ciclo`, mas AGENTS.md diz "Server Action e rota de API começam com `exigirCapacidade`" e "o navegador nunca fala com essas tabelas" (para eventos). Opções: (a) manter upsert direto (RLS 0018 é a autorização; funciona offline sem rota), (b) trocar por rota `POST /api/ciclo/presencas` com `exigirCapacidade("ciclo.presenca.lancar", localidade)` — a fila local continua igual, só muda o transporte (`sincronizar`, l.93-126). Registrar como ADR.
2. **`exigirCapacidade` redireciona** no sniconecta. As actions que hoje devolvem `{ok:false}` (`inscrever`, `gerarPreviaImportacao`, `efetivarImportacao`) precisam de outra forma de negar (ex.: `pessoaAtual()` + `pode()` manual) ou de uma variante que lance.
3. **Cliente `service_role` em telas do aluno** (`meu-curso`, `aulas`, `provas`, `resultado`): o Ciclo usa `criarClienteServico` porque o aluno não alcança presenças/tentativas de outros e o RLS de algumas tabelas é restritivo (`emitir.ts:30-34`). Manter, mas cada tela filtra por `eu.id` à mão — é a regra "service_role só em fluxo controlado" (`service.ts:5-9`). Alternativa: policies de leitura `self` e usar o cliente com RLS. Decidir por tabela.
4. **Papel `aluno` nunca é criado** pela inscrição (`matricula/actions.ts` não escreve `papeis`), embora `permissoes.ts` e o RLS `app.pode_ver_matricula` existam. Se o hub 360º e `ciclo.matricula.ver` dependem de papel, a inscrição (ou a ativação da matrícula) precisa criar `papeis(tipo='aluno', localidade_id, edicao_id)`.
5. **Transição `pendente → ativa`** não existe (§2.1.11). Enquanto a Cielo não entra, precisa de tela de "confirmar pagamento" (cap `ciclo.matricula.decidir` ou `ciclo.financeiro.*`) que mude `pagamentos.status` e `matriculas.status`, com auditoria.
6. **Localidade como unidade da estrutura institucional** (`ciclo-esquema.md` §5): as 4 colunas de pagamento em `localidades` (`max_parcelas`, `modo_pagamento`, `mdr_percent`, `tarifa_fixa_centavos`) e `landing_pages.localidade_id` são do módulo; se `localidades` virar tabela de plataforma partilhada com eventos, essas colunas migram para `ciclo_localidade_config` (1:1) e `politicaDaLocalidade` (`configuracao/index.ts:93-116`) lê de lá.
7. **Onde mora o módulo**: AGENTS.md diz `src/modulos/ciclo/` para domínio e `src/app/ciclo/...` para rotas. Sugestão de mapa: `src/modulos/ciclo/{dominio/{desconto,prerequisito,apostila}.ts, pagamento/, presenca/, prova/, certificado/, video/, importacao/, landing.ts}`; actions ficam junto das rotas em `src/app/ciclo/**/actions.ts` (como hoje) ou em `src/modulos/ciclo/acoes/` — escolher um e manter.

### 5.7 Importação: plataforma ou módulo?

`gerarPreviaImportacao`/`efetivarImportacao` escrevem `pessoas` e
`pessoa_funcao_hist` (plataforma) **e** `historico_turma` (módulo). O
sniconecta já tem `scripts/migrar-mysql.ts` para a carga de eventos e a decisão
0004 (CPF validado, e-mail nulo, CodSNI anulável). Sugestão: o parser e a prévia
puros (`parse.ts`, `previa.ts`, `tipos.ts`) viram utilitário de plataforma
(`src/lib/importacao/`), a tela vira `/admin/importacao` de plataforma com
`pessoa.gerir` + `importacao.executar`, e o módulo registra um "gancho" para
`historico_turma`. Pontos a alinhar com 0004: hoje a prévia **exige e-mail
válido quando presente** mas não exige e-mail (`previa.ts:80-84`), e grava
`email: p.email` mesmo vazio (`actions.ts:218`) — é o caso que a decisão 0004
proíbe ("e-mail em branco vira `NULL`, nunca string vazia"): no esquema atual
`email citext not null unique` (0002:18) aceita `""` uma vez e derruba o unique
na segunda pessoa. `PessoaNormalizada.codSni` pode ficar `""` e é gravado como
`cod_sni: ""` (`actions.ts:216`) — hoje isso **estoura** no check
`cod_sni_digitos` (`^[0-9]+$`, 0002:27) e aborta o lote inteiro; com `cod_sni`
anulável (0004), gravar `null`.

### 5.8 Telas que não existem e o plano pressupõe

- Cadastro de tipos de turma, pré-requisitos e equivalências (`ciclo.tipos.gerir`).
- Decisão de matrícula: aprovar/ativar, cancelar, transferir (`ciclo.matricula.decidir`).
- Desconto/isenção manual com motivo (`ciclo.desconto.autorizar`) gravando `desconto_autorizado_por`/`desconto_motivo` e respeitando `respeita_piso`.
- Resolução da fila `importacao_conflitos`.
- Correção humana de dissertativas (`respostas.correta` null → nota recalculada).
- Credenciais Cielo por localidade (cifradas com `src/lib/cripto.ts` do sniconecta, tabela sem GRANT) e webhook idempotente.
- Cancelamento/reembolso (§18-#5) e "pagamento_pendente"/"lembrete_aula" (templates existem, ninguém enfileira).
- Adaptadores `ControlePlayer` (Bunny `player.js` / Vimeo `player.js`) para posição real.

### 5.9 Ordem sugerida

1. Migração consolidada com prefixo (§5.3) e diff mecânico (plano §4); trazer `dispensar_prerequisito`, `recusar_prerequisito`, `proximo_numero_certificado`, policies 0015/0018/0019/0020/0021.
2. `src/lib/permissoes.ts` com as 16 capacidades `ciclo.*` + testes.
3. `Modal.tsx` + primitivos faltantes em `ui.tsx` (§3.1, §5.5-2).
4. Libs puras (`dominio/`, `prova/dominio`, `presenca/fila`, `video/progresso`, `importacao/previa`) — copiam com os 69 testes.
5. Libs com banco (`pagamento/`, `certificado/`, `video/acesso`, `video/provedores`) — só renomear tabelas.
6. Telas, na ordem das fases da spec: edição/turmas/grade → landing/inscrição → chamada → aulas → provas → certificados → importação.
7. `registro.ts` com o bloco `ciclo`; `manifest.ts`; `sw.js`.
8. `testar-rls.sh` estendido (plano §6-7): além de SP × Campinas, um papel `eventos_*` tentando ler `ciclo_matriculas`.
