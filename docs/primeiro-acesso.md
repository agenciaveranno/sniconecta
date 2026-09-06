# Primeiro acesso

O RLS só reconhece quem tem linha em `pessoas` ligada a uma conta do Supabase
Auth, e a única tela que cria pessoas exige estar dentro. É o ovo e a galinha:
alguém precisa nascer com acesso.

A migração `20260906210000_primeiro_acesso_e_credenciais.sql` resolve isso —
cria a pessoa da Sede **sem conta** e dá a ela o papel nacional `sede`. Quem
cria a conta é o convite do Auth, e um gatilho amarra as duas pelo e-mail.

## Antes: o que precisa estar configurado

### Na Vercel — Settings → Environment Variables, marcando **Production**

```
NEXT_PUBLIC_SUPABASE_URL         https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY    a chave `anon public`
SUPABASE_SERVICE_ROLE_KEY        a `service_role` (⚠️ ignora o RLS)
DATABASE_URL                     o pooler, porta 6543
CRON_SECRET                      qualquer segredo longo
CREDENCIAIS_ENCRYPTION_KEY       ≥32 caracteres
```

⚠️ **Não é o mesmo lugar dos segredos do GitHub.** Os do GitHub aplicam
migrações; estes fazem a aplicação falar com o banco. Faltando as duas
primeiras, toda tela protegida devolve 500 — e a tela de login continua
abrindo, porque rota pública não fala com o Supabase. É um estado que
parece "quase funcionando" e não é.

### No Supabase — Authentication → URL Configuration

```
Site URL        https://sniconecta.com.br/auth/confirmar
Redirect URLs   https://sniconecta.com.br/**
```

O **Site URL** é para onde o convite volta. Se ficar no endereço gerado pela
Vercel, o link do e-mail leva a pessoa para fora do domínio da instituição.

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

   O link do e-mail cai em `/auth/confirmar`, que troca o convite por uma
   sessão e leva a `/definir-senha`. ⚠️ Essa tela precisa ser CLIENTE: o
   convite do painel devolve o token no FRAGMENTO da URL (`#access_token=…`),
   e fragmento nunca chega ao servidor — o navegador não o envia. Uma rota de
   servidor veria a URL vazia e trataria um convite válido como link quebrado.

   Se o Site URL estiver apontando para a raiz ou para o login, não se perde
   nada: `ResgatarConvite` acha o token no fragmento e encaminha.

   ⚠️ **O e-mail precisa bater.** Se divergir por uma letra, a conta entra e a
   pessoa fica sem papel nenhum — a tela dirá que ela não tem permissão, e o
   problema estará no cadastro, não na permissão.

4. **Configure o envio de e-mail** em `/admin/configuracoes` antes de convidar
   qualquer outra pessoa: o convite do Supabase sai pelo SMTP dele, mas tudo
   que o sistema manda depois (comprovante, certificado) sai pela fila, e a
   fila precisa desses dados.

## Os demais operadores não passam mais pelo painel do Supabase

Só a PRIMEIRA pessoa precisa do convite pelo painel — porque é a única que
nasce antes de existir alguém para cadastrá-la. Daí em diante, tudo acontece
em `/admin/pessoas`, nesta ordem:

1. **Cadastre a pessoa** (CPF, nome, e-mail).
2. **Conceda o papel** na unidade certa, em *Papéis*.
3. **Crie o acesso**, em *Acesso*. Deixe o sistema gerar a senha: ela aparece
   uma vez, na tela, para você passar à pessoa. Depois disso não aparece mais
   — nem em log, nem em auditoria.

⚠️ **Ter cadastro não é ter acesso.** A maioria das dezesseis mil pessoas
nunca vai ter conta: elas participam, compram ingresso e fazem curso sem
nunca entrar no sistema. Conta é para quem opera.

⚠️ **E-mail de família não vira duas contas.** Depois da decisão 0011, mãe e
filho podem dividir o mesmo e-mail no cadastro — mas só uma pessoa por e-mail
consegue ter acesso, porque é por ele que se entra. A tela diz de quem é a
conta quando isso acontece, em vez de devolver o erro do Supabase.

## Quando alguém diz que "o login não funciona"

Quase sempre é o e-mail do cadastro divergindo do e-mail do Auth. Nesse
estado o Supabase responde *"Invalid login credentials"* — a mesma frase de
senha errada — e a pessoa fica trancada fora com a senha certa na mão.

Redefinir a senha em *Acesso* conserta os dois de uma vez: a operação
sincroniza o e-mail junto. É por isso que essa é a tela a procurar.
