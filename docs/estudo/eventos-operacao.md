# Módulo Eventos — operação e gestão (venda balcão, check-in, relatórios, gestão, comunicação, configurações)

Recorte: tudo o que a Sede e os voluntários **operam** no sistema de eventos
(`sni-ciclo`), fora do checkout público e do Cielo. Este documento é a base
para **reescrever** essas telas no SNI Conecta; por isso lista cada rota, cada
coluna, cada função exportada e cada regra, com caminho e linha. O que não
foi encontrado está dito como não encontrado.

## 0. Fontes, método e o que NÃO foi encontrado

| Item | Valor |
|---|---|
| Repositório lido | `/home/user/sni-ciclo`, branch `claude/event-registration-system-7bHxn`, commit `82a8036` ("Merge pull request #90 … novos-parametros-design") |
| Stack | Next `16.2.2`, React `19.2.4`, `mysql2 ^3.11`, `next-auth ^4.24`, `nodemailer ^7`, `jspdf ^4.2` + `jspdf-autotable ^5`, `xlsx ^0.18`, `qrcode ^1.5`, `pdf-lib` (`package.json`) |
| Esqueleto de destino | `/home/user/sniconecta`, commit `0fc023f`; já tem `src/lib/permissoes.ts`, `src/lib/comunicacao/fila.ts` (só contrato), `src/lib/db.ts` (pooler Postgres), `src/lib/cripto.ts`, `src/modulos/registro.ts`, `supabase/rascunhos/eventos_schema.sql` (302 linhas) |
| Arquivos lidos | 21 rotas de API do recorte, 17 páginas, 16 libs, 4 componentes, `vercel.json`, `.github/workflows/email-cron.yml`, `README.md`, `SNI-CONECTA-INTEGRACAO.md`, `src/app/api/migrate/route.ts` (1 300 linhas, fonte do esquema) |

Método: `cat -n`, `sed -n`, `grep -rn`, `find`, `wc -l`. Nada aqui é de memória.

**Não encontrado / diferente do que o pedido presumia:**

| Item pedido | Situação |
|---|---|
| `.env.example` do `sni-ciclo` | **não existe** (`ls .env*` vazio; `.gitignore:35` ignora `.env*`). As variáveis foram levantadas por `grep -rn process.env` (§6.3) e pelo `README.md:19-27` / `SNI-CONECTA-INTEGRACAO.md:190-207`. |
| Check-in **por QR** | **não implementado**. O QR do voucher codifica `SNI-INSCRICAO-<inscricaoId>` (`src/lib/voucher-codes.ts:19-21`, com comentário "lido no check-in"), mas `src/app/checkin/page.tsx` só tem campo de CPF (l.250-262) e `GET /api/checkin` só aceita `cpf` + `eventoId` (`src/app/api/checkin/route.ts:124-129`). Nenhum leitor de câmera/`BarcodeDetector` em lugar nenhum (`grep -rni "scanner\|camera\|BarcodeDetector"` vazio). |
| **Desfazer** check-in | existe só na API (`DELETE /api/checkin`, `route.ts:249-267`). **Nenhuma tela chama** (`grep -rn "api/checkin"` só acha o GET e o POST de `checkin/page.tsx:125,156`). |
| Forma de pagamento **gratuito** no balcão | não é opção do balcão (`PayMethod`, `venda/page.tsx:67`, tem 6 valores). `gratuito` só aparece como rótulo em `src/lib/pagamento.ts:18,31` e como "sem estorno" em `src/lib/cancelamento.ts:36`; quem grava é o checkout público (fora deste recorte, não lido). |
| `src/app/api/relatorios/**` | só existe `campos/route.ts`. Os relatórios XLSX/PDF/Estatística são gerados **no navegador** a partir de `GET /api/inscricoes?eventoId` (§3.2). |
| `src/app/api/analytics/**` | `checkout/route.ts` e `purchase/route.ts` — ambos **públicos** (sem sessão), chamados pelas páginas públicas. |
| Cron do Vercel | `vercel.json` tem `0 9 * * *` para `/api/cron/emails`, mas quem drena a fila de fato é o GitHub Actions a cada 10 min (`.github/workflows/email-cron.yml:16-18`). |
| Auditoria/estornos/usuários/perfis/regionais/organizações | fora do recorte; citados só onde as telas deste recorte dependem deles (§4.15, §7). |

⚠️ **19 páginas fazem `POST /api/migrate` ao carregar** (`grep -rln 'fetch("/api/migrate"' src/app`), inclusive `/venda` (`venda/page.tsx:253`). Isso some no porte: o esquema passa a vir de migração (AGENTS.md). Toda leitura "resiliente ao migrate" (`try { … } catch {}` em volta de colunas novas, ex.: `api/venda/route.ts:269-274`, `api/inscricoes/route.ts:34-49`) também some.

---

## 1. Venda balcão

### 1.1 Tela `/venda` — `src/app/venda/page.tsx` (1 254 linhas)

Máquina de estados `type Step = "setup" | "search" | "cart" | "cieloWaiting" | "success"` (l.66). Permissão de menu `venda` (`src/components/AppShell.tsx:32`).

| Passo | O que acontece | Linhas |
|---|---|---|
| carga | `POST /api/migrate` (ignora erro); `GET /api/eventos`; lê `localStorage["vendaConfig"]` e, se houver, pula direto para `search` coerindo `valor`/`maxParcelas` para número | 251-277 |
| **setup** ("Iniciar Turno") | select de evento; ao escolher, carrega `GET /api/eventos/{id}/ingressos` **filtrando `ativo !== 0`** e `GET /api/eventos/{id}/combos` **filtrando `ativo !== 0`**; monta uma lista única de rádios `t:<id>` (convite) e `c:<id>` (combo, com badge e itens); pré-seleciona o 1º tipo, senão o 1º combo. Confirmar grava `VendaConfig` no `localStorage` e foca a busca | 279-322, 372-407, 595-707 |
| **search** | busca com debounce 300 ms, mínimo 2 caracteres, `GET /api/participants?search=…` e `slice(0, 8)`; placeholder "Nome, CPF, CodSNI ou telefone"; sem resultado oferece `Link /participantes/novo?return=/venda`; botão "Trocar" volta ao setup (apaga o `localStorage`) | 326-337, 545-551, 713-819 |
| **cart** | cartão do participante; resumo navy com nome do turno e valor (no cortesia mostra R$ 0,00 e "valor de tabela"); grade 2×3 de formas de pagamento; campos por forma (§1.2); botão principal muda de rótulo: "Gerar Link Cielo" / "Registrar Cortesia" / "Confirmar Venda" | 823-1050 |
| **cieloWaiting** | mostra a URL de pagamento, "Copiar link", "Enviar WhatsApp" (`https://wa.me/?text=…`), polling a cada 3 s em `GET /api/cielo/api3/status?pedidoId=`, timeout 120 s com toast "Confirme o pagamento manualmente"; botão "Confirmar pagamento manualmente" força uma consulta; "Cancelar e voltar" | 343-364, 516-528, 1055-1141 |
| **success** | banner verde "Venda Concluída!" com `Inscrição #id` ou `Inscrições #a · #b`; blocos Participante / Evento-Convite(ou Combo, com lista de itens e ids) / Pagamento (forma, parcelas, autorização, pedido SNI, data e recibo do Pix, motivo da cortesia); botões "Imprimir Recibo" (2 vias) e "Nova Venda" | 1145-1250 |

`VendaConfig` (l.69-83): `eventoId, eventoNome, ingressoTipoId | null, ingressoTipoNome, comboId?, itens?, valor, maxParcelas`. `Escolha` (l.86-91) `parseEscolha("t:12" | "c:3")`.

Helpers locais: `formatCPF` (l.95), `formatDate` (l.101), `formatCurrency` (l.106), `hojeISO` (l.113, fuso local, não UTC), `formatDateISO` (l.120).

### 1.2 Formas de pagamento do balcão

`type PayMethod = "dinheiro" | "cartao" | "cielo" | "credenciamento" | "pix" | "cortesia"` (`venda/page.tsx:67`). Rótulos e ícones em l.868-875.

| Forma | Campos na tela | Obrigatório (cliente l.424-446 / servidor `api/venda/route.ts`) | O que vai para `Inscricao` | `status` | Aviso à regional | Estorno (`cancelamento.ts:31-38`) |
|---|---|---|---|---|---|---|
| `dinheiro` | "Valor recebido (opcional)" → calcula **troco** (`troco = recebido − valor`, só se ≥ 0) | — | `formaPagamento='dinheiro'` | `pago` | sim | `dinheiro` |
| `cartao` | "Parcelas" (1..`maxParcelas`, mostra `valor/n`), "Nº Autorização / Recibo" | — (nenhum dos dois é obrigatório) | `formaPagamento='cartao'`. ⚠️ **`parcelas` e `recibo` NÃO são gravados em `Inscricao`** — vão só para o `AuditLog.detalhes` (`route.ts:296`) e para a resposta/recibo impresso | `pago` | sim | `cartao` |
| `cielo` ("Cielo Link") | só um aviso informativo | — | **não grava `Inscricao` aqui**: cria `PedidoPendente` via `POST /api/cielo/link` (§1.5); a inscrição nasce no `confirmarPedido` com `formaPagamento` `cielo-credito`/`cielo-pix` | `pendente` → `pago` | sim, mas dentro do fluxo Cielo (não lido) | `cartao`/`pix` |
| `credenciamento` ("Credenciamento SNI") | "Número do pedido (Credenciamento SNI)" | **obrigatório** (cliente l.424; servidor l.107-109 → 400 "Informe o número do pedido do Credenciamento SNI") | `formaPagamento='credenciamento'`, `credenciamentoPedido` | `pago` | sim | `sede` |
| `pix` | "Data do Pix" (`<input type=date>`, padrão hoje) e "Nº do recibo" | **ambos obrigatórios**; servidor valida `^\d{4}-\d{2}-\d{2}$` (l.119-126) → 400 "Informe a data do Pix" / "Informe o número do recibo do Pix" | `formaPagamento='pix'`, `pixData` (DATE), `pixRecibo` | `pago` | sim | `pix` |
| `cortesia` | "Motivo da cortesia" (textarea, `maxLength=500`) | **obrigatório** (l.128-130 → 400 "Informe o motivo da cortesia") | `formaPagamento='cortesia'`, `cortesiaMotivo`, `valorOriginal = preço de tabela`, `descontoAplicado = preço de tabela` (líquido zero, l.225-230) | `pago` | sim | `sem_estorno` |
| `gratuito` | **não existe no balcão** | — | gravado pelo checkout público (fora do recorte) | — | — | `sem_estorno` |

Rótulos operacionais × públicos (`src/lib/pagamento.ts:9-33`): `dinheiro`→Dinheiro; `cartao`→Cartão / "Cartão de crédito"; `cielo`→"Cielo (Link)" / "Cartão de crédito"; `cielo-pix`→"Cielo (Pix)" / PIX; `cielo-credito`→"Cielo (Crédito)" / "Cartão de crédito"; `pix`→PIX; `credenciamento`→"Credenciamento SNI"; `cortesia`→Cortesia; `gratuito`→Gratuito; `transferencia`→Transferência / "Transferência de evento". `pagamentoLabel(fp, vazio="—")` (l.39) e `pagamentoLabelPublico(fp)` (l.46) devolvem a chave crua se desconhecida.

### 1.3 `POST /api/venda` — `src/app/api/venda/route.ts:78-317`

1. `requirePermissao("venda")` (l.79). Sessão lida de novo para o e-mail do autor (l.81).
2. Corpo (l.84-98): `participanteId, eventoId, ingressoTipoId, comboId, formaPagamento, parcelas, recibo, cieloOrderId, credenciamentoPedido, pixData, pixRecibo, cortesiaMotivo, status`, mais `ignorarRegras` (l.143). ⚠️ `valor` do corpo é **ignorado** (preço lido do banco, l.214-221); `status` do corpo é **aceito como vier** (`status || "pago"`, l.245) — a tela sempre manda `"pago"`, mas a API não restringe (comentado em `relatorio-colunas.ts:70-74`).
3. Validações: 400 se faltar `participanteId`/`eventoId`/(`ingressoTipoId` ou `comboId`) (l.100-105); regras por forma (§1.2); 404 participante (l.136-138).
4. **Combo** (l.151-184): `carregarComboParaVenda(comboId, eventoId)` (`src/lib/combo.ts:38-102`) → 404 "Combo não encontrado", 409 inativo / "vendas ainda não começaram" / "já encerraram" / "mal configurado (sem itens)" (menos de 2 unidades) / "inclui um convite inativo"; `checarEstoqueCombo(combo, cpf)` (`combo.ts:109-126`) → 409 "Combo esgotado." ou "Limite de combos por CPF atingido." (conta inscrições ativas ÷ unidades + pedidos pendentes); depois, se `!ignorarRegras`, `checarRegraPapelIngresso` para cada tipo distinto com `principalNoMesmoPedido = combo tem principal`.
5. **Avulso** (l.185-223): `getTipoRegra` + `checarRegraPapelIngresso` (se `!ignorarRegras`) → 409 `{ error, regra: true }`; `tipoEstaAtivo` → 409 "Este tipo de convite está inativo e não pode mais ser vendido."; preço congelado lido de `IngressoTipo.valor` (404 se o tipo não é do evento).
6. `compraGrupoId = crypto.randomUUID()` (l.235). Um `INSERT INTO Inscricao` por unidade (l.255-262), colunas: `participanteId, eventoId, ingressoTipoId, comboId, formaPagamento, tipoVenda='balcao', dataPurchase=NOW(), status, cieloOrderId, credenciamentoPedido, pixData, pixRecibo, cortesiaMotivo, valorOriginal, descontoAplicado, compradorCpf, compradorId, compraGrupoId`. **O valor fica só na 1ª linha** (as demais `0`), mesmo desenho do online (l.232-234). Fallback sem `compraGrupoId` se a coluna não existir (l.269-274).
7. `detalhesVenda(inscricaoId)` (l.19-76): junta `Inscricao`+`Participant`+`IngressoTipo`+`Combo`+`Evento`; no combo devolve `itens` ("2× Jantar") e `inscricaoIds` do mesmo `compraGrupoId`; `ingressoTipoNome` vira o nome do combo.
8. `logAudit` acao `"venda"`, entidade `Inscricao`, com `eventoId, ingressoTipoId, comboId, inscricaoIds, participanteId, formaPagamento, valor, descontoAplicado, parcelas, pixData, pixRecibo, cortesiaMotivo` (l.281-300).
9. **Se `status === "pago"`: `avisarRegionalNovaCompra({eventoId, participanteId})` síncrono, dentro da requisição** (l.306-311) — um aviso por venda mesmo em combo.
10. Resposta 201 `{ ...detalhe, inscricaoIds, valor, parcelas, recibo }` (l.313-316).

`GET /api/venda?id=` (l.319-331): só sessão (sem `requirePermissao`); devolve `detalhesVenda` + `id`.

### 1.4 Regras de convite usadas pelo balcão — `src/lib/ingresso-regras.ts`

| Export | Faz | Linhas |
|---|---|---|
| `interface TipoRegra { id, nome, papel: 'principal'\|'adicional', exigePrincipal, unicoPorCpf }` | | 14-20 |
| `getTipoRegra(ingressoTipoId, eventoId, ex=db)` | lê as 5 colunas; fallback sem `papel/exigePrincipal` se a coluna não existir | 24-59 |
| `checarRegraPapelIngresso({participanteId, eventoId, tipo, nome, principalNoMesmoPedido?, ex?})` | (1) `unicoPorCpf` → "limitado a 1 por CPF e já consta uma compra"; (2) `papel='principal'` e já há principal ativo → "já possui um convite principal neste evento"; (3) `adicional` com `exigePrincipal` sem principal ativo nem no mesmo pedido → "só pode ser adquirido junto com um convite principal". "Ativo" = `status NOT IN ('cancelado','expirado')` (`inscricao-status.ts:62-65`) — **`transferido` conta como ativo** | 117-150 |
| `validarUmPrincipal(lista, eventoId)` | combo com 2+ principais → mensagem de erro | 158-176 |

`src/lib/ingresso-tipo.ts`: `contarVendidosPorTipo(ids, ex)` (l.111-127, conta TODAS as inscrições, inclusive canceladas), `usoDoTipo(id, ex)` → `{ vendidos, pedidosPendentes, combos: string[] }` (l.130-162), `motivoBloqueioExclusao(uso)` (l.165-190), `tipoEstaAtivo(id, ex)` (l.196-210, tolera coluna ausente = ativo), `tiposInativosDoEvento(eventoId, ex)` (l.213-226).

### 1.5 Caminho Cielo Link do balcão

- `POST /api/cielo/link` (`src/app/api/cielo/link/route.ts`): `requirePermissao("venda")` (l.19); corpo `{participanteId, eventoId, ingressoTipoId, comboId, valor}` (l.23-29); `getCieloCreds(eventoId)` (l.35) → 503 "Credenciais Cielo não configuradas. Cadastre uma conta em /admin/cielo-contas."; combo: carrega e checa estoque, **combo com valor 0 → 400 "Este combo não tem valor: registre a venda como cortesia."** (l.63-67); `INSERT INTO PedidoPendente (compradorId, compradorCpf, eventoId, ingressoTipoId=âncora, comboId, quantity=1, valorOriginal, descontoAplicado=0, participantesJson, status='pendente')` (l.80-86); `cieloOrderId = 'SNI'+pedidoId` (l.89); devolve `{ pedidoId, orderNumber, paymentUrl: NEXTAUTH_URL + '/comprar/pagamento?pedidoId=' }` (l.95-99). ⚠️ O `valor` do avulso vem do **corpo** (l.56), diferente do `/api/venda`.
- Resolução de credenciais `getCieloCreds(eventoId?)` (`src/lib/cielo.ts:55-118`): (1) `Evento.cieloAccountId` → `CieloAccount`; (2) `CieloAccount.isDefault=1`; (3) primeira `CieloAccount`; (4) legado `Configuracao` `cielo.merchantId/merchantKey/environment` com fallback `CIELO_MERCHANT_ID/KEY/ENVIRONMENT`.
- `GET /api/cielo/api3/status?pedidoId=` (`src/app/api/cielo/api3/status/route.ts:137-194`): **público, sem sessão**; se o pedido já está `confirmado` devolve `inscricaoIds`; se `pendente` e tem `cieloPaymentId`, consulta a Cielo e chama `confirmarPedido` (cria as `Inscricao`) ou `cancelarPedido`. A tela do balcão usa `data.inscricaoId` para buscar `GET /api/venda?id=` e mostrar o sucesso com `formaPagamento: "cielo"` forçado na tela (l.356, l.526).

### 1.6 Recibo térmico — `printReceipt(venda, config, copies=2)` (`venda/page.tsx:134-198`)

`window.open` com `@page { size: 80mm auto; margin: 3mm }`, corpo `72mm` monoespaçado 11px, `copies` vias com `page-break-after`. Conteúdo: cabeçalho fixo "SNI / Seminário Especial da Prosperidade" + data/hora; nome do evento; PARTICIPANTE (nome, CPF formatado, Regional se houver); COMBO ou CONVITE (nome, itens "+ 2× Jantar"); Valor (R$ 0,00 "(cortesia)" quando `cortesiaMotivo`); Pagamento (`pagamentoLabel`); Parcelas (se > 1); "Recibo/Aut:"; "Pedido SNI:"; "Data do Pix:"; "Recibo Pix:"; "Motivo da cortesia:"; "Nº Inscrição" ou "Nº Inscrições: a, b"; linha para assinatura do operador. Botão "Imprimir (2 vias)" que chama `window.print(); window.close()`.

⚠️ Texto do cabeçalho ("Seminário Especial da Prosperidade") é fixo no código — não vem do evento nem do promotor.

### 1.7 Rastro de conferência

| Forma | Coluna(s) em `Inscricao` (criadas em `api/migrate/route.ts`) | Onde aparece depois |
|---|---|---|
| credenciamento | `credenciamentoPedido VARCHAR(255)` (l.657) | recibo, tela de sucesso, `vendas-por-dia` (origem "credenciamento", l.281-289), `conflitos`, `apagar-inscricoes` (contagem) |
| pix | `pixData DATE`, `pixRecibo VARCHAR(255)` (l.1188-1189) | recibo, tela de sucesso, `detalhesVenda` (`DATE_FORMAT` l.23) |
| cortesia | `cortesiaMotivo VARCHAR(500)` (l.1190) | recibo, tela de sucesso |
| cartão | **nada** (parcelas/recibo só no `AuditLog.detalhes`) | recibo impresso na hora |
| todas | `tipoVenda='balcao'`, `compraGrupoId`, `compradorCpf`, `compradorId` | relatórios (coluna "Venda"), cancelamento em grupo |

`AuditLog` (`src/lib/audit.ts:18-45`): `logAudit({req, userEmail, acao, entidade, entidadeId, detalhes})` grava `userEmail, acao(≤80), entidade(≤80), entidadeId(≤80), detalhes(JSON ≤2000), ip` — **nunca lança**, é best-effort (l.42-44). Por isso o cancelamento e a troca de titular gravam o registro "oficial" em colunas próprias da `Inscricao` (§4.12-4.14).

### 1.8 Aviso à regional na venda

`avisarRegionalNovaCompra` (`src/lib/email-regional.ts:171-206`) é chamado **dentro da requisição** do `POST /api/venda` (l.306-311). Detalhes do e-mail em §5.3. Se não houver e-mail cadastrado para o par (regional do participante × promotor do evento), ou o SMTP falhar, devolve `0` sem lançar (`tentar`, l.159-165). O SMTP tem timeouts de 10 s/10 s/30 s (`mailer.ts:100-102`) justamente porque roda dentro de requisições.

### 1.9 Busca de participantes usada pelo balcão — `GET /api/participants` (`src/app/api/participants/route.ts:27-129`)

`requirePermissaoAny(["participantes","venda","eventos","comissao","trocar-titular"])` (l.31). Parâmetros `search, regional, organizacao, eventoId, limit(≤500)`. Cada termo (separado por espaço, AND entre termos) vira `OR` de `nomeCompleto`/`email`/`codSNI` acento-insensíveis (`CONVERT … COLLATE utf8mb4_unicode_ci`, l.17) e, se tiver dígitos, `cpf`/`telefone` comparados só por dígitos (`DIGITOS`, l.21-22). `%` e `_` são escapados (l.25). Ordena quem **começa** pelo 1º termo primeiro (l.79-82). Devolve `p.*` + `eventos: [{id, nome, corPrimaria, status}]` por participante (l.93-128). ⚠️ Sem `limit` devolve **tudo** — o balcão corta em 8 no cliente.

---

## 2. Check-in

### 2.1 Tela `/checkin` — `src/app/checkin/page.tsx` (479 linhas)

| Etapa | Comportamento | Linhas |
|---|---|---|
| seleção de evento | lista de cartões de `GET /api/eventos` (sem filtro de ativo/data); escolha persistida em `localStorage["checkinEventoId"]`; "Trocar evento" apaga | 69-105, 189-232 |
| busca | um campo de CPF com máscara (`formatCPF`, l.42-48), `inputMode=numeric`, só busca com 11 dígitos; `GET /api/checkin?cpf=&eventoId=` | 107-146, 250-274 |
| erro | mostra a mensagem que a API mandou (`error`) em vermelho | 277-287 |
| vários grupos | se a API devolver mais de um grupo ("N cadastros vinculados a este CPF" — só acontece com `pendente` residual, ver §2.2), lista para escolher | 290-341 |
| cartão | banner navy (ou verde se já tem check-in), Regional, "Tipo de Convite" ou "Convites (N)" com bullets, aviso "Confirmar a presença credencia os N convites de uma vez", respostas de campos personalizados (rótulo/valor), aviso amarelo "já realizou check-in. Convite: nº"; campo "Número do Convite" (só dígitos, foco automático); botão "Confirmar Presença"; "Nova Busca" | 344-474 |

`POST /api/checkin` com `{ inscricaoId, participanteId, numeroConvite }` (l.156-160). **Não há botão de desfazer.**

### 2.2 `GET /api/checkin?cpf=&eventoId=` — `src/app/api/checkin/route.ts:120-199`

`requirePermissao("checkin")`. Consulta `INSCRICAO_SELECT` (l.8-15: `inscricaoId, participanteId, ingressoTipoId, status, ingressoTipoNome, numeroConvite, checkinAt, nomeCompleto, regional`) com `p.cpf = ? AND i.eventoId = ? AND status NOT IN ('cancelado','expirado','transferido')` (`inscricaoValePresencaSql`, `inscricao-status.ts:82-86`).

Sem linhas, distingue 4 casos, todos **404** com mensagem (l.136-197):
1. `status='cancelado'` → "Convite cancelado em dd/mm/aaaa — check-in não permitido."
2. `status='transferido'` → "Convite transferido para \"<evento destino>\" em … — o check-in é feito no evento de destino."
3. `titularAnteriorId` = esta pessoa → "Convite transferido para outro titular em … — o check-in é feito pelo CPF de quem recebeu."
4. senão → "Participante não encontrado neste evento".

Com linhas, `agrupar(rows)` (l.67-106): **credencia a PESSOA, não o convite** — todas as linhas `pago` do mesmo `participanteId` viram um grupo (chave `p:<id>`); qualquer outro status (um `pendente` residual) fica isolado (`i:<id>`). Cada grupo: `inscricaoId` (âncora = menor id), `inscricaoIds`, `participanteId`, `nomeCompleto`, `regional`, `ingressoTipoNome` (da âncora), `itens[{inscricaoId, ingressoTipoNome, checkinAt}]`, `numeroConvite` (primeiro não nulo), `checkinAt` (primeiro não nulo), `respostas[{label, valor}]` (de `InscricaoResposta`, l.39-57, tolera tabela ausente).

### 2.3 `POST /api/checkin` — l.201-247

`requirePermissao("checkin")`; 400 sem `inscricaoId`; `grupoDeInscricao(id)` (`src/lib/voucher-grupo.ts:68-74` → `idsDoGrupo`, l.51-65: todos os `pago` da pessoa no evento, ordenados; um não-pago fica sozinho); 404 se não existe; **409** "Convite cancelado/expirado/transferido — check-in não permitido."; **409** "Este convite trocou de titular. Refaça a busca pelo CPF." se `body.participanteId` ≠ dono atual (l.222-227); `UPDATE Inscricao SET numeroConvite=?, checkinAt=NOW WHERE id IN (grupo) AND <vale presença>` (l.234-238); `affectedRows=0` → 409 "Convite cancelado durante a operação — check-in não realizado."; devolve o grupo relido.

⚠️ `numeroConvite` é gravado em **todas** as linhas do grupo com o mesmo número (é o número físico do convite/pulseira digitado no balcão). ⚠️ Não há auditoria do check-in (`logAudit` não é chamado aqui).

### 2.4 `DELETE /api/checkin?id=` — l.249-267

`requirePermissao("checkin")`; desfaz o **grupo inteiro** (`checkinAt=NULL, numeroConvite=NULL`) sem checar status; devolve `{ ok, inscricaoIds }`. Sem auditoria. **Sem tela.**

---

## 3. Relatórios e visão geral

### 3.1 Tela `/relatorios` — `src/app/relatorios/page.tsx` (737 linhas)

Permissão de menu `relatorios` (`AppShell.tsx:37`). Duas preferências **por usuário no banco** (`usePreferenciaUsuario`, §6.4): `relatorios:evento` (id do evento) e `relatorios:lista` (`{ filtros, colunas, ordenacao }`) (l.47-60). `normalizar()` (l.75-83) descarta colunas que não existem mais e restaura o padrão.

Carga: `GET /api/eventos` (l.113-121); `GET /api/regionais` para o mapa `nome → correspondeNome` (l.124-131); `GET /api/promotores` para `usarCorrespondenciaRegional` e contato (l.132-149); `GET /api/branding/logo-relatorio` (l.150-154); ao escolher evento: `GET /api/inscricoes?eventoId`, `GET /api/eventos/{id}/comissao`, `GET /api/eventos/{id}/orientadores` (l.166-193).

Barra superior: "Trocar evento", "Colunas (N)" (modal com checkboxes das 23 colunas + "Restaurar padrão"; a última coluna não pode ser desmarcada, l.234-249), "Estatística", "Exportar XLSX", "Exportar PDF" (l.481-508). Subtítulo "N de M convite(s)". Filtros (l.520-616), rodapé "Filtros, colunas e ordenação ficam salvos na sua conta" + "Limpar (n)" (l.604-616). Tabela com cabeçalho ordenável (clique: asc → desc → sem ordenação, l.222-229), linha cancelada com opacidade 0,6 e nome riscado (l.655-694), badges de status (`BADGE_STATUS`, l.63-69).

### 3.2 Fonte de dados — `GET /api/inscricoes?eventoId=` (`src/app/api/inscricoes/route.ts:6-51`)

`requirePermissao("relatorios")`. Uma linha por `Inscricao` do evento com `status <> 'expirado'` (cancelados e transferidos **entram** de propósito, l.15-17), `ORDER BY p.nomeCompleto`. Colunas base: `inscricaoId, participanteId, ingressoTipoId, ingressoTipoNome, numeroConvite, formaPagamento, tipoVenda, dataPurchase, checkinAt, status, nomeCompleto, cpf, codSNI, telefone, email, regional, organizacao, associacaoLocal, primeiraVez, bairro, cidade, estado`. Variante completa acrescenta `canceladoEm, cancelamentoMotivo, estornoStatus, origemTransferenciaId, transferidoParaEventoId, transferidoEm, valorOriginal, descontoAplicado, observacao` (l.34-40, três tentativas em cascata). ⚠️ Não traz `comboId`/nome do combo, `compradorCpf`, `pixRecibo`, `credenciamentoPedido`, `cortesiaMotivo`.

### 3.3 Catálogo de colunas — `src/lib/relatorio-colunas.ts` (424 linhas)

`interface InscricaoRow` (l.10-42) espelha o `GET` acima. `interface Coluna { key, label, alinhamento?, texto(r), ordenar(r) }` (l.156-164). `COLUNAS` (l.166-202):

| `key` | `label` | Alinhamento | `texto` | `ordenar` |
|---|---|---|---|---|
| `nome` | Nome | — | `nomeCompleto` ou "—" | texto |
| `cpf` | CPF | — | `formatCPF` (000.000.000-00) | dígitos |
| `codSNI` | CodSNI | — | | texto |
| `email` | E-mail | — | | texto |
| `telefone` | Telefone | — | | texto |
| `regional` | Regional | — | | texto |
| `organizacao` | Organização | — | | texto |
| `associacaoLocal` | Associação local | — | | texto |
| `cidade` | Cidade | — | | texto |
| `estado` | UF | — | | texto |
| `bairro` | Bairro | — | | texto |
| `primeiraVez` | 1ª vez | center | Sim/Não | 1/0 |
| `ingresso` | Tipo de convite | — | `ingressoTipoNome` | texto |
| `numeroConvite` | Nº do convite | — | | texto |
| `formaPagamento` | Forma de pagamento | — | `pagamentoLabel` | rótulo |
| `tipoVenda` | Venda | — | `vendaLabel`: balcao→Balcão, online→Online, transferencia→Transferência, senão "—" (l.128-133) | texto |
| `dataPurchase` | Data da compra | — | `formatData` (pt-BR) | epoch |
| `valorOriginal` | Valor | right | `formatMoeda` (BRL) | número |
| `descontoAplicado` | Desconto | right | `formatMoeda` | número |
| `checkin` | Check-in | center | Sim/Não | 1/0 |
| `checkinAt` | Data/hora do check-in | — | `formatDataHora` | epoch |
| `status` | Status | — | `statusLabel` | rótulo |
| `observacao` | Observação | — | | texto |

`COLUNAS_PADRAO` (l.206-217): `nome, cpf, codSNI, regional, organizacao, ingresso, numeroConvite, formaPagamento, checkin, status`. `colunasVisiveis(escolhidas)` (l.224-228) respeita a ordem do catálogo e cai no padrão se nada sobrar. `ordenarLinhas(linhas, {coluna, dir})` (l.408-424): nulos sempre no fim, números por subtração, texto por `localeCompare('pt-BR', {numeric:true})`.

### 3.4 Status (acumulativo) — `statusesDe(r): StatusKey[]` (l.76-87)

`StatusKey = "pago" | "cancelado" | "estornado" | "transferido-de" | "transferido-para"`; rótulos em `STATUS_OPCOES` (l.53-59): "Pagamento confirmado", "Cancelado", "Estornado", "Transferido de outro evento", "Transferido para outro evento". Regras: `status='cancelado'` → cancelado; `estornoStatus='efetuado'` → estornado; `status='transferido'` **ou** `transferidoParaEventoId != null` → transferido-para; `origemTransferenciaId != null` → transferido-de; `status='pago'` → pago. Lista **vazia** possível (status arbitrário do balcão) → `statusCru` (l.90-94) mostra o valor cru capitalizado em badge cinza. `statusLabel` junta com " · " (l.96-100).

### 3.5 Filtros — `FiltrosRelatorio` (l.343-356) e `aplicarFiltros` (l.371-400)

| Filtro | Opções | Regra |
|---|---|---|
| `busca` | texto livre | acento-insensível sobre `nomeCompleto + email + codSNI + numeroConvite`; **ou** CPF por dígitos (`includes`) |
| `regional`, `organizacao`, `ingressoTipo`, `formaPagamento` | selects alimentados pelos **valores presentes nos dados** (`opcoes()`, l.90-105; o valor já selecionado entra mesmo se sumir) | igualdade exata (forma de pagamento compara a chave crua, mostra rótulo) |
| `checkin` | "" / `com` / `sem` | `checkinAt` nulo ou não |
| `status` | 5 `StatusKey` | `statusesDe(r).includes` |
| `periodo` (data da compra) | `PERIODO_OPCOES` (l.249-259): hoje, ontem, 7dias (inclui hoje), 30dias, mes, mes-passado, ano, ano-passado, personalizado (`dataInicial`/`dataFinal` inclusivas, uma ponta em branco = aberta) | `intervaloDoPeriodo` (l.285-323) no **fuso local do navegador**; convite sem `dataPurchase` nunca cabe num período |

`periodoLabel` (l.326-341) e `resumoFiltros()` (`page.tsx:285-301`) montam o texto do cabeçalho das exportações. `filtrosAtivos` não conta `dataInicial`/`dataFinal` separadamente (l.270-273).

### 3.6 Exportações da lista — `page.tsx`

- `matriz()` (l.312-315): `head = colunas.label`, `body = linhas × colunas.texto` — **o mesmo que está na tela**, na mesma ordem, com os mesmos filtros.
- **XLSX** (l.317-334): `xlsx` dinâmico; `aoa_to_sheet`; largura de coluna = `min(max(maxLen+2, 8), 40)`; aba "Relatório"; arquivo `relatorio.xlsx`.
- **PDF** (l.336-386): `jspdf` A4 **paisagem**; fonte Figtree embutida (`src/lib/figtree-font.ts`, base64); faixa azul `#1e3a5f` 20 mm com o nome do evento; linha "N convite(s) — resumo dos filtros | sem filtros" e "Gerado em"; `autoTable` a partir de y=40 com fonte 8/7/6 pt conforme >9 / >12 colunas, cabeçalho azul, zebra `#f5f7fa`; arquivo `relatorio.pdf`.

### 3.7 Relatório "Estatística" (PDF institucional) — `src/lib/relatorio-estatistica-pdf.ts` (472 linhas)

Chamado por `exportEstatistica` (`page.tsx:388-410`) **ignorando os filtros da tela** (usa `data`, não `linhas`). Entrada `EstatisticaEntrada` (l.35-49): `eventoNome, periodo` (datas do evento formatadas), `inscricoes: InscricaoRow[]`, `comissao: ComissaoMembro[]` (l.12-22, com `temIngressoPago`), `orientadores: {id, nome}[]`, `promotor?: {nome, telefone, email}`, `logoUrl`, `correspondencia: Map<regional, regionalCorrespondente>` (só preenchida quando `Promotor.usarCorrespondenciaRegional=1` do promotor do evento, `page.tsx:392-394`).

Regras:
- `isEvento(r)` = `ingressoTipoNome` contém "evento" (case-insensitive) (l.54-55). ⚠️ **Heurística por nome do tipo**: o ranking só conta convites cujo tipo se chama "…Evento…".
- `montarEstatistica` (l.104-149): descarta `status='cancelado'`; pega os "evento" **com check-in**, deduplica por CPF; resolve a regional pela correspondência (saltos encadeados, com proteção contra ciclo; vazio → "Sem Regional"); por regional: `total`, `primeiraVez` (`Participant.primeiraVez=1`), `comissao` = membros da comissão **sem** convite pago. Ordena por `total` desc e nome.
- `montarMovimentacao` (l.176-199): conta **convites** (não pessoas): `transferidosDe`, `transferidosPara`, `canceladosEstornados` (cancelado ou estornado, uma vez só), `naoComparecidos` (sem check-in e não transferido-para nem encerrado).
- `coordenadoresGerais` (l.208-219): membros com setor normalizado = "coordenacao geral" e função começando com "coordenador".
- Layout (`exportarEstatisticaPdf`, l.221-472): A4 **retrato**, Figtree; cabeçalho por página (nome do evento, "período — Ranking por Regional (Convite Evento com Check-in)", "Gerado em", logo no canto superior direito ≤16 mm, "Página: n/N"); tabela principal `Posição | Regional | Participantes | Total | 1ª vez` (posição só para `total>0`, linha TOTAL); nota "Comissão: membros sem convite pago…"; tabela "Movimentação de Convites" (4 linhas); coluna esquerda "Orientadores" e "Coordenador Geral"; coluna direita "Total de Participantes / Total de Comissão Organizadora / Orientadores / Total Geral"; rodapé com `INSTITUCIONAL.nome` em negrito + `rodapeComplemento(promotor)` (`src/lib/institucional.ts:16-23`: endereço fixo "Av. Eng. Armando de Arruda Pereira, 1266 - Jabaquara - São Paulo - SP", telefone/e-mail do promotor, "www.sni.org.br"), encolhendo a fonte até 5,5 pt para caber. Arquivo `relatorio-estatistica.pdf`.

### 3.8 Relatório "Campos personalizados" — `/relatorios/campos`

`src/app/relatorios/campos/page.tsx` (239 linhas): seleciona evento; `GET /api/relatorios/campos?eventoId=`; agrega ingresso → campo (`campoId::label`) → valor (vazio = "(em branco)") com barras proporcionais (l.75-101, 198-233); "Exportar CSV" no cliente com BOM, colunas `Participante, CPF, Convite, Campo, Resposta`, arquivo `respostas-campos-<eventoId>.csv` (l.103-118).

`GET /api/relatorios/campos` (`src/app/api/relatorios/campos/route.ts`): `requirePermissao("relatorios")`; `InscricaoResposta ⋈ Inscricao ⋈ Participant ⋈ IngressoTipo` com `inscricaoAtivaSql` (l.258-268); devolve `{ respostas: [{inscricaoId, campoId, label, valor, ingressoTipoId, ingressoNome, nomeCompleto, cpf}] }`.

### 3.9 "Vendas por dia/origem" — `/admin/eventos/[id]/vendas-por-dia`

Página (155 linhas): filtro "A partir de" (date) + "Limpar"; tabela `Dia | Site | Balcão | Credenciamento | Transferência | Total` (a coluna `outro` da API não é exibida); lista "Inscrições NÃO-credenciamento" (`Data | Participante (link para /participantes/{id}/ingressos) | CPF | Convite | Origem`). Propósito declarado: conferir o que se perderia num reimport (l.183-187).

`GET /api/eventos/[id]/vendas-por-dia?desde=` (`route.ts:293-358`): `requirePermissao("relatorios")`; `ORIGEM_SQL` (l.281-289): `credenciamento` se `formaPagamento='credenciamento'` ou `credenciamentoPedido` preenchido; senão `tipoVenda` (`online`/`balcao`/`transferencia`), senão `outro`; só inscrições ativas; agrupa por `DATE(dataPurchase)`; detalhe das origens `online/balcao/transferencia`.

### 3.10 "Conflitos de regras" — `/admin/eventos/[id]/conflitos`

Página (139 linhas): cartões "participantes ativos" e "com conflito"; tabela `Participante (link) | Convites (papel, exige principal) | Problema`, badge "Credenciamento SNI". `GET /api/eventos/[id]/conflitos` (`route.ts:149-246`): `requirePermissao("relatorios")`; agrupa inscrições ativas por participante e aponta (a) mais de um principal, (b) adicional que exige principal sem principal. Read-only.

### 3.11 Dashboard `/dashboard` + `GET /api/stats`

`src/app/dashboard/page.tsx` (196 linhas): 3 métricas (Cadastrados, Check-ins, Aguardando), 4 atalhos (`/participantes/novo`, `/participantes/importar`, `/checkin`, `/relatorios`), "Cadastros recentes" (5) e "Por regional (top 10)" com barra de % de check-in.

`src/app/api/stats/route.ts:6-103` (`requirePermissao("dashboard")`): ⚠️ **conta `Participant.checkinAt`**, coluna **legada** da época em que a inscrição vivia no participante (`server.js:32`, `migrate/route.ts:290-296` migrou para `Inscricao.checkinAt`). Desde então **ninguém grava `Participant.checkinAt`** (`grep -rn "checkinAt" src` só encontra `Inscricao`), logo "Check-ins" e o % por regional estão **congelados** no valor migrado. Além disso, os totais são de participantes (base inteira), sem recorte por evento. A reescrita deve substituir por contagens de `Inscricao` por evento.

### 3.12 Logo dos relatórios — `src/lib/logo-relatorio.ts` e `/api/branding/*`

`obterLogoRelatorio()` (l.35-61): lê `Configuracao['relatorioLogoUrl']`; se não for `data:`, baixa `https://sni.org.br/wp-content/uploads/2020/11/img_seicho-no-ie_favicon_portal.png` (timeout 15 s, 1 KB–2 MB, `content-type image/*`), grava como data URI e devolve; falha → `null` (relatório sai sem selo). Também é chamado no fim do `/api/migrate` (l.1244). `GET /api/branding/logo-relatorio` (sessão) devolve `{ logoUrl }`; `GET /api/branding` (**público**) devolve `{ sniLogoUrl, logoUrl, relatorioLogoUrl }`.

---

## 4. Gestão

### 4.1 Eventos — `/admin/eventos`, `/admin/eventos/novo`, `/admin/eventos/[id]`

**Lista** (`src/app/admin/eventos/page.tsx`, 192 linhas): tabela `Nome | Data Inicial | Data Final | Local | Promotor | Tipos (contagem) | Ações`; ações por linha: copiar link da landing (`/e/<slug ou id>`, l.57-78), "Programação de e-mails" (`/admin/eventos/{id}/emails`), "Comissão do evento" (`/admin/eventos/{id}/comissao`), Editar, Excluir (`confirm`). `GET /api/eventos` (`route.ts:9-27`, só sessão) devolve `e.*` + `localNome, promotorNome, totalIngressoTipos`, ordenado por `dataInicial DESC`. ⚠️ `e.*` inclui `voucherBannerUrl/voucherLogoUrl/comprarLogoUrl` em **LONGTEXT base64** — a lista de eventos, o setup do balcão, o check-in e os relatórios baixam todos os banners a cada carga.

**Campos do evento** (tabela `Evento`, criada em `migrate/route.ts:53-77` e alterada em l.488-497, 577-578, 610-615; formulário `novo/page.tsx:44-66` e `[id]/page.tsx:73-95`; `POST/PUT /api/eventos*`):

| Coluna | Tipo (MySQL) | Tela | Validação/uso |
|---|---|---|---|
| `nome` | VARCHAR(255) NOT NULL | "Nome *" | 400 "nome is required" |
| `dataInicial`, `dataFinal` | DATE NOT NULL | "Data Inicial/Final" (não marcadas como obrigatórias na tela) | 400 se faltarem (`api/eventos/route.ts:61-62`) |
| `localId` | INT | select de `GET /api/locais` | sem validação de existência |
| `promotorId` | INT | select de `GET /api/promotores` | sem validação; define assinatura dos e-mails, contato do rodapé da Estatística, logo do rodapé da landing (`e/[id]/page.tsx:161-171`) e a correspondência de regionais |
| `ativo` | TINYINT(1) DEFAULT 1 | checkbox "Evento ativo — aparece na página pública e aceita vendas / escondido do público, vendas bloqueadas" | landing filtra `COALESCE(e.ativo,1)=1` (`e/[id]/page.tsx:75`). ⚠️ **Balcão, check-in e relatórios listam eventos inativos** (`GET /api/eventos` não filtra) |
| `slug` | VARCHAR(100) UNIQUE | "Slug (URL personalizada)", saneado no cliente para `[a-z0-9-]` | servidor: `^[a-z0-9][a-z0-9-]{1,98}[a-z0-9]$` (3-100) → 400; `ER_DUP_ENTRY` → 409 "Já existe um evento com esse slug" |
| `cieloAccountId` | INT | select "Conta Cielo (recebe os pagamentos)" de `GET /api/cielo-accounts` ("Usar conta padrão") | resolução em `getCieloCreds` (§1.5) |
| `voucherBannerUrl` | LONGTEXT (base64) | `ImageUploader` "Banner / Cabeçalho", 1920×640 (3:1), `maxWidth 1920`, `maxBytes 700 KB` | 413 "Banner muito grande" se > 1 500 000 chars; topo da landing e do voucher; `openGraph.images` |
| `voucherLogoUrl` | LONGTEXT | **sem campo na tela** (só no estado do formulário) | 413 "Logo muito grande"; lido pela landing (`e/[id]/page.tsx:68`) e pelo voucher |
| `comprarLogoUrl` | LONGTEXT | **sem campo na tela** | 413 "Logo do rodapé muito grande"; não encontrei leitura na landing (`grep comprarLogoUrl e/[id]/page.tsx` vazio) |
| `voucherCorPrimaria`, `voucherCorSecundaria` | VARCHAR(7) DEFAULT `#1e3a5f` / `#f59e0b` | `<input type=color>` | landing usa como `cor`/`corSec` (l.228-229); `Participant.eventos[].corPrimaria` na busca |
| `voucherBoasVindas` | TEXT | textarea "Mensagem de Boas-vindas", teto editorial 500 (`BOAS_VINDAS_MAX`) | landing l.316-327 |
| `voucherInstrucoes` | TEXT | textarea "Instruções ao Participante", teto 800 | landing "Informações Importantes" l.603-637 e voucher |
| `voucherRodape` | TEXT | **sem campo na tela** | gravado como `null` pelo formulário |
| `voucherMostrarParticipante/Evento/Ingresso/QRCode/Pagamento` | TINYINT(1) DEFAULT 1 | 5 checkboxes "Dados a exibir no voucher" | `voucher-pdf.ts:212`, `Voucher.tsx:141` |
| `createdAt` | DATETIME | — | — |

**Novo** (`novo/page.tsx`, 730 linhas): 3 seções (Dados do Evento, Tipos de Convite com mini-formulário e lista local, Personalização); `handleSubmit` (l.176-217) faz `POST /api/eventos` e depois **um `POST /api/eventos/{id}/ingressos` por tipo, sem transação e sem checar erro** (l.194-213), e redireciona para `/admin/eventos`. O mini-formulário de tipo no "novo" **não tem** `exibirVendaPublica`, `ativo` nem campos personalizados.

**Editar** (`[id]/page.tsx`, 2 005 linhas): além das seções acima, tem: lista de tipos com badges (valor, vagas, "até Nx", "N vendidos", "inativo") e ações Editar / Inativar-Reativar (`PATCH`) / Excluir (só quando `vendidos === 0`, l.1040-1052); "COMBOS PROMOCIONAIS" (l.1062-1121); `CuponsManager` (l.1127-1132); Orientadores do evento com ordem por setas e persistência imediata (`PUT /api/eventos/{id}/orientadores`, l.575-615); seção "Relatórios e manutenção" com links para vendas-por-dia, conflitos, combos, importar-convites e a **zona de perigo** (§4.11). Modais de tipo (l.1318-1651), combo (l.1653-1889), confirmação de mudança de preço (l.1896-1963) e exclusão barrada (l.1966-2002). Modais **não fecham por clique fora** (comentário l.1318-1319).

`DELETE /api/eventos/[id]` (`route.ts:294-312`): apaga `IngressoTipo`, `Inscricao` e `Evento`. ⚠️ **Não apaga** `Combo/ComboItem`, `Cupom`, `EmailAgendado/EmailEnvio`, `ComissaoMembro`, `EventoOrientador`, `InscricaoResposta`, `PedidoPendente`, `CarrinhoAbandonado` — ficam órfãos. Auditoria `excluir Evento`.

### 4.2 Tipos de convite — `IngressoTipo`

Colunas (`migrate/route.ts:82-97`, `+descricao` l.668, `+unicoPorCpf` l.699, `+papel/exigePrincipal/exibirVendaPublica` l.1055-1059, `+ativo` l.1137):

| Coluna | Tipo | Tela (modal de edição) | Regra |
|---|---|---|---|
| `nome` | VARCHAR(255) NOT NULL | "Nome do Tipo" | obrigatório |
| `descricao` | VARCHAR(500) | textarea "Descrição" (≤500) | landing e voucher |
| `quantidade` | INT DEFAULT 999 | "Quantidade" (padrão 100 no form) | ⚠️ **informativa**: nenhuma rota deste recorte checa estoque por tipo (só combos têm `checarEstoqueCombo`); o rascunho `eventos_schema.sql:106` já anota isso |
| `valor` | DECIMAL(10,2) | "Valor (R$)" | preço de tabela; **congelado** em `Inscricao.valorOriginal` na venda |
| `maxParcelas` | INT DEFAULT 1 | "Máx. Parcelas" 1-12 | balcão cartão e Cielo |
| `idadeMin`, `idadeMax` | INT | "Idade Mín./Máx." | não checadas em nenhuma rota deste recorte |
| `vendaInicio`, `vendaFim` | DATETIME | `datetime-local` | ⚠️ **não checadas no balcão** (`/api/venda` não olha janela do tipo; só o combo tem janela) |
| `unicoPorCpf` | TINYINT(1) | "Máximo de 1 por CPF" | regra 1 (§1.4) |
| `papel` | VARCHAR(20) `principal`/`adicional` | select "Papel do convite" | regras 2-3 |
| `exigePrincipal` | TINYINT(1) | checkbox só para adicional | servidor zera se `papel='principal'` |
| `exibirVendaPublica` | TINYINT(1) DEFAULT 1 | "Exibir na venda pública" | oculto do público, vendável no balcão |
| `ativo` | TINYINT(1) DEFAULT 1 | botão Inativar/Reativar (não é campo do modal) | fora de venda em público, balcão e combos |

Rotas:
- `GET /api/eventos/[id]/ingressos` (sessão): `*` + `vendidos` (`contarVendidosPorTipo`).
- `POST` (`requirePermissao("eventos")`): defaults `quantidade 999`, `valor 0`, `maxParcelas 1`, `publico` = só 0 se `exibirVendaPublica === false`, `ativo` idem; auditoria `criar IngressoTipo`.
- `PUT /api/eventos/[id]/ingressos/[ingressoId]` (l.112-234): **mudança de preço com vendas exige `confirmarMudancaValor: true`**, senão 409 `{ error, confirmacaoValor: { nome, vendidos, valorAnterior, valorNovo } }` (l.156-173) e a tela abre o diálogo "Estou ciente, alterar"; auditoria `editar-valor` / `reativar` / `inativar` só quando muda preço ou `ativo` (l.206-223).
- `PATCH` (l.242-286): só `{ ativo: boolean }`; auditoria.
- `DELETE` (l.288-333): 409 `{ error: motivoBloqueioExclusao, podeInativar: true, uso }` se há inscrições (inclusive canceladas), pedidos pendentes ou combos; senão apaga `IngressoCampo` do tipo e o tipo; auditoria.

### 4.3 Campos personalizados — `IngressoCampo` + `InscricaoResposta`

Tabelas `migrate/route.ts:123-158`: `IngressoCampo(ingressoTipoId, label, tipo 'texto'|'select', opcoesJson, obrigatorio, ordem, ativo)`; `InscricaoResposta(inscricaoId, campoId, label snapshot, valor)`. Tela: dentro do modal do tipo (l.1533-1626): rótulo, tipo (texto livre / lista suspensa), opções uma por linha, obrigatório. `GET /api/eventos/[id]/ingressos/[ingressoId]/campos` (sessão) devolve os ativos; `PUT` (`requirePermissao("eventos")`) sincroniza a lista: atualiza por id, insere novos, **soft-delete `ativo=0`** dos que sumiram (l.102-111); lista sem opções é ignorada (l.80). Consumo: check-in mostra respostas (§2.2); relatório de campos (§3.8); régua de e-mails `campo_faltante` e ação `coletar_campo` (§5.5); transferência copia respostas por rótulo igual (§4.12); troca de titular **apaga** as respostas (§4.13).

### 4.4 Combos — `Combo` + `ComboItem`

Colunas (`migrate/route.ts:1067-1090`, `+limitePorCpf/maxParcelas` l.1098-1099): `nome, descricao(500), valor DECIMAL, quantidade (null=ilimitado), vendaInicio, vendaFim, ativo, limitePorCpf, maxParcelas`; `ComboItem(comboId, ingressoTipoId, quantidade≥1)`.

Duas telas: o modal em `/admin/eventos/[id]` (todos os campos, começa com 2 itens, l.415-452, 1653-1889) e a página `/admin/eventos/[id]/combos` (292 linhas, **mais antiga: sem `vendaInicio/vendaFim/limitePorCpf/maxParcelas`**, só filtra tipos `ativo !== 0`, aceita 1 item no cliente mas a API exige 2).

`GET /api/eventos/[id]/combos` (sessão): combos + `itens[{id, comboId, ingressoTipoId, quantidade, ingressoNome, papel}]`. `POST`/`PUT` (`requirePermissao("eventos")`): nome obrigatório, **≥2 itens** (400), `validarUmPrincipal` (400); o `PUT` substitui os itens **numa transação** (`[comboId]/route.ts:412-448`). `DELETE`: apaga itens e combo sem checar inscrições (o `confirm` diz "As inscrições já vendidas não são afetadas").

### 4.5 Cupons — `Cupom` (`migrate/route.ts:367-386`, `+comboId` l.1104)

`codigo` (2-50, `[A-Z0-9_-]`, maiúsculo, único por evento), `descricao(255)`, `tipo` `percentual|valor`, `valor` (>0; percentual ≤100), `ingressoTipoId` **ou** `comboId` (se `comboId`, `ingressoTipoId` é anulado, `cupons/route.ts:133`), `vigenciaInicio/Fim`, `maxUsosTotal`, `maxUsosPorCpf`, `ativo`. `GET` devolve `usosAtuais` (inscrições ativas com o cupom). `PATCH` parcial com `ALLOWED_FIELDS` (`[cupomId]/route.ts:149-152`). `DELETE`: se há uso ativo, **soft-delete** `ativo=0` e `softDeleted: true`. Tela: `src/components/CuponsManager.tsx` (538 linhas, não lido além do cabeçalho l.1-80: `aplicaSe` `"" | "t<id>" | "c<id>"`).

### 4.6 Orientadores — `/admin/orientadores` e por evento

`Orientador(nome, fotoUrl LONGTEXT, bio VARCHAR(150))` e `EventoOrientador(eventoId, orientadorId, ordem)` (`migrate/route.ts:960-985`). Tela global (217 linhas): grade de cartões com foto 64px, modal com Nome, `SquareImageUploader` (foto recortada em quadrado, §5.10) e Biografia (`BIO_MAX=150`). `GET /api/orientadores` (sessão), `POST`/`PUT`/`DELETE` (`requirePermissao("orientadores")`; foto > 1 500 000 chars → 413; DELETE remove `EventoOrientador` antes; auditoria criar/editar/excluir). Por evento: `GET /api/eventos/[id]/orientadores` (ordenado por `ordem, nome`) e `PUT { orientadorIds: number[] }` (`requirePermissao("eventos")`, apaga e reinsere com `ordem=i`, l.258-264). Landing exibe a seção "Orientadores" (`e/[id]/page.tsx:332-360`); Estatística lista os nomes.

### 4.7 Locais — `/admin/locais`

`Local(nome NOT NULL, endereco TEXT, bairro, cidade, estado CHAR 2, telefone, email, contaCielo)` (`migrate/route.ts:31-45`). Tela (345 linhas): tabela `Nome | Cidade/Estado | Telefone | Conta Cielo`, modal com os 8 campos (UF em select com 27 siglas, l.41-44). `GET /api/locais` (sessão, ordem por nome), `POST`/`PUT`/`DELETE` (`requirePermissao("locais")`, `nome` obrigatório). ⚠️ `DELETE` não verifica eventos que apontam para o local (fica `localId` órfão). ⚠️ `contaCielo` é texto livre, **não** é lido por `getCieloCreds` — resquício anterior à tabela `CieloAccount`. Usos do local: landing (`localNome, localCidade, localEstado`), e-mails à regional (`email-regional.ts:84`), voucher, `GET /api/eventos/[id]` (endereço).

### 4.8 Promotores — `/admin/promotores`

`Promotor(nome NOT NULL, telefone, email, logoUrl LONGTEXT, usarCorrespondenciaRegional TINYINT)` (`migrate/route.ts:18-28`, l.700-701). Tela (291 linhas): tabela `Nome | Telefone | Email`, modal com Nome, Telefone, Email, `ImageUploader` "Logo do promotor" (`maxWidth 600`, prévia 3:1 sobre `#1e3a5f`, "Aparece no rodapé de todas as landing pages dos eventos deste promotor") e o checkbox "Usar correspondência de Regionais na estatística". Rotas `GET` (sessão) / `POST`/`PUT`/`DELETE` (`requirePermissao("promotores")`); `DELETE` apaga `RegionalPromotorEmail` do promotor (l.397). Usos: assinatura dos e-mails à regional (`promotorNome`), rodapé do e-mail do voucher ("Evento promovido pela …, WhatsApp, E-mail", `email-voucher.ts:62-78`), rodapé da Estatística, chave do e-mail corporativo da regional (§4.15).

### 4.9 Comissão organizadora

**Padrões** (`/admin/comissao`, 353 linhas): dois painéis — Setores (`nome`, `ordem`) e Funções (`setorId` obrigatório, `nome`, `ordem`), com modais; funções agrupadas por setor. Tabelas `ComissaoSetorPadrao(nome UNIQUE, ordem)`, `ComissaoFuncaoPadrao(nome, ordem, setorId; UNIQUE (setorId, nome))` (`migrate/route.ts:715-733`, 935-956). **Seed** quando vazias (l.888-916): setores `Coordenação Geral, Andamento da Programação, Interna, Externa, Estacionamento, Cozinha e Refeitório`; funções `Coordenador, Encarregado, Assistente, Monitor` (backfill liga funções órfãs ao 1º setor, l.1001-1034). Rotas `GET /api/comissao/setores|funcoes` (**sem autenticação**, `setores/route.ts:9-14`, `funcoes/route.ts:9-17`), `POST/PUT/DELETE` (`requirePermissao("comissao")`, `ER_DUP_ENTRY` → 409). ⚠️ `DELETE` de setor não trata as funções dele.

**Por evento** (`/admin/eventos/[id]/comissao`, 349 linhas): resumo (membros, "com convite pago (contam como participante)", "sem convite (estatística paralela)"); adicionar membro = busca de participante (`GET /api/participants?search=&limit=8`, debounce, com tratamento de 403) + select de setor (por nome) + select de função (filtrada pelo `setorNome`); lista por setor `Nome | Função | Regional | Convite (Pago / Sem convite) | Remover`. Tabela `ComissaoMembro(eventoId, participanteId, setor VARCHAR, funcao VARCHAR)` (l.734-744) — **setor e função gravados como TEXTO** (snapshot dos padrões), não por id. `GET /api/eventos/[id]/comissao` (sessão): `+ nomeCompleto, cpf, regional, organizacao, temIngressoPago = EXISTS(Inscricao pago no evento)`; `POST` (`requirePermissao("eventos")`, 409 se mesmo participante+setor+função); `DELETE /[membroId]`. Consumo: Estatística (§3.7).

### 4.10 Importar convites (XLSX) — `/admin/eventos/[id]/importar-convites`

Página (368 linhas), 4 passos: (1) arquivo `.xlsx/.xls` + "Identificação do pedido (Credenciamento)" (padrão `CREDENCIAMENTO`); "Ler colunas" → `POST … modo=headers`; (2) mapear coluna da planilha → campo do sistema (grupos "Participante" e "Dados da venda", obrigatórios `cpf` e `nomeCompleto`, aviso de colunas ignoradas); "Analisar" → `POST … dryRun=1&colMap`; (3) correlacionar cada "Convite na planilha" com um tipo (`t<id>`) ou combo (`c<id>`) e cada organização da planilha com a canônica; "Lançar convites" → `POST … mapping&colMap&orgMapping&pedidoCredenciamento`; (4) resultado (criados, lançados, pulados, erros por linha).

`POST /api/eventos/[id]/importar-convites` (`route.ts:54-361`): ⚠️ `requirePermissao("participantes")` (não `eventos`); `maxDuration = 60`. Campos do participante (`src/lib/import-xlsx.ts:40-56`): `cpf, nomeCompleto, codSNI, telefone, email, regional, organizacao, associacaoLocal, dataNascimento, endereco, bairro, cidade, estado, formaPagamento, tipoConvite`; campos da venda (l.64-70): `codInscricao, respCompra, tipoVenda, valor, obsPgto`. Regras ao aplicar (l.210-349): cadastro **só para CPF novo** (o existente não é sobrescrito); organização canonizada ("Assoc." → "Associação", `orgKey`, l.24-33, lista `ORGANIZACOES` de `src/lib/constants.ts:262-267`); idempotência: pula se já há inscrição ativa do mesmo combo/tipo; `formaPagamento='credenciamento'`, `status='pago'`, `tipoVenda` da planilha ou `'balcao'`, `credenciamentoPedido = 'B-'|'O-' + codInscricao` ou o identificador geral (l.39-47); responsável pela compra (`respCompra`) vira `compradorCpf/compradorId` (cria cadastro mínimo "Responsável <cpf>" se preciso, l.223-235); valor e `observacao` só na 1ª unidade; `compraGrupoId` por linha. Auditoria `importar-convites`.

### 4.11 Apagar todas as inscrições do evento — zona de perigo

`GET /api/eventos/[id]/apagar-inscricoes` (`requirePermissao("eventos")`): prévia `{ total, credenciamento, online, balcao }`. `POST` com `{ confirmacao: "APAGAR" }`: apaga `InscricaoResposta` das inscrições do evento e depois **todas** as `Inscricao` (l.187-203); auditoria `apagar-inscricoes-evento`. Modal na tela exige digitar `APAGAR` e alerta quando há compras de site/balcão.

### 4.12 Transferência entre eventos — `POST /api/inscricoes/transferir` (`route.ts:14-136`)

⚠️ `requirePermissao("participantes")`. Corpo `{ inscricaoId, destinoEventoId, destinoIngressoTipoId? }`. Regras: 409 se já `transferido` ou `cancelado`; 400 se destino = origem; 404 evento destino; 400 se o tipo não é do destino. Cria **nova** `Inscricao` no destino: `formaPagamento='transferencia', tipoVenda='transferencia', status='pago', valorOriginal=0, descontoAplicado=0, origemTransferenciaId=<origem>`, herdando `compradorCpf/compradorId` (l.60-73); copia `InscricaoResposta` para campos de mesmo rótulo no tipo de destino (l.76-102); marca a origem `status='transferido', transferidoParaEventoId, transferidoParaInscricaoId, transferidoEm, transferidoPor=<e-mail>` (l.106-112). Receita fica na origem. Auditoria `editar Inscricao`. Depois, `avisarTrocaDeEvento` (§5.4) e devolve `{ ok, destinoInscricaoId, emails: { participante, regionais } }`. Sem transação. Tela: `src/app/participantes/[id]/ingressos/page.tsx:515-546` (fora do recorte; carrega `GET /api/eventos/{dest}/ingressos` e avisa "Use 2ª via do voucher" se o e-mail falhar).

### 4.13 Troca de titular — `GET|POST /api/inscricoes/trocar-titular` (`route.ts`)

`requirePermissao("trocar-titular")` (permissão própria, `permissions.ts:61`). **Mesmo convite, outro CPF** (comentário l.17-26). Bloqueios (`bloqueioDoConvite`, l.30-42): cancelado, expirado, transferido, **check-in já feito**. `GET` (prévia, l.90-153): `{ inscricaoId, ingressoTipoNome, comboNome, valor líquido, respostas (contagem), valorMigraPara, bloqueio }`, aplicando as regras de papel ao destinatário. `POST` (l.156-320): exige `motivo` ≥ 5 chars e sessão com e-mail; **transação com `FOR UPDATE`**; regras de papel/CPF para o novo titular (409 `{ regra: true }`); em combo, se a unidade cedida carrega o valor, **migra `valorOriginal/descontoAplicado` para a menor irmã** que fica (`destinoDoValor`, l.53-76) e zera a cedida; **apaga `InscricaoResposta`** da inscrição (l.257); `UPDATE participanteId=novo, titularAnteriorId, titularTrocadoEm, titularTrocadoPor, titularTrocaMotivo` (l.259-265); `cupomId` intencionalmente intocado (l.240-242); libera a conexão antes do `logAudit` (`trocar-titular`); `avisarTrocaDeTitular` (§5.4); resposta `{ ok, inscricaoId, titularAnteriorId, valorMigradoPara, emails }`. Erro "unknown column" → 503 com mensagem de migração pendente (l.310-315). O token do voucher é derivado do `participanteId` e por isso rotaciona sozinho (`src/lib/voucher-acesso.ts:4-19`).

### 4.14 Cancelamento (referência cruzada) — `src/lib/cancelamento.ts`, `POST /api/inscricoes/cancelar`

Fora do recorte (estornos), mas as regras dele derivam do balcão: `formaEstornoDe(formaPagamento)` (l.31-38, tabela em §1.2); `resolverGrupoCancelamento` (l.89-188) agrupa o combo por `compraGrupoId` → `cieloOrderId` → `credenciamentoPedido` → inferência conservadora; venda de balcão **sem `valorOriginal`** (histórico anterior ao congelamento) entra na fila da Sede como `pendente` sem valor (`cancelar/route.ts:143-155`). `requirePermissao("cancelamentos")`.

### 4.15 Regionais (dependência) — `/admin/regionais`, `/api/regionais`

Tabela `Regional(nome UNIQUE, correspondeRegionalId)` (`migrate/route.ts:540-547`) e `RegionalPromotorEmail(regionalId, promotorId, email; UNIQUE(regionalId, promotorId))` (l.1209-1224). `GET /api/regionais` é **público** para os nomes; os `emails: { promotorId: email }` só com sessão (`route.ts:9-29`). `POST/PUT` (`requirePermissao("regionais")`) gravam `correspondeRegionalId` (não pode ser ela mesma) e os e-mails por promotor via `gravarEmailsDaRegional` (`src/lib/regional-emails.ts:221-250`, endereço em branco/inválido apaga a linha). A ponte `Inscricao → Regional` é **o nome** em `Participant.regional` (texto livre escolhido de um select). Lista fixa legada `REGIONAIS` (128 nomes) em `src/lib/constants.ts:1-116` — ainda importada por telas de participante, não por este recorte.

---

## 5. Comunicação

### 5.1 SMTP — `src/lib/mailer.ts` (126 linhas)

| Export | Faz |
|---|---|
| `type SendMailInput { to, subject, html, from?, replyTo?, attachments?[{filename, content, contentType}] }` (l.4-12) | |
| `sendMail(input)` (l.66-120) | lê `smtp.host/port/secure/user/pass/from` da `Configuracao` com cache de 30 s (l.45-54), fallback `SMTP_*` (host padrão `smtp.gmail.com`, porta 587); **lança "SMTP não configurado"** sem user/pass; `from` = `input.from` → `smtp.from` → `smtp.user` → `SMTP_FROM`, saneado por `pickFrom` (nome padrão "SNI Seminário", endereço válido ou a caixa autenticada, l.31-41); `secure=true` = TLS direto/465, senão STARTTLS obrigatório (`requireTLS`); timeouts 10 s / 10 s / 30 s |
| `clearMailerCache()` (l.57) | usado pelo teste de envio |
| `mailerConfigured()` (l.123-126) | user+pass presentes |

Teste: `POST /api/admin/email/test` (`requirePermissao("configuracoes")`, destino = corpo ou e-mail da sessão, HTML fixo "E-mail de teste ✔", 502 em falha).

### 5.2 Moldura e e-mails do voucher — `src/lib/email-voucher.ts` (275 linhas)

- `layoutEmail(conteudo, logoUrl?)` (l.29-49): tabela 600 px, cabeçalho azul `#1e3a5f` com título fixo **"Confirmação de inscrição em evento da SEICHO-NO-IE DO BRASIL"**, logo (`Configuracao.logoUrl`) pequeno no rodapé.
- `enviarVoucherEmail(inscricaoId, opts?)` (l.95-220): resolve o grupo (§2.2), recusa `cancelado/expirado/transferido` (409), "sem e-mail" (status 200, `ok:false`); corpo com título ("Inscrição Confirmada!" ou `opts.titulo`), intro, faixa de aviso opcional, cartão Evento/datas/Convites/Total/Pagamento (`pagamentoLabelPublico`)/Nº do pedido `#âncora`; **anexa o voucher em PDF** (`getVoucherData` + `buildVoucherPdf`, falha → e-mail sem anexo); rodapé do promotor. Assunto padrão `Inscrição confirmada — <evento>`.
- `enviarAvisoEmail({to, nome?, assunto, titulo, paragrafos[], itens?[{label,valor}], aviso?})` (l.239-275): aviso sem voucher.

### 5.3 E-mail corporativo da Regional — `src/lib/email-regional.ts` (329 linhas)

Destinatário: `emailDaRegional(regionalNome, promotorId)` (`regional-emails.ts:257-278`) — par (nome da regional do participante × promotor do evento). Corpo comum (`enviarAvisoRegional`, l.107-156): "Olá, presidente!", "Reverências, muito obrigado.", intro, blocos rotulados, fecho, "Muito obrigado," + nome do promotor, "enviado automaticamente pelo sistema de inscrições", dentro de `layoutEmail`.

| Função | Gatilho | Assunto | Blocos | Extra |
|---|---|---|---|---|
| `avisarRegionalNovaCompra({eventoId, participanteId})` (l.171-206) | `POST /api/venda` (status pago) e `confirmarPedido` (online) | `Nova compra de convite — <regional> — <evento>` | pessoa (nome, cidade/UF), evento (nome, datas, local) | fecho "sua Regional já tem N convite(s) confirmado(s). Parabéns!" — conta **pessoas distintas** com `pago` (l.95-104) |
| `avisarRegionalNovaCompraEmLote(eventoId, ids[])` (l.215-230) | webhook (várias pessoas na compra) | idem | idem | levas de 3 em paralelo |
| `avisarRegionalTrocaTitular({eventoId, titularAnteriorId, novoParticipanteId})` (l.237-279) | troca de titular | `Transferência de titularidade — <evento>` | Participante anterior / Novo participante / Evento | regionais das duas pontas, deduplicadas |
| `avisarRegionalTrocaEvento({participanteId, origemEventoId, destinoEventoId})` (l.286-329) | transferência de evento | `Transferência de convite — <destino>` | Participante / Evento anterior / Novo evento | um e-mail por endereço (promotores diferentes), assinado pelo promotor dono do endereço |

Todas devolvem o número de enviados e **nunca lançam** (`tentar`, l.159-165).

### 5.4 Avisos das transferências — `src/lib/email-transferencia.ts` (158 linhas)

`avisarTrocaDeTitular` (l.36-113) → `{ novoTitular, titularAnterior, regionais }`: voucher novo para quem recebeu (`enviarVoucherEmail` com assunto "Convite transferido para você — <evento>" e intro sobre check-in pelo CPF), aviso sem voucher para quem cedeu ("Transferência de titularidade confirmada", itens Evento/Convite/Novo titular/Nº do pedido, faixa "O voucher que estava no seu nome deixou de valer"), e regionais. `avisarTrocaDeEvento` (l.120-158) → `{ participante, regionais }`: um e-mail só com o voucher do destino ("Sua inscrição foi transferida de evento", faixa "O voucher do evento anterior não vale mais").

### 5.5 Régua de e-mails — `EmailAgendado` / `EmailEnvio` + cron

Tela `/admin/eventos/[id]/emails` (456 linhas): tabela `Nome interno | Assunto | Agendamento | Segmento | Status (Ativo/Pausado) | Enviados | Ações`; modal com `RichTextEditor` para o corpo (§5.10) e os campos abaixo; dica de variáveis `{{nome}}` e `{{link_acao}}`.

Colunas (`migrate/route.ts:783-799`, `+frequencia/campoId/ingressoTipoIdB/acao/acaoIngressoTipoId/anexarVoucher` l.821-826) e normalização `parseEmailAgendado` (`src/lib/email-agendado.ts:152-177`):

| Campo | Valores | Semântica |
|---|---|---|
| `nomeInterno`, `assunto` | texto (obrigatórios) | |
| `corpo` | LONGTEXT HTML | `{{nome}}` (escapado), `{{link_acao}}` |
| `frequencia` | `once` (padrão) / `semanal` / `mensal` | recorrente "repete até sair da audiência" |
| `agendamentoTipo` | `fixa` / `apos_compra` / `antes_evento` | só com `once` |
| `dataEnvio` | datetime | `fixa` ou início da recorrência |
| `dias` | int | `apos_compra`/`antes_evento` |
| `segmento` | `todos` / `tipo` / `carrinho` / `campo_faltante` / `tem_sem` | ver candidatos abaixo |
| `ingressoTipoId`, `ingressoTipoIdB`, `campoId` | ids | conforme segmento |
| `acao` | `nenhuma` / `coletar_campo` / `comprar_ingresso` / `voucher` (aceito pela lib, **sem opção na tela** e sem tratamento no cron) | link do e-mail |
| `acaoIngressoTipoId` | id | `comprar_ingresso` |
| `anexarVoucher` | 0/1 | anexa PDF do voucher da âncora |
| `ativo` | 0/1 | pausado não dispara |

`EmailEnvio(emailAgendadoId, participanteId, email, status 'processando'|'enviado'|'erro', erro, sentAt, periodo; UNIQUE (emailAgendadoId, email, periodo))`.

**Processador** `GET|POST /api/cron/emails` (`src/app/api/cron/emails/route.ts`, 317 linhas; `runtime nodejs`, `maxDuration 60`):
1. `autorizado(req)` (l.26-33): `CRON_SECRET` ausente → **libera tudo**; senão `Authorization: Bearer` **ou `?key=`** na URL.
2. `expirarPendentes()` (`src/lib/expiracao.ts:51-75`) **antes** do gate do mailer: `PedidoPendente` Pix vencido pelo `cieloPixExpiresAt`, `PedidoPendente` sem Pix e `Inscricao pendente` mais velhos que `pendenteExpiraHoras` (padrão 24) → `expirado`.
3. Sem SMTP → `{ enviados: 0, motivo }`.
4. Limpa `EmailEnvio` travados (`processando` > 15 min) e `erro` > 60 min (l.193-198).
5. Orçamento: `min(20 por execução, 9000 − enviados hoje)` (l.21-23, 200-211); ritmo `2100 ms` entre envios (~28/min, Office 365).
6. Para cada `EmailAgendado ativo`: período = semana ISO ou `AAAA-MM` em UTC-3 (l.45-58, 226); `candidatos(em)` (l.86-145):
   - `carrinho`: `CarrinhoAbandonado` não convertido com e-mail, sem opt-out;
   - `campo_faltante`: pagos do tipo sem `InscricaoResposta` preenchida para `campoId`;
   - `tem_sem`: pagos do tipo A sem inscrição ativa do tipo B;
   - `todos`/`tipo`: pagos (opcionalmente do tipo), `MIN(dataPurchase)` como referência; sempre `emailOptOut=0` e e-mail preenchido.
   - **Devido** (l.243-255): recorrente → `now ≥ dataEnvio` (ou sempre); `fixa` → `now ≥ dataEnvio`; `apos_compra` → `now ≥ refDate + dias`; `antes_evento` → `now ≥ dataInicial − dias`.
   - Reserva `INSERT EmailEnvio … 'processando'` (dedup pelo UNIQUE; falha = já enviado no período, l.258-265).
   - `buildLinkAcao` (l.147-171): `coletar_campo` → `campoUrl(inscricaoId, campoId)` (`src/lib/campo-token.ts:14-22`, HMAC, `/r/campo/<token>`); `comprar_ingresso` → cria `MagicLink` (45 dias) e monta `/comprar?token=&evento=&ingresso=&qty=1`.
   - Corpo: substitui `{{nome}}`; `{{link_acao}}` ou botão "Acessar" ao fim (l.267-276); anexo PDF se `anexarVoucher` (l.278-288); `envelope()` (l.60-75: cabeçalho azul com `logoUrl` ou "SNI — Seminário Especial da Prosperidade", rodapé com link de **descadastro** `optOutUrl(participanteId)` → `/descadastro?token=` → `Participant.emailOptOut=1`, `src/lib/email-optout.ts`, `api/descadastro/route.ts`).
   - `sendMail`; atualiza `EmailEnvio` para `enviado`/`erro`.
7. Resposta `{ ok, avaliados, enviados, enviadosHoje, orcamento, detalhes[], expirados }`.

**Agendamento**: `vercel.json` `{"crons":[{"path":"/api/cron/emails","schedule":"0 9 * * *"}]}` (1×/dia, Hobby) e `.github/workflows/email-cron.yml` a cada 10 min com `curl -L -X POST "$BASE/api/cron/emails?key=$CRON_SECRET" -H "Authorization: Bearer …" --max-time 90` (segredo `CRON_SECRET`, variável `CRON_BASE_URL`, padrão `https://seminarioespecial.com.br`).

### 5.6 2ª via do voucher — `POST /api/email/send` (`src/app/api/email/send/route.ts`)

**Público** (tela de confirmação e a ficha do participante); corpo `{ inscricaoId }` apenas; rate limit 20/h por IP (`rateLimit("email-send")`); trava de idempotência 60 s **pela âncora do grupo** (`voucher-email`, l.183-226) com auditoria `voucher-email-duplicado`; libera a trava quando nada foi enviado (409/404/sem e-mail); auditoria `voucher-email`. `runtime nodejs`, `maxDuration 60`.

### 5.7 WhatsApp Cloud API — `POST /api/whatsapp/send` (103 linhas)

**Público**; corpo `{ inscricaoId }`; rate limit 20/h por IP; recusa cancelado (409); "sem telefone" → `{ ok:false, skipped }`; telefone só dígitos com prefixo `55` (l.55-56); `POST https://graph.facebook.com/v19.0/{phoneNumberId}/messages` com `Authorization: Bearer <whatsapp.token>`, `type: "template"`, `template.name = whatsapp.template` (padrão `sni_confirmacao`), `language pt_BR`, **4 parâmetros de corpo na ordem**: nome, nome do evento, nº da inscrição, URL do voucher com token do titular (`voucherUrl`, `voucher-acesso.ts:36-39`). Devolve `{ ok, messageId }` ou 502.

### 5.8 Analytics — GA4, Meta Pixel e CAPI

- `src/app/layout.tsx:50-52,66-68`: lê `ga.measurementId` e `meta.pixelId` **em todo o app** (painel incluído) e monta `<AnalyticsScripts>` (`src/components/AnalyticsScripts.tsx`): gtag.js + `gtag('config')`, Pixel `fbevents.js` + `fbq('init')`, `PageView` a cada mudança de rota (l.335-348).
- `src/lib/meta-capi.ts`: `sendMetaEvent(nome, input)` (l.31-84) → `POST https://graph.facebook.com/v19.0/{pixelId}/events?access_token=<meta.capiToken>` com `event_id` (dedup com o cliente), `user_data` com `em`/`ph` **SHA-256**, IP, UA, `fbp`/`fbc`, `custom_data { currency, value }`, `test_event_code` opcional; `sendMetaPurchase`, `sendMetaInitiateCheckout`.
- `POST /api/analytics/checkout` (público, rate 60/h): `InitiateCheckout`, valor = preço do tipo × quantidade, `event_id = ic-<evento>-<participante|anon>-<tipo>`. `POST /api/analytics/purchase` (público): `Purchase` só se `status='pago'`, valor líquido, `event_id = insc-<id>`.

### 5.9 Imagens em base64 — componentes

| Componente | Entrada | Saída | Limites |
|---|---|---|---|
| `src/components/ImageUploader.tsx` (288 l.) | PNG/JPEG/WebP ≤ 5 MB, clique ou arrastar | data URL: PNG mantido se couber, senão JPEG com qualidade 0,85→0,4 e escala 1→0,55, fundo branco (`compressImage`, l.37-93) | `maxWidth` e `maxBytes` (padrão 500 KB) por uso; erro "ficou maior que X após compressão" |
| `src/components/SquareImageUploader.tsx` (311 l.) | idem ≤ 8 MB | modal de recorte quadrado com arraste e zoom 1-3× (`CropModal`, l.34-209); JPEG 0,85/0,7/0,55 | `outputSize` 400 px, `maxBytes` 400 KB |
| `src/components/RichTextEditor.tsx` (107 l.) | `contentEditable` com `document.execCommand` (negrito, itálico, sublinhado, H2, listas, link via `prompt`, limpar) | HTML; imagem inserida como `<img src="data:…">` redimensionada a 800 px (l.355-379) | sem limite de bytes |

Onde os base64 param: `Evento.voucherBannerUrl/voucherLogoUrl/comprarLogoUrl`, `Promotor.logoUrl`, `Orientador.fotoUrl`, `Configuracao.logoUrl/sniLogoUrl/relatorioLogoUrl`, `EmailAgendado.corpo`. Tetos no servidor: 1 500 000 chars (eventos e orientadores). Destino na plataforma: Supabase Storage (`docs/migracao.md`, "Imagens em base64 → Supabase Storage").

---

## 6. Configurações

### 6.1 Mecânica

Tabela `Configuracao(chave VARCHAR(100) PK, valor LONGTEXT, updatedAt)` (`migrate/route.ts:325-331`, `MODIFY LONGTEXT` l.339). Leitura `getConfigs(chaves[]): Record<chave, valor|"">` (`src/lib/config.ts:4-16`, engole erro devolvendo `{}`). Escrita `POST /api/admin/config` (`requirePermissao("configuracoes")`, upsert por chave, **auto-heal** `ALTER … LONGTEXT` em falha, auditoria `editar Configuracao` com a lista de chaves — sem valores). `GET /api/admin/config` devolve **todas** as chaves, **inclusive segredos em claro** (`smtp.pass`, `whatsapp.token`, `meta.capiToken`), para preencher a tela.

Tela `/admin/configuracoes` (462 linhas): "Identidade visual" (3 `ImageUploader` que salvam sozinhos: `logoUrl` 2:1, `sniLogoUrl` 4:1 sobre `#02509d`, `relatorioLogoUrl` 1:1); seções `SECTIONS` (l.22-70) com salvar por seção; "Testar envio de e-mail"; cartão "Pagamento (Cielo)" só com link para `/admin/cielo-contas`; "Manutenção · Banco de dados" com o botão "Rodar migração" que exibe os `steps`.

### 6.2 Todas as chaves de `Configuracao` em uso

| Chave | Lida em | Escrita em | Segredo? | Fallback em env |
|---|---|---|---|---|
| `smtp.host` | `mailer.ts:69` | tela | não | `SMTP_HOST` (padrão `smtp.gmail.com`) |
| `smtp.port` | `mailer.ts:70` | tela | não | `SMTP_PORT` (587) |
| `smtp.secure` | `mailer.ts:71` | tela | não | `SMTP_SECURE` |
| `smtp.user` | `mailer.ts:72,78,125` | tela | não | `SMTP_USER` |
| `smtp.pass` | `mailer.ts:73,125` | tela (`type=password`) | **sim** | `SMTP_PASS` |
| `smtp.from` | `mailer.ts:78` | tela | não | `SMTP_FROM` |
| `whatsapp.token` | `whatsapp/send/route.ts:14` | tela (password) | **sim** | `WHATSAPP_TOKEN` |
| `whatsapp.phoneNumberId` | `…:15` | tela | não | `WHATSAPP_PHONE_NUMBER_ID` |
| `whatsapp.template` | `…:16` | tela | não | `WHATSAPP_TEMPLATE` (`sni_confirmacao`) |
| `pendenteExpiraHoras` | `expiracao.ts:12` | tela; seed `24` (`migrate:1041-1044`) | não | — |
| `ga.measurementId` | `layout.tsx:50` | tela | não | — |
| `meta.pixelId` | `layout.tsx:50`, `meta-capi.ts:31` | tela | não | — |
| `meta.capiToken` | `meta-capi.ts:31` | tela (password) | **sim** | — |
| `meta.capiTestCode` | `meta-capi.ts:31,60` | tela | não | — |
| `logoUrl` | `email-voucher.ts:134,243`, `email-regional.ts:116`, `cron/emails:187`, `voucher-data.ts:22`, `branding` | tela (upload) | não (base64) | — |
| `sniLogoUrl` | `e/[id]/page.tsx:157`, `voucher-data.ts:22`, `branding` | tela (upload) | não | — |
| `relatorioLogoUrl` | `logo-relatorio.ts:14-18` | tela (upload) e auto-download (`logo-relatorio.ts:53`) | não | — |
| `cielo.merchantId`, `cielo.merchantKey`, `cielo.environment` | `cielo.ts:106-118` (**legado**, só se não há `CieloAccount`); migração para `CieloAccount` em `migrate:626-651` | **sem campo na tela** | **sim** (`merchantKey`) | `CIELO_MERCHANT_ID`, `CIELO_MERCHANT_KEY`, `CIELO_ENVIRONMENT` |
| `cielo.mpi.clientId`, `cielo.mpi.clientSecret`, `cielo.mpi.establishmentCode`, `cielo.mpi.merchantName`, `cielo.mpi.mcc` | `cielo.ts:124-146` (3DS/MPI) | **sem campo na tela** | **sim** (`clientSecret`) | — |

Segredos fora de `Configuracao`: `CieloAccount.merchantKey` (`migrate:562-573`, texto puro, tela `/admin/cielo-contas`, fora do recorte).

### 6.3 Variáveis de ambiente (completo, por `grep -rn process.env`)

| Variável | Onde | Obrigatória | Observação |
|---|---|---|---|
| `DATABASE_URL` | `src/lib/db.ts:7` (pool `connectionLimit 5, queueLimit 20`), `server.js:14` | sim | MySQL Railway |
| `NEXTAUTH_SECRET` | `src/lib/auth.ts:143`, `src/lib/signed-token.ts:3` | sim | ⚠️ **padrão hardcoded** `"sni-prosperidade-secret-key-2024"` se ausente (`auth.ts:143`); assina também os tokens de opt-out, campo e voucher (`signed-token.ts`) |
| `AUTH_SECRET` | `signed-token.ts:3` | não | alternativa ao anterior; padrão `"sni-signed-token-secret"` |
| `NEXTAUTH_URL` | `src/lib/base-url.ts:3` (`APP_BASE_URL`), `layout.tsx:38`, `cielo/link/route.ts:8` + 3 outros | sim em produção | padrão `https://seminarioespecial.com.br` |
| `CRON_SECRET` | `cron/emails/route.ts:27` | não | **ausente = rota aberta** |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | `mailer.ts:69-79` | não | fallback da `Configuracao` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE` | `whatsapp/send/route.ts:14-16` | não | fallback |
| `CIELO_MERCHANT_ID`, `CIELO_MERCHANT_KEY`, `CIELO_ENVIRONMENT` | `cielo.ts:111-113` | não | fallback legado |
| `NODE_ENV` | `db.ts:16` | — | cache do pool em dev |
| `PORT` | `server.js:10` | não | `server.js` **não é usado na Vercel** (`package.json` `start: node server.js`, mas o deploy é serverless); ele recria `Participant` e tenta `DROP INDEX cpf` a cada subida |

No GitHub Actions: secret `CRON_SECRET`, variável `CRON_BASE_URL`.

### 6.4 Preferências por usuário e tema

`UserPreferencia(userId, chave, valor LONGTEXT; PK (userId, chave))` (`migrate:1156-1166`). `GET|PUT|DELETE /api/preferencias?chave=` (só sessão; `userId` da sessão, teto 64 KB, JSON). Hook `usePreferenciaUsuario(chave, padrao)` (`src/lib/preferencia-usuario.ts:117-192`): carrega, trava a gravação até chegar o valor do servidor, debounce 600 ms, `limpar()` apaga no servidor. Chaves em uso: `relatorios:evento`, `relatorios:lista`, `tema`. Tema (`src/lib/tema.ts`): `claro|escuro|sistema`, `localStorage["sni-tema"]` + preferência `tema` no banco, `data-sni-theme` no `<html>`, `SCRIPT_TEMA_INICIAL` no `<head>`; tela `/minha-conta`.

### 6.5 `/api/migrate` (`requirePermissao("configuracoes")`)

Única fonte do esquema: 36 passos idempotentes (`CREATE TABLE IF NOT EXISTS` + `ALTER … ADD` em `try/catch`), seeds (39º Seminário, tipos "Evento"/"Jantar", `Perfil Administrador`, setores/funções da comissão, `pendenteExpiraHoras`, `CieloAccount` a partir das chaves legadas, logo dos relatórios). Some no porte (AGENTS.md: "esquema só por migração").

---

## 7. Mapeamento para a plataforma

### 7.1 O que vira serviço comum e o que fica no módulo

| Hoje (`sni-ciclo`) | Destino no SNI Conecta | Onde já existe | Observações |
|---|---|---|---|
| `Configuracao` chaves não sensíveis (`smtp.host/port/secure/user/from`, `whatsapp.phoneNumberId/template`, `ga.*`, `meta.pixelId/capiTestCode`, `pendenteExpiraHoras`) | `public.configuracoes` (comum), editável em tela | AGENTS.md ("Configuração que é decisão do cliente mora no banco") | `pendenteExpiraHoras` é do módulo: prefixar (`eventos.pendente_expira_horas`) |
| Segredos (`smtp.pass`, `whatsapp.token`, `meta.capiToken`, `cielo.*`, `CieloAccount.merchantKey`) | tabela cifrada **sem GRANT**, `src/lib/cripto.ts` | `cripto.ts` (41 linhas) | `GET /api/admin/config` não pode mais devolver segredos em claro; a tela mostra "definido/não definido" |
| `mailer.ts` (`sendMail`), `envelope`/`layoutEmail` | provedor SMTP da fila comum (`src/lib/comunicacao/`) | só o contrato `fila.ts` (`enfileirar`, `processarFila`) | SMTP com STARTTLS, `from` saneado, anexos PDF — a fila precisa aceitar `attachments` (o contrato atual não tem) |
| `avisarRegional*`, `enviarVoucherEmail`, `enviarAvisoEmail`, avisos de transferência | **módulo** monta o HTML e chama `enfileirar()` | — | some o envio dentro da requisição (`POST /api/venda:306`, `trocar-titular:291`, `transferir:125`); `chaveUnica` substitui a trava `rateLimit("voucher-email")` |
| `EmailAgendado` (régua) | **módulo** (`eventos.emails_agendados`): a régua é regra de negócio de evento; o processador vira um job que **enfileira** em `notificacoes` | rascunho ainda não traduziu (`eventos_schema.sql:298` diz `public.notificacoes`) | `EmailEnvio` (dedup por período) ≠ fila: manter `eventos.emails_envios` como registro de "já mandei para este e-mail neste período" |
| `expirarPendentes` | job do módulo, disparado pelo mesmo cron | `vercel.json` `/api/notificacoes/processar` `0 12 * * *` | 1×/dia no Hobby; hoje roda a cada 10 min via GitHub Actions — decidir (§7.4) |
| `POST /api/whatsapp/send` | provedor WhatsApp da fila comum (canal `whatsapp`) | `Notificacao.canal: "whatsapp"` | o contrato só tem `corpo: string`; template com 4 parâmetros precisa de campo próprio |
| `AuditLog` / `logAudit` | `public.auditoria` (comum) | citado em AGENTS.md | `acao` deve virar `eventos.<acao>`; `userEmail` → `pessoa_id`; **nunca** gravar segredo (hoje `Configuracao` audita só chaves — manter) |
| `UserPreferencia` + `/api/preferencias` | `public.preferencias` (comum) | rascunho l.301 | chaves `relatorios:*` viram `eventos.relatorios.*` |
| `RateLimit` (tabela) | decidir: `eventos.rate_limits` ou Upstash | rascunho l.299 | usado por login, e-mail, WhatsApp, analytics |
| Base64 em `Evento/Promotor/Orientador/Configuracao/EmailAgendado.corpo` | Supabase Storage + URL | `docs/migracao.md` | `ImageUploader` passa a enviar arquivo; `RichTextEditor` precisa de upload de imagem em vez de `data:` |
| `Regional`, `Organizacao`, `RegionalPromotorEmail` | `public.regionais`, `public.organizacoes` (comum) + `eventos.regional_avisos` (módulo) | rascunho l.300-302 | `Participant.regional` (texto) vira FK em `pessoas`; `emailDaRegional` passa a buscar por `regional_id` |
| `User`/`Perfil`/`requirePermissao(key)` | Supabase Auth + `papeis` + `exigirCapacidade` | `permissoes.ts`, `auth.ts` | mapa em §7.2 |
| `Participant` | `public.pessoas` (uuid) | decisão 0002 | `Participant.checkinAt/formaPagamento/tipoConvite/ingressoEvento/ingressoJantar/numeroConvite/dataPurchase` são **legado** e não migram |
| `getCieloCreds`, `CieloAccount` | módulo (`eventos.contas_cielo`, chave cifrada) | rascunho l.54-62 | remover o legado `cielo.*` em `Configuracao` e `Local.contaCielo` |
| Landing `/e/[id]`, `/comprar/**`, `/descadastro`, `/r/campo` | módulo, públicas | `src/proxy.ts:13` já lista os prefixos | fora deste recorte |
| `INSTITUCIONAL` (endereço da Sede) | `public.configuracoes` | — | hoje fixo em `institucional.ts:16-20` |
| `REGIONAIS`/`ORGANIZACOES`/`FORMAS_PAGAMENTO` (constantes) | tabelas comuns | — | `FORMAS_PAGAMENTO` ("Cartão 1x"…"Cartão 10x", "Boleto") é vocabulário de importação de participante, não do balcão |

### 7.2 Checklist de porte por tela, com capacidade `eventos.*`

Capacidades disponíveis em `src/lib/permissoes.ts:41-49`: `eventos.gerir`, `eventos.vender`, `eventos.checkin`, `eventos.inscricoes.ver`, `eventos.inscricoes.gerir`, `eventos.estornos.gerir`, `eventos.comissao.gerir`, `eventos.configurar`. Rotas de destino conforme `src/modulos/eventos/README.md` e `src/modulos/registro.ts:32-45`.

| # | Tela/rota de origem | Permissão hoje | Destino | Capacidade | O que precisa mudar no porte |
|---|---|---|---|---|---|
| 1 | `/venda` + `POST/GET /api/venda` | `venda` | `/eventos/venda` (Server Actions) | `eventos.vender` | tirar `POST /api/migrate`; `localStorage["vendaConfig"]` pode virar preferência do usuário; gravar **parcelas e nº de autorização do cartão** em colunas (`eventos.inscricoes` precisa de `cartao_parcelas`, `cartao_autorizacao`); `status` do corpo não pode ser livre; aviso à regional → `enfileirar()`; valor em centavos; cabeçalho do recibo vindo do evento/promotor; filtrar eventos inativos/passados no setup |
| 2 | `POST /api/cielo/link` + `GET /api/cielo/api3/status` | `venda` / público | `/api/eventos/cielo/*` | `eventos.vender` (link); status continua público para a tela de pagamento | `valor` do avulso deve vir do banco; o polling do balcão pode usar um endpoint autenticado |
| 3 | `GET /api/participants?search` | any(5) | busca em `pessoas` (comum) | `eventos.vender` ∪ `eventos.inscricoes.ver` ∪ `eventos.comissao.gerir` ∪ `eventos.inscricoes.gerir` | busca acento-insensível (`unaccent`/`citext` no Postgres), `limit` obrigatório, devolver `eventos[]` por pessoa |
| 4 | `/checkin` + `GET/POST/DELETE /api/checkin` | `checkin` | `/eventos/checkin` | `eventos.checkin` | manter as 4 mensagens de diagnóstico e o carimbo por grupo; **expor o desfazer** (hoje sem tela) ou remover a rota; auditar check-in e desfazer; decidir leitura de QR (`SNI-INSCRICAO-<id>`) — não existe hoje; `localStorage["checkinEventoId"]` → preferência |
| 5 | `/relatorios` + `GET /api/inscricoes` | `relatorios` | `/eventos/relatorios` | `eventos.inscricoes.ver` | colunas (§3.3) e status acumulativo (§3.4) são a especificação; trazer `combo`, `credenciamentoPedido`, `pixRecibo`, `cortesiaMotivo`, `comprador` na consulta; filtros e ordenação podem ir para o servidor (16 mil pessoas × eventos); XLSX/PDF continuam no cliente ou viram rota; preferências `relatorios:*` → `public.preferencias` |
| 6 | Estatística (`relatorio-estatistica-pdf.ts`) | `relatorios` | idem | `eventos.inscricoes.ver` | substituir `isEvento` (nome contém "evento") por um marcador no tipo (`papel='principal'` ou flag "conta na estatística"); correspondência de regionais via `public.regionais`; logo de `Storage`; endereço da Sede de configuração |
| 7 | `/relatorios/campos` + `GET /api/relatorios/campos` | `relatorios` | `/eventos/relatorios/campos` | `eventos.inscricoes.ver` | CSV pode virar XLSX pela mesma lib |
| 8 | `/admin/eventos/[id]/vendas-por-dia` + API | `relatorios` (API) | `/eventos/admin/[id]/vendas-por-dia` | `eventos.inscricoes.ver` | `ORIGEM_SQL` vira `CASE` no Postgres; exibir a coluna `outro` |
| 9 | `/admin/eventos/[id]/conflitos` + API | `relatorios` (API) | `/eventos/admin/[id]/conflitos` | `eventos.inscricoes.ver` | idem |
| 10 | `/dashboard` + `GET /api/stats` | `dashboard` | `/eventos` | `eventos.inscricoes.ver` | **reescrever as métricas** sobre `inscricoes` por evento (hoje conta `Participant.checkinAt` legado) |
| 11 | `/admin/eventos` (lista) + `GET /api/eventos` | `eventos` | `/eventos/admin` | `eventos.gerir` (lista também serve venda/check-in/relatórios → `eventos.inscricoes.ver` para ler) | não devolver imagens na listagem; exclusão em cascata completa (combos, cupons, e-mails, comissão, orientadores, pedidos) ou bloqueio quando há inscrições |
| 12 | `/admin/eventos/novo`, `/admin/eventos/[id]` + `POST/PUT/DELETE /api/eventos*` | `eventos` | `/eventos/admin/novo`, `/eventos/admin/[id]` | `eventos.gerir` | cadastro em modal (AGENTS.md); criar evento + tipos numa transação; campos sem tela (`voucherLogoUrl`, `comprarLogoUrl`, `voucherRodape`) — decidir se entram na tela ou saem do esquema (rascunho manteve os três, `eventos_schema.sql:78-84`); `voucherMostrar*` → jsonb; cores padrão mudam no rascunho (`#132460`/`#B45309`, l.80-81) — confirmar |
| 13 | Tipos de convite (`/api/eventos/[id]/ingressos/**`) | `eventos` | Server Actions | `eventos.gerir` | manter: confirmação de mudança de preço, inativar × excluir com `usoDoTipo`, PATCH de ativo, campos personalizados com soft-delete; decidir se `quantidade`, `idadeMin/Max`, `vendaInicio/Fim` passam a valer no balcão (hoje não) |
| 14 | Combos (modal + `/admin/eventos/[id]/combos`) | `eventos` | um lugar só | `eventos.gerir` | aposentar a página antiga (sem janela/limite/parcelas); PUT transacional; DELETE deve checar inscrições |
| 15 | Cupons (`CuponsManager`) | `eventos` | idem | `eventos.gerir` | `valor` percentual × centavos (rascunho l.160) |
| 16 | `/admin/locais` + API | `locais` | `/eventos/admin/locais` | `eventos.gerir` | remover `contaCielo`; DELETE bloqueado se há evento; `public.locais` no plano de fundação vs `eventos.locais` no rascunho — decidir (§7.4) |
| 17 | `/admin/promotores` + API | `promotores` | `/eventos/admin/promotores` | `eventos.gerir` | logo em Storage; DELETE apaga `regional_avisos` |
| 18 | `/admin/orientadores` + API + por evento | `orientadores` / `eventos` | `/eventos/admin/orientadores` | `eventos.gerir` | foto em Storage; `evento_orientadores` com PK composta (rascunho) |
| 19 | `/admin/comissao` (padrões) + `/api/comissao/**` | `comissao` | `/eventos/admin/comissao` | `eventos.comissao.gerir` | **rotas GET hoje sem autenticação** → exigir capacidade; DELETE de setor com funções |
| 20 | `/admin/eventos/[id]/comissao` + `/api/eventos/[id]/comissao/**` | `eventos` | `/eventos/admin/[id]/comissao` | `eventos.comissao.gerir` | rascunho gravou `pessoa_id` **anulável** + `nome/telefone/email` (`eventos_schema.sql:268-278`) — hoje o membro é sempre participante; confirmar se "membro sem cadastro" é desejado (contradiz "pessoa no centro") |
| 21 | `/admin/eventos/[id]/importar-convites` + API | `participantes` | `/eventos/admin/[id]/importar` | `eventos.gerir` (+ `pessoa.gerir` para criar pessoas) | `maxDuration 60` → plano Pro; CPF validado pelo dígito (decisão 0004) em vez de aceitar qualquer 11 dígitos; cria pessoa em `public.pessoas` |
| 22 | Apagar inscrições do evento | `eventos` | idem | `eventos.gerir` | manter a confirmação por texto; auditar |
| 23 | `/admin/eventos/[id]/emails` + `/api/eventos/[id]/emails/**` | `eventos` | `/eventos/admin/[id]/emails` | `eventos.gerir` | `RichTextEditor` sem `data:` inline; ação `voucher` sem tela — remover ou implementar |
| 24 | `GET|POST /api/cron/emails` + `expirarPendentes` | `CRON_SECRET` (opcional) | job dentro de `/api/notificacoes/processar` ou rota própria fora do proxy | Bearer obrigatório | tirar o `?key=` da URL (vaza em logs); `CRON_SECRET` ausente deve **fechar** (como `sniconecta` já faz, `notificacoes/processar/route.ts:11-14`); orçamento diário/ritmo passam para o processador comum |
| 25 | `POST /api/email/send`, `POST /api/whatsapp/send` | públicos | rotas públicas do módulo (`/api/eventos/voucher/reenviar`) | — (magic link/`inscricaoId` + rate limit) | enfileirar; `chaveUnica = voucher:<âncora>:<janela>` |
| 26 | `POST /api/inscricoes/transferir` | `participantes` | Server Action | `eventos.inscricoes.gerir` | transação; `transferidoPor` → `pessoa_id`; e-mails enfileirados; rascunho só tem `transferido_para_id/transferido_de_id` (l.224-225) — faltam `transferido_em`, `transferido_por` |
| 27 | `GET|POST /api/inscricoes/trocar-titular` | `trocar-titular` | Server Action | `eventos.inscricoes.gerir` | manter `FOR UPDATE`, migração do valor no combo, apagar respostas; rascunho não tem `titular_trocado_por`, `titular_troca_motivo` (l.226-227) |
| 28 | `/admin/configuracoes` + `/api/admin/config` + `/api/admin/email/test` | `configuracoes` | `/eventos/configuracoes` (segredos do módulo) + `/admin/configuracoes` (comum) | `eventos.configurar` / `configuracao.gerir` | separar segredo × preferência; teste de envio pela fila; "Rodar migração" some |
| 29 | `/api/preferencias`, `/minha-conta` (tema) | sessão | comum | qualquer pessoa autenticada | `userId` → `pessoa_id` |
| 30 | `GET /api/branding`, `/api/branding/logo-relatorio` | público / sessão | URLs de Storage | — | `obterLogoRelatorio` deixa de baixar de `sni.org.br` em produção |
| 31 | Analytics (`layout.tsx`, `AnalyticsScripts`, `/api/analytics/*`) | público | **só nas rotas públicas do módulo**, nunca no painel | — | hoje o GA/Pixel carrega no painel inteiro (`layout.tsx:66-68`); risco LGPD já anotado em `docs/integracao-eventos.md` |

### 7.3 Lacunas do rascunho `supabase/rascunhos/eventos_schema.sql` frente a este recorte

| Item do sistema atual | No rascunho | Ação |
|---|---|---|
| `Inscricao.tipoVenda='transferencia'` (`transferir/route.ts:64`) | `check (tipo_venda in ('online','balcao','importado'))` (l.204) | adicionar `transferencia`; decidir se `importado` substitui `credenciamento` (hoje credenciamento é `formaPagamento`, e `tipoVenda` da planilha é `online`/`balcao`) |
| `Inscricao.transferidoParaInscricaoId`, `transferidoEm`, `transferidoPor`, `titularTrocadoPor`, `titularTrocaMotivo`, `cancelamentoAncoraId`, `canceladoPor` (e-mail), `observacao`, `numeroConvite` gravado no check-in | parcialmente (l.217-227) | completar |
| `Inscricao.cieloPaymentId/Method/Tid/AuthCode/Brand/Pix*` | só `cielo_order_id` (l.216) | jsonb `cielo` como em `pedidos` |
| Parcelas/autorização do cartão no balcão | não existe em lugar nenhum (nem hoje) | criar |
| `IngressoCampo.ativo` (soft-delete) | ausente (l.120-129) | adicionar |
| `Local.contaCielo` | removido (correto) | — |
| `Promotor.usarCorrespondenciaRegional`, `Regional.correspondeRegionalId` | ausentes | `public.regionais.corresponde_id` + flag no promotor |
| `EventoOrientador.id` | PK composta (l.95) | ok |
| `ComissaoMembro.setor/funcao` texto | mantido texto + campos novos | ver §7.2 #20 |
| `EmailAgendado`, `EmailEnvio`, `RegionalPromotorEmail`, `Configuracao`, `UserPreferencia`, `AuditLog`, `RateLimit` | "ainda não traduzidas" (l.295-302) | traduzir conforme §7.1 |
| `Evento.landing jsonb` | novo (l.87) | hoje não há campos além dos `voucher*`; definir o conteúdo ou remover |

### 7.4 Riscos e perguntas abertas

**Riscos encontrados no código (viram bug se ignorados):**
1. `GET /api/stats` conta `Participant.checkinAt` legado — dashboard congelado (§3.11).
2. Parcelas e nº de autorização do cartão no balcão não são persistidos (§1.2).
3. `POST /api/venda` aceita `status` arbitrário do cliente (§1.3).
4. Janela de venda, idade e quantidade do tipo **não valem no balcão**; só `ativo` e as regras de papel (§4.2).
5. Envio de e-mail dentro da requisição em venda, troca de titular e transferência (§1.8, §4.12-4.13).
6. `CRON_SECRET` ausente abre `/api/cron/emails`; segredo também aceito por query string (§5.5).
7. `GET /api/comissao/setores|funcoes`, `GET /api/cielo/api3/status`, `GET /api/regionais` (nomes) sem autenticação (§4.9, §1.5, §4.15).
8. `GET /api/admin/config` devolve segredos em claro; `NEXTAUTH_SECRET` com padrão hardcoded (§6.1, §6.3).
9. `DELETE /api/eventos/[id]` deixa combos, cupons, e-mails, comissão, orientadores e respostas órfãos; `DELETE /api/locais/[id]` não checa eventos (§4.1, §4.7).
10. `GET /api/eventos` devolve base64 de todos os eventos em toda tela operacional (§4.1).
11. Estatística depende do nome do tipo conter "evento" (§3.7).
12. Check-in não é auditado; desfazer existe só na API (§2.3-2.4).
13. GA/Pixel carregam no painel inteiro (§5.8).
14. Importação aceita CPF sem validar dígito verificador — rejeitado na migração (decisão 0004), mas a tela nova precisa validar na entrada.

**Perguntas para a Sede / decisão de arquitetura:**
1. Check-in por QR (`SNI-INSCRICAO-<id>`): implementar leitor na tela nova ou continuar por CPF?
2. Desfazer check-in: expor na tela (com auditoria) ou remover?
3. `quantidade`/`vendaInicio`/`vendaFim`/`idadeMin/Max` do tipo devem passar a valer no balcão?
4. Cortesia/credenciamento/pix do balcão continuam **sem** Cielo e com rastro manual? Alguma forma nova (ex.: Pix com QR da Cielo no balcão)?
5. Membro da comissão pode não ser pessoa cadastrada (rascunho) ou sempre é (`pessoas`)?
6. `Local`, `Promotor`, `Orientador`: comuns (`public.*`, como o plano de fundação lista `locais`) ou do módulo (`eventos.*`, como o rascunho)? O Ciclo também tem locais.
7. Frequência do cron: manter os 10 min via GitHub Actions ou aceitar 1×/dia (Hobby)? A régua "X dias antes do evento" e a expiração de Pix (QR vence em horas) não funcionam bem com 1×/dia.
8. Régua de e-mails: fica no módulo `eventos` ou vira recurso comum (o Ciclo pode querer "lembrete X dias antes da aula")?
9. Estatística: qual o critério oficial de "participante" — tipo com `papel='principal'`?
10. Rótulo/cabeçalho fixos "Seminário Especial da Prosperidade", "SNI Seminário", título do e-mail "Confirmação de inscrição em evento da SEICHO-NO-IE DO BRASIL", endereço da Sede: viram configuração ou dado do evento/promotor?
11. Correspondência de regionais (`correspondeRegionalId` + flag por promotor): mantém como regra de relatório ou se resolve no cadastro comum de regionais?
12. Preferências de filtro/colunas por usuário: comum (`public.preferencias`) — confirmar nome e forma.
13. Campos do evento sem tela (`voucherLogoUrl`, `comprarLogoUrl`, `voucherRodape`) e `Evento.landing jsonb`: entram na tela ou saem?
14. Cores padrão do voucher: `#1e3a5f/#f59e0b` (produção) ou `#132460/#B45309` (rascunho)?
