# Estudo — módulo `eventos`: fluxo de compra e pagamento

Levantamento do sistema em produção (`sni-ciclo`, Next 16 + MySQL no Railway)
para servir de base à REESCRITA do módulo `eventos` no SNI Conecta. Tudo aqui
foi lido do código; nada foi inferido de memória. Onde o código não faz algo,
está escrito "não encontrei" ou "não é imposto".

Convenção de citação: `arquivo:linha` relativo a `/home/user/sni-ciclo`. As
tabelas são do MySQL de produção, tal como o endpoint `/api/migrate` as cria
(`src/app/api/migrate/route.ts`, 1300 linhas, 102 `ALTER TABLE` idempotentes).

Arquivos lidos integralmente para este recorte (linhas): `src/lib/cielo.ts`
(682), `pedido.ts` (254), `combo.ts` (126), `ingresso-regras.ts` (176),
`ingresso-tipo.ts` (140), `expiracao.ts` (75), `cancelamento.ts` (188),
`inscricao-status.ts` (36), `pagamento.ts` (50), `voucher-data.ts` (214),
`voucher-pdf.ts` (332), `voucher-grupo.ts` (74), `voucher-acesso.ts` (45),
`voucher-codes.ts` (26), `signed-token.ts` (22), `campo-token.ts` (22),
`email-voucher.ts` (275), `rate-limit.ts` (98), `meta-capi.ts` (88),
`config.ts` (16), `cpf.ts` (30), `constants.ts` (138), `db.ts` (16);
`src/app/api/comprar/**` (14 rotas), `api/carrinho`, `api/cielo/**` (9 rotas),
`api/cielo-accounts/**`, `api/voucher/[id]/pdf`, `api/estornos`,
`api/inscricoes/**` (4 rotas), `api/eventos/**` (route, [id], ingressos,
ingressos/[id], campos, combos, combos/[id], cupons, cupons/[id]),
`api/email/send`, `api/whatsapp/send`, `api/analytics/purchase`,
`api/migrate`; páginas `e/[id]`, `comprar`, `comprar/pagamento`,
`comprar/confirmacao`, `admin/estornos`, `admin/cielo-contas`; componentes
`Voucher.tsx`, `CuponsManager.tsx`, `SelosSeguranca.tsx`; e, por grep
dirigido, `api/venda/route.ts`, `api/cron/emails/route.ts`,
`email-regional.ts`, `mailer.ts`, `permissions.ts`, `permissions-server.ts`,
`proxy.ts`, `vercel.json`.

Não há testes automatizados no repositório de origem (`find . -name
"*.test.ts"` fora de `node_modules` retorna vazio).

---

## 1. Esquema envolvido (como está em produção)

Sem chave estrangeira em nenhuma tabela. Dinheiro em `DECIMAL(10,2)`. Datas
em `DATETIME` sem fuso.

### 1.1 `PedidoPendente` — a tentativa de compra online

`api/migrate/route.ts:564-593`, `:1168`, `:1186-1187`.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | INT PK | vira `MerchantOrderId` (`SNI{id}q{qty}`, `SNIC{id}`, `SNI{id}`) |
| `compradorId` | INT NOT NULL | `Participant.id` |
| `compradorCpf` | VARCHAR(14) | só dígitos; usado em contagens de cupom/combo |
| `eventoId` | INT NOT NULL | |
| `ingressoTipoId` | INT NOT NULL | no combo é o 1º item, "âncora" (`combo-checkout/route.ts:260`) |
| `comboId` | INT NULL | preenchido só na compra de combo |
| `quantity` | INT DEFAULT 1 | nº de participantes (avulso); sempre 1 no combo |
| `cupomId` | INT NULL | |
| `valorOriginal` | DECIMAL(10,2) NOT NULL | preço UNITÁRIO de tabela (avulso) ou do combo |
| `descontoAplicado` | DECIMAL(10,2) DEFAULT 0 | desconto UNITÁRIO |
| `participantesJson` | TEXT | snapshot `ParticipanteSnapshot[]` (`pedido.ts:32-38`) |
| `status` | VARCHAR(20) DEFAULT 'pendente' | ver §2.1 |
| `cieloOrderId` | VARCHAR(40) | `MerchantOrderId` |
| `cieloPaymentId` | VARCHAR(40) | `PaymentId` da Cielo |
| `cieloPaymentMethod` | VARCHAR(20) | `'credit'` ou `'pix'` |
| `cieloTid`, `cieloAuthCode`, `cieloBrand` | VARCHAR | crédito |
| `cieloPixQrCode` TEXT, `cieloPixQrImage` LONGTEXT, `cieloPixExpiresAt` DATETIME | | Pix |
| `cieloReturnCode` VARCHAR(32), `cieloReturnMessage` VARCHAR(512) | | também recebe motivo de cancelamento |
| `inscricaoIds` | VARCHAR(255) | CSV dos ids de `Inscricao` gerados |
| `createdAt`, `updatedAt` | DATETIME | |

Índices: `cieloOrderId`, `cieloPaymentId`, `status`, `(status, cieloPixExpiresAt)`, `(status, createdAt)`.

### 1.2 `Inscricao` — o convite

Criação `api/migrate/route.ts:104-117`; colunas adicionadas em `:375-428`,
`:497-507`, `:658`, `:704`, `:1166-1170`, `:1244-1246`, `:1260`.

| Grupo | Colunas |
|---|---|
| Identidade | `id`, `participanteId` (titular), `eventoId`, `ingressoTipoId` (NULL possível), `comboId`, `numeroConvite`, `qrCode` (não usado no fluxo lido) |
| Venda | `formaPagamento` VARCHAR(100), `tipoVenda` VARCHAR(20) (`'online'`, `'balcao'`, `'transferencia'`), `dataPurchase`, `status` DEFAULT `'pago'`, `observacao` |
| Comprador | `compradorCpf`, `compradorId` (quem pagou; pode diferir do titular) |
| Dinheiro | `valorOriginal` DECIMAL NULL, `descontoAplicado` DECIMAL NOT NULL DEFAULT 0, `cupomId` |
| Cielo | `cieloOrderId`, `cieloPaymentId`, `cieloPaymentMethod`, `cieloTid`, `cieloAuthCode`, `cieloBrand`, `cieloPixQrCode`, `cieloPixQrImage`, `cieloPixExpiresAt`, `cieloReturnCode`, `cieloReturnMessage` (copiadas do pedido em `pedido.ts:181-190`) |
| Balcão | `credenciamentoPedido`, `pixData` DATE, `pixRecibo`, `cortesiaMotivo` |
| Agrupamento | `compraGrupoId` VARCHAR(36) (UUID por participante por compra) |
| Transferência de evento | `transferidoParaEventoId`, `transferidoParaInscricaoId`, `transferidoEm`, `transferidoPor`, `origemTransferenciaId` |
| Cancelamento | `canceladoEm`, `canceladoPor`, `cancelamentoMotivo`, `cancelamentoAncoraId` |
| Estorno (só na âncora) | `estornoValor`, `estornoForma` VARCHAR(20), `estornoStatus` VARCHAR(20), `estornoEfetuadoEm`, `estornoEfetuadoPor`, `estornoComprovante`, `estornoObservacao` |
| Troca de titular | `titularAnteriorId`, `titularTrocadoEm`, `titularTrocadoPor`, `titularTrocaMotivo` |
| Presença | `checkinAt` |

### 1.3 Catálogo do evento

- `IngressoTipo` (`:82-95`, `:672`, `:705`, `:1110-1112`, `:1207`): `eventoId`,
  `nome`, `descricao` VARCHAR(500), `vendaInicio`, `vendaFim`, `quantidade`
  INT DEFAULT **999**, `valor` DECIMAL(10,2), `maxParcelas` INT DEFAULT 1,
  `idadeMin`, `idadeMax`, `unicoPorCpf` TINYINT, `papel` VARCHAR(20) DEFAULT
  `'adicional'`, `exigePrincipal` TINYINT, `exibirVendaPublica` TINYINT
  DEFAULT 1, `ativo` TINYINT DEFAULT 1.
- `IngressoCampo` (`:128-139`): `ingressoTipoId`, `label`, `tipo` (`'texto'`
  | `'select'`), `opcoesJson` TEXT, `obrigatorio`, `ordem`, `ativo`.
- `InscricaoResposta` (`:150-159`): `inscricaoId`, `campoId`, `label`
  (snapshot), `valor` TEXT.
- `Combo` (`:1127-1138`, `:1164-1165`): `eventoId`, `nome`, `descricao`,
  `valor` DECIMAL, `quantidade` INT NULL, `vendaInicio`, `vendaFim`, `ativo`,
  `limitePorCpf` INT NULL, `maxParcelas` INT DEFAULT 1.
- `ComboItem` (`:1141-1146`): `comboId`, `ingressoTipoId`, `quantidade` INT DEFAULT 1.
- `Cupom` (`:350-367`, `:1172`): `eventoId`, `codigo` VARCHAR(50), `descricao`,
  `tipo` ENUM(`'percentual'`,`'valor'`), `valor` DECIMAL(10,2), `ingressoTipoId`
  NULL, `comboId` NULL, `vigenciaInicio`, `vigenciaFim`, `maxUsosTotal`,
  `maxUsosPorCpf`, `ativo`; UNIQUE `(eventoId, codigo)`.
- `Evento` (`:53-73`, `:457-459`, `:508-509`, `:607-609`): além do básico,
  `slug` UNIQUE, `ativo`, `cieloAccountId`, `comprarLogoUrl` LONGTEXT e a
  personalização do voucher: `voucherBannerUrl` LONGTEXT, `voucherLogoUrl`
  LONGTEXT, `voucherCorPrimaria` DEFAULT `'#1e3a5f'`, `voucherCorSecundaria`
  DEFAULT `'#f59e0b'`, `voucherBoasVindas`, `voucherInstrucoes`,
  `voucherRodape`, `voucherMostrarParticipante|Evento|Ingresso|QRCode|Pagamento`
  TINYINT DEFAULT 1. Imagens são data-URLs base64 dentro do banco.
- `Local.contaCielo` VARCHAR(255) (`:42`, `:169`): existe, é editável em
  `admin/locais`, mas **não é lida por `cielo.ts`** (grep em `src` só acha
  a tela e a rota de locais). Coluna morta para o pagamento.

### 1.4 Infra do fluxo

- `CieloAccount` (`:552-561`): `nome` UNIQUE, `merchantId` VARCHAR(40),
  `merchantKey` VARCHAR(80) **em claro**, `environment` VARCHAR(20) DEFAULT
  `'production'`, `isDefault` TINYINT. Semeada a partir de
  `Configuracao.cielo.*` se vazia (`:624-652`).
- `MagicLink` (`:474-485`): `token` VARCHAR(64) PK **em claro**,
  `participanteId`, `eventoId`, `ingressoTipoId`, `quantity`, `expiresAt`,
  `usedAt`.
- `CarrinhoAbandonado` (`:772-787`): UNIQUE `(eventoId, cpf)`;
  `ingressoTipoId`, `participanteId`, `nome`, `email`, `telefone`, `quantity`,
  `convertido`, `updatedAt`.
- `RateLimit` (`:1014-1021`): `bucket`, `identifier` VARCHAR(190), `createdAt`.
- `Configuracao` (`:326-330`) chaves usadas aqui: `pendenteExpiraHoras`
  (semeada `'24'`, `:1089-1091`), `cielo.merchantId/merchantKey/environment`
  (legado), `cielo.mpi.*`, `smtp.*`, `whatsapp.token/phoneNumberId/template`,
  `meta.pixelId/capiToken/capiTestCode`, `logoUrl`, `sniLogoUrl`.
- `RegionalPromotorEmail` (`:1277-1286`): e-mail da regional por promotor,
  destino do aviso de nova compra.

---

## 2. Máquinas de estado

### 2.1 `PedidoPendente.status`

Valores encontrados: `'pendente'`, `'confirmado'`, `'cancelado'`, `'expirado'`.
Nenhum ENUM; a coluna é VARCHAR.

| De | Para | Quem dispara | Onde |
|---|---|---|---|
| — | `pendente` | checkout avulso pago | `api/comprar/checkout/route.ts:367-391` (INSERT + UPDATE `cieloOrderId = 'SNI{id}q{qty}'`) |
| — | `pendente` | checkout combo pago | `api/comprar/combo-checkout/route.ts:251-271` (`cieloOrderId = 'SNIC{id}'`) |
| — | `pendente` | operador de balcão gera cobrança Cielo | `api/cielo/link/route.ts:80-93` (`'SNI{id}'`, `requirePermissao("venda")` em `:19`) |
| `pendente` | `confirmado` | `confirmarPedido()` | `lib/pedido.ts:74-246`; grava `inscricaoIds` (CSV) em `:223-226` |
| `pendente` | `cancelado` | `cancelarPedido()` | `lib/pedido.ts:249-254`; guarda motivo em `cieloReturnMessage` |
| `pendente` | `expirado` | `expirarPendentes()` | `lib/expiracao.ts:55-65`; Pix pelo `cieloPixExpiresAt`, resto pela idade (`createdAt` + `pendenteExpiraHoras`) |
| `expirado` | `confirmado` | webhook / polling / autorização | `api/cielo/webhook/route.ts:36,59` aceita explicitamente `expirado`; `api3/status/route.ts:24-45` e `api3/autorizar/route.ts:49-154` **não testam `expirado`**, só `confirmado`/`cancelado` |
| `expirado` | `cancelado` | webhook com status negativo | `webhook/route.ts:43,85` |
| `cancelado` | (novo Pix) | `api3/pix/route.ts:21` só bloqueia `confirmado` — um pedido `cancelado` ou `expirado` ainda gera QR novo | **defeito**: status terminal não é respeitado |

Quem chama `confirmarPedido`:

1. `api/cielo/api3/autorizar/route.ts:154` — cartão aprovado
   (`mapCieloStatus` ∈ {1,2}).
2. `api/cielo/api3/status/route.ts:45` — polling do Pix a cada 4 s
   (`comprar/pagamento/page.tsx:114-133`).
3. `api/cielo/webhook/route.ts:41` (compat v1 por `order_number`) e `:81`
   (por `PaymentId`).

O que `confirmarPedido` faz (`lib/pedido.ts`): idempotência em `:79-81` (só se
`status === 'confirmado' && inscricaoIds`); monta linhas por participante
(`:99-160`); combo expande `ComboItem × quantidade`, preço só na 1ª linha,
`cupomId` só na 1ª linha, `compraGrupoId` UUID por participante (`:119-146`);
INSERT em `Inscricao` com `tipoVenda='online'`, `status='pago'`,
`dataPurchase=NOW()`, `formaPagamento` ∈ {`'cielo-pix'`, `'cielo-credito'`,
`'cielo'`} derivado de `cieloPaymentMethod` (`:94-97`); respostas em
`InscricaoResposta` (`:214-220`); `UPDATE PedidoPendente SET status='confirmado',
inscricaoIds` (`:223-226`); marca `CarrinhoAbandonado.convertido=1` (`:229-232`);
dispara `avisarRegionalNovaCompraEmLote` **dentro da requisição**, via
`sendMail` (`:240-243`; `lib/email-regional.ts:215-230`).

⚠️ `confirmarPedido` **não abre transação nem trava a linha**. A checagem de
idempotência é read-then-write: webhook e polling chegando juntos (é o caso
normal do Pix: o navegador consulta a cada 4 s enquanto a Cielo notifica)
passam ambos pela linha 79 e inserem `Inscricao` em dobro. Nada no esquema
impede (não há UNIQUE em `(participanteId, eventoId, ingressoTipoId)`).

Não há `UPDATE ... WHERE status='pendente'` em nenhuma transição do pedido: a
transição é sempre `SET status = X WHERE id = ?`.

### 2.2 `Inscricao.status`

Default `'pago'` (`api/migrate/route.ts:113`). Valores encontrados no código:
`'pago'`, `'pendente'`, `'cancelado'`, `'expirado'`, `'transferido'`.

| De | Para | Quem | Onde |
|---|---|---|---|
| — | `pago` | compra online paga | `lib/pedido.ts:192-198` (`tipoVenda='online'`) |
| — | `pago` | compra online gratuita (total 0) — **sem** `PedidoPendente` | avulso `api/comprar/checkout/route.ts:324-356` (`formaPagamento='gratuito'`); combo `combo-checkout/route.ts:198-240` |
| — | `pago` (ou o `status` que vier no corpo) | venda balcão | `api/venda/route.ts:97,244,255-262` (`tipoVenda='balcao'`, `formaPagamento` ∈ dinheiro, cartao, pix, credenciamento, cortesia, cielo…). A tela só envia `'pago'`; a API aceita qualquer string |
| — | `pago` | transferência de evento (destino) | `api/inscricoes/transferir/route.ts:60-73` (`formaPagamento='transferencia'`, `tipoVenda='transferencia'`, valor 0/0, `origemTransferenciaId`) |
| — | `pago` | importação de planilha | `api/eventos/[id]/importar-convites/route.ts:304,334` (`tipoVenda` `'online'`/`'balcao'`) — fora deste recorte, citado para completar a lista |
| `pago` | `cancelado` | operador com permissão `cancelamentos` | `api/inscricoes/cancelar/route.ts:193-205`, transação com `FOR UPDATE` (`:110-118`); todas as unidades do grupo + `cancelamentoAncoraId`; a âncora recebe `estornoValor/Forma/Status/Observacao` |
| `pago` | `transferido` | operador com `participantes` | `api/inscricoes/transferir/route.ts:106-112` — **sem transação** (INSERT do destino em `:60`, UPDATE da origem em `:106`) |
| `pendente` | `expirado` | cron | `lib/expiracao.ts:68-72` (idade de `dataPurchase`) |
| `pago` | `pago` (troca de dono) | operador com `trocar-titular` | `api/inscricoes/trocar-titular/route.ts:259-265`, transação com `FOR UPDATE` (`:181-189`); move `valorOriginal/descontoAplicado` para uma irmã do combo (`:243-252`), apaga `InscricaoResposta` (`:257`) |

Bloqueios de cancelamento (`cancelar/route.ts:24-39`): já cancelado, expirado,
transferido, veio de transferência (`origemTransferenciaId`), check-in feito.
Bloqueios de troca de titular (`trocar-titular/route.ts:30-42`): cancelado,
expirado, transferido, check-in feito; e as regras de convite valem para o
destinatário (`:216-231`).

Não há transição `cancelado → pago` (reativação) nem `transferido → pago`.
Não encontrei `UPDATE Inscricao SET status='pago'` fora da criação; o antigo
POST público que fazia isso foi removido (`api/comprar/inscricao/route.ts:32-35`).

### 2.3 Sub-máquina `Inscricao.estornoStatus` (só na âncora)

`NULL` (nunca cancelado) → definido no cancelamento (`cancelar/route.ts:148-162`):

| Condição | `estornoStatus` | `estornoValor` |
|---|---|---|
| `formaEstornoDe(formaPagamento) === 'sem_estorno'` (gratuito, cortesia, transferencia) | `'sem_estorno'` | 0 |
| âncora com `valorOriginal IS NULL` (balcão antigo sem valor) | `'pendente'` | NULL ("conferir pelo recibo") |
| total líquido ≤ 0 | `'sem_estorno'` | 0 |
| senão | `'pendente'` | soma de `valorLiquido` das linhas |

`'pendente'` → `'efetuado'`: `api/estornos/route.ts:87-93`, `UPDATE ... WHERE
id=? AND estornoStatus='pendente'` (idempotente por predicado), grava
`estornoEfetuadoEm/Por/Comprovante`. `estornoForma` ∈ `pix | cartao | dinheiro
| sede | sem_estorno` (`lib/cancelamento.ts:14-38`), derivada da forma de
pagamento; o operador não escolhe.

### 2.4 "Ativa" e "vale presença"

`lib/inscricao-status.ts:3-15`: ativa = `status NOT IN ('cancelado','expirado')`
— é o que conta para vaga, cupom, unicidade por CPF e combo. `:24-36`: vale
presença = também exclui `'transferido'` — é o que o voucher e o check-in usam.
`'pendente'` conta como ativa (ocupa cota) e como "vale presença" (o voucher
abre em modo "aguardando", `voucher-grupo.ts:52`).

### 2.5 Expiração

`lib/expiracao.ts:51-75`, chamada só por `api/cron/emails/route.ts:177`. O
cron está em `vercel.json` como `0 9 * * *` (**uma vez por dia**, plano Hobby);
o comentário em `expiracao.ts:48-49` ("a cada 10 min") está desatualizado.
Janela em `Configuracao.pendenteExpiraHoras` (default 24, `:11-15`), a mesma
usada para o vencimento do QR Pix (`api3/pix/route.ts:103-105`). A Cielo não
recebe prazo por transação (comentário em `pix/route.ts:99-102`); o vencimento
é só do sistema.

---

## 3. Regras de convite

### 3.1 O que o tipo de convite (`IngressoTipo`) controla

| Campo | Onde é imposto | Como |
|---|---|---|
| `ativo` | checkout `checkout/route.ts:153-158` (409); combo `combo-checkout/route.ts:80-83`; listagem `comprar/eventos/[id]/route.ts:56-66`; balcão `venda/route.ts:203-208`; `lib/combo.ts:81-86` | Tipo inativo não vende em canal nenhum e some dos combos. Exclusão física só sem uso (`lib/ingresso-tipo.ts:44-104`; `ingressos/[ingressoId]/route.ts:200-215`) |
| `exibirVendaPublica` | checkout `:163-174` (403); listagens `comprar/eventos/route.ts:29-44`, `comprar/eventos/[id]/route.ts:46-66`, `e/[id]/page.tsx:92-99,177-179` | Oculto do público, vendável no balcão |
| `vendaFim` | listagens filtram (`comprar/eventos/[id]/route.ts:65`; `e/[id]/page.tsx:237-239`) | **Não é checado em `/api/comprar/checkout`** |
| `vendaInicio` | só a landing marca "Em breve" e não gera link (`e/[id]/page.tsx:427-431,519-525`) | **Nem a listagem `/api/comprar/eventos*` nem o checkout filtram**; `/comprar?evento=&ingresso=` compra antes da data |
| `quantidade` | **não é estoque**. Comentário em `combo-checkout/route.ts:16-18`: "a plataforma não controla estoque por tipo de ingresso (quantidade é informativa)". No cliente vira teto do seletor de quantidade por compra: `max = quantidade ?? 20` (`comprar/page.tsx:1648-1659`) | Default 999 (`migrate:89`) |
| `idadeMin`/`idadeMax` | exibidos na landing (`e/[id]/page.tsx:471-478`) | **Não imposto**: nenhuma rota compara com `Participant.dataNascimento` (grep em `src/app/comprar`, `src/app/api/comprar`, `src/lib` só acha exibição) |
| `maxParcelas` | resumo `api3/resumo/route.ts:58` → select de parcelas na tela (`pagamento/page.tsx:108-111,421-435`) | **Não validado no servidor**: `autorizar/route.ts:91` aceita qualquer `installments ≥ 1` |
| `valor` | preço de tabela lido do banco no checkout (`checkout/route.ts:138,150`) | Mudança de preço com vendas exige `confirmarMudancaValor` (`ingressos/[ingressoId]/route.ts:48-69`); histórico congelado em `Inscricao.valorOriginal` |
| `unicoPorCpf`, `papel`, `exigePrincipal` | ver §3.2 | |

### 3.2 Papel principal/adicional, dependência e unicidade

`lib/ingresso-regras.ts`. `getTipoRegra` (`:24-59`) lê `papel`,
`exigePrincipal`, `unicoPorCpf`. `checarRegraPapelIngresso` (`:117-150`), para
UM participante e UM tipo, na ordem:

1. `unicoPorCpf`: recusa se já existe inscrição **ativa** do mesmo tipo para o
   `participanteId` no evento (`:121-126`, `temMesmoTipoAtivo :78-91`).
2. `papel === 'principal'`: recusa se já existe inscrição ativa de qualquer
   tipo `principal` no evento (`:129-136`, `temPrincipalAtivo :62-75`) — um
   principal exclui o outro.
3. `papel === 'adicional' && exigePrincipal`: exige principal ativo OU
   `principalNoMesmoPedido` (combo que traz um principal) (`:139-147`).

Observações:
- A checagem é por `participanteId`, não por CPF (o cadastro admite CPF
  repetido: `migrate:178-182`, índice único removido; `:1071-1083` cria índice
  não-único). O nome "por CPF" é histórico.
- Conta `'pendente'` como ativa, mas **não conta `PedidoPendente`**: dois
  pedidos abertos do mesmo CPF para um tipo `unicoPorCpf` passam os dois; o
  segundo só falha se o primeiro já tiver virado `Inscricao`.
- Aplicada em: checkout avulso para cada participante do snapshot
  (`checkout/route.ts:291-304`), combo só para o comprador com
  `principalNoMesmoPedido` (`combo-checkout/route.ts:108-130`), balcão
  (`venda/route.ts:165-197`), troca de titular (`trocar-titular/route.ts:216-231`).
  **Não** é aplicada na transferência de evento (`transferir/route.ts` não
  importa `ingresso-regras`).
- `validarUmPrincipal` (`:158-176`): um combo não pode ter dois tipos
  `principal` (usado em `combos/route.ts:61` e `combos/[comboId]/route.ts:24`).
- Defaults neutros: `papel='adicional'`, `exigePrincipal=0`, `unicoPorCpf=0`
  — sem configuração, nada bloqueia.

### 3.3 Combos

Leitura para venda: `lib/combo.ts:38-102` (`carregarComboParaVenda`) — exige
`ativo`, janela `vendaInicio/vendaFim`, ≥ 2 unidades depois de expandir
`ComboItem.quantidade`, nenhum tipo inativo. Estoque e limite:
`checarEstoqueCombo` (`:109-126`): `vendidos = floor(inscrições ativas com
comboId / unidades) + SUM(quantity) de PedidoPendente pendente`; `doCpf` idem
filtrando `compradorCpf`; recusa se `vendidos + 1 > quantidade` ou `doCpf + 1
> limitePorCpf`. O checkout público repete a mesma conta inline
(`combo-checkout/route.ts:84-106`).

Regras da compra pública de combo (`combo-checkout/route.ts`):
- Só o comprador é titular; `quantity = 1`; **sem participantes adicionais**,
  **sem campos personalizados** (`respostas: []`, `:194`); comentário `:11-18`.
- Cupom revalidado no servidor (`:134-190`): restrito a combo → tem de ser
  este; restrito a tipo → o tipo precisa compor o combo (`:159-168`).
- Gratuito (total 0): cria uma `Inscricao` por unidade, `formaPagamento='gratuito'`,
  preço na 1ª (`:197-240`).
- Pago: `PedidoPendente` com `comboId`, `ingressoTipoId = unidades[0]`,
  `valorOriginal = Combo.valor`, `descontoAplicado = desconto` (`:251-267`).

Admin (`api/eventos/[id]/combos/route.ts`, `[comboId]/route.ts`): POST exige
`nome` e ≥ 2 itens com `ingressoTipoId` (`:56-60`); PUT substitui itens numa
transação (`[comboId]/route.ts:30-63`, sem `FOR UPDATE`); DELETE apaga itens e
combo sem checar inscrições existentes (`:71-86`) — **combo vendido pode ser
apagado**, deixando `Inscricao.comboId` órfão (os JOINs são LEFT).

### 3.4 Cupons

Modelo (§1.3). Validação pública em `api/comprar/cupom/route.ts:25-176` e
revalidação no checkout (`checkout/route.ts:40-106` para avulso;
`combo-checkout/route.ts:134-190` para combo):

| Regra | Público (`cupom/route.ts`) | Checkout avulso | Checkout combo |
|---|---|---|---|
| código | `trim().toUpperCase()`, busca por `(eventoId, codigo)` `:28,46-49` | por `id` (`:51-55`) — o cliente manda `cupomId` | por `id` |
| `ativo` | `:55` | `:57` | `:146` |
| vigência | `:59-65` | `:59-61` | `:149-154` |
| alvo `comboId` | só naquele combo `:67-72` | recusa em avulso `:63-65` | tem de ser o mesmo `:156-158` |
| alvo `ingressoTipoId` | avulso: igual; combo: tipo compõe o combo `:73-88` | igual `:66-68` | tipo compõe o combo `:160-168` |
| `maxUsosTotal` | conta só `Inscricao` ativas `:90-107` | `Inscricao` ativas **+ `PedidoPendente` pendentes** `:70-82` | idem `:169-180` |
| `maxUsosPorCpf` | por `compradorCpf`, só inscrições `:109-127` | inscrições + pedidos `:84-96` | idem `:182-184` |
| desconto | percentual: `+(preco*pct/100).toFixed(2)`; valor: `min(preco, valor)` `:147-152` | idem `:98-104` | idem sobre o valor do combo `:186-188` |

Consequências: a prévia pública pode dizer "válido" e o checkout recusar (o
público não vê pedidos pendentes). Uso = 1 por `Inscricao` avulsa (quantidade
N consome N usos, `checkout:80`), e 1 por combo (cupom só na 1ª linha,
`pedido.ts:137-139`). Troca de titular não mexe em `cupomId`
(`trocar-titular/route.ts:239-242`); cancelamento libera o uso porque a
contagem ignora `'cancelado'`. Rate limit da validação pública: 15 tentativas /
10 min por `IP:evento` (`cupom/route.ts:41`). Admin: DELETE vira `ativo=0` se
houver uso (`cupons/[cupomId]/route.ts:90-103`); PATCH aceita só campos da
lista `:9-12`; POST zera `ingressoTipoId` quando há `comboId` (`cupons/route.ts:133`).

### 3.5 Campos personalizados e respostas

Definição por tipo em `IngressoCampo`; sincronização inteira por PUT
(`ingressos/[ingressoId]/campos/route.ts:46-117`): atualiza os que têm id,
insere os novos, `ativo=0` nos ausentes (respostas antigas não ficam órfãs);
`select` sem opções é descartado (`:80`). Listagem pública com `opcoes`
parseadas (`comprar/eventos/route.ts:46-77`).

No checkout avulso (`checkout/route.ts:183-209`): carrega campos ativos,
`validarRespostas` exige os obrigatórios para o comprador (`buyerRespostas`) e
para cada adicional (`p.respostas`), gera snapshot `{campoId, label, valor}`
que viaja em `participantesJson` e vira `InscricaoResposta` na confirmação
(`pedido.ts:214-220`) ou na hora, se gratuito (`checkout:335-341`). A tela vai
ao passo `participantes` mesmo com 1 pessoa quando há campos
(`comprar/page.tsx:759-780`). Transferência copia respostas por `label`
igual (`transferir/route.ts:76-102`); troca de titular apaga (`trocar-titular:257`).
Combos ignoram campos.

---

## 4. Integração Cielo

### 4.1 Credenciais e múltiplas contas

`lib/cielo.ts:62-119` (`getCieloCreds(eventoId?)`), ordem: (1) `Evento.cieloAccountId`
→ `CieloAccount`; (2) `CieloAccount.isDefault = 1`; (3) primeira `CieloAccount`
por id; (4) legado `Configuracao.cielo.merchantId/Key/environment`; (5)
`process.env.CIELO_MERCHANT_ID/KEY/ENVIRONMENT`. `environment` normalizado:
`'sandbox'` ou `'homologacao'` → sandbox; qualquer outro → production
(`:94-98`, `:113-116`).

CRUD de contas: `api/cielo-accounts/route.ts` (GET com `merchantKey`
mascarada, exige sessão; POST exige `cielo`), `[id]/route.ts` (PUT mantém a
chave se vier vazia `:28-38`; DELETE zera `Evento.cieloAccountId` das que a
usavam `:56-57`). Só uma `isDefault` (zera as outras em `:40-42`, `:25-27`).
Tela `admin/cielo-contas/page.tsx` com botão de diagnóstico.

⚠️ `api/cielo/api3/tokenize/route.ts:31` chama `getCieloCreds()` **sem
`eventoId`**: o `CardToken` nasce na conta padrão, mas `autorizar` usa a conta
do evento (`autorizar/route.ts:60`). Com contas distintas por evento, o token
não pertence ao merchant que autoriza. Só funciona hoje porque, na prática, o
evento usa a conta padrão. `Local.contaCielo` não participa (§1.3).

### 4.2 Funções exportadas de `lib/cielo.ts`

Constantes `:5-10`: `PROD_API https://api.cieloecommerce.cielo.com.br`,
`PROD_QUERY https://apiquery.cieloecommerce.cielo.com.br`, `SBX_API
https://apisandbox.cieloecommerce.cielo.com.br`, `SBX_QUERY
https://apiquerysandbox.cieloecommerce.cielo.com.br`, `MPI_API
https://mpi.braspag.com.br`, `MPI_SBX https://mpisandbox.braspag.com.br`.
Headers `:147-154`: `MerchantId`, `MerchantKey`, JSON.

| Função | Linhas | Endpoint | Payload enviado | Resposta usada | Erros |
|---|---|---|---|---|---|
| `CieloApiError` | 37-46 | — | — | `status`, `body`, `op`, `wwwAuthenticate` | classe lançada por todas as chamadas |
| `getCieloCreds(eventoId?)` | 62-119 | — | — | `{merchantId, merchantKey, environment}` ou `null` | engole erro de tabela ausente |
| `getMpiCreds()` | 123-145 | — | `Configuracao.cielo.mpi.*` | `MpiCredsFull` | `null` sem clientId/secret |
| `tokenizeCard(input, creds)` | 166-188 | `POST {api}/1/card/` | `CustomerName` (≤255), `CardNumber` (sem espaços), `Holder` (≤25), `ExpirationDate` MM/AAAA, `Brand` | `CardToken` | HTTP ≠ 2xx → `CieloApiError('tokenize')`; sem token → 502 `tokenize-empty` |
| `authorizeCredit(input, creds)` | 233-316 | `POST {api}/1/sales` | `MerchantOrderId`, `Customer{Name, Identity (só dígitos), IdentityType, Email?}`, `Payment{Type:'CreditCard', Amount (centavos), Installments ≥1, Capture:true, Authenticate: !!externalAuth, CreditCard{CardToken ou CardNumber, Holder, ExpirationDate, Brand, SecurityCode?}, SoftDescriptor (≤13 alfanum.), ExternalAuthentication?{Eci, Version, ReferenceID, Cavv?, Xid?}}` | `Payment.PaymentId, Status, ReturnCode, ReturnMessage, Tid, AuthorizationCode, ProofOfSale, CreditCard.Brand` | `CieloApiError('authorize')`; lança `Error` se não há token nem número |
| `createPix(input, creds)` | 335-378 | `POST {api}/1/sales` | `MerchantOrderId`, `Customer{Name, Identity, IdentityType}`, `Payment{Type:'Pix', Provider:'Cielo2', Amount}` | `PaymentId` (ou `Paymentid`), `QrCodeBase64Image` (ou `QrcodeBase64Image`), `QrCodeString`, `Status` (default 12), `ReturnCode/Message` | `CieloApiError('pix')` |
| `getPayment(paymentId, creds)` | 390-419 | `GET {query}/1/sales/{PaymentId}` | headers apenas | `PaymentId, Status, ReturnCode, ReturnMessage, Type` | `CieloApiError('getPayment')` |
| `getMpiAccessToken(mpi)` | 423-446 | `POST {mpi}/v2/auth/token`, `Authorization: Basic base64(clientId:clientSecret)` | `EstablishmentCode, MerchantName (≤25), MCC` | `access_token, expires_in` | `CieloApiError('mpi-token')` |
| `probeCredentials({merchantId, merchantKey})` | 475-638 | `/1/card/` + `/1/sales` crédito (cartão 4111…, R$1,00, `Capture:false`) + `/1/sales` Pix, em prod E sandbox | `DiagnoseProbe[]` com `ok = status ∉ {401,403}` | nunca lança |
| `mapCieloStatus(n)` | 647-651 | — | 1,2 → `'pago'`; 3,10,11,13 → `'cancelado'`; resto (0,12,20…) → `'pendente'` | | |
| `detectBrand(pan)` | 654-670 | — | Visa, Amex, Hipercard, Diners, Discover, JCB, Elo (BINs), Master | | duplicada de forma mais pobre em `pagamento/page.tsx:29-41` |
| `isAuthenticatedEci(eci, brand)` | 676-682 | — | Master: 01/02; demais: 05/06 | | não chamada por rota alguma |

**Não existem** funções de captura separada, cancelamento/void
(`PUT /1/sales/{id}/void`), consulta por `MerchantOrderId`, nem cartão de
débito. Grep por `void`, `refund`, `checkout.cielo`, `cielocheckout` em `src`
não acha nada além de rótulos.

### 4.3 Rotas que usam a Cielo

| Rota | Auth | O que faz | Linhas-chave |
|---|---|---|---|
| `POST /api/cielo/api3/tokenize` | pública, sem rate limit | recebe PAN, `holder`, `expirationDate`, `customerName`, `brand?`; `detectBrand`; devolve `{cardToken, brand}`; em 401/403 roda `probeCredentials` e devolve dica | `tokenize/route.ts:16-91` |
| `POST /api/cielo/api3/autorizar` | pública, sem rate limit | exige `pedidoId, cardToken, brand, holder, expirationDate`; se `confirmado` devolve ids; calcula centavos; `authorizeCredit` com `Capture:true`, `softDescriptor 'SNISeminario'`; persiste `cieloPaymentId/Method='credit'/Tid/AuthCode/Brand/ReturnCode/Message`; pago → `confirmarPedido`; negado → `cancelarPedido` | `autorizar/route.ts:18-183` |
| `POST /api/cielo/api3/pix` | pública | reaproveita QR vivo (`:26-41`); senão `createPix`, grava QR + `cieloPixExpiresAt = now + pendenteExpiraHoras` | `pix/route.ts:9-136` |
| `GET /api/cielo/api3/status?pedidoId` | pública | polling: `confirmado`/`cancelado` respondem do banco; senão `getPayment` e aplica `mapCieloStatus` (pode confirmar ou cancelar) | `status/route.ts:11-68` |
| `GET /api/cielo/api3/resumo?pedidoId` | pública | total, `maxParcelas` (do combo ou do tipo), comprador (**nome, CPF, e-mail, telefone**), Pix vivo, `inscricaoId` se confirmado | `resumo/route.ts:9-85` |
| `GET /api/cielo/api3/mpi-token` | pública | 204 sem MPI; senão token do Braspag | `mpi-token/route.ts:11-34` |
| `POST/GET /api/cielo/api3/diagnose` | `requirePermissao("cielo")` | `probeCredentials` por credencial ad hoc, `accountId` ou padrão; veredito ok/partial/rejected | `diagnose/route.ts:16-126` |
| `POST /api/cielo/link` | `requirePermissao("venda")` | balcão: cria `PedidoPendente` (tipo ou combo, valor do combo lido do banco, `checarEstoqueCombo`) e devolve `/comprar/pagamento?pedidoId=` | `link/route.ts:18-100` |
| `POST /api/cielo/webhook` | nenhuma | ver §4.5 | `webhook/route.ts:21-97` |

### 4.4 Checkout hospedado × API 3.0 × "link"

Só a **API e-Commerce 3.0** está em uso: tokenização (`/1/card`), autorização
com captura automática (`/1/sales`), Pix (`/1/sales` com `Provider: Cielo2`) e
consulta (`apiquery`). O Checkout Cielo hospedado **não existe no código**; o
rótulo `"cielo" → "Cielo (Link)"` (`lib/pagamento.ts:12`) e o ramo
`order_number` do webhook (`webhook/route.ts:27-49`, "compat com Checkout v1")
são resquício de dados antigos. O "link de pagamento" atual é interno: a rota
`/api/cielo/link` gera um `PedidoPendente` e a URL da própria página
`/comprar/pagamento`, onde o cliente paga por cartão ou Pix.

Cartão: PAN passa pelo servidor uma vez (`tokenize`), nunca é persistido;
`CardToken` + CVV vão em `autorizar`. Não há salvamento de cartão para reuso.

### 4.5 Webhook (`api/cielo/webhook/route.ts`)

- **Assinatura: não há.** Nenhum header é verificado. A defesa é não confiar
  no corpo: sempre `getPayment` na Cielo antes de mudar status (`:15-16`,
  `:71-78`).
- Corpo aceito: `PaymentId | paymentId | payment_id` (`:24-25`); fallback
  `order_number | OrderNumber` (`:31`) → `getPedidoByCieloOrderId` e só age se
  o pedido já tem `cieloPaymentId` (`:36`).
- Pedido inexistente → `{ok:true, ignored:true}` (`:52-56`). Status
  `confirmado`/`cancelado` → `alreadyFinalized` (`:59-61`). `pendente` e
  `expirado` seguem (`:57-61`).
- Atualiza: `confirmarPedido` (pago) ou `cancelarPedido` com `"Webhook: Cielo
  status=N"` (`:80-88`). Não grava `ChangeType` nem log da notificação.
- Idempotência: só a de `confirmarPedido` (§2.1, não atômica).
- `GET` responde `{ok:true}` (`:95-97`) — a Cielo testa a URL.
- Sem credenciais → 503 (`:63-69`); falha de consulta → 502 (`:75-77`).
- Fica fora de `src/proxy.ts` (matcher só cobre `/dashboard`, `/participantes`,
  `/checkin`, `/relatorios`, `/minha-conta`, `proxy.ts:9-17`).

### 4.6 Estorno

**O sistema não movimenta dinheiro.** `api/estornos/route.ts:9-11` e o aviso na
tela (`admin/estornos/page.tsx:123-130`): a Sede faz o estorno fora (Pix,
portal da Cielo, caixa) e a tela só registra. Fluxo completo:

1. Operador cancela (`/api/inscricoes/cancelar`, permissão `cancelamentos`).
   `GET` mostra prévia (linhas, total, forma, bloqueio) `:42-87`; `POST` exige
   `motivo ≥ 5` chars `:106-108`, abre transação, `resolverGrupoCancelamento`
   com `FOR UPDATE` (`lib/cancelamento.ts:89-188`: avulso = só ele; combo =
   unidades do mesmo participante por `compraGrupoId` → `cieloOrderId` →
   `credenciamentoPedido` → inferência conservadora ou recusa), escolhe a
   âncora (`escolherAncora :72-76`, maior valor líquido, empate menor id),
   grava status/estorno (§2.2, §2.3), alerta quando unidades do combo foram
   cedidas a outro titular (`cancelar/route.ts:164-190`).
2. Fila `GET /api/estornos?status=pendente|efetuado|sem_estorno|todos&eventoId=`
   (permissão `estornos`), até 500 linhas, mostra titular E comprador (`:34-56`).
3. `POST /api/estornos {inscricaoId, comprovante?}` → `'efetuado'` (`:68-112`),
   auditoria `estorno-efetuado`.

`PedidoPendente` não participa do estorno. Não há reversão automática na
Cielo, nem estorno parcial, nem estorno de pedido pago que nunca virou
inscrição.

### 4.7 Sandbox

Por conta (`CieloAccount.environment`), com URLs em `cielo.ts:5-8,19-27`.
`probeCredentials` testa os dois ambientes e o diagnóstico sugere em qual a
credencial vale (`diagnose/route.ts:92-114`). Não há chave de sandbox por
evento nem modo de teste global; um evento apontado para conta sandbox vende
"de mentira" com a mesma UI.

### 4.8 3DS / MPI (Braspag)

Código completo em `lib/cielo.ts:121-145,192-198,262-271,423-446,676-682` e
`api/cielo/api3/mpi-token`, mas a página de pagamento **não carrega o script
`bpmpi` nem envia `externalAuth`** (grep em `src/app` e `src/components` não
acha `bpmpi`/`mpi-token`/`externalAuth` fora das rotas). Toda transação é
não autenticada (`Authenticate: false`), liability com a loja.

---

## 5. Fluxo do checkout público

### 5.1 Endpoints, autenticação e rate limits

Rate limit: `lib/rate-limit.ts:23-70`, janela deslizante em tabela `RateLimit`,
**fail-open** em erro de banco (`:66-69`), IP por `x-real-ip` → `x-forwarded-for`
(`:77-83`). `limparRateLimit` (`:91-98`) devolve a trava de idempotência.

| Endpoint | Autenticação | Rate limit (limite / janela / chave) | Linhas |
|---|---|---|---|
| `GET /api/comprar/eventos` | nenhuma | — | `comprar/eventos/route.ts` |
| `GET /api/comprar/eventos/[id]` | nenhuma | — | `comprar/eventos/[id]/route.ts` |
| `GET /api/comprar/listas` | nenhuma | — | regionais/organizações |
| `POST /api/comprar/identify {cpf}` | nenhuma; valida DV | 8/15 min `ip:cpf` + 50/10 min `ip` | `identify/route.ts:44-54` |
| `POST /api/comprar/auth {cpf, telefone}` | prova de posse: últimos 9 dígitos do telefone (`:41-45`) | 8/15 min `ip:cpf` | `auth/route.ts:19` |
| `POST /api/comprar/magic-link/request {cpf, email, eventoId?, ingressoTipoId?, quantity?}` | e-mail tem de bater com o cadastro (`:44-48`); sempre 200 | 5/15 min `ip:cpf` | `request/route.ts:31` |
| `POST /api/comprar/magic-link/verify {token}` | token hex 16–128 (`:22`); uso único (`usedAt`, `:34-35,50`); TTL 30 min (`request:9`) | — | `verify/route.ts` |
| `POST /api/comprar/register` | nenhuma; DV + organização obrigatórios | 8/15 min `ip:cpf` | `register/route.ts:24` |
| `POST /api/comprar/lookup {cpf}` | nenhuma; devolve só nome/regional/organização | 6/15 min `ip:cpf` + 40/10 min `ip` | `lookup/route.ts:22-23` |
| `POST /api/comprar/atualizar {id, cpf, …}` | `(id, cpf)` têm de bater (`:29-39`) | 15/15 min `ip:cpf` | `atualizar/route.ts:24` |
| `POST /api/comprar/cupom` | nenhuma | 15/10 min `ip:evento` | `cupom/route.ts:41` |
| `POST /api/carrinho` | nenhuma | — | `carrinho/route.ts` |
| `POST /api/comprar/checkout` | **nenhuma**: confia em `buyerId` do corpo (`:111-127`) | **nenhum** | `checkout/route.ts` |
| `POST /api/comprar/combo-checkout` | **nenhuma** (`:23-25`) | **nenhum** | `combo-checkout/route.ts` |
| `GET /api/cielo/api3/resumo` | **nenhuma** — expõe nome, CPF, e-mail, telefone por `pedidoId` sequencial | — | `resumo/route.ts:22-64` |
| `POST /api/cielo/api3/tokenize|autorizar|pix`, `GET status` | nenhuma | — | §4.3 |
| `GET /api/comprar/inscricao?id&vt` | token `vt` só se trocou de titular; sessão dispensa | 120/5 min `ip` | `inscricao/route.ts:15-26` |
| `GET /api/voucher/[id]/pdf?vt` | idem | 60/5 min `ip` | `voucher/[id]/pdf/route.ts:23-32` |
| `POST /api/email/send {inscricaoId}` | nenhuma; dados derivados no servidor | 20/h `ip` + trava 1/60 s por âncora (`voucher-email`) | `email/send/route.ts:37-68` |
| `POST /api/whatsapp/send {inscricaoId}` | nenhuma | 20/h `ip` | `whatsapp/send/route.ts:29` |
| `POST /api/analytics/checkout`, `/purchase` | nenhuma | — | CAPI |

Não há sessão do comprador: o "login" (telefone ou magic link) só devolve o
objeto `participant` ao navegador (`auth/route.ts:51-63`;
`verify/route.ts:53-70`), e o cliente reenvia `buyerId` no checkout
(`comprar/page.tsx:841`). Qualquer um que saiba um `Participant.id` (inteiro
sequencial) abre pedido em nome dele e vê seu resumo.

### 5.2 Passo a passo (`src/app/comprar/page.tsx`)

Máquina de passos `:98-108`: `eventos → ingresso → identify → (phone |
magicEmail → magicSent | register) → participantes → confirmar → redirect`.

1. **Entrada.** `/e/[slug|id]` (landing, SSR, `e/[id]/page.tsx:61-185`) lista
   tipos visíveis e combos; cada card leva a `/comprar?evento=&ingresso=` ou
   `?combo=` (`:430`, `:589`). `/comprar` sem parâmetros lista eventos
   ativos (`/api/comprar/eventos`). Deep-links pré-selecionam evento
   (`:288-293`), tipo e `qty` (`:321-332`), combo (`:925-935`).
2. **Ingresso.** Seletor de quantidade 1..`quantidade ?? 20` (`:1645-1663`);
   cupom (`applyCupom :373-418`, revalidado ao mudar item/quantidade
   `:282-285,336-371`); CPF no mesmo passo (`:1317-1320`). Combo e avulso se
   excluem (`:906-920`).
3. **Identificação.** `handleIdentify` (`:420-465`) → `identify`. Encontrado:
   com telefone → passo `phone` (`handlePhone :476-502` → `/api/comprar/auth`);
   sem telefone e com e-mail → `magicEmail` (`handleMagicLinkRequest
   :504-527`) → `magicSent`; o link `/comprar?token=…&evento&ingresso&qty`
   volta e `verify` autentica (`:530-569`), removendo o token da URL
   (`:551-553`). Não encontrado → `register` (`handleRegister :627-659`).
4. **Participantes.** Se `quantity > 1` ou o tipo tem campos (`goAfterIngresso
   :764-780`): uma linha por adicional com lookup de CPF (`handleCpfLookup
   :675-740`), bloqueio de CPF repetido/do comprador (`:695-708`), respostas
   por pessoa. Combo pula direto ao checkout (`:766-768`).
5. **Confirmar.** Comprador edita e-mail/regional/organização/associação;
   `handleCheckout` (`:782-871`) chama `/api/comprar/atualizar` se mudou
   (`:808-835`) e depois `/api/comprar/checkout` com `buyerId, eventoId,
   ingressoTipoId, cupomId, buyerRespostas, participants[]`.
6. **Servidor** (`checkout/route.ts:108-404`): carrega comprador/evento/tipo;
   tipo ativo e público; organização obrigatória; campos; cria/atualiza
   `Participant` dos adicionais **antes** de qualquer pagamento (`:245-277`,
   com `COALESCE(NULLIF(?,''), col)`); regras de papel por participante;
   cupom; `precoUnitarioFinal = max(0, +(preco - desc).toFixed(2))`,
   `totalAmount = +(unit × qty).toFixed(2)` (`:320-321`). Total 0 → cria
   `Inscricao` direto e devolve `paymentUrl = /comprar/confirmacao?inscricaoId=`
   (`:324-356`). Total > 0 → exige credenciais Cielo (503 sem elas), cria
   `PedidoPendente` e devolve `/comprar/pagamento?pedidoId=` (`:358-399`).
7. **Redirecionamento** `window.location.href = paymentUrl` (`:866`, `:898`).
8. **Pagamento** (`comprar/pagamento/page.tsx`): carrega `resumo` (`:83-104`;
   se já confirmado, vai à confirmação). Aba cartão: validação local, `tokenize`
   → `autorizar` com `installments` (`:136-226`); aprovado → confirmação;
   negado → mensagem `ReturnCode ReturnMessage`. Aba Pix: `handleGerarPix`
   (`:228-255`), QR + copia-e-cola, polling `/api/cielo/api3/status` a cada
   4 s (`:114-133`) até `pago` (redireciona) ou `cancelado`.
9. **Confirmação** (`comprar/confirmacao/page.tsx`): polling
   `/api/comprar/inscricao?id&vt` a cada 4 s por até 180 s (`:22-49`); estado
   `waiting` enquanto `status='pendente'`; `pago` renderiza `<Voucher>`,
   botões imprimir e "Baixar PDF" (`/api/voucher/{id}/pdf?vt=`, `:136-143`).

### 5.3 Carrinho abandonado

Ao entrar em `participantes`/`confirmar` com comprador e tipo escolhidos, o
navegador faz `POST /api/carrinho` (`comprar/page.tsx:584-599`) — upsert por
`(eventoId, cpf)` (`carrinho/route.ts:15-37`, `ON DUPLICATE KEY UPDATE`). Não
registra combos (só `ingressoTipoId`). Marcação `convertido=1` em três lugares:
`checkout/route.ts:344-347` (gratuito), `combo-checkout/route.ts:229-232`
(gratuito), `lib/pedido.ts:229-232` (pago). Quem consome a tabela é a régua
de e-mails (`api/cron/emails`, fora do recorte). No mesmo efeito dispara
`InitiateCheckout` (Pixel + `/api/analytics/checkout`) com dedup em
`localStorage` (`:601-622`).

### 5.4 Confirmação: e-mail e WhatsApp

Os dois são disparados **pelo navegador** na tela de confirmação, uma vez por
`inscricaoId`, com dedup em `localStorage` (`confirmacao/page.tsx:51-93`):
`POST /api/email/send` se há e-mail, `POST /api/whatsapp/send` se há telefone.
Consequências: se o comprador fechar a aba antes do Pix cair (o webhook
confirma depois), **ninguém recebe voucher**; troca de navegador reenvia.

- E-mail: `lib/email-voucher.ts:95-220` — destinatário e conteúdo derivados
  do `inscricaoId` (âncora do grupo), PDF anexado (`:162-173`), assunto
  `"Inscrição confirmada — {evento}"`, rótulo de pagamento sem adquirente
  (`lib/pagamento.ts:22-33`). Envio SMTP síncrono via `sendMail`
  (`lib/mailer.ts:66`), `maxDuration = 60` (`email/send/route.ts:17-18`).
- WhatsApp: `api/whatsapp/send/route.ts:12-99` — Meta Cloud API
  `graph.facebook.com/v19.0/{phoneNumberId}/messages`, template
  `whatsapp.template` (default `sni_confirmacao`), 4 parâmetros: nome, evento,
  nº da inscrição, `voucherUrl` com token `vt`. Recusa `cancelado`; telefone
  recebe prefixo 55.
- Aviso à regional: `avisarRegionalNovaCompraEmLote` em `confirmarPedido`
  (síncrono, lotes de 3, `lib/email-regional.ts:215-230`) — sai mesmo sem a
  tela de confirmação, ao contrário do voucher.
- Reenvio pelo painel usa o mesmo `/api/email/send` (comentário `:13-16`).

### 5.5 Analytics

`Purchase`: Pixel + `gtag` + CAPI (`confirmacao/page.tsx:95-128`). O valor do
cliente é `ingressoValor` (preço de tabela de UM convite, `:103`), enquanto o
servidor manda o líquido da inscrição âncora (`analytics/purchase/route.ts:33-36`)
— em combo ou quantidade > 1 o valor reportado não é o total pago. `event_id
= insc-{id}` para dedup. E-mail e telefone vão hasheados (`lib/meta-capi.ts:37-38`).

---

## 6. Voucher

### 6.1 Identidade do voucher

O voucher é da **pessoa no evento**, não da inscrição: grupo = todas as
`Inscricao` com `status='pago'` do `participanteId` no `eventoId`, âncora =
menor id (`lib/voucher-grupo.ts:51-65`); inscrição não paga fica sozinha
(`:52`). O nº do pedido exibido é a âncora (`Voucher.tsx:362`;
`voucher-pdf.ts:281`), não o `PedidoPendente.id` nem o `cieloOrderId`.

### 6.2 Dados (`lib/voucher-data.ts:111-214`)

Query em `:127-149`: inscrição âncora com `inscricaoValePresencaSql` (some se
cancelado/expirado/transferido), participante (nome, CPF, e-mail, telefone,
regional, organização), tipo, evento (nome, datas, promotor, todas as colunas
`voucher*`), local (nome, cidade, UF, endereço, bairro, telefone), comprador.
Enriquecimento: `itens` do grupo (`:50-76`: nome/descrição/valor do tipo,
`valorPago = max(0, valorOriginal - descontoAplicado)`, combo, `checkinAt`),
`valorTotal` (soma dos `valorPago`, ou preço de tabela se nenhuma linha tem
valor, `:194-197`), logos (`logoUrl`, `sniLogoUrl` da `Configuracao` com cache
de 60 s, `:12-32`; `Promotor.logoUrl/telefone/email`, `:160-176`),
`responsavelNome` só quando comprador ≠ titular (`:179-182`), `voucherToken`
(`:204`). Remove `compradorCpf`/`compradorNome` da resposta (`:184-187`).

Acesso (`lib/voucher-acesso.ts`): `vt = HMAC-SHA256(NEXTAUTH_SECRET,
"voucher:{inscricaoId}:{participanteId}")[0:24]` (`signed-token.ts:7-9`);
exigido **só** quando `titularAnteriorId IS NOT NULL` (`voucher-data.ts:118-122`);
sessão do sistema ou cron dispensam (`interno`). Links: `voucherUrl` →
`/comprar/confirmacao?inscricaoId=&vt=`, `voucherPdfUrl` (`:36-44`).

### 6.3 Códigos e QR (`lib/voucher-codes.ts`)

- QR: `SNI-INSCRICAO-{ancoraId}` (`:19-21`), PNG 320 px via `qrcode`.
- Código: `shortCode("v|{id}|{cpf}", 5)` (`:24-26`) — hash djb2 sobre alfabeto
  sem 0/O/1/I/L (`:6-16`); determinístico, sem segredo.
- "Senha": `shortCode("s|{id}|{cpf}", 6)` só na tela (`Voucher.tsx:152,388-392`);
  o PDF não a imprime (`voucher-pdf.ts:219-221` imprime só o código). Não
  encontrei quem confere a senha.

### 6.4 PDF (`lib/voucher-pdf.ts:110-332`)

`pdf-lib` + `@pdf-lib/fontkit`, A4 retrato, fontes Figtree (regular/bold) e
Platypi Bold embutidas em base64 (`lib/figtree-font.ts`, `platypi-font.ts`),
subset. Layout: barra institucional azul `#02509d` com `sniLogoUrl` e
"Evento da SEICHO-NO-IE DO BRASIL" (`:139-183`), arte do evento
(`voucherBannerUrl`, até 200 pt, aparo pelo centro simulado com retângulos
brancos, `:149-167`), filete na cor primária só sem arte (`:185-192`), logo
do promotor/evento/sistema + título Platypi (`:194-208`), QR 150 pt + código
(`:210-223`), campos condicionados por `voucherMostrar*` (`:237-282`):
participante, regional, responsável; convites (lista, combo, total); local;
nº do pedido; "Informações" (`voucherBoasVindas` + `voucherInstrucoes`,
`:284-296`), `voucherRodape` (`:298-302`), rodapé institucional com contato do
promotor (`:304-329`, `lib/institucional.ts`). Imagens remotas com timeout de
8 s (`:65-72`); só PNG/JPEG. Rota `GET /api/voucher/[id]/pdf` (`runtime nodejs`,
`Content-Disposition: attachment`).

### 6.5 Tela (`components/Voucher.tsx`)

Mesmo desenho em React (210 mm, `window.print`), com os mesmos códigos, mais
"Senha", "Quantidade" (`itens.length`), "Utilizar em", forma de pagamento
pública + parcelas (`parcelas` nunca é preenchido pelo `getVoucherData`),
`tipoVenda` Balcão/Online, `dataPurchase`, telefone do participante. Modo
`preview` com faixa de exemplo para o admin (`:271-288`).

### 6.6 Personalização por evento

Colunas `Evento.voucher*` (§1.3), editadas em `POST/PUT /api/eventos`
(`eventos/route.ts:41-57`, `[id]/route.ts:55-77`) com teto de 1,5 MB por
imagem base64 (`:64-73`). O `Promotor.logoUrl` tem precedência sobre
`voucherLogoUrl` (`voucher-pdf.ts:195`; `Voucher.tsx:292-294`). A landing
reutiliza banner, cores, boas-vindas e instruções (`e/[id]/page.tsx`).

---

## 7. Dinheiro

### 7.1 Onde é DECIMAL e onde vira número

`DECIMAL(10,2)`: `IngressoTipo.valor`, `Combo.valor`, `Cupom.valor`,
`PedidoPendente.valorOriginal/descontoAplicado`,
`Inscricao.valorOriginal/descontoAplicado/estornoValor`. O driver `mysql2`
devolve DECIMAL como **string**; por isso os tipos declaram `number | string`
(`pedido.ts:13-14`; `cancelamento.ts:48-49`; `checkout:30`) e todo consumo faz
`Number(...)`: `pedido.ts:90-91`, `checkout:150`, `combo.ts:94`,
`cupom/route.ts:145,149,151`, `voucher-data.ts:64-71`, `cancelamento.ts:63-65`,
`resumo/route.ts:48-50`, `autorizar:66`, `pix:44`, `email-voucher.ts:147-150`,
`analytics/purchase:33-36`.

### 7.2 Arredondamentos encontrados

| Onde | Fórmula |
|---|---|
| desconto percentual unitário | `+(preco × pct/100).toFixed(2)` — `checkout:100`, `combo-checkout:187`, `cupom:149` |
| desconto valor fixo | `min(preco, valor)` sem arredondar |
| unitário final | `max(0, +(preco - desc).toFixed(2))` — `checkout:320`, `cupom:153`, `combo-checkout:191` |
| total exibido/retornado | `+(unitFinal × qty).toFixed(2)` — `checkout:321,353,397`; `cupom:154-155`; `comprar/page.tsx:946-947`, `:1310-1315` |
| total no resumo | `+(max(0, valorOriginal - desconto) × quantity).toFixed(2)` — `resumo:50` |
| **centavos para a Cielo** | `Math.round(max(0, valorOriginal - desconto) × 100 × quantity)` — `autorizar:65-69`, `pix:43-47` (multiplica ANTES de arredondar; fórmula diferente da do total exibido) |
| parcela exibida | `total / n` sem arredondar — `pagamento/page.tsx:430` (só exibição; a Cielo divide) |
| valor pago por linha (voucher) | `max(0, +(bruto - desc).toFixed(2))` — `voucher-data.ts:71`; total `+soma.toFixed(2)` `:196` |
| valor líquido (cancelamento) | `valorOriginal - descontoAplicado` sem arredondar — `cancelamento.ts:63-65`; soma `cancelar:139` |
| CAPI | `Number(value.toFixed(2))` — `meta-capi.ts:55` |

Convenções de gravação: preço e desconto são **unitários** no pedido e na
inscrição avulsa (quantidade multiplica); no combo o preço inteiro fica na 1ª
linha e 0 nas demais (`pedido.ts:139-141`; `combo-checkout:207-208`;
`venda:250-251`), e a troca de titular migra o valor para uma irmã
(`trocar-titular:243-252`). Cortesia grava `valorOriginal = tabela` e
`descontoAplicado = tabela` (líquido 0, `venda:225-230`). Transferência grava
0/0. Balcão antigo pode ter `valorOriginal NULL` (`cancelar:70-72,143`).

### 7.3 O que muda com centavos inteiros (decisão do AGENTS.md)

- Colunas `*_centavos integer` com `check (>= 0)`; `Cupom.valor` vira
  `percentual smallint` (0–100) **ou** `centavos integer` conforme `tipo` (o
  rascunho `supabase/rascunhos/eventos_schema.sql` já faz isso).
- Regra de arredondamento única e testada em `src/lib/dominio/dinheiro.ts`:
  desconto percentual = `round(valor_centavos × pct / 100)` com regra
  explícita (half-up). Hoje é `toFixed(2)`, que herda o binário do float
  (`(1.005).toFixed(2) === "1.00"`); replicar bit a bit não é objetivo —
  documentar que centavos podem diferir em ±1 dos históricos e migrar o
  histórico por conversão exata (`DECIMAL × 100`).
- Manter a semântica "unitário × quantidade" ou gravar o total no pedido? O
  novo esquema tem `pedidos.valor_original_centavos`/`desconto_centavos`
  unitários e `quantidade`; o total da cobrança deve ser calculado uma vez
  (`unit_final × qty`) e **gravado** para a Cielo e para o resumo não
  divergirem (§7.2 tem duas fórmulas).
- `Amount` da Cielo já é inteiro em centavos: some a conversão `× 100`.
- Formatação só na borda (`Intl.NumberFormat`), com `Num`/`.num` do design
  system.
- Estorno: `estorno_valor_centavos` nullable preserva o caso "não registrado".

---

## 8. Checklist de porte para `src/modulos/eventos`

Mapeamento das permissões atuais (`lib/permissions.ts:10-31`) para as
capacidades de `src/lib/permissoes.ts` do SNI Conecta:

| Hoje (`requirePermissao`) | Capacidade | Rotas |
|---|---|---|
| `eventos` | `eventos.gerir` | eventos CRUD, ingressos, campos, combos, cupons |
| `venda` | `eventos.vender` | `/api/cielo/link`, `/api/venda` |
| `relatorios` | `eventos.inscricoes.ver` | `GET /api/inscricoes` |
| `cancelamentos`, `participantes` (transferir), `trocar-titular` | `eventos.inscricoes.gerir` | cancelar, transferir, trocar-titular |
| `estornos` | `eventos.estornos.gerir` | `/api/estornos` |
| `cielo`, `configuracoes` | `eventos.configurar` | contas Cielo, diagnose, `/api/migrate` (some) |
| só sessão (`GET` de eventos, ingressos, combos, cupons, contas) | `eventos.inscricoes.ver` ou `eventos.gerir` — decidir | hoje qualquer operador logado lê tudo, inclusive `merchantId` |

Checklist:

- [ ] **Sessão do comprador.** `eventos.magic_links` com `token_hash` (hoje em
  claro), TTL, uso único, e cookie assinado/HttpOnly emitido por
  `auth`/`verify`/`register`. `checkout`, `combo-checkout`, `atualizar`,
  `resumo`, `autorizar`, `pix`, `status` só aceitam o `pessoa_id` do cookie —
  nunca do corpo. Rate limit em `checkout`/`combo-checkout`/`tokenize`.
- [ ] **`confirmarPedido` atômico.** `BEGIN; SELECT ... FROM eventos.pedidos
  WHERE id=$1 FOR UPDATE;` se `status='confirmado'` devolve `inscricao_ids`;
  senão insere inscrições, respostas, `UPDATE pedidos SET status='confirmado',
  inscricao_ids`, `COMMIT`. É o único ponto por onde webhook, polling e
  autorização passam. Sem isso o Pix duplica convite (§2.1).
- [ ] **Reserva na compra com `FOR UPDATE`.** Em `checkout`/`combo-checkout`
  e no balcão, dentro de uma transação: travar `eventos.ingresso_tipos` (ou
  `combos`) da compra e o cupom (`SELECT ... FOR UPDATE`) e usar
  `pg_advisory_xact_lock(hashtext(pessoa_id||evento_id))` por participante
  antes de contar `unico_por_cpf`/principal/`limite_por_cpf`/usos de cupom;
  contar `pedidos.status='pendente'` **também** nas regras de papel (hoje só
  cupom e combo contam pendentes). Só então inserir o pedido.
- [ ] **Estoque de verdade ou não?** `quantidade` do tipo hoje é informativa
  (§3.1). Decidir com a Sede: se virar estoque, entra na mesma transação;
  se não, renomear para `maximo_por_compra` (é o que o cliente faz) e o
  rascunho do esquema (`quantidade ... a plataforma não controla estoque`)
  já assume isso.
- [ ] **Janela de venda no servidor.** Checar `venda_inicio`/`venda_fim` do
  tipo no checkout (hoje só `venda_fim` na listagem) e a idade
  (`idade_min/max` × `pessoas.data_nascimento`) — ou remover os campos.
- [ ] **`max_parcelas` no servidor** (`autorizar` aceita qualquer valor).
- [ ] **Status terminais.** `pix`, `autorizar` e `status` recusam pedido
  `cancelado`; definir se `expirado` pode ser confirmado (webhook aceita
  hoje; é desejável para Pix pago tarde) e registrar a decisão.
- [ ] **Transições por predicado.** Todo `UPDATE pedidos/inscricoes SET
  status` com `WHERE status IN (...)` e `affectedRows` conferido.
- [ ] **Transferência de evento em transação** e com regras de papel no
  destino.
- [ ] **Estorno**: manter fila manual (decisão da Sede) ou integrar
  `PUT /1/sales/{PaymentId}/void` (cartão) / devolução Pix. Documentar
  `estorno_status` como sub-máquina da inscrição âncora.
- [ ] **Webhook** em `/api/eventos/cielo/webhook`, fora do proxy; validar por
  re-consulta (como hoje) e, se a Cielo oferecer, por IP/assinatura; gravar
  cada notificação em `eventos.cielo_notificacoes` (payload, `PaymentId`,
  resultado) para auditoria e reprocesso.
- [ ] **Tokenização na conta do evento.** `tokenize` recebe `pedidoId` e usa
  `getCieloCreds(evento_id)`; `contas_cielo.merchant_key_cifrada` via
  `src/lib/cripto.ts`, sem GRANT.
- [ ] **Voucher e-mail/WhatsApp pelo servidor.** Enfileirar em
  `notificacoes` dentro de `confirmarPedido` (e nos caminhos gratuitos), não
  no navegador; idem aviso à regional. Reenvio manual continua existindo.
- [ ] **Expiração** por cron da plataforma (mesmo `pendente_expira_horas`
  em `configuracoes`), com `UPDATE ... WHERE status='pendente'` (já é seguro
  sem lock).
- [ ] **Cupom**: uma função de domínio pura (`aplicarCupom`) usada pela prévia
  e pelo checkout, com a mesma contagem (inscrições ativas + pedidos
  pendentes) para as duas telas não divergirem.
- [ ] **Combo**: impedir DELETE com inscrições (inativar), como já se faz com
  tipo; manter "preço na 1ª linha" ou mover o total para `pedidos` e deixar
  `inscricoes` com rateio — decidir antes da migração de dados.
- [ ] **PII**: `resumo` devolve só o necessário; `Participant.cpf` deixa de
  ser "não único"; `legado_id` preserva ids para links antigos
  (`/comprar/confirmacao?inscricaoId=`).
- [ ] **Remover**: MPI/3DS morto (ou ativar de fato), `Local.contaCielo`,
  `Inscricao.qrCode`, `numeroConvite` (confirmar uso na importação), rótulo
  "Cielo (Link)", ramo `order_number` do webhook.
- [ ] **Analytics/Meta**: passa pelo jurídico (risco 2 de
  `docs/integracao-eventos.md`); se ficar, valor = total pago do grupo.
- [ ] **Testes de domínio** (não existem hoje): regras de papel, cupom,
  expansão de combo, arredondamento em centavos, resolução de grupo de
  cancelamento (os 4 caminhos de `resolverGrupoCancelamento`), tokens.

---

## 9. Riscos e perguntas abertas

Riscos (defeitos observados no código, não hipóteses):

1. Checkout sem autenticação e sem rate limit: `buyerId` vem do cliente
   (`checkout/route.ts:111-127`); `resumo` expõe CPF/e-mail/telefone por
   `pedidoId` sequencial (`resumo/route.ts:22-64`).
2. `confirmarPedido` sem transação: corrida webhook × polling duplica
   inscrições (`pedido.ts:74-81`).
3. Voucher só sai se o comprador abrir a tela de confirmação
   (`confirmacao/page.tsx:51-93`).
4. `tokenize` usa a conta padrão, não a do evento (`tokenize/route.ts:31`).
5. `pix` gera QR para pedido cancelado/expirado (`pix/route.ts:21`);
   `autorizar` não testa `expirado` (`autorizar/route.ts:49`).
6. `vendaInicio`, `idadeMin/Max`, `quantidade` e `maxParcelas` não são
   impostos no servidor (§3.1).
7. Regras de papel não contam pedidos pendentes (§3.2); prévia de cupom e
   checkout contam de formas diferentes (§3.4).
8. Transferência sem transação (`transferir/route.ts:60-112`); DELETE de
   combo vendido (`combos/[comboId]/route.ts:71-86`); DELETE de evento apaga
   inscrições em cascata manual (`eventos/[id]/route.ts:169-171`).
9. `MagicLink.token` e `CieloAccount.merchantKey` em claro; segredo HMAC
   com fallback fixo `"sni-signed-token-secret"` (`signed-token.ts:3`).
10. E-mails síncronos na requisição (`magic-link/request`, `email/send`,
    aviso à regional em `confirmarPedido`).
11. Cron 1×/dia expira pedidos; o comentário fala em 10 min.
12. Meta Pixel/CAPI em página que, na plataforma, identifica pessoa da
    espinha comum.

Perguntas para a Sede/produto:

1. `IngressoTipo.quantidade` deve virar estoque real (com reserva) ou é só
   "máximo por compra"?
2. Pedido `expirado` pago depois: confirmar (como o webhook faz) ou estornar?
3. Estorno continua manual (fila) ou integra com a Cielo?
4. Idade mínima/máxima: impor com `data_nascimento` obrigatória, ou remover?
5. Combo: manter "só o comprador, sem campos personalizados"? Manter preço
   na 1ª linha ou total no pedido?
6. "Senha" do voucher (`shortCode s|…`) tem uso no check-in? Não encontrei.
7. 3DS: ativar (liability shift) ou remover o código do MPI?
8. Analytics/Pixel nas páginas públicas: fica?
9. Quem pode ler `merchantId` e a lista de contas: hoje qualquer operador
   logado (`cielo-accounts/route.ts:8-21`).
