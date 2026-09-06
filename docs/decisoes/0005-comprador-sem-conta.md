# 0005 — Quem compra não tem conta; quem opera tem

**Situação.** O checkout público de eventos autentica o comprador por magic
link (e-mail ou CPF), sem senha e sem conta. Criar conta no Supabase Auth
para cada comprador geraria dezenas de milhares de identidades que ninguém
usa — cada uma um vetor a mais — e obrigaria e-mail para todo mundo.

**Decisão.**
- **Operador** (Sede, admin de eventos, operador de balcão, coordenador):
  conta no Supabase Auth, ligada a `pessoas.auth_user_id`, criada pelo
  servidor a partir do cadastro. Sem autocadastro.
- **Comprador**: sem conta. O módulo `eventos` mantém o próprio magic link
  (`eventos.magic_links`, token com hash e validade) para a pessoa acessar
  o checkout e o voucher. Se um dia ela virar operadora, a conta é criada
  sobre a mesma linha de `pessoas`.

**Consequência.** O proxy de sessão só protege rotas de painel. Rotas
públicas de eventos (`/e/`, `/comprar`, `/descadastro`, `/r/`) ficam fora
dele e validam o magic link por conta própria.
