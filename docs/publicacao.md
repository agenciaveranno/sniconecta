# Publicação: onde o código mora e por onde ele chega ao ar

Este arquivo existe porque o caminho entre "merge na `main`" e "a tela mudou"
tem **três esteiras independentes**, cada uma com o seu próprio acesso — e
quando uma delas cai, nada grita. O CI fica verde, o merge acontece, o PR
fecha, e o site continua servindo a versão da semana passada. Já aconteceu
(ver *O caso de 19/09/2026*, no fim).

## Os endereços

| O quê | Onde | Conta |
|---|---|---|
| Código | `github.com/viniveranno/sniconecta` (**privado**) | GitHub, conta pessoal `viniveranno` |
| Testes e migrações | GitHub Actions, no mesmo repositório | idem |
| Aplicação no ar | Vercel, projeto `sniconecta` | Vercel, equipe `agenciaverannos-projects`, plano Hobby |
| Banco | Supabase (Postgres, São Paulo) | projeto Supabase de produção |

Domínios que o projeto Vercel atende: `sniconecta.com.br`,
`www.sniconecta.com.br` e `sniconecta.vercel.app`.

Identificadores úteis para falar com a API da Vercel — são **identificadores,
não credenciais**; aparecem na URL do painel:

- projeto: `prj_vt728DnBBDu4km75n0H5cxW0qACa`
- equipe: `team_U3AnDGn761fI8sIVAAfRxZbO`

## ⚠️ O GitHub e a Vercel estão em contas DIFERENTES

O repositório é da conta **`viniveranno`**. O projeto Vercel é da conta
**`agenciaveranno`**. Não são a mesma conta, e é daí que vem toda a fragilidade
desta ligação: a Vercel não é dona do repositório, ela é uma convidada.

A Vercel só lê o código enquanto o **app Vercel do GitHub** estiver instalado
na conta `viniveranno` **com o repositório `sniconecta` na lista de acesso**.
E como o repositório é privado, quando essa concessão some o GitHub não
responde "sem permissão": responde **"não encontrado"**. Para a Vercel, o
repositório simplesmente deixou de existir — e ela não avisa ninguém.

A concessão mora aqui, e é a única tela que diz a verdade sobre ela:

**GitHub → Settings → Integrations → Applications → Vercel → Configure**
(`https://github.com/settings/installations`, entrando com a conta
`viniveranno`)

## ⚠️ A tela de Git da Vercel NÃO prova que o acesso existe

*Vercel → projeto → Settings → Git* mostra o vínculo **guardado**: o id do
repositório e o nome que ele tinha. Ela continua desenhando "Connected
`viniveranno/sniconecta`" depois que o acesso caiu, porque o que caiu foi a
concessão do outro lado. Conferir aquela tela e concluir "está tudo certo" é o
erro natural — foi exatamente o que aconteceu em 19/09.

Pior: a Vercel guarda o caminho **antigo** do repositório
(`agenciaveranno/sniconecta`) nos metadados dos deploys já feitos e nos filtros
da API. Quem consultar a API por `repoUrl` encontra o projeto pelo caminho
velho e **não** encontra pelo caminho atual. Esse dado é histórico, não é o
vínculo — não tire conclusão dele (foi o que me fez acusar o repositório
errado antes de achar a causa real).

O acesso só se prova **pedindo o código**: um *Redeploy*, ou um deploy pela
API. Se a resposta for `incorrect_git_source_info — The provided GitHub
repository can't be found`, a concessão caiu.

## As três esteiras, e o que cada uma precisa

**1. Testes (`.github/workflows/ci.yml`).** Roda em todo PR e em todo push
para `main`: typecheck, vitest, harness de RLS e build. Não depende da Vercel.
Verde aqui significa que o código presta — **não** significa que ele está no
ar.

**2. Migrações (`.github/workflows/migrations.yml`).** Aplica os arquivos de
`supabase/migrations/` no merge para `main`. Ninguém roda SQL à mão. Depende
dos segredos do repositório no GitHub, não da Vercel.

**3. Aplicação (Vercel).** Publica sozinha a cada push na `main` — enquanto a
concessão do app Vercel alcançar o repositório. É o elo que cai calado.

As três são independentes. A migração pode ter sido aplicada no banco enquanto
a aplicação que a usa continua sem publicar: é o cenário que quebra a
produção sem ninguém ter mexido nela. Por isso, **quem faz merge confere o
deploy**, não só o CI.

## Conferir se a ligação está viva (dois minutos)

1. **O push virou deploy?** Vercel → projeto → *Deployments*: tem que existir
   um deploy de produção com o SHA do commit que acabou de entrar na `main`.
2. **O PR recebeu status da Vercel?** Um PR com a ligação viva ganha o status
   de commit `Vercel — Deployment has completed`. PR sem status nenhum da
   Vercel é ligação caída — este é o sinal mais cedo de todos, e aparece
   **antes** do merge.
3. **Quem está no ar?** O deploy de produção mais recente diz qual commit está
   servindo os domínios. Se ele for mais velho que a `main`, a produção está
   atrasada em relação ao código, e a diferença é tudo o que foi mergeado
   desde então.

Pela API, o mesmo em um comando (o SHA vem do `git rev-parse origin/main`):

```
GET /v6/deployments?projectId=prj_vt728DnBBDu4km75n0H5cxW0qACa
                   &teamId=team_U3AnDGn761fI8sIVAAfRxZbO
                   &target=production&limit=1
```

## Quando a ligação cai — o conserto

1. GitHub → `https://github.com/settings/installations` na conta
   `viniveranno` → **Vercel** → *Configure* → incluir `sniconecta` na lista de
   repositórios. Repositório privado precisa estar marcado explicitamente
   quando a instalação é "Only select repositories".
2. Vercel → projeto → *Deployments* → *Redeploy* no commit atual da `main`.
   Um push novo também serve; deploy não nasce sozinho para o que já passou.
3. Conferir pelos três pontos acima.

Se depois disso a Vercel ainda recusar, o vínculo guardado está podre: em
*Settings → Git*, *Disconnect* e reconectar apontando para
`viniveranno/sniconecta`.

## O cron e as rotas de máquina

`vercel.json` declara o cron do projeto:

```json
{ "path": "/api/notificacoes/processar", "schedule": "0 12 * * *" }
```

É a Vercel quem chama essa rota — ou seja, **o cron também é refém desta
ligação**: um projeto que parou de publicar continua executando o cron do
último deploy publicado, com o código de lá. A fila de notificações é
processada por esse caminho e por nenhum outro (`enfileirar()` nunca envia
dentro da requisição da pessoa).

A rota fica **fora** do proxy de sessão (`src/proxy.ts`) e autentica por
`Authorization: Bearer $CRON_SECRET`, respondendo 401 sem o segredo e 503
quando `CRON_SECRET` não está configurado. Sem isso ela receberia a página de
login com status 200, e o cron "funcionaria" para sempre sem processar nada.

A outra rota de API, `/api/cep/[cep]`, é consulta de apoio ao cadastro e não
tem nada a ver com publicação (decisão 0014 — o CEP ajuda, não manda).

## Variável de ambiente nova só vale depois de um redeploy

A Vercel não reinicia o que está no ar porque alguém salvou uma variável. Toda
mudança em *Settings → Environment Variables* exige um redeploy para valer — e
um redeploy exige a ligação viva. Ver `docs/primeiro-acesso.md`, que trata da
configuração inicial e do escopo Production das variáveis.

## O caso de 19/09/2026

Um PR de correção de interface entrou na `main` com o CI verde. O site
continuou exibindo a versão de 12/09. Nada estava errado no código.

O que se via: nenhum deploy criado para o commit novo; nenhum status da Vercel
no PR (o PR de 12/09 tinha o seu); e a tela *Settings → Git* mostrando o
repositório conectado, o que fez a ligação parecer sadia. Dois pedidos de
deploy pela API — um nomeando o repositório, outro mandando a Vercel usar o
vínculo dela mesma — receberam `The provided GitHub repository can't be
found`.

A lição que este arquivo guarda: **o CI verde e o merge fechado não são prova
de publicação**, e a tela de vínculo da Vercel não é prova de acesso. A prova é
o deploy existindo com o SHA certo.
