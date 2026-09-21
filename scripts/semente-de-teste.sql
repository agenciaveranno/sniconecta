-- Um evento de mentira, para as consultas do módulo `eventos` rodarem contra
-- um Postgres de verdade.
--
-- ⚠️ A semente cobre os CASOS QUE MORDEM, não o caso feliz. Consulta que só é
-- exercitada com dados bem-comportados passa verde e quebra no primeiro
-- registro que a carga trouxe torto: a cortesia com preço preenchido, a
-- inscrição sem tipo de ingresso, o combo cujo item saiu de venda pública, a
-- pessoa com passaporte em vez de CPF.

-- Duas pessoas: uma com CPF, uma com passaporte (decisão 0013 — exatamente um
-- dos dois), para as buscas exercitarem os dois caminhos.
insert into pessoas (id, cpf, nome, email) values
  ('aaaa0000-0000-0000-0000-000000000001', '39053344705', 'Maria de Teste', 'maria@teste.local');
insert into pessoas (id, cpf, passaporte, nome) values
  ('aaaa0000-0000-0000-0000-000000000002', null, 'AB123456', 'Yoko de Teste');

insert into eventos.eventos (id, nome, data_inicial, data_final, local_id, promotor_unidade_id)
select 900, 'Seminário de Teste', now(), now() + interval '1 day',
       (select id from locais limit 1),
       (select id from unidades where tipo = 'regional' limit 1);

-- Um evento sem promotor e sem ingresso: é o que faz `porQueNaoVende` e a
-- página pública terem o que recusar.
insert into eventos.eventos (id, nome, data_inicial, data_final)
values (901, 'Evento Sem Nada', now(), now());

insert into eventos.ingresso_tipos
  (id, evento_id, nome, valor_centavos, papel, quantidade, unico_por_cpf, exige_principal, exibir_venda_publica)
values
  (9001, 900, 'Inteira',  10000, 'principal', 100, false, false, true),
  (9002, 900, 'Jantar',    5000, 'adicional',  20, true,  true,  true),
  -- Fora da venda pública: a página do mundo não pode mostrar este.
  (9003, 900, 'Cortesia',  10000, 'principal', null, false, false, false);

insert into eventos.ingresso_campos (id, ingresso_tipo_id, rotulo, tipo, opcoes, obrigatorio, ordem)
values
  (9101, 9001, 'Tamanho da camiseta', 'selecao', '["P","M","G"]'::jsonb, false, 1),
  (9102, 9002, 'Restrição alimentar', 'multipla', '["Vegetariano","Sem glúten"]'::jsonb, false, 1),
  (9103, 9001, 'Como soube do evento', 'texto', null, false, 2);

insert into eventos.combos (id, evento_id, nome, valor_centavos, quantidade)
values (9201, 900, 'Inteira + Jantar', 12000, 30);
insert into eventos.combo_itens (combo_id, ingresso_tipo_id, quantidade)
values (9201, 9001, 1), (9201, 9002, 1);

-- Combo cujos itens NÃO são de venda pública: a página do mundo tem de
-- escondê-lo, senão anuncia um pacote que o site não entrega.
insert into eventos.combos (id, evento_id, nome, valor_centavos)
values (9202, 900, 'Pacote Interno', 9000);
insert into eventos.combo_itens (combo_id, ingresso_tipo_id, quantidade)
values (9202, 9003, 1);

insert into eventos.cupons (id, evento_id, codigo, tipo, valor, ingresso_tipo_id)
values (9301, 900, 'VERAO10', 'percentual', 10, null),
       (9302, 900, 'SOJANTAR', 'valor', 1000, 9002);
-- Cupom preso a um combo: `conferirCupom` tem de RECUSAR este.
insert into eventos.cupons (id, evento_id, codigo, tipo, valor, combo_id)
values (9303, 900, 'PACOTE20', 'percentual', 20, 9201);

-- As inscrições, uma por situação que morde.
insert into eventos.inscricoes
  (id, pessoa_id, evento_id, ingresso_tipo_id, combo_id, compra_grupo_id, tipo_venda, status,
   forma_pagamento, valor_original_centavos, desconto_centavos, data_compra, checkin_em)
values
  -- paga, já entrou
  (9401, 'aaaa0000-0000-0000-0000-000000000001', 900, 9001, null,
   '11110000-0000-0000-0000-00000000aaaa', 'balcao', 'pago', 'dinheiro', 10000, 0, now(), now()),
  -- paga, não entrou
  (9402, 'aaaa0000-0000-0000-0000-000000000002', 900, 9002, null,
   '11110000-0000-0000-0000-00000000bbbb', 'balcao', 'pago', 'pix', 5000, 1000, now(), null),
  -- ⚠️ CORTESIA COM VALOR PREENCHIDO: é o que a carga trouxe, e o defeito que
  -- este módulo já cometeu três vezes — arrecadação inflada e estorno de
  -- dinheiro que ninguém pagou.
  (9403, 'aaaa0000-0000-0000-0000-000000000001', 900, 9003, null,
   '11110000-0000-0000-0000-00000000cccc', 'cortesia', 'pago', null, 10000, 0, now(), null),
  -- pendente
  (9404, 'aaaa0000-0000-0000-0000-000000000002', 900, 9001, null, null,
   'online', 'pendente', null, 10000, 0, now(), null),
  -- cancelada, com estorno na fila
  (9405, 'aaaa0000-0000-0000-0000-000000000001', 900, 9001, null, null,
   'balcao', 'cancelado', 'dinheiro', 10000, 0, now(), null),
  -- ⚠️ SEM TIPO DE INGRESSO: a carga deixou assim, e um `join` fechado a faria
  -- sumir da tela com a pessoa na frente do balcão.
  (9406, 'aaaa0000-0000-0000-0000-000000000002', 900, null, null, null,
   'importado', 'pago', null, 0, 0, now(), null),
  -- de combo
  (9407, 'aaaa0000-0000-0000-0000-000000000001', 900, 9001, 9201,
   '11110000-0000-0000-0000-00000000dddd', 'balcao', 'pago', 'maquininha', 10000, 1500, now(), null),
  (9408, 'aaaa0000-0000-0000-0000-000000000001', 900, 9002, 9201,
   '11110000-0000-0000-0000-00000000dddd', 'balcao', 'pago', 'maquininha', 5000, 1500, now(), null);

update eventos.inscricoes
   set estorno_status = 'pendente',
       estorno = jsonb_build_object('valor_centavos', 10000, 'origem', 'cancelamento'),
       cancelado_em = now(), cancelamento_motivo = 'desistiu'
 where id = 9405;

insert into eventos.inscricao_respostas (inscricao_id, campo_id, rotulo, valor)
values (9401, 9101, 'Tamanho da camiseta', 'M'),
       (9402, 9102, 'Restrição alimentar', 'Vegetariano; Sem glúten'),
       (9401, 9103, 'Como soube do evento', 'Pela Regional');

insert into eventos.pedidos (id, comprador_id, evento_id, ingresso_tipo_id, quantidade, status)
values (9501, 'aaaa0000-0000-0000-0000-000000000001', 900, 9001, 1, 'pendente');

insert into eventos.comissao_setores_padrao (nome, ordem) values ('Recepção', 1)
  on conflict do nothing;
insert into eventos.comissao_funcoes_padrao (nome, ordem) values ('Credenciamento', 1)
  on conflict do nothing;
insert into eventos.comissao_membros (evento_id, pessoa_id, nome, setor, funcao)
values (900, 'aaaa0000-0000-0000-0000-000000000001', 'Maria de Teste', 'Recepção', 'Credenciamento'),
       -- Sem pessoa vinculada e com setor fora do catálogo: é o que a carga
       -- trouxe, e o que a tela precisa marcar como pendente de conciliação.
       (900, null, 'Alguém da Carga', 'SETOR ANTIGO', 'FUNÇÃO ANTIGA');
