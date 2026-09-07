# 0018 — Papel pode ter recorte de Organização

**Data:** 2026-09-07
**Situação:** aceita
**Decide:** Sede (SEICHO-NO-IE DO BRASIL)
**Fecha a pendência da decisão 0009** ("promovê-lo a cargo institucional é
decisão de negócio, não de esquema")

## Problema

A matriz dava `pessoa.gerir` ao Presidente de UAP e o banco não o deixava tocar
em ninguém: `tipos_papel.administra_unidade` era `false` para ele, e
`app.unidades_administradas()` só devolve linha para quem administra.

⚠️ **E isso não dava erro.** A RLS não recusa um `update` fora de alcance — ela
o reduz a zero linhas, sem mensagem. O menu oferecia o que o banco sempre
negaria, em silêncio.

Era regressão de porte, não decisão: no sistema do Ciclo que está no ar, o
Presidente de UAP entra em `app.admin_localidade_ids()` ao lado do coordenador e
do orientador (`0010_funcoes_autorizacao.sql:42`). Trouxemos a metade da matriz
e não a metade do banco. A decisão 0009 já registrara a dúvida por escrito, e
até hoje **nenhuma das quatro fontes expandia a sigla UAP**.

## O que a Sede respondeu

O Presidente de UAP responde pela Associação da Prosperidade **naquela
Regional** e pelas Associações Locais dela. E — perguntado explicitamente —
**"Associação da Prosperidade da Regional Sul" não é entidade cadastrável**: é o
conjunto das Associações Locais de Prosperidade dali.

## Decisão

O alcance dele é uma **fatia**, `Regional ∩ Organização`. `papeis.unidade_id`
sozinho só sabe dizer *subárvore*, então o papel ganha uma segunda dimensão:

```
papeis(pessoa_id, tipo, unidade_id, organizacao_id, ativo)
tipos_papel.escopo ∈ ('nacional', 'unidade', 'unidade_organizacao')
```

`app.unidades_administradas()` passa a devolver, para um papel com recorte, só
as unidades daquela Organização dentro da subárvore.

⚠️ **A recursão não filtra; só o `select` final filtra.** Para chegar às
Associações Locais de Prosperidade é preciso descer PELA Regional e pelos
Núcleos, que não são dele — filtrar durante a descida cortaria o caminho e o
alcance sairia vazio.

⚠️ **A Regional e o Núcleo caem fora sozinhos**, porque têm `organizacao_id`
nulo. É o certo nos dois casos: ele responde pelas Associações Locais, não pela
Regional; e o Núcleo é a união de ALs de organizações diferentes no mesmo
endereço, então não é de nenhuma delas.

⚠️ **O gatilho recusa conceder o papel sem a Organização.** Sem ela, o recorte
sumiria e `unidades_administradas()` trataria "sem recorte" como "tudo abaixo":
a pessoa herdaria as Associações Locais das outras três Organizações da
Regional, sem ninguém ter decidido isso.

## Alternativas recusadas

**Só marcar `administra_unidade = true`.** Uma linha, e daria alcance DEMAIS:
com `unidade_id = <Regional>` ele administraria também as ALs de Fraternidade,
Pomba Branca e Jovens. Silenciosamente mais largo do que o cargo.

**Criar um degrau na árvore** (`Regional → Associação da Prosperidade → AL`).
Resolveria por herança, sem mecanismo novo, e `organizacao_id` da AL deixaria de
ser digitado. Recusada porque **a entidade não existe**: seria inventar uma
pessoa jurídica para caber no modelo. E um degrau que às vezes tem e às vezes
não custa caro em toda tela que percorre a árvore.

**Uma coluna booleana à parte** em vez de um terceiro valor no `escopo`.
Recusada porque `escopo` JÁ É a pergunta "que forma este tipo de papel aceita?",
e um booleano separado permitiria a combinação sem sentido "nacional e com
recorte de organização".

## O que NÃO entrou nesta decisão

A Sede disse "ele pode alterar os cadastros delas". Ficou como **as pessoas
daquelas Associações Locais** — que é o `pessoa.gerir` da matriz.

Alterar o cadastro **da Associação Local em si** (nome, endereço, CNPJ) continua
sendo só da Sede: `estrutura_escreve_unidades` é `app.e_sede()`, com a razão
escrita na fundação — *"uma regional renomeada por engano desalinha relatório de
todo mundo"*. Nem o Coordenador pode. Mudar isso é outra decisão, e precisa ser
tomada como tal.

## Consequências

- O harness ganhou oito asserções, e três delas provam **onde ele para**: outra
  Organização na mesma Regional, a mesma Organização em outra Regional, e
  conceder papel. ⚠️ Nenhuma asserção exercitava este papel — foi por isso que a
  divergência entre matriz e banco passou despercebida.
- `eventos_admin` continua com o mesmo problema e **não é resolvido por aqui**:
  ele é nacional (`unidade_id` nulo), e `unidades_administradas()` exige unidade.
  Ver a discussão em aberto sobre alcance nacional de cadastro no módulo de
  eventos.
- Nenhum papel de Presidente de UAP existe em produção hoje — a carga não criou
  papel nenhum. Isto corrige uma armadilha antes da primeira concessão, não um
  operador travado.
