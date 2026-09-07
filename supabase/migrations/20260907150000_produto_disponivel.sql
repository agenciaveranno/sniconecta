-- ───────────────────────────────────────────────────────────────────────────
-- PRODUTO SEM ESTOQUE CONTINUA SENDO PRODUTO
--
-- A loja tem título publicado sem preço — "A Lição dos Bichos (Japonês)", R$ 0.
-- Deixá-lo de fora da importação apagaria do catálogo uma obra que existe; e
-- importá-lo como se estivesse à venda o ofereceria por zero real.
--
-- ⚠️ `disponivel` é uma coisa diferente de `ativo`. `ativo` responde "este
-- produto faz parte do catálogo?" — desligado, ele some da tela. `disponivel`
-- responde "dá para comprar agora?" — desligado, ele APARECE, marcado como sem
-- estoque. Sem a separação, o único jeito de impedir a venda seria sumir com a
-- obra, e quem procurasse por ela concluiria que a instituição não a tem.
-- ───────────────────────────────────────────────────────────────────────────

alter table produtos add column disponivel boolean not null default true;

comment on column produtos.disponivel is
  'Dá para comprar agora. Diferente de `ativo`: o indisponível continua no '
  'catálogo, marcado como sem estoque.';

-- ⚠️ Produto sem preço não pode ficar disponível. É a regra que impede a venda
-- por zero real de existir no banco, e não só na tela que a esconde — a
-- importação roda sozinha, e uma tela não protege o que ela grava.
alter table produtos add constraint sem_preco_nao_vende
  check (preco_capa_centavos > 0 or not disponivel);

create index idx_produtos_disponiveis on produtos(categoria_id) where disponivel and ativo;

-- ───────────────────────────────────────────────────────────────────────────
-- ASSINATURA DE REVISTA NÃO É COTA DE REVISTA
--
-- São duas coisas com o mesmo substantivo, e a Sede foi explícita:
--
--   · ASSINATURA — 12 exemplares por ano, enviados pelo Correio à casa da
--     pessoa. É produto: tem preço, se compra na livraria, se entrega.
--   · COTA — mínimo de 10 por mês conforme a função doutrinária, retirada na
--     Associação Local para divulgar. Não é compra no varejo: é o
--     compromisso do Associado, e mora no módulo de revistas.
--
-- ⚠️ Categoria própria por causa disso. Sem ela, "Assinatura de Revista Fonte
-- de Luz (12 meses)" ficaria em Artigos Religiosos, ao lado de incenso e
-- pingente — e quem fosse conferir as revistas do mês encontraria a assinatura
-- no lugar errado e concluiria que o sistema tem duas verdades sobre revista.
-- Aqui ele vê onde cada coisa mora, e por quê.
-- ───────────────────────────────────────────────────────────────────────────

insert into produto_categorias (nome, ordem) values ('Assinaturas de Revista', 3)
on conflict (nome) do nothing;
