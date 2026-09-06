# Módulo `eventos` — respostas ao documento de referência da plataforma

Respostas às perguntas da seção 16 do documento "Plataforma SNI — referência
para integração de módulo", escritas pela sessão que conhece o sistema de
eventos (repositório `sni-ciclo`). Duas premissas do documento não valem para
este módulo e estão corrigidas no fim.

## Sobre o sistema de eventos

**1. O que faz, quem opera, quantos usuários.** Inscrições em eventos da
SEICHO-NO-IE DO BRASIL (hoje o Seminário Especial da Prosperidade): landing
pública por evento, checkout com Cielo (cartão, Pix, link), vouchers em PDF
com QR, venda balcão, check-in, relatórios, estornos, combos, cupons, comissão
organizadora, e-mails por regional. Operam a Sede e voluntários; base de mais
de 16 mil pessoas com CPF; poucos operadores (dezenas).

**2. Stack.** Next 16.2 (App Router, React 19), TypeScript, Tailwind 4,
`mysql2` com SQL cru (449 consultas em 104 arquivos), **sem ORM**. NextAuth 4
com usuário e senha. Vercel (serverless) + MySQL no Railway.

**3. Esquema.** 31 tabelas. Principais: `Participant`, `Evento`,
`IngressoTipo`, `Inscricao`, `PedidoPendente`, `Combo`/`ComboItem`, `Cupom`,
`Local`, `Promotor`, `Orientador`, `ComissaoMembro`, `User`/`Perfil`,
`AuditLog`, `EmailAgendado`/`EmailEnvio`, `MagicLink`, `Configuracao`,
`CieloAccount`, `UserPreferencia`. Sem chave estrangeira no banco; esquema
mantido por um endpoint `/api/migrate` idempotente com 102 `ALTER TABLE`.

**4. Autenticação.** Operador: NextAuth (JWT em cookie) contra `User` com
bcrypt. Comprador: magic link próprio por e-mail/CPF, sem conta nem senha.

**5. Autorização.** Perfis com lista de permissões por tela (`eventos`,
`venda`, `checkin`, `relatorios`, `estornos`, `usuarios`…), checadas no
servidor por `requirePermissao`. **Nacional, sem escopo por localidade.**
Regional e organização existem como atributo do participante (texto livre)
e para avisar o presidente da regional por e-mail.

**6. Processo de longa duração.** Nenhum. Já é serverless na Vercel. Um cron
diário (`/api/cron/emails`, 9h). Webhook da Cielo. Deduplicação de
participantes em POST com resposta em streaming (longa) — precisa de limite
de função adequado.

**7. Arquivos.** Logos e banners em base64 dentro do banco (`LONGTEXT`).
Voucher PDF gerado sob demanda.

**8. Integrações.** Cielo (Checkout, API 3.0 com Pix e tokenização,
webhook), SMTP via Nodemailer, Meta WhatsApp Cloud API (token e template já
configurados em produção), Google Analytics e Meta Pixel/CAPI nas páginas
públicas.

**9. Volume.** Mais de 16 mil participantes; inscrições, pedidos e eventos
contados por `scripts/contagens.sql` (aguardando execução).

## Sobre a integração

**10. Mesmas pessoas, CPF nos dois.** Sim. O Ciclo está sem dados, então não
há reconciliação: `pessoas` nasce da base de eventos. `Participant.cpf` é
único (houve deduplicação recente). `codSNI` é **anulável** na origem; se
todos têm, as contagens confirmam.

**11. Escopo.** Nacional. Não é por localidade. Ver decisão 0003.

**12. Papéis.** Dois novos, nacionais: `eventos_admin` e `eventos_operador`.
Os seis existentes não cobrem o balcão nem o check-in. Ver `permissoes.ts`.

**13. Quem vê o quê.** Capacidades com prefixo `eventos.*`; nenhum papel do
Ciclo as recebe por padrão e vice-versa. Teste de minimização em
`tests/permissoes.test.ts`.

**14. Prazo.** A virada de eventos precisa ficar longe de evento com vendas
abertas. Data a confirmar com a Sede.

**15. Plano Vercel.** O cron diário cabe no Hobby. Importação de planilha,
deduplicação e PDF de relatório pedem limite de função maior: recomendo Pro
antes da virada.

**16. Mesmo projeto Supabase.** Sim, um só. É o ponto inteiro.

## Premissas do documento que não valem para eventos

- **Não há aplicação no Railway.** Só o banco. A aplicação já é serverless na
  Vercel; a seção 15.1 não se aplica.
- **Não há ORM para desfazer.** A migração é de dialeto (MySQL → Postgres) e
  de convenção (camelCase → snake_case, DECIMAL → centavos), não de ORM.

## O que o módulo de eventos traz para a plataforma

- Integração Cielo completa (checkout, Pix, webhook, estorno), pronta para o
  Ciclo cobrar matrícula.
- WhatsApp Cloud API já em produção com template aprovado.
- Deduplicação de pessoas por CPF com prévia e revisão.
- Design system v2.7 já implantado em CSS (tokens + componentes), origem do
  `src/design/` daqui.

## Riscos que este módulo carrega para a plataforma

1. Base real: CPF inválido, e-mail ausente ou compartilhado, CodSNI faltando.
   Resolvidos por rejeição com motivo na migração e pelas decisões 0004/0005.
2. Analytics e Pixel da Meta nas páginas públicas: ao juntar com a espinha de
   pessoas de um curso doutrinário, o dado enviado à Meta infere prática
   religiosa. Entra na pauta do jurídico com os termos.
3. Segredos em texto puro em `Configuracao`: migram cifrados
   (`src/lib/cripto.ts`) para tabela sem GRANT.
4. Envio de e-mail dentro da requisição (aviso à regional no balcão): migra
   para a fila comum.
