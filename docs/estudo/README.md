# Estudo de fundação — estado e retomada

Escrito em 06/09/2026, sessão interrompida por limite de tempo. Este arquivo
diz o que está pronto, o que estava em produção quando a sessão acabou, o que
já foi concluído e por onde a próxima sessão continua.

## O que existe nesta pasta

| Documento | Estado | Fonte estudada |
|---|---|---|
| `ciclo-esquema.md` | pronto (111 KB) | `sistema-ciclo` em `70f61d6`, 23 migrations, verificado num Postgres 16 local |
| `ciclo-plataforma.md` | pronto (93 KB) | `sistema-ciclo` em `70f61d6`: auth, permissões, acesso, fila, configuração, diagnóstico |
| `ciclo-modulo.md` | pronto (92 KB) | `sistema-ciclo` em `70f61d6`: rotas, actions, regras de negócio, checklist de porte |
| `ui-design-system.md` | pronto (71 KB) | Ciclo × esqueleto × eventos: primitivos, tokens, modal, tema, AppShell |
| `eventos-esquema.md` | em produção ao fim da sessão | `sni-ciclo/src/app/api/migrate/route.ts` (31 tabelas) × `supabase/rascunhos/eventos_schema.sql` |
| `eventos-identidade.md` | pronto (75 KB) | User/Perfil/permissões, participantes, dedup, regional/organização, magic link |
| `eventos-compra.md` | em produção | checkout, pedidos, inscrições, Cielo, cupons, combos, voucher, estornos |
| `eventos-operacao.md` | pronto (94 KB) | balcão, check-in, relatórios, comissão, e-mails, WhatsApp, configurações |
| `estrutura-organizacional.md` | em produção | hierarquia institucional nos quatro sistemas + esboço de modelo unificado |
| `esqueleto-main.md` | em produção | auditoria do commit `8cd93fa` (typecheck, testes, contradições, qualidade) |
| seção "Delta para 2f07f6a" nos 4 docs do Ciclo | em produção | diferença entre `70f61d6` e a versão nova do Ciclo |

Se um documento "em produção" não estiver aqui, o agente não terminou antes
do fim da sessão: refazer com o mesmo recorte (os recortes estão descritos
abaixo em "Como retomar").

## Descoberta que muda o estudo do Ciclo

O clone raso de `agenciaveranno/sistema-ciclo` trouxe `70f61d6` (3/set),
porque o `HEAD` remoto aponta para `claude/system-development-0yi4m6`. A
versão real é mais nova:

- `main` = `370e786` — design system v2.7 implantado (#28), e-mail transacional
  configurável em tela (#30) com `supabase/migrations/0024_email_transacional.sql`,
  `src/lib/cripto.ts`, `src/lib/endereco.ts`, `src/lib/comunicacao/email.ts`,
  `src/components/Tema.tsx`, `ui.tsx` com +359 linhas.
- `claude/design-system-implementation-ics328` = `2f07f6a` — `main` + 4 commits:
  `docs/PLATAFORMA-SNI-REFERENCIA.md` (referência da plataforma para integrar o
  segundo módulo), decisão de identidade (CPF como chave), ajuste do importador
  (CodSNI confirmado para todos; e-mail `''` derruba a carga) e
  `docs/SNICONECTA-FUNDACAO.md` (o plano enviado pelo cliente).

Nesta sessão, `2f07f6a` foi materializado em `/home/user/sistema-ciclo-novo`
(worktree). **Toda leitura futura do Ciclo deve partir de `2f07f6a`.**

## Fatos estabelecidos (com fonte)

- Os dois sistemas concordam no essencial: `pessoas` é a espinha, CPF
  identifica (`not null unique`, só dígitos, DV validado na entrada), `id`
  uuid referencia; ficha 360º é read model montado por capacidade de cada
  módulo (ADR 0002 do esqueleto; referência do Ciclo §15.3–15.4).
- E-mail passa a ser **anulável**, obrigatório só quando `auth_user_id`
  existe (ADR 0004; referência do Ciclo §15.4.1 chama isso de bloqueio e
  descreve o defeito do `''` no importador).
- CodSNI: cliente confirmou que **todas as 16 mil pessoas de eventos têm**
  (commit `c75324c` do Ciclo). Mas o checkout público de eventos cadastra
  gente nova sem CodSNI (`primeiraVez`), logo a coluna precisa continuar
  anulável e única quando presente; o importador rejeita ausência com motivo.
- Ciclo **não tem dado real em produção** (ADRs 0001 e 0006 do esqueleto);
  só eventos tem (MySQL no Railway, mais de 16 mil pessoas).
- Nomes dos módulos decididos pelo esqueleto: `ciclo` e `eventos`.
- Localidade do Ciclo **reúne uma ou mais Regionais** (N:N, spec §3.1). É
  conceito do módulo, não da estrutura institucional.
- Estrutura institucional descrita pelo cliente: Sede Internacional (sem
  ingerência) > Sede Central (Brasil + ibero-americanos + África latina) >
  Regionais Doutrinárias > Núcleos e Associações Locais; Organizações
  atravessam todas as esferas. O `sni-conecta` antigo tem seed de quatro
  organizações (CB/AM/AS/JU) com nomes diferentes dos de `sni-ciclo/src/lib/constants.ts`.
- A lista `REGIONAIS` de eventos mistura dois padrões ("SP-CAMPINAS" e
  "SP-NORTE 1 - Campinas"); precisa de confirmação do cliente sobre o que é
  Regional Doutrinária e o que é Núcleo/AL.
- Design system v2.7: os quatro arquivos enviados pelo cliente são idênticos
  aos que o esqueleto já carrega (`docs/tokens.json`, `docs/referencia-visual.html`;
  tokens iguais; cópia de produção em `docs/tokens-v2.7-original.css`).
- Esqueleto passa em `typecheck` e nos 22 testes. O harness
  `scripts/testar-rls.sh` do Ciclo roda neste ambiente (Postgres 16 local,
  23 migrations, todas as asserções verdes).
- Achado do estudo de UI: `src/design/componentes.css` do esqueleto veio só da
  metade "override" do `globals.css` de eventos; falta a camada estrutural
  (76 seletores). O `AppShell` do esqueleto não fica de pé sem isso.
- Achado do estudo de plataforma: `papeis` do Ciclo tem FK `edicao_id` para
  tabela do módulo e `check` fixo nos 6 tipos; não aceita os papéis nacionais
  `eventos_admin`/`eventos_operador`. A tabela de papéis da plataforma precisa
  de escopo genérico.
- `exigir()` e `exigirCapacidade()` têm semânticas diferentes no Ciclo
  (lança) e no esqueleto (redireciona / lança em `null`). Escolher uma antes
  de portar.
- A fila de notificações do Ciclo exige `template`; eventos precisa de corpo
  livre/HTML por regional. Contrato a reconciliar.

## Decisões que esta sessão considera tomadas (a registrar como ADR 0007+)

1. **Schema por módulo** (`ciclo.*`, `eventos.*`), `public` só para a
   plataforma. Motivo: `revoke usage on schema` fecha o módulo inteiro (o
   esqueleto já depende disso para eventos), o Ciclo paga só `.schema('ciclo')`
   no cliente e a exposição do schema no painel do Supabase, e o `gen types`
   aceita vários schemas. O plano do Ciclo recomendava prefixo; a diferença é
   pequena e a consistência com o esqueleto vale mais.
2. **Estrutura institucional como árvore `unidades`** (`tipo` em
   sede_central/regional/nucleo/associacao_local, `pai_id`) + `organizacoes`
   transversais + vínculos pessoa↔unidade e pessoa↔organização com histórico;
   `ciclo.localidades` aponta para regionais via N:N; eventos guarda regional
   e organização do participante por FK, não texto livre. Detalhes dependem de
   `estrutura-organizacional.md` e de perguntas ao cliente (abaixo).
3. **Papéis com escopo genérico**: `papeis(pessoa_id, tipo, escopo_tipo,
   escopo_id)`; `tipos_papel` como catálogo com coluna `modulo`; capacidades
   de plataforma sem prefixo (`estrutura.gerir`, `pessoa.gerir`,
   `papel.conceder`, `acesso.gerir`, `configuracao.gerir`, `lgpd.decidir`,
   `auditoria.ver`), capacidades de módulo com prefixo.
4. **Refundação limpa do Ciclo**: migration consolidada da plataforma +
   migration do schema `ciclo`, provadas por diff de `pg_dump --schema-only`
   contra as 24 migrations originais (plano §4).
5. **`exigirCapacidade` lança** `SemPermissao` (modelo do Ciclo); páginas usam
   um invólucro que redireciona. Rotas de API respondem 403.
6. **Fila única** com `template` opcional e `corpo` obrigatório; cada módulo
   registra os próprios templates.

## Perguntas que só o cliente responde

- Núcleo é filho de Regional ou de Associação Local? Pessoa pertence a uma
  única unidade por vez? Organização é atributo da pessoa ou do vínculo?
- Sede Internacional entra na árvore (como raiz sem operação) ou fica fora?
  Países ibero-americanos e África latina são "regionais" da Sede Central?
- Quais nomes das quatro organizações valem (seed do `sni-conecta` ou lista
  do `sni-ciclo`)?
- Venda de balcão sem CPF (menor, estrangeiro): registro sem pessoa,
  reconciliável depois, ou recusa? Placeholder está descartado.
- Vercel continua Hobby (cron 1×/dia)? Mesmo projeto Supabase para tudo (sim
  é o esperado).

## Como retomar (próxima sessão)

```bash
# repositórios de referência (somente leitura)
git clone --depth 1 https://github.com/agenciaveranno/sni-ciclo /home/user/sni-ciclo
git clone --depth 1 https://github.com/agenciaveranno/sni-conecta /home/user/sni-conecta
git clone --depth 1 -b claude/design-system-implementation-ics328 \
  https://github.com/agenciaveranno/sistema-ciclo /home/user/sistema-ciclo-novo

# neste repositório
npm ci && npm run typecheck && npm test
```

Ordem de trabalho combinada com o cliente (06/09/2026):

1. Completar os documentos "em produção" que faltarem (mesmos recortes da
   tabela acima) e escrever `conflitos-e-decisoes.md` cruzando tudo com
   `docs/decisoes/`, `AGENTS.md` e `docs/SNICONECTA-FUNDACAO.md` do Ciclo.
2. Registrar as decisões acima em `docs/decisoes/0007…` e ajustar `AGENTS.md`.
3. Projetar o modelo de dados da plataforma (pessoas, unidades, organizações,
   vínculos, funções doutrinárias, papéis, auditoria, notificações,
   consentimentos, configurações) e escrever a migration consolidada, validada
   no Postgres local com um `testar-rls.sh` da plataforma.
4. Portar a camada de plataforma do Ciclo (`2f07f6a`): `ui.tsx` como
   superconjunto, `Modal`, `Tema`, `acesso.ts`, `comunicacao/*`,
   `configuracao/*`, `diagnostico/*`, `cripto.ts` (conferir compatibilidade
   com o do esqueleto), `endereco.ts`; restaurar o CSS estrutural do AppShell.
5. Telas de plataforma: `/admin/pessoas`, `/admin/estrutura`, `/admin/papeis`,
   `/admin/configuracoes`, `/minha-conta`, `/pessoas/[id]` (ficha 360º).
6. Módulo `ciclo` (schema + telas sob `/ciclo`) e módulo `eventos` (schema do
   rascunho virando migration + porte na ordem do `src/modulos/eventos/README.md`).
