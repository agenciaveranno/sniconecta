# Esquema do MySQL de origem — Credenciamento

Lido em 06/09/2026 pelo Console do Railway, com o comando 1 de
`scripts/esquema-origem.sql`. 31 tabelas.

Formato de cada linha: `Tabela :: coluna tipo [!] [chave] [extra]`, onde `!`
marca NOT NULL, `PRI`/`UNI`/`MUL` é o tipo de índice e `auto_increment` /
`DEFAULT_GENERATED` vêm do MySQL.

⚠️ Este arquivo é o CONTRATO da origem. Quando uma fase da migração falhar por
coluna inexistente, é aqui que se confere — e é aqui que se atualiza, relendo
do banco, se a origem mudar.

```
AuditLog :: id int ! PRI auto_increment | userEmail varchar(255) MUL | acao varchar(80) ! | entidade varchar(80) MUL | entidadeId varchar(80) | detalhes text | ip varchar(64) | createdAt datetime MUL DEFAULT_GENERATED
CarrinhoAbandonado :: id int ! PRI auto_increment | eventoId int ! MUL | ingressoTipoId int | participanteId int | nome varchar(255) | email varchar(255) | telefone varchar(30) | cpf varchar(14) | quantity int ! | convertido tinyint(1) ! MUL | createdAt datetime DEFAULT_GENERATED | updatedAt datetime DEFAULT_GENERATED on update CURRENT_TIMESTAMP
CieloAccount :: id int ! PRI auto_increment | nome varchar(100) ! UNI | merchantId varchar(40) ! | merchantKey varchar(80) ! | environment varchar(20) ! | isDefault tinyint(1) ! | createdAt datetime DEFAULT_GENERATED
Combo :: id int ! PRI auto_increment | eventoId int ! MUL | nome varchar(255) ! | descricao varchar(500) | valor decimal(10,2) ! | quantidade int | vendaInicio datetime | vendaFim datetime | ativo tinyint(1) ! | createdAt datetime DEFAULT_GENERATED | limitePorCpf int | maxParcelas int !
ComboItem :: id int ! PRI auto_increment | comboId int ! MUL | ingressoTipoId int ! | quantidade int !
ComissaoFuncaoPadrao :: id int ! PRI auto_increment | nome varchar(255) ! | ordem int ! | createdAt datetime DEFAULT_GENERATED | setorId int MUL
ComissaoMembro :: id int ! PRI auto_increment | eventoId int ! MUL | participanteId int ! MUL | setor varchar(255) ! | funcao varchar(255) ! | createdAt datetime DEFAULT_GENERATED
ComissaoSetorPadrao :: id int ! PRI auto_increment | nome varchar(255) ! UNI | ordem int ! | createdAt datetime DEFAULT_GENERATED
Configuracao :: chave varchar(100) ! PRI | valor longtext | updatedAt datetime DEFAULT_GENERATED on update CURRENT_TIMESTAMP
Cupom :: id int ! PRI auto_increment | eventoId int ! MUL | codigo varchar(50) ! | descricao varchar(255) | tipo enum('percentual','valor') ! | valor decimal(10,2) ! | ingressoTipoId int MUL | vigenciaInicio datetime | vigenciaFim datetime | maxUsosTotal int | maxUsosPorCpf int | ativo tinyint(1) ! | createdAt datetime DEFAULT_GENERATED | comboId int
EmailAgendado :: id int ! PRI auto_increment | eventoId int ! MUL | nomeInterno varchar(255) ! | assunto varchar(255) ! | corpo longtext | agendamentoTipo varchar(20) ! | dataEnvio datetime | dias int | segmento varchar(20) ! | ingressoTipoId int | ativo tinyint(1) ! | createdAt datetime DEFAULT_GENERATED | updatedAt datetime DEFAULT_GENERATED on update CURRENT_TIMESTAMP | frequencia varchar(20) ! | campoId int | ingressoTipoIdB int | acao varchar(20) ! | acaoIngressoTipoId int | anexarVoucher tinyint(1) !
EmailEnvio :: id int ! PRI auto_increment | emailAgendadoId int ! MUL | participanteId int | email varchar(255) ! | status varchar(20) ! | erro varchar(500) | sentAt datetime DEFAULT_GENERATED | periodo varchar(10) !
Evento :: id int ! PRI auto_increment | nome varchar(255) ! | dataInicial date ! | dataFinal date ! | localId int | promotorId int | voucherBannerUrl longtext | voucherLogoUrl longtext | voucherCorPrimaria varchar(7) | voucherCorSecundaria varchar(7) | voucherBoasVindas text | voucherInstrucoes text | voucherRodape text | voucherMostrarParticipante tinyint(1) | voucherMostrarEvento tinyint(1) | voucherMostrarIngresso tinyint(1) | voucherMostrarQRCode tinyint(1) | voucherMostrarPagamento tinyint(1) | createdAt datetime DEFAULT_GENERATED | comprarLogoUrl longtext | ativo tinyint(1) ! | slug varchar(100) UNI | cieloAccountId int MUL
EventoOrientador :: id int ! PRI auto_increment | eventoId int ! MUL | orientadorId int ! MUL | ordem int ! | createdAt datetime DEFAULT_GENERATED
IngressoCampo :: id int ! PRI auto_increment | ingressoTipoId int ! MUL | label varchar(255) ! | tipo varchar(20) ! | opcoesJson text | obrigatorio tinyint(1) ! | ordem int ! | ativo tinyint(1) ! | createdAt datetime DEFAULT_GENERATED
IngressoTipo :: id int ! PRI auto_increment | eventoId int ! | nome varchar(255) ! | vendaInicio datetime | vendaFim datetime | quantidade int | valor decimal(10,2) | maxParcelas int | idadeMin int | idadeMax int | createdAt datetime DEFAULT_GENERATED | descricao varchar(500) | unicoPorCpf tinyint(1) ! | papel varchar(20) ! | exigePrincipal tinyint(1) ! | exibirVendaPublica tinyint(1) ! | ativo tinyint(1) !
Inscricao :: id int ! PRI auto_increment | participanteId int ! | eventoId int ! | ingressoTipoId int MUL | numeroConvite varchar(50) | formaPagamento varchar(100) | dataPurchase datetime | checkinAt datetime | status varchar(20) MUL | cieloOrderId varchar(255) | qrCode varchar(255) | createdAt datetime DEFAULT_GENERATED | cupomId int MUL | compradorCpf varchar(14) MUL | valorOriginal decimal(10,2) | descontoAplicado decimal(10,2) ! | cieloPaymentId varchar(40) MUL | cieloPaymentMethod varchar(20) | cieloTid varchar(40) | cieloAuthCode varchar(20) | cieloBrand varchar(20) | cieloPixQrCode text | cieloPixQrImage longtext | cieloPixExpiresAt datetime | cieloReturnCode varchar(32) | cieloReturnMessage varchar(512) | credenciamentoPedido varchar(255) | tipoVenda varchar(20) | compradorId int MUL | transferidoParaEventoId int | transferidoParaInscricaoId int | transferidoEm datetime | transferidoPor varchar(255) | origemTransferenciaId int MUL | comboId int MUL | observacao varchar(1000) | canceladoEm datetime | canceladoPor varchar(255) | cancelamentoMotivo varchar(500) | cancelamentoAncoraId int MUL | estornoValor decimal(10,2) | estornoForma varchar(20) | estornoStatus varchar(20) MUL | estornoEfetuadoEm datetime | estornoEfetuadoPor varchar(255) | estornoComprovante varchar(255) | estornoObservacao varchar(255) | compraGrupoId varchar(36) MUL | titularAnteriorId int MUL | titularTrocadoEm datetime | titularTrocadoPor varchar(255) | titularTrocaMotivo varchar(500) | pixData date | pixRecibo varchar(255) | cortesiaMotivo varchar(500)
InscricaoResposta :: id int ! PRI auto_increment | inscricaoId int ! MUL | campoId int MUL | label varchar(255) ! | valor text | createdAt datetime DEFAULT_GENERATED
Local :: id int ! PRI auto_increment | nome varchar(255) ! | endereco text | bairro varchar(255) | cidade varchar(255) | estado varchar(2) | telefone varchar(20) | email varchar(255) | contaCielo varchar(255) | createdAt datetime DEFAULT_GENERATED
MagicLink :: token varchar(64) ! PRI | participanteId int ! MUL | eventoId int | ingressoTipoId int | quantity int | expiresAt datetime ! MUL | usedAt datetime | createdAt datetime DEFAULT_GENERATED
Organizacao :: id int ! PRI auto_increment | nome varchar(255) ! UNI | createdAt datetime DEFAULT_GENERATED
Orientador :: id int ! PRI auto_increment | nome varchar(255) ! | fotoUrl longtext | bio varchar(150) | createdAt datetime DEFAULT_GENERATED
Participant :: id int ! PRI auto_increment | nomeCompleto varchar(255) ! | codSNI varchar(100) | cpf varchar(20) ! UNI | telefone varchar(50) | email varchar(255) | regional varchar(100) | organizacao varchar(100) | associacaoLocal varchar(255) | dataNascimento datetime | endereco varchar(255) | bairro varchar(100) | cidade varchar(100) | estado varchar(10) | tipoConvite varchar(255) | numeroConvite varchar(100) | dataPurchase datetime | formaPagamento varchar(100) | checkinAt datetime | createdAt datetime ! DEFAULT_GENERATED | updatedAt datetime ! DEFAULT_GENERATED on update CURRENT_TIMESTAMP | ingressoEvento tinyint(1) ! | ingressoJantar tinyint(1) ! | primeiraVez tinyint(1) ! | emailOptOut tinyint(1) !
PedidoPendente :: id int ! PRI auto_increment | compradorId int ! | compradorCpf varchar(14) | eventoId int ! | ingressoTipoId int ! | quantity int ! | cupomId int | valorOriginal decimal(10,2) ! | descontoAplicado decimal(10,2) ! | participantesJson text | status varchar(20) ! MUL | cieloOrderId varchar(40) MUL | cieloPaymentId varchar(40) MUL | cieloPaymentMethod varchar(20) | cieloTid varchar(40) | cieloAuthCode varchar(20) | cieloBrand varchar(20) | cieloPixQrCode text | cieloPixQrImage longtext | cieloPixExpiresAt datetime | cieloReturnCode varchar(32) | cieloReturnMessage varchar(512) | inscricaoIds varchar(255) | createdAt datetime DEFAULT_GENERATED | updatedAt datetime DEFAULT_GENERATED on update CURRENT_TIMESTAMP | comboId int
Perfil :: id int ! PRI auto_increment | nome varchar(255) ! UNI | isAdmin tinyint(1) ! | permissoes text | createdAt datetime DEFAULT_GENERATED
Promotor :: id int ! PRI auto_increment | nome varchar(255) ! | telefone varchar(20) | email varchar(255) | createdAt datetime DEFAULT_GENERATED | usarCorrespondenciaRegional tinyint(1) ! | logoUrl longtext
RateLimit :: id int ! PRI auto_increment | bucket varchar(80) ! MUL | identifier varchar(190) ! | createdAt datetime MUL DEFAULT_GENERATED
Regional :: id int ! PRI auto_increment | nome varchar(255) ! UNI | createdAt datetime DEFAULT_GENERATED | correspondeRegionalId int
RegionalPromotorEmail :: id int ! PRI auto_increment | regionalId int ! MUL | promotorId int ! MUL | email varchar(255) ! | createdAt datetime DEFAULT_GENERATED | updatedAt datetime DEFAULT_GENERATED on update CURRENT_TIMESTAMP
User :: id int ! PRI auto_increment | nome varchar(255) ! | username varchar(100) ! UNI | email varchar(255) | passwordHash varchar(255) ! | ativo tinyint(1) ! | createdAt datetime DEFAULT_GENERATED | perfilId int
UserPreferencia :: userId int ! PRI | chave varchar(100) ! PRI | valor longtext | updatedAt datetime DEFAULT_GENERATED on update CURRENT_TIMESTAMP
```

## O que o esquema decide, e o que ele obriga a decidir

### `Participant` confirma a decisão 0002 e a 0004

`cpf varchar(20) NOT NULL UNIQUE` — a origem **já** trata CPF como identidade,
e isso é a melhor notícia da leitura: não há duas linhas para a mesma pessoa
por CPF. Mas `varchar(20)` guarda máscara, então a carga normaliza para onze
dígitos, e o dígito verificador é conferido na entrada (a origem nunca
conferiu).

`codSNI varchar(100)` **sem unique**: pode haver repetido, e vai haver. Como o
destino tem `cod_sni` único, o repetido é rejeição da carga, com o motivo no
relatório — nunca sobrescrita silenciosa.

`email varchar(255)` anulável e sem unique. É exatamente o cenário da decisão
0004: e-mail em branco vira `NULL`, nunca string vazia.

`regional`, `organizacao` e `associacaoLocal` são **texto livre**. Não são
chave estrangeira para `Regional` e `Organizacao` — são o que alguém digitou.
Vão para `migracao_extras` até o catálogo oficial de unidades casar com eles,
e o casamento é trabalho à parte, não da carga.

### A conta Cielo é do EVENTO na origem, e passa a ser da ENTIDADE

`Evento.cieloAccountId → CieloAccount` e, solto, `Local.contaCielo varchar(255)`
— um texto sem estrutura. Hoje existe **uma** conta cadastrada, marcada
`isDefault`.

O destino inverte isso (decisão 0010): a conta é da Organização, da Regional ou
da Academia, e o evento herda de quem o promove. A carga, portanto, não
transporta o vínculo evento→conta: transporta a conta uma vez e deixa o
apontamento para o cadastro. Com uma conta só, é trivial; com dez seria a
mesma coisa, porque o que muda é onde o apontamento mora.

⚠️ `merchantKey varchar(80)` está **em claro** na origem. No destino vai
cifrada. A carga cifra ao gravar, e o valor em claro nunca aparece em log nem
em relatório.

### `Inscricao` é o coração, e carrega quatro histórias

Sessenta colunas que contam: a compra (Cielo, PIX, parcelas), o **estorno**
(valor, forma, status, comprovante), a **transferência** entre eventos
(`transferidoPara*`, `origemTransferenciaId`) e a **troca de titular**
(`titularAnterior*`). São quatro fluxos que o módulo de eventos precisa ter no
primeiro dia — não são enfeite, estão em uso.

`compraGrupoId varchar(36)` amarra os ingressos comprados juntos: é o que
permite estornar uma compra inteira em vez de ingresso a ingresso.

### O que não estava no mapa

- **`EmailAgendado` / `EmailEnvio`**: régua de e-mail por evento, com
  segmentação por tipo de ingresso e anexo de voucher. Vira uso da fila de
  `notificacoes`, não uma segunda fila (regra do AGENTS.md).
- **`ComissaoSetorPadrao` / `ComissaoFuncaoPadrao` / `ComissaoMembro`**:
  comissão organizadora do evento, com setor e função. É catálogo mais
  vínculo — não se confunde com as funções doutrinárias da plataforma.
- **`Orientador` / `EventoOrientador`**: quem conduz o evento, com foto e bio.
  Orientador aqui é pessoa pública do evento, não o papel `orientador` do
  Ciclo. Nomes iguais, domínios diferentes.
- **`RateLimit`**: proteção do checkout público.
- **`User` / `Perfil` / `UserPreferencia`**: o controle de acesso antigo, com
  `username` e `passwordHash`. **Senha não migra**: o destino autentica pelo
  Supabase Auth. Cada `User` ativo vira `pessoas` + `papeis`, e a pessoa recebe
  convite. `Perfil.permissoes` é texto e serve de referência para escolher o
  papel de cada um — não vira dado.
- **`Regional.correspondeRegionalId`**: uma Regional aponta para outra que
  responde pela correspondência dela. Some no destino: a árvore de `unidades`
  já expressa isso, e `Promotor.usarCorrespondenciaRegional` é a chave que
  liga o comportamento.

## O que falta ler da origem

- `scripts/contagens.sql` — a qualidade do dado: CPF fora do formato, CodSNI
  repetido, e-mail repetido. É o que diz quantas rejeições esperar.
- Comandos 2 e 3 de `scripts/esquema-origem.sql` — chaves estrangeiras
  declaradas e índices únicos. O `MUL` acima indica índice, mas não diz para
  onde aponta.
