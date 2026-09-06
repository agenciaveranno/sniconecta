# 0011 — E-mail não identifica pessoa

*Aceita em 06/09/2026. Emenda a decisão 0004.*

## Problema

A decisão 0004 pôs `unique` em `pessoas.email`, com um bom motivo: e-mail em
branco gravado como string vazia derrubaria a segunda pessoa sem e-mail. O
`unique` resolveu isso — e criou outro problema, que só apareceu quando a base
de origem foi medida.

Dos **16.676 participantes** do Credenciamento:

| Medida | Quantidade |
|---|---|
| Sem CPF | 0 |
| CPF fora do formato | 0 |
| CPF placeholder (`111…`) | 2 |
| CodSNI repetido | 0 |
| Sem e-mail | 443 |
| **E-mails repetidos (grupos)** | **1.060** |

Mil e sessenta caixas compartilhadas. Mãe que compra para a família, casal com
um endereço só, filho que usa o e-mail do pai. Não é sujeira de cadastro: é
como as pessoas vivem, e nenhuma delas está errada.

Com o `unique`, a carga teria dois caminhos, ambos ruins: rejeitar milhares de
pessoas legítimas, ou gravá-las sem o e-mail que a instituição tem — e o
comprovante deixaria de chegar a quem sempre recebeu.

## Decisão

**E-mail deixa de ser único em `pessoas`.** Quem identifica pessoa é o CPF
(decisão 0002), com o CodSNI como segunda chave. O e-mail é dado de contato,
e contato se compartilha.

**Continua único entre quem tem conta.** Um índice parcial —
`unique (email) where auth_user_id is not null` — porque duas contas com o
mesmo e-mail seriam duas identidades para o mesmo login. O Supabase Auth já
exige e-mail único em `auth.users`; este índice é a cinta do nosso lado, para
o dia em que aquela regra mudar.

**O gatilho de ligação passa a exigir resposta única.** Quando uma conta nasce
no Auth, ele procura a pessoa pelo e-mail. Com e-mail repetido, `where email =
…` atinge a família inteira — e ligar a conta à pessoa errada é a pior falha
que este sistema pode cometer: entrega o histórico, o CPF e o endereço de
outra pessoa a quem não é ela.

Então: **liga só quando há exatamente uma candidata.** Havendo mais, não liga
e grava `conta.ligacao_ambigua` em `auditoria`. A pessoa entra sem acesso —
chato, visível e reversível em um minuto por quem administra. Ver a ficha da
irmã achando que é a sua não é reversível.

O mesmo vale no sentido inverso, quando a pessoa ganha um e-mail que já é de
uma conta: só liga se ninguém mais na base usar aquele e-mail sem conta.

## Consequências

- **Buscar pessoa por e-mail deixa de ser busca de identidade.** Toda tela que
  o fizer precisa tratar "várias" como resposta legítima e pedir o CPF para
  desempatar. É o caso do magic link do checkout público — que já pergunta o
  CPF antes.
- **Quem compartilha caixa não ganha conta automaticamente.** Para ter acesso
  ao sistema, cada pessoa precisa de um e-mail só seu. A tela de acesso pede.
- **A carga não perde e-mail nenhum.** As duas pessoas ficam com o mesmo
  endereço, e as duas recebem comprovante e certificado por ele.
- **Os 2 CPFs placeholder da origem serão rejeitados** pela validação de
  dígito verificador, com o motivo e o id antigo no relatório. São dois: se
  resolvem cadastrando o CPF certo, à mão, depois.
