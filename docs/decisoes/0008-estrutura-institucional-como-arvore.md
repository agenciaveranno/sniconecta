# 0008 — A estrutura institucional é uma árvore de unidades

**Situação.** A Sede descreveu a instituição assim: Sede Internacional acima
de todos, sem ingerência nossa; Sede Central no Brasil, que cuida também de
países ibero-americanos e da África latina; Regionais Doutrinárias; Núcleos e
Associações Locais. As Organizações atravessam todas as esferas.

Nenhum dos quatro sistemas existentes modela isso inteiro. O Ciclo tem
Regional e Localidade; o de eventos guarda regional, organização e associação
local como **três textos livres** na ficha do participante; o Conecta antigo
tem Regional e Associação Local em tabelas separadas, com Organização
pendurada na AL. Núcleo e Sede Internacional não existem como entidade em
lugar nenhum. Ver `docs/estudo/estrutura-organizacional.md`.

**Decisão.** Uma tabela `unidades` com `tipo` e `pai_id` — árvore recursiva —
e `tipos_unidade` como catálogo com `nivel`. Organizações ficam **fora** da
árvore, numa dimensão transversal.

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

1. `tipos_unidade` tem `nivel`, e um gatilho recusa `pai_id` cujo tipo não
   seja o nível imediatamente acima. Sem isso, nada no tipo impede pendurar
   uma Regional dentro de uma Associação Local.
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
| Níveis: Sede Central → Regional → {Núcleo, Associação Local} | a própria frase da Sede põe Núcleo e AL no mesmo degrau | linha em `tipos_unidade` |
| Sede Internacional fora da árvore | "não temos ingerência sobre nada" | uma linha de tipo e uma unidade raiz |
| Pessoa tem **um** vínculo de unidade ativo por vez | é o modelo do Conecta antigo, e é o que torna "minha AL" uma pergunta com resposta | remover um índice único parcial |
| Organização é vínculo **da pessoa**, N:N com vigência | "as Organizações transpassam todas as esferas" descreve a pessoa atravessando a hierarquia, não a unidade | acrescentar `unidade_organizacoes` |
| Funções doutrinárias: as 11 do Ciclo | é a lista validada com a Sede na especificação do Ciclo | é dado numa tabela com `ordem` |
| Organizações: os quatro nomes que estão em produção no sistema de eventos | são os que classificam mais de 16 mil pessoas hoje | é dado, editável em tela |

**Consequência.** `unidades` substitui `regionais` do Ciclo e as três colunas
de texto do sistema de eventos. A `localidade` do Ciclo — que reúne uma ou
mais Regionais e é onde a turma acontece — continua existindo como tabela do
módulo (`ciclo_localidades`), apontando para `unidades`: ela é um agrupamento
operacional do curso, não um degrau da instituição. `slug` entra em `unidades`
desde já, mesmo sem site público decidido: retrofitar slug depois quebra URL
que já circulou.
