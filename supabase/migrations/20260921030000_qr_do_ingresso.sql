-- O ingresso ganha um código próprio, e quem gera é o banco
--
-- `eventos.inscricoes.qr_code` existe desde a fundação e está VAZIA para tudo
-- que esta plataforma vendeu: a coluna veio da carga, preenchida só para os
-- ingressos do sistema antigo. A porta, por isso, só sabe procurar por
-- documento — e o balcão entrega um ingresso sem nada que se leia.
--
-- ⚠️ O CÓDIGO NÃO É O `id`, e não é o CPF. Um identificador sequencial deixa
-- qualquer pessoa imprimir um ingresso plausível somando um; o CPF acaba
-- fotografado e repassado em grupo de WhatsApp junto com a imagem do QR. O que
-- vai no código é aleatório e não diz nada sobre quem o carrega: 64 bits de
-- sorteio, que é mais do que alguém adivinha digitando.
--
-- ⚠️ QUEM GERA É O BANCO, por DEFAULT — não a aplicação. Gerado em TypeScript,
-- o formato existiria em dois lugares: a venda balcão, a transferência e o que
-- vier depois teriam cada um a sua cópia, e a primeira que divergisse criaria
-- ingresso que a porta não lê. Com o default, toda linha nova nasce com código
-- sem ninguém precisar lembrar.
--
-- Formato: SNI-XXXX-XXXX-XXXX-XXXX, hexadecimal em caixa alta. Hexadecimal
-- porque na porta o código é DITADO quando a câmera falha, e 0-9A-F não tem
-- par ambíguo — nada de O contra 0, nem de I contra 1.
--
-- ⚠️ Não se cria índice ÚNICO aqui. Os códigos da carga vêm do sistema antigo
-- e não há como conferir daqui se algum se repete; um `create unique index`
-- que encontrasse repetição derrubaria a migração DEPOIS do merge, com o
-- deploy já no ar. O índice é comum, e a leitura da porta trata o caso de dois
-- resultados em vez de supor que ele não existe.

create or replace function eventos.novo_qr() returns text
language sql volatile as $$
  -- As posições 13 e 17 de um uuid v4 compacto são fixas (versão e variante):
  -- ficam de fora, senão dois dos dezesseis caracteres seriam sempre os mesmos.
  select 'SNI-' || upper(
           substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' ||
           substr(h, 9, 4) || '-' || substr(h, 19, 4))
    from (select replace(gen_random_uuid()::text, '-', '') as h) u;
$$;

comment on function eventos.novo_qr() is
  'Código do ingresso: SNI-XXXX-XXXX-XXXX-XXXX, 64 bits de sorteio. Usado como default de eventos.inscricoes.qr_code.';

alter table eventos.inscricoes
  alter column qr_code set default eventos.novo_qr();

-- ⚠️ Preenche o que já está lá, e SÓ o que está sem código. Reescrever os
-- códigos da carga invalidaria os ingressos que já foram emitidos e
-- circularam: a pessoa chega na porta com o papel na mão e o código não existe
-- mais em lugar nenhum.
update eventos.inscricoes
   set qr_code = eventos.novo_qr()
 where qr_code is null or btrim(qr_code) = '';

-- A porta procura pelo código em caixa alta: o da carga pode vir em qualquer
-- caixa, e quem digita no balcão não distingue.
create index if not exists idx_inscricoes_qr
  on eventos.inscricoes (upper(qr_code));
