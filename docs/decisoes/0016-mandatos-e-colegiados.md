# 0016 — Cargo é mandato datado, não coluna na pessoa

**Data:** 2026-09-07
**Situação:** aceita
**Decide:** Sede (SEICHO-NO-IE DO BRASIL)

## Problema

A instituição tem duas dezenas de cargos, em duas direções:

- **De cima para baixo, nomeados:** Diretor-Presidente, Vice-Presidentes e
  Diretores da DAC; membros do CDOC; Supervisor Regional; gestores de
  Departamento e de Seção; Diretoria de Academia; Presidente e membros da CEC.
- **De baixo para cima, eleitos:** Presidente de Associação Local; Presidentes
  Regionais (Federações); Presidente da Associação dos Preletores e dos
  Educadores Regionais; Representante Regional.

Cada um tem **duração e mês de início próprios**:

| Colegiado / cargo | Duração | Começa em |
|---|---|---|
| DAC | 3 anos | 1º de março |
| CDOC | 3 anos | 1º de janeiro |
| CDOR | 3 anos | 1º de setembro |
| Supervisor Regional | 3 anos | 1º de outubro |
| Presidente de Associação Local | 3 anos | 1º de junho |
| Representante Regional | 1 ano | — |
| CEC, CER, Academia, Departamentos | 3 anos | acompanham a DAC ou o Presidente |

## Decisão

**Uma tabela de mandatos**, com pessoa, cargo, âmbito, início e fim. Não uma
coluna `presidente_id` em cada tabela.

### Por que não coluna

`unidades.supervisor_id` responde quem é o Supervisor hoje e **apaga** quem era
antes. A ata de 2024 foi assinada por alguém; o relatório de 2023 é dele. Com
coluna, a troca de gestão reescreve o passado — e a pergunta "quem assinou
isto?" deixa de ter resposta no dia seguinte à posse.

Mandato datado responde as duas: quem é hoje, e quem era naquela data.

### Por que não reusar `papeis`

`papeis` é **autorização**: decide o que a pessoa pode fazer no sistema.
Mandato é **fato institucional**: existe para quem nunca vai abrir o sistema, e
a maioria dos titulares nunca vai. Juntar os dois faria toda posse conceder
acesso e toda concessão de acesso parecer posse.

Eles se relacionam — quem é Supervisor normalmente recebe papel de coordenador
— mas a relação é uma decisão de quem administra, não uma identidade.

## Requisito de função doutrinária

Cada cargo exige uma função mínima, e a lista não é a mesma:

- Diretor-Presidente e Vices: Preletor em grau Máster, Aspirante a Preletor da
  Sede Internacional, ou Preletor da Sede Internacional.
- Diretores da DAC: os acima, ou Preletor em grau Sênior.
- CDOC: Preletor de qualquer grau.
- Supervisor: Preletor de qualquer grau.
- Presidente de AL, Diretoria de Academia, CEC, CER: Preletor ou Divulgador de
  qualquer grau.

**A regra fica em DADO, na tabela de cargos, e não em `if` no código.** A Sede
muda requisito por decisão de assembleia, não por implantação de sistema.

⚠️ E o requisito é conferido **na data da posse**, contra o histórico de função
doutrinária — não contra a função de hoje. Quem foi nomeado Diretor sendo
Sênior e depois virou Máster não pode fazer a nomeação de 2024 parecer
irregular; nem o contrário.

## Efetivo e ouvinte

Membros de DAC e CDOC podem ser **efetivos** ou **ouvintes** — a diferença é
que ouvinte não vota. É atributo do mandato, não da pessoa: a mesma pessoa pode
ser efetiva num colegiado e ouvinte noutro.

## Secretário

Todo colegiado tem um Secretário, que **pode ser de fora dele**. Por isso é um
cargo como os outros dentro do mesmo colegiado, e não uma coluna
`secretario_id`: quem secretaria sem ser membro precisa de mandato próprio,
para a ata de 2025 saber quem a lavrou.

## O Supervisor preside o CDOR e não vota

Exceto para desempatar. Fica em dado (`vota` como `nunca`, `sempre`,
`desempate`), pela mesma razão do requisito: é regra de assembleia.

## O que NÃO entra agora

Eleição — urna, apuração, chapa. O sistema registra o **resultado**: quem tomou
posse, quando, e por qual mandato. Conduzir a eleição é outro problema, e
misturar os dois faria o cadastro de quem é Presidente depender de um módulo
que ainda não existe.
