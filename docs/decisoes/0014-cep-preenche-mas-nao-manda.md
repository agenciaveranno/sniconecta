# 0014 — O CEP preenche o endereço, mas quem manda é quem digita

**Data:** 2026-09-07
**Situação:** aceita
**Decide:** Sede (SEICHO-NO-IE DO BRASIL)

## Problema

Digitar logradouro, bairro, cidade e UF à mão, dezesseis mil vezes, produz
dezesseis mil grafias diferentes da mesma rua. E é lento no balcão, com a
pessoa esperando.

## Decisão

Ao sair do campo de CEP, o sistema busca o endereço e **preenche** os quatro
campos. Todos continuam editáveis, e o que a pessoa escrever por cima é o que
fica gravado.

O CEP **ajuda, não engessa**: ele não trava campo, não impede salvar, e sua
falha nunca bloqueia um cadastro. Endereço sem CEP encontrado continua sendo
endereço válido — casa em zona rural, condomínio novo, endereço no exterior.

## De onde vem o endereço

Os Correios **não publicam API aberta**: a base oficial (DNE) é licenciada por
contrato, e o serviço deles exige credencial. Então:

1. **BrasilAPI `/cep/v2/`** — consulta vários provedores em cadeia, entre eles
   o serviço dos próprios Correios, e devolve o primeiro que responder.
2. **ViaCEP** — segunda tentativa, quando a primeira falha ou não conhece o CEP.

Ordem, e não escolha: CEP que um não conhece o outro às vezes conhece, e
tentar os dois custa menos que um cadastro errado.

## Por que há uma tabela de cache

`ceps` guarda o que já foi respondido. Três razões, em ordem de peso:

1. **O cadastro não pode depender de a internet estar boa.** Um CEP já visto
   responde do banco, sem rede.
2. Dezesseis mil pessoas de uma Associação Local moram em poucas ruas. Sem
   cache, é a mesma pergunta repetida milhares de vezes.
3. **É por onde a base oficial entra depois.** No dia em que a Sede licenciar o
   DNE dos Correios, ele é carregado nesta tabela e nenhuma tela muda — a
   consulta já olha aqui primeiro. A decisão de hoje não fecha a porta da
   amanhã.

## O que NÃO se faz

- **Não se valida CEP contra a base.** CEP que a consulta não conhece é
  gravado assim mesmo. Recusar o que a base não tem transformaria uma ajuda em
  obstáculo, e a base tem buracos.
- **Não se sobrescreve o que já está preenchido** sem a pessoa pedir: quem
  editou o complemento e depois corrigiu o CEP não perde o que digitou.
- **Não se chama a API do navegador direto.** A consulta passa pelo servidor,
  que é quem cacheia — e assim a chave de um provedor pago, no futuro, não
  precisa ir para o navegador de ninguém.
