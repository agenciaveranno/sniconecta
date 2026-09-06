# 0008 — A estrutura institucional é uma árvore de unidades

**Situação.** A Sede descreveu a instituição assim: Sede Internacional acima
de todos, sem ingerência nossa; Sede Central no Brasil, que cuida também de
países ibero-americanos e da África latina; Regionais Doutrinárias; Núcleos e
Associações Locais.

E, ao ser perguntada, precisou três coisas que mudam o esquema:

- **O Núcleo fica entre a Regional e a Associação Local, e é opcional.** É a
  união de duas ou mais Associações Locais do mesmo endereço, que passam a ter
  caixa e estoque unificados. Onde ele não existe, a Associação Local pende
  direto da Regional.
- **Cada Associação Local pertence a uma Organização; o Núcleo não tem** —
  justamente porque une Associações Locais de organizações diferentes.
- **Uma pessoa pertence a uma única Regional, uma única Organização e uma
  única Associação Local**, e isso vale em todos os módulos.

Nenhum dos quatro sistemas existentes modela isso inteiro. O Ciclo tem
Regional e Localidade; o de eventos guarda regional, organização e associação
local como **três textos livres** na ficha do participante; o Conecta antigo
tem Regional e Associação Local em tabelas separadas, com Organização
pendurada na AL. Núcleo e Sede Internacional não existem como entidade em
lugar nenhum. Ver `docs/estudo/estrutura-organizacional.md`.

**Decisão.** Uma tabela `unidades` com `tipo` e `pai_id` — árvore recursiva —
e `tipos_unidade` como catálogo. A organização é **coluna da unidade**,
obrigatória em quem o catálogo diz que exige.

```
Sede Central → Regional → [Núcleo] → Associação Local (tem Organização)
                       └───────────→ Associação Local (tem Organização)
```

**O catálogo guarda os tipos que podem ser o pai, não um número de nível.**
Contar degraus daria a resposta errada em metade dos casos, porque o Núcleo é
opcional: a Associação Local está a dois saltos da Regional onde ele existe e
a um salto onde não existe. Pela mesma razão, "de que Regional é esta
Associação Local?" se responde subindo a árvore até achar o tipo `regional`
(`app.ancestral_do_tipo`), nunca contando saltos.

**A organização da pessoa se deriva da Associação Local dela**, e não é
guardada em `pessoa`. Guardar nos dois lugares deixaria a pessoa dizer que é
da Fraternidade enquanto a Associação Local dela é da Prosperidade, sem nada
no banco perceber. A visão `pessoa_vinculo_atual` devolve as três respostas —
Regional, Organização e Associação Local — numa leitura só.

**Por que árvore e não uma tabela por nível.** Porque a altura da instituição
não é conhecida, e três sinais dizem isso antes de qualquer resposta: Núcleo
aparece na fala e em nenhum dado; a lista de 114 regionais do sistema de
eventos mistura dois níveis na mesma coluna, e São Paulo é visivelmente mais
funda que as outras UFs; e a Sede Central cuida de outros países, o que é um
nível a mais ou uma raiz a mais. Com tabelas por nível, cada uma dessas
descobertas vira migração de esquema com dado de produção em cima, e cada
módulo futuro repete uma coluna de escopo por nível — foi o que aconteceu com
o Conecta antigo, que carrega `regional_id` **e** `associacao_local_id` em
quatro tabelas, com um `check` para garantir que só uma esteja preenchida.
Com árvore, nível novo é uma linha em `tipos_unidade`, e todo módulo tem uma
única chave estrangeira para dizer onde a coisa aconteceu.

**O que a árvore custa, e por que é aceitável.** O RLS que sobe a árvore
precisa de `WITH RECURSIVE`. Mas a policy nunca consulta a árvore direto: ela
chama uma função `SECURITY DEFINER STABLE`, que é o padrão que o Ciclo já usa
e já documentou (sem ele, a policy que consulta `papeis` dispara o RLS de
`papeis` e recursa para sempre). A ordem de grandeza é de centenas a poucos
milhares de nós, avaliados uma vez por comando. Se um dia doer, a saída
conhecida é materializar o fecho transitivo numa tabela de ancestrais mantida
por gatilho — e a regra do projeto é medir antes de otimizar.

**Duas condições para a árvore não virar bagunça.**

1. `tipos_unidade` declara `pais_permitidos`, e um gatilho recusa `pai_id` de
   tipo fora da lista. Sem isso, nada impede pendurar uma Regional dentro de
   uma Associação Local — e todo cálculo de escopo passa a mentir.
2. `locais` (hotel, salão, espaço) **fica fora da árvore**. Local é recurso
   físico, não unidade institucional. O Conecta antigo tentou juntar os dois
   num enum `regional | al | outro` e teve de acrescentar `academia` numa
   migração seguinte.

**Suposições assumidas onde a Sede ainda não respondeu.** Estão listadas em
`docs/estudo/estrutura-organizacional.md` §6 com o efeito de cada resposta.
O esquema nasce com estas, todas baratas de reverter porque são dado ou
índice, não forma:

| Suposição | Base | Como se reverte |
|---|---|---|
| Sede Internacional fora da árvore | "não temos ingerência sobre nada" | uma linha de tipo e uma unidade raiz |
| Funções doutrinárias: as 11 do Ciclo | é a lista validada com a Sede na especificação do Ciclo | é dado numa tabela com `ordem` |
| Só a Associação Local exige organização | a Sede citou a AL e negou o Núcleo; sobre Regional não disse | `exige_organizacao` no catálogo |

Já **confirmadas** pela Sede e implementadas: o Núcleo entre Regional e
Associação Local e opcional; a organização na Associação Local e ausente no
Núcleo; um vínculo por pessoa; e as quatro organizações — Pomba Branca,
Fraternidade, Jovens e Prosperidade — como ponto de partida de um cadastro
editável em tela, não como lista fechada.

**Consequência.** `unidades` substitui `regionais` do Ciclo e as três colunas
de texto do sistema de eventos — e a coluna `organizacao` do participante
deixa de existir, porque a organização passa a vir da Associação Local dele. A `localidade` do Ciclo — que reúne uma ou
mais Regionais e é onde a turma acontece — continua existindo como tabela do
módulo (`ciclo_localidades`), apontando para `unidades`: ela é um agrupamento
operacional do curso, não um degrau da instituição. `slug` entra em `unidades`
desde já, mesmo sem site público decidido: retrofitar slug depois quebra URL
que já circulou.
