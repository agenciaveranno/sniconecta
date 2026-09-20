# 0019 — O cadastro da unidade é página, não modal

**Data:** 2026-09-20
**Situação:** aceita
**Decide:** Sede (SEICHO-NO-IE DO BRASIL)
**Altera:** a regra "todo cadastro acontece em modal" (`docs/design-system.md`),
pela segunda vez — a primeira foi a decisão 0015, da ficha da pessoa.

## Problema

A unidade — Regional, Núcleo, Associação Local — nasceu como cadastro curto e
cabia num modal. Deixou de caber.

Hoje ela tem nome, código, idioma, CNPJ, sete campos de endereço, telefone,
WhatsApp, e-mail, quatro redes, endereço na web e a conta Cielo. Passa de
vinte campos numa caixa que rola dentro de uma página que não rola, com o
rodapé de botões escondendo o que se está preenchendo.

E vai crescer com assuntos que **não se parecem**: fotos que o site publica,
as contas por onde a entidade recebe dinheiro, e o CDOR — o Conselho da
unidade. Empilhados no mesmo modal, quem vinha trocar o telefone passa por
tudo.

Há ainda um defeito que só existia por causa da caixa única. A Merchant Key da
Cielo é `<input type="password">` e morava no mesmo formulário do e-mail da
unidade. Um campo de senha ao lado de um campo de e-mail faz o navegador ler a
tela como login: o gerenciador de senhas preenchia os dois **sem ninguém
pedir**. O e-mail da Regional trocava pelo de quem estava editando, e a
Merchant Key era gravada cifrada com uma senha que não é a da loja — o que
derruba a venda da entidade sem erro nenhum aparecer na tela.

## Decisão

**A unidade é uma página dedicada**, em `/admin/estrutura/[id]`, com abas:

- **Dados cadastrais** — o que era o modal.
- **Fotos** — as imagens que o site publica.
- **Pagamento** — a conta Cielo e, depois, as contas bancárias.
- **CDOR** — os membros do Conselho.

**Criar continua em modal.** Nascer é um punhado de campos, e a lista é o lugar
certo para isso: quem cadastra três Regionais seguidas não quer navegar para
outra tela e voltar três vezes. Editar é que virou dossiê.

Uma página para os **três degraus**. A lista já é um componente só
(`ListaDeUnidades`) justamente para Regionais, Núcleos e Associações Locais não
divergirem; uma página de edição por degrau desfaria isso na primeira aba que
alguém acrescentasse em uma só.

## O critério da 0015, aplicado

Vira página quem tiver **duas** destas. A unidade tem as quatro:

- passa de ~15 campos — passa de vinte;
- tem upload de arquivo — as fotos;
- tem mais de um assunto dentro — são quatro;
- precisa de URL própria — "me manda a Regional de Maceió" vira um link.

O critério continua valendo, e continua sendo o que impede a decisão de virar
"cada tela do jeito que deu".

## Cada aba é um formulário próprio

Não é organização: é o que tira o par usuário+senha da frente do navegador.
Com a conta Cielo em aba própria, o campo de senha deixa de conviver com o
campo de e-mail, e o preenchimento automático não tem mais o que parear.

Some a isso `autocomplete="off"` no e-mail e `autocomplete="new-password"` na
Merchant Key — este último porque o Chrome **ignora** `off` em campo de senha,
e `new-password` é o único valor que ele respeita para dizer "não preencha com
a guardada".

## O que isso muda em quem salva

Salvar os dados cadastrais não passa mais perto da conta Cielo, e salvar a
conta não passa perto do cadastro. A marca `cielo_na_tela` continua de pé e
continua sendo o que impede um formulário que não desenhou o bloco de APAGAR a
conta da entidade — agora com uma garantia a mais, porque os dois nem
compartilham formulário.

A capacidade também se separa: o cadastro exige `estrutura.gerir`, a aba de
pagamento exige `configuracao.gerir`. Quem desenha a estrutura não
necessariamente manda em por onde entra o dinheiro.

## As abas são URL, não estado

`?aba=pagamento`, como na 0015. Renderizado no servidor, sem JavaScript para
trocar de aba, e o endereço da aba é compartilhável.

## O que NÃO muda

- O modal continua sendo o padrão do sistema para todo o resto: organização,
  departamento, local, categoria.
- Desativar continua desativando, nunca apagando.
- Server Action continua começando com `exigirCapacidade(...)`.
