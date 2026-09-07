# 0015 — A ficha da pessoa é página, não modal

**Data:** 2026-09-07
**Situação:** aceita
**Decide:** Sede (SEICHO-NO-IE DO BRASIL)
**Altera:** a regra "todo cadastro acontece em modal" (`docs/design-system.md`)

## Problema

A regra do modal existe por um bom motivo: cadastro curto em modal mantém a
pessoa no contexto da lista, sem perder onde estava.

A ficha da pessoa deixou de ser cadastro curto. São mais de trinta campos,
documentos anexados, foto, papéis, vínculo, histórico de função doutrinária —
e vai crescer: Missão Sagrada, cotas de revista, inscrições em eventos.

Num modal isso vira uma caixa que rola dentro de uma página que não rola, com
o rodapé de botões escondendo o que se está preenchendo.

## Decisão

**A ficha da pessoa é uma página dedicada**, em `/admin/pessoas/[id]`, com abas.
Duas hoje — Dados Cadastrais e Anexos — e mais depois.

A regra do modal **continua valendo para todo o resto**: organização,
departamento, local, unidade, categoria. Modal é o padrão; página é a exceção
para o cadastro que virou dossiê.

## O critério, para a próxima vez

Vira página quando **duas** destas forem verdade:

- passa de ~15 campos;
- tem upload de arquivo;
- tem mais de um assunto dentro (abas);
- precisa de URL própria, para alguém mandar o link a outra pessoa.

Abaixo disso, modal. O critério existe para a decisão não virar "cada tela do
jeito que deu".

## As abas são URL, não estado

`?aba=anexos`. Renderizado no servidor, sem JavaScript para trocar de aba, e o
endereço da aba é compartilhável — quem pede "me manda os documentos dele"
recebe um link que abre onde deve.

Aba como estado de componente perderia isso e quebraria o botão Voltar.

## O que NÃO muda

- Esc e clique fora continuam sem fechar nada, porque não há o que fechar.
- Salvar continua sendo Server Action, com `exigirCapacidade` na primeira linha.
