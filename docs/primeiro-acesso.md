# Primeiro acesso

O RLS só reconhece quem tem linha em `pessoas` ligada a uma conta do Supabase
Auth, e a única tela que cria pessoas exige estar dentro. É o ovo e a galinha:
alguém precisa nascer com acesso.

A migração `20260906210000_primeiro_acesso_e_credenciais.sql` resolve isso —
cria a pessoa da Sede **sem conta** e dá a ela o papel nacional `sede`. Quem
cria a conta é o convite do Auth, e um gatilho amarra as duas pelo e-mail.

## Passo a passo

1. **Aplique as migrações.** Merge para `main` dispara
   `.github/workflows/migrations.yml`. Confira no Supabase que `pessoas` tem a
   linha da Sede e que `papeis` tem o papel `sede` sem unidade.

2. **Desligue a criação de conta pública.** No painel do Supabase:
   *Authentication → Providers → Email → "Enable sign up"* **desligado**.
   Operador não se cadastra: alguém o cadastra em `pessoas` e o convida. Com o
   sign up ligado, qualquer pessoa cria conta — fica sem acesso a nada, porque
   o gatilho não encontra pessoa com aquele e-mail, mas entope a base de contas
   órfãs.

3. **Convide a primeira pessoa.** *Authentication → Users → Invite user*, com o
   e-mail exatamente igual ao que está em `pessoas`. O gatilho
   `trg_auth_user_liga_pessoa` preenche `pessoas.auth_user_id` no instante em
   que a conta nasce.

   ⚠️ **O e-mail precisa bater.** Se divergir por uma letra, a conta entra e a
   pessoa fica sem papel nenhum — a tela dirá que ela não tem permissão, e o
   problema estará no cadastro, não na permissão.

4. **Configure o envio de e-mail** em `/admin/configuracoes` antes de convidar
   qualquer outra pessoa: o convite do Supabase sai pelo SMTP dele, mas tudo
   que o sistema manda depois (comprovante, certificado) sai pela fila, e a
   fila precisa desses dados.

## Convidando os demais operadores

O caminho é sempre o mesmo, e nesta ordem:

1. Cadastre a pessoa em `/admin/pessoas` (CPF, nome, e-mail).
2. Conceda o papel na unidade certa.
3. Convide o e-mail no painel do Supabase.

Se a conta já existir por algum motivo, o gatilho inverso
(`trg_pessoa_liga_conta`) amarra as duas no momento em que a pessoa ganha o
e-mail. Acontece com quem é promovido a operador depois de anos só com
histórico.
