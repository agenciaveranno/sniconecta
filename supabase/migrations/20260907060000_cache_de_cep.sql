-- ───────────────────────────────────────────────────────────────────────────
-- CACHE DE CEP (decisão 0014)
--
-- Guarda o que a consulta de CEP já respondeu. Não é otimização: é o que faz o
-- cadastro funcionar quando a internet do balcão está ruim, e é por onde a
-- base oficial dos Correios (DNE) entra no dia em que a Sede a licenciar —
-- carregada aqui, nenhuma tela muda, porque a consulta já olha nesta tabela
-- antes de sair para a rede.
--
-- ⚠️ SEM GRANT. O navegador nunca fala com esta tabela: quem lê e escreve é a
-- rota do servidor, com a chave de serviço. Assim, no dia em que o provedor
-- for pago, a credencial dele não precisa existir no navegador de ninguém.
-- ───────────────────────────────────────────────────────────────────────────

create table ceps (
  -- Só dígitos, como todo identificador do sistema. A tela formata na saída.
  cep         text primary key check (cep ~ '^[0-9]{8}$'),
  logradouro  text,
  complemento text,
  bairro      text,
  cidade      text not null,
  uf          char(2) not null,
  -- Qual provedor respondeu. Serve para saber o que substituir quando a base
  -- oficial chegar: o que veio do DNE não se re-consulta.
  fonte       text not null,
  criado_em   timestamptz not null default now()
);

comment on table ceps is
  'Endereços já consultados. Cache e ponto de entrada da base oficial dos '
  'Correios — ver decisão 0014.';

alter table ceps enable row level security;
-- E nenhum grant: nem anon, nem authenticated.
