# Módulo `eventos`

Migração do SNI Ciclo de Eventos (repositório `sni-ciclo`, MySQL no Railway,
em produção). Nada deste módulo existe ainda aqui: este arquivo é o mapa do
que será portado, na ordem.

## Rotas de origem → destino

| Origem (`sni-ciclo`) | Destino | Capacidade |
|---|---|---|
| `/dashboard` | `/eventos` | `eventos.inscricoes.ver` |
| `/participantes/**` | `/eventos/pessoas/**` | `eventos.inscricoes.ver` / `.gerir` |
| `/venda` | `/eventos/venda` | `eventos.vender` |
| `/checkin` | `/eventos/checkin` | `eventos.checkin` |
| `/relatorios/**` | `/eventos/relatorios/**` | `eventos.inscricoes.ver` |
| `/admin/estornos` | `/eventos/estornos` | `eventos.estornos.gerir` |
| `/admin/eventos/**`, `locais`, `promotores`, `orientadores`, `comissao` | `/eventos/admin/**` | `eventos.gerir` / `eventos.comissao.gerir` |
| `/admin/cielo-contas` | cadastro do promotor (decisão 0010) | `estrutura.gerir` |
| `/admin/configuracoes` | `/admin/configuracoes` (comum) | `configuracao.gerir` |
| `/admin/usuarios`, `/admin/perfis` | `/admin/pessoas` (comum) | `pessoa.gerir`, `papel.conceder` |
| `/admin/regionais`, `/admin/organizacoes` | comum (`regionais`, `organizacoes`) | `pessoa.gerir` |
| `/e/[id]`, `/comprar/**`, `/descadastro`, `/r/campo/[token]` | mesmas rotas, públicas | — |
| `/api/cielo/webhook`, `/api/cron/emails` | `/api/eventos/cielo/webhook`; cron some (fila comum) | Bearer / assinatura |

## O que muda ao entrar na plataforma

- `Participant` vira `pessoas` (comum). `Inscricao.participanteId` passa a
  apontar para `pessoas.id` (uuid). A coluna `legado_id` guarda o inteiro
  antigo para rastreabilidade.
- `User` + `Perfil` viram conta no Auth + `papeis` (`eventos_admin`,
  `eventos_operador`). Comprador continua sem conta (magic link do módulo).
- `Configuracao` com segredo (Cielo, SMTP, WhatsApp) vira tabela cifrada e
  sem GRANT. O resto vira configuração comum editável em tela.
- `EmailAgendado` / `EmailEnvio` viram a fila `notificacoes`. Nenhum envio
  dentro de requisição.
- Dinheiro passa de `DECIMAL(10,2)` para centavos inteiros.
- `/api/migrate` deixa de existir: esquema só por migração.
- Logos e banners em base64 vão para o Supabase Storage.

## Ordem de porte

1. Esquema (`supabase/rascunhos/eventos_schema.sql` → migração).
2. Camada de dados e domínio puro (`src/modulos/eventos/dominio/`): regras de
   papel de convite, combos, cupons, status de inscrição, vouchers.
3. Público: landing, checkout, magic link, Cielo, confirmação, voucher PDF.
4. Operação: venda balcão, check-in, pessoas.
5. Gestão: eventos, convites, combos, cupons, locais, promotores, orientadores,
   comissão, estornos, relatórios, configurações.
6. Testes de fumaça de ponta a ponta contra homologação.
