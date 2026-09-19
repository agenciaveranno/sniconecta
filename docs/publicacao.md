# Publicação: onde o código mora e por onde ele chega ao ar

Este arquivo existe porque o caminho entre "merge na `main`" e "a tela mudou"
tem **três esteiras independentes**, cada uma com o seu próprio acesso — e
quando uma delas cai, nada grita. O CI fica verde, o merge acontece, o PR
fecha, e o site continua servindo a versão da semana passada. Já aconteceu
(ver *O caso de 19/09/2026*, no fim).

## Os endereços

| O quê | Onde | Conta |
|---|---|---|
| Código | `github.com/agenciaveranno/sniconecta` (**privado**) | GitHub, conta `agenciaveranno` |
| Testes e migrações | GitHub Actions, no mesmo repositório | idem |
| Aplicação no ar | Vercel, projeto `sniconecta` | Vercel, conta `agenciaveranno`, plano Hobby |
| Banco | Supabase (Postgres, São Paulo) | projeto Supabase de produção |

Domínios que o projeto Vercel atende: `sniconecta.com.br`,
`www.sniconecta.com.br` e `sniconecta.vercel.app`.

Identificadores úteis para falar com a API da Vercel — são **identificadores,
não credenciais**; aparecem na URL do painel:

- projeto: `prj_vt728DnBBDu4km75n0H5cxW0qACa`
- equipe: `team_U3AnDGn761fI8sIVAAfRxZbO`

## ⚠️ O repositório precisa morar na conta que a Vercel enxerga

A Vercel amarra **um login do GitHub por conta Vercel**. A lista de escopos
que ela oferece é: o namespace pessoal desse login, mais as **organizações**
de que ele participa. Namespace pessoal de outra conta **nunca** entra nessa
lista — conta pessoal não é compartilhável como organização é, e não adianta
instalar o app do Vercel lá.

Por isso os dois lados têm de ser a mesma conta, `agenciaveranno`, e é isso
que faz a publicação automática funcionar. **Tirar o repositório dessa conta
quebra a publicação na hora**, e quebra em silêncio (foi o que aconteceu em
19/09). Se um dia for preciso tirá-lo de lá — para uma conta pessoal de outra
pessoa, por exemplo, ou para tirar o sistema institucional de cima de uma
conta pessoal —, o destino tem de ser uma **organização do GitHub** da qual
`agenciaveranno` seja membro, e não outra conta pessoal. Organização é grátis;
o que é pago é o Time na Vercel (recurso Pro), que seria a outra forma de ter
um escopo de Git próprio.

## ⚠️ A tela de Git da Vercel NÃO prova que o acesso existe

*Vercel → projeto → Settings → Git* mostra o vínculo **guardado**: o id do
repositório e o nome que ele tinha. Ela continua desenhando "Connected
`conta/sniconecta`" depois que o acesso caiu, porque o que caiu foi a
capacidade de ler o repositório, não o registro do vínculo. Conferir aquela
tela e concluir "está tudo certo" é o erro natural — foi exatamente o que
aconteceu em 19/09.

Pior: quando o repositório muda de dono, a Vercel guarda o caminho **antigo**
nos metadados dos deploys já feitos e nos filtros da API. Quem consultar a API
por `repoUrl` encontra o projeto pelo caminho velho e **não** encontra pelo
atual. Esse dado é histórico, não é o vínculo — não tire conclusão dele.

Como o repositório é privado, quando a Vercel perde o acesso o GitHub não
responde "sem permissão": responde **"não encontrado"**. O acesso só se prova
**pedindo o código** — um *Redeploy*, ou um deploy pela API. Se a resposta for
`incorrect_git_source_info — The provided GitHub repository can't be found`, o
vínculo está morto.

## As três esteiras, e o que cada uma precisa

**1. Testes (`.github/workflows/ci.yml`).** Roda em todo PR e em todo push
para `main`: typecheck, vitest, harness de RLS e build. Não depende da Vercel.
Verde aqui significa que o código presta — **não** significa que ele está no
ar.

**2. Migrações (`.github/workflows/migrations.yml`).** Aplica os arquivos de
`supabase/migrations/` no merge para `main`. Ninguém roda SQL à mão. Depende
dos segredos do repositório no GitHub, não da Vercel. ⚠️ Repositório que muda
de dono leva os segredos junto, mas confira — migração que roda sem eles falha
depois de já ter mexido no banco.

**3. Aplicação (Vercel).** Publica sozinha a cada push na `main` — enquanto o
repositório estiver na conta que a Vercel enxerga. É o elo que cai calado.

As três são independentes. A migração pode ter sido aplicada no banco enquanto
a aplicação que a usa continua sem publicar: é o cenário que quebra a produção
sem ninguém ter mexido nela. Por isso, **quem faz merge confere o deploy**,
não só o CI.

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

1. **O repositório ainda é da conta `agenciaveranno`?** Se saiu de lá, essa é
   a causa, e nenhum ajuste na Vercel resolve enquanto ele estiver fora (ver a
   primeira seção). Devolvê-lo, ou movê-lo para uma organização de que a conta
   participe, é o conserto.
2. **Vercel → projeto → *Settings → Git*.** Se o vínculo estiver caído,
   *Disconnect* e conectar de novo: escolher o escopo `agenciaveranno` e o
   repositório `sniconecta`. ⚠️ Repositório que não aparece na lista é
   repositório que a conta não enxerga — volte ao passo 1.
3. **Deploy não nasce retroativo.** Depois de reconectar, *Deployments* →
   *Redeploy* no commit atual da `main`, ou um push novo. Sem isso, o que foi
   mergeado durante a queda continua fora do ar.
4. Conferir pelos três pontos da seção anterior — inclusive o **status no
   próximo PR**, que é o que prova que a Vercel voltou a ser avisada dos
   pushes, e não só a conseguir ler o repositório. São duas coisas diferentes:
   o *Redeploy* prova a leitura; só o push seguinte prova o aviso.

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

A causa: o repositório tinha saído da conta `agenciaveranno` para uma conta
pessoal diferente. O app do Vercel foi instalado na conta nova, com acesso a
todos os repositórios, e mesmo assim não adiantou — porque o que faltava não
era permissão no GitHub, era a Vercel **enxergar aquele namespace**, e
namespace de conta pessoal alheia ela não enxerga nunca. Reconectar não
resolveu: na hora de escolher o repositório, ele simplesmente não aparecia na
lista. Criar um Time na Vercel resolveria, mas é recurso pago.

O que se via enquanto isso: nenhum deploy criado para o commit novo; nenhum
status da Vercel no PR (o PR de 12/09 tinha o seu); e a tela *Settings → Git*
mostrando o repositório conectado, o que fez a ligação parecer sadia. Os
pedidos de deploy pela API — inclusive um mandando a Vercel usar o vínculo
dela mesma — voltavam com `The provided GitHub repository can't be found`.

O conserto foi devolver o repositório à conta `agenciaveranno` e reconectar.
Duas mudanças tinham ficado represadas por sete dias.

A lição que este arquivo guarda: **o CI verde e o merge fechado não são prova
de publicação**, e a tela de vínculo da Vercel não é prova de acesso. A prova é
o deploy existindo com o SHA certo.
