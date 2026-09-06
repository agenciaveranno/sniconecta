-- ═══════════════════════════════════════════════════════════════════════════
-- Seed da estrutura publicada: Sede Central, 114 Regionais e 7 Academias
--
-- Por quê: sem a árvore cadastrada não há onde vincular pessoa, conceder papel
-- nem realizar evento. São mais de cem Regionais — digitar à mão é uma tarde
-- de trabalho e um punhado de erros de transcrição que ninguém acha depois.
--
-- ORIGEM. Extraído do site institucional por `scripts/extrair-sni.ts`. Refazer
-- com `npx tsx scripts/extrair-sni.ts > <esta migração>` quando o site mudar.
--
-- ⚠️ O QUE NÃO VEIO, E POR QUÊ.
--   · O CÓDIGO de três dígitos de cada Regional não é publicado no site. Fica
--     nulo, para a Sede preencher em tela.
--   · O CNPJ de cada Regional também não é publicado. Só o da Sede Central,
--     que está no rodapé do site.
--   · 20 Regionais não têm cidade separada e  3 não têm telefone: o endereço
--     publicado não os distingue. Nesses casos o endereço INTEIRO ficou em
--     `logradouro`, íntegro — nada foi inventado. Cidade errada é pior que
--     cidade em branco: a branca alguém preenche, a errada vira relatório
--     torto que ninguém confere.
--
-- Idempotente pelo slug: rodar de novo não duplica nem sobrescreve o que a
-- Sede já corrigiu à mão.
-- ═══════════════════════════════════════════════════════════════════════════

-- A raiz. Endereço e CNPJ do rodapé do site institucional. O CNPJ vai só em
-- dígitos, como o CPF: a tela formata na saída.
insert into unidades (tipo, nome, slug, logradouro, numero, bairro, cidade, uf, cep, telefone, cnpj)
values (
  'sede_central', 'Sede Central', 'sede-central',
  'Avenida Engenheiro Armando de Arruda Pereira', '1266', 'Jabaquara',
  'São Paulo', 'SP', '04308900', '(11) 5014-2222', '61278388000181'
)
on conflict (slug) do nothing;

-- As Regionais, filhas da Sede Central. O idioma vem da página em que cada uma
-- é publicada: o site as separa entre atividades em português e em japonês, e
-- é esse campo que decide em que língua a pessoa recebe convite e certificado.
insert into unidades (tipo, pai_id, nome, slug, idioma, logradouro, bairro, cidade, uf, cep, telefone, email)
select 'regional', (select id from unidades where slug = 'sede-central'),
       v.nome, v.slug, v.idioma, v.logradouro, v.bairro, v.cidade, v.uf, v.cep, v.telefone, v.email
  from (values
  ('DF-BRASÍLIA', 'df-brasilia', 'pt-BR', 'EQS 403 /404, s/n', 'Asa Sul', 'Brasilia', 'DF', null, '(61) 3325-2680', null),
  ('GO-GOIÂNIA', 'go-goiania', 'pt-BR', 'Rua S-2, nº 566', 'Setor Bela Vista', 'Goiânia', 'GO', '74823430', '(62) 9 9377-6204', null),
  ('MS-CAMPO GRANDE', 'ms-campo-grande', 'pt-BR', 'R. Antônio Maria Coelho, 1119', 'Centro', 'Campo Grande', 'MS', '79002221', '(67) 3382-6743', null),
  ('MS-DOURADOS', 'ms-dourados', 'pt-BR', 'Rua Monte Alegre, 2270', null, 'Vl Progresso Dourados', 'MS', '79825040', '(67) 3421-8083', null),
  ('MT-CUIABÁ', 'mt-cuiaba', 'pt-BR', 'Travessa Joaquim da Costa Siqueira, 71 - Araés - Cuiabá', null, null, 'MT', '78005740', '(65) 3321-6587', null),
  ('AL-MACEIÓ', 'al-maceio', 'pt-BR', 'Rua Dom Santino Coutinho, 77', 'Pitanguinha', 'Maceió', 'AL', '57050070', '(82) 3221-7873', null),
  ('BA-BARRIS', 'ba-barris', 'pt-BR', 'Rua General Labatut, nº 48', 'Barris', 'Salvador', 'BA', '40070100', '(77) 98736-6582', null),
  ('BA-FEIRA DE SANTANA', 'ba-feira-de-santana', 'pt-BR', 'Rua Barão de Cotegipe, 1827 - Queimadinha - Feira de Santana', null, null, 'BA', '44050012', '(75) 3223-0828', null),
  ('BA-ILHÉUS', 'ba-ilheus', 'pt-BR', 'Avenida Vereador Amilton Ignácio de Castro,156', 'Barra de Itaipe', 'Ilhéus', 'BA', '45658120', '(73) 3231-7989', null),
  ('BA-ITAMARAJU', 'ba-itamaraju', 'pt-BR', 'Praça Nações Unidas - 284 - Centro - Itamaraju', null, null, 'BA', '45836000', '(73) 3294-3280', null),
  ('BA-PITUBA', 'ba-pituba', 'pt-BR', 'Av. Prof. Magalhães Neto, 22 - Pituba', null, null, 'BA', null, '(71) 2132-4183', null),
  ('CE-FORTALEZA', 'ce-fortaleza', 'pt-BR', 'Rua Waldery Uchôa, nº 72', 'Benfica', 'Fortaleza', 'CE', '60020110', '(85) 3226-9080', null),
  ('MA-IMPERATRIZ', 'ma-imperatriz', 'pt-BR', 'Rua Tupinambá, 2616', 'Bacurí', 'Imperatriz', 'MA', '65901110', '(99) 3523-3455', null),
  ('MA-SÃO LUÍS', 'ma-sao-luis', 'pt-BR', 'Av. Alcântara Machado n° 12 - Quadra 7', 'Bairro Maranhão Novo', 'São Luís', 'MA', null, '(98) 3236-7661', null),
  ('PB-JOÃO PESSOA', 'pb-joao-pessoa', 'pt-BR', 'Av. Dom Pedro II, nº 702, Centro', null, 'João Pessoa', 'PB', '58013420', '(83) 3222-4835', null),
  ('PE-RECIFE', 'pe-recife', 'pt-BR', 'Rua do Riachuelo, 425 - Boa Vista - Recife', null, null, 'PE', '50500400', '(81) 3222-1402', null),
  ('PI-TERESINA', 'pi-teresina', 'pt-BR', 'Rua Clodoaldo Freitas, 1690 - Centro Norte - Teresina', null, null, 'PI', '64000360', '(86) 3221-2267', null),
  ('RN-NATAL', 'rn-natal', 'pt-BR', 'R. Monsenhor João da Mata, 29', 'Lagoa Nova', 'Natal', 'RN', '59075020', '(84) 3231-1213', null),
  ('SE-ARACAJU', 'se-aracaju', 'pt-BR', 'R. Dom Bosco, 1245', 'Suissa', 'Aracajú', 'SE', '49050220', '(79) 3214-3011', null),
  ('AM-MANAUS', 'am-manaus', 'pt-BR', 'Av. Ayrão, 1020', 'Centro', 'Manaus', 'AM', '69025050', '(92) 3232-6379', null),
  ('PA-BELÉM', 'pa-belem', 'pt-BR', 'Av. Generalíssimo Deodoro, 1526 - Nazaré Belém', null, null, 'PA', '66035090', '(91) 3224-5579', null),
  ('RO-CACOAL', 'ro-cacoal', 'pt-BR', 'R. Duque de Caxias, 1862', 'Centro', 'Cacoal', 'RO', '76963818', '(69) 99289-9130', null),
  ('RO-PORTO VELHO', 'ro-porto-velho', 'pt-BR', 'Rua Herbert de Azevedo, 1846', 'São Cristovão', 'Porto Velho', 'RO', '76804068', '(69) 3223-3919', null),
  ('TO - PALMAS', 'to-palmas', 'pt-BR', 'Quadra 606 Sul, AL, 11- LT 21 Plano Diretor Sul', null, 'Palmas', 'TO', '77023090', '(63) 3217-4906', null),
  ('ES-VITÓRIA', 'es-vitoria', 'pt-BR', 'Rua Bertino Borges, 144', 'Antonio Honorio', 'Vitoria', 'ES', '29070815', '(27) 99993-6381', null),
  ('MG-BH CAIÇARA', 'mg-bh-caicara', 'pt-BR', 'Rua Coronel Antônio Junqueira, 130 - Santo André - Belo horizonte', null, null, 'MG', '31230300', '(31) 3411-7411', null),
  ('MG-BH PARAISO', 'mg-bh-paraiso', 'pt-BR', 'R. José Lavarine, 391', 'Paraiso', 'Belo Horizonte', 'MG', '30270220', '(31) 3461-1501', null),
  ('MG-JUIZ DE FORA', 'mg-juiz-de-fora', 'pt-BR', 'R. Nair de Castro Cunha, 155', 'Cascatinha', 'Juiz de Fora', 'MG', '36033260', '(32) 3236-2320', null),
  ('MG-MONTES CLAROS', 'mg-montes-claros', 'pt-BR', 'R. José Rodrigues de Carvalho, 265 - São José - Montes Claros', null, null, 'MG', '39400376', '(38) 3221-4464', null),
  ('MG-TRÊS VALES', 'mg-tres-vales', 'pt-BR', 'R. Quintino Bocaiúca, 494', 'Centro', 'Governador Valadares', 'MG', '35010220', '(33) 3022-4138', null),
  ('MG-TRIÂNGULO E ALTO PARANAÍBA', 'mg-triangulo-e-alto-paranaiba', 'pt-BR', 'R. Olegário Maciel, 2500', 'Vigilato Pereira', 'Uberlândia', 'MG', null, '(34) 3214-3893', null),
  ('RJ-CATETE', 'rj-catete', 'pt-BR', 'R. Pedro Américo, 89', 'Catete', 'Rio de Janeiro', 'RJ', '22211200', '(21) 2205-9697', null),
  ('RJ-COPACABANA', 'rj-copacabana', 'pt-BR', 'R. Francisco Sá, 23 - Sala 507', 'Copacabana', 'Rio de Janeiro', 'RJ', '22080010', '(21) 2287-4299', null),
  ('RJ-NITERÓI', 'rj-niteroi', 'pt-BR', 'Av. Feliciano Sodré, 39', 'Centro', 'Niteroi', 'RJ', '24030013', '(21)2625-4442', null),
  ('SP-ARAÇATUBA', 'sp-aracatuba', 'pt-BR', 'R. Dr. Luiz Nogueira Martins, 470', 'São João', 'Araçatuba', 'SP', '16025025', '(18)3623-1088', null),
  ('SP-ARARAQUARA', 'sp-araraquara', 'pt-BR', 'Av.Jorge Haddad, 1150', 'Jd. das Estações', 'Araraquara', 'SP', '14810244', '(16) 3339-4424', null),
  ('SP-ARICANDUVA', 'sp-aricanduva', 'pt-BR', 'R. Eng. Guilherme Cristiano Frender, 880', 'Vila Antonieta', 'São Paulo', 'SP', '03477000', '(11) 2721-4198', null),
  ('SP-ATIBAIA', 'sp-atibaia', 'pt-BR', 'R. João Pires, 848', 'Centro', 'Atibaia', 'SP', '12940500', '(19) 99692-3700', null),
  ('SP-BARRETOS', 'sp-barretos', 'pt-BR', 'Av. Seicho-No-Ie, 277', 'Bairro: Exposição', 'Barretos', 'SP', '14783033', '(17) 99114-4797', null),
  ('SP-BAURU', 'sp-bauru', 'pt-BR', 'R. Monsenhor Claro, quadra 5 nº 35', 'Centro', 'Bauru', 'SP', '17015130', '(14) 3234-2233', null),
  ('SP-CAMPINAS', 'sp-campinas', 'pt-BR', 'R. Nazaré Paulista, 750 - Jardim Paineiras', null, null, 'SP', '13090610', '(19) 3251-7234', null),
  ('SP-DRACENA', 'sp-dracena', 'pt-BR', 'R. Tomé de Souza, 324', 'Centro', 'Dracena', 'SP', '17900000', '(18) 99736-9042', null),
  ('SP-GUARULHOS', 'sp-guarulhos', 'pt-BR', 'R. Barão de Mauá, 146', 'Centro', 'Guarulhos', 'SP', '07012090', '(11) 2443-3552', null),
  ('SP-INTERLAGOS', 'sp-interlagos', 'pt-BR', 'Av. Senador Teotônio Vilela, 3063', 'Cidade Dutra', 'São Paulo', 'SP', '04801010', '(11) 2155-0912', null),
  ('SP-JABAQUARA', 'sp-jabaquara', 'pt-BR', 'Praça Dácio Pires Correia, 05', 'Cidade Vargas', 'São Paulo', 'SP', '04320020', '(11) 2068-5225', null),
  ('SP-LAPA', 'sp-lapa', 'pt-BR', 'R. Roma, 287', 'Lapa', 'São Paulo', 'SP', '05050090', '(11) 3871-4696', null),
  ('SP-LIMEIRA', 'sp-limeira', 'pt-BR', 'Av. Maria Buzolin, 383', 'Jd. Piratininga', 'Limeira', 'SP', '13484318', '(19) 99999-6904', null),
  ('SP-MARÍLIA', 'sp-marilia', 'pt-BR', 'Rua Cincinato Braga, 130, esquina com Av. Nelson Spielman', null, null, 'SP', '17509002', '(14) 3433-8930', null),
  ('SP-MOGI das CRUZES', 'sp-mogi-das-cruzes', 'pt-BR', 'R. Engenheiro Eugênio Mota, 69', 'Jardim Santista', 'Mogi das Cruzes', 'SP', '08730120', '(11) 4727-6499', null),
  ('SP-OSASCO', 'sp-osasco', 'pt-BR', 'R. Tomás Spitaletti, 79', 'Centro', 'Osasco', 'SP', null, '(11) 3681-4331', null),
  ('SP-OURINHOS', 'sp-ourinhos', 'pt-BR', 'R. Maranhão, 424', 'Vila Perino', 'Ourinhos', 'SP', '19911790', null, null),
  ('SP-PENHA', 'sp-penha', 'pt-BR', 'Av. Amorim Diniz, 463', null, 'Jd. Jaú- São Paulo', 'SP', '03730040', '(11) 2641-3236', null),
  ('SP-PINDAMONHANGABA', 'sp-pindamonhangaba', 'pt-BR', 'R. Carlos Maria Koheler Asseburg, 102', 'São Benedito', 'Pindamonhangaba', 'SP', '12410060', '(12) 3527-5062', null),
  ('SP-PINHEIROS', 'sp-pinheiros', 'pt-BR', 'R. Amaro Cavalheiro, 173', null, 'Pinheiros', 'SP', '05425010', '(11) 3815-2218', null),
  ('SP-PRESIDENTE PRUDENTE', 'sp-presidente-prudente', 'pt-BR', 'R. Araraquara, 41', 'Vila Tabajara', 'Presidente Prudente', 'SP', '19014020', '(18) 3222-5931', null),
  ('SP-RIBEIRÃO PRETO', 'sp-ribeirao-preto', 'pt-BR', 'R. Mariana Junqueira, 587', 'Centro', 'Ribeirão Preto', 'SP', '14015010', '(16) 3636-8704', null),
  ('SP-SANTANA', 'sp-santana', 'pt-BR', 'R. Salvador Bicudo, 46', null, 'Tucuruvi', 'SP', '02307250', '(11) 2977-4725', 'seichosantana@gmail.com'),
  ('SP-SANTO AMARO', 'sp-santo-amaro', 'pt-BR', 'Av. Adolfo Pinheiro, 1136', 'Santo Amaro', 'São Paulo', 'SP', '04734002', '(11) 5521-7621', null),
  ('SP-SANTO ANDRÉ', 'sp-santo-andre', 'pt-BR', 'R. Martim Afonso de Souza, 322', 'Vila Leopoldina', 'Santo André', 'SP', '09195230', '(11) 4972-2513', null),
  ('SP-SANTOS', 'sp-santos', 'pt-BR', 'R. Leonardo Roitman, 17', 'Vila Mathias', 'Santos', 'SP', null, '(13) 3232-6687', null),
  ('SP-SÃO BERNARDO DO CAMPO', 'sp-sao-bernardo-do-campo', 'pt-BR', 'R. Assahí, 75 - Rudge Ramos - São Bernardo do Campo', null, null, 'SP', null, '(11) 4367-2518', null),
  ('SP-SÃO JOÃO DA BOA VISTA', 'sp-sao-joao-da-boa-vista', 'pt-BR', 'R. Saldanha Marinho, 194', null, null, 'SP', '13870229', '(19) 3633-1507', null),
  ('SP-SÃO JOSÉ DO RIO PRETO', 'sp-sao-jose-do-rio-preto', 'pt-BR', 'Av. Constituição, 1287', 'Boa Vista', 'São José do Rio Preto', 'SP', '15025120', '(17) 3233-8877', null),
  ('SP-SÃO JOSÉ DOS CAMPOS', 'sp-sao-jose-dos-campos', 'pt-BR', 'R. Eng. Prudente Meirelles de Moraes, 501', 'Vila Adyana', 'São José dos Campos', 'SP', '12243750', '(12) 3923-3933', null),
  ('SP-SÃO MIGUEL PAULISTA', 'sp-sao-miguel-paulista', 'pt-BR', 'R. Tenente Miguel Delia, 24-A - sala 4', 'Vila Rosaria', 'São Paulo', 'SP', null, '(11) 2037-1892', null),
  ('SP-SOROCABA', 'sp-sorocaba', 'pt-BR', 'Av. Com. Pereira Inácio,700 - Jd Emilia', null, null, 'SP', null, '(15) 3232-6895', null),
  ('SP-VILA PRUDENTE', 'sp-vila-prudente', 'pt-BR', 'R. Dr. Sanareli, 178', 'Vila Prudente', 'São Paulo', 'SP', '03137100', '(11) 2273-0153', null),
  ('PR-CURITIBA', 'pr-curitiba', 'pt-BR', 'Av. Prefeito Erasto Gaertner, 1833', 'Bacacheri', 'Curitiba', 'PR', '82515000', '(41) 3356-1414', null),
  ('PR-FOZ DO IGUAÇU', 'pr-foz-do-iguacu', 'pt-BR', 'R. Castelo Branco, 1015', 'Vila Maracanã', 'Foz de Iguaçu', 'PR', '85852010', null, null),
  ('PR-FRANCISCO BELTRÃO', 'pr-francisco-beltrao', 'pt-BR', 'R. Tenente Camargo, 910', 'Presidente Kennedy', 'Francisco Beltrão', 'PR', '85605090', '(46) 3524-1825', null),
  ('PR-LONDRINA', 'pr-londrina', 'pt-BR', 'R. Paranaguá, 2018 - Higienópolis', null, null, 'PR', null, '(43) 3322-3479', null),
  ('PR-MARINGÁ', 'pr-maringa', 'pt-BR', 'R. Marechal Deodoro, 625, Zona 07', null, 'Maringá', 'PR', '87030020', '(44) 3227-3977', null),
  ('PR-PARANAVAÍ', 'pr-paranavai', 'pt-BR', 'Av. Rio Grande do Norte, 1600', 'Centro', 'Paranavaí', 'PR', '87701020', '(44) 3423-5531', null),
  ('PR-UMUARAMA', 'pr-umuarama', 'pt-BR', 'Av. Flórida, 3889', 'Centro', 'Umuarama', 'PR', '87501220', '(44) 3624-0709', null),
  ('PR-WENCESLAU BRAZ', 'pr-wenceslau-braz', 'pt-BR', 'R. 19 de Dezembro, 70', null, 'Wenceslau Braz', 'PR', '86500000', null, null),
  ('RS-CAXIAS DO SUL', 'rs-caxias-do-sul', 'pt-BR', 'R. Henrique Girelli, 76', 'São Leopoldo', 'Caxias do Sul', 'RS', '95097572', '(54) 3213-3955', null),
  ('RS-IJUÍ', 'rs-ijui', 'pt-BR', 'R. 7 De Setembro, 987', 'Ijui', 'Centro', 'RS', null, '(55) 3332-5688', null),
  ('RS-NOVO HAMBURGO', 'rs-novo-hamburgo', 'pt-BR', 'R. Tupi, 1285', 'Centro', 'Novo Hamburgo', 'RS', '93320050', '(51) 3593-7599', null),
  ('RS-PASSO D''AREIA', 'rs-passo-d-areia', 'pt-BR', 'R. Bezerra de Menezes, 129', 'Passo D''Areia', 'Porto Alegre', 'RS', '91350130', '(51) 3362-7039', null),
  ('RS-PASSO FUNDO', 'rs-passo-fundo', 'pt-BR', 'R. Capitão Eleutério, 179 - loja', 'Centro', 'Passo Fundo', 'RS', '99010060', '(54) 3198 2354', null),
  ('RS-PELOTAS', 'rs-pelotas', 'pt-BR', 'R. Professor Araújo, 1554', 'Centro', 'Pelotas', 'RS', '96020360', '(53) 3305-5103', null),
  ('RS-RIO BRANCO', 'rs-rio-branco', 'pt-BR', 'Rua Afonso Pena, 149 Bairro Azenha', null, 'Porto Alegre', 'RS', '90160020', '(51) 3331-8112', null),
  ('RS-SANTA MARIA', 'rs-santa-maria', 'pt-BR', 'R. Gal. Neto, 641', 'Centro', 'Santa Maria', 'RS', '97050241', '(55) 3222-6785', null),
  ('SC-CRICIÚMA', 'sc-criciuma', 'pt-BR', 'R. Presidente Prudente. 1300', 'São Luiz', 'Criciúma', 'SC', '88803210', '(48) 98832-1582', null),
  ('SC-FLORIANÓPOLIS', 'sc-florianopolis', 'pt-BR', 'R. Profª Rosinha Campos, 349', 'Abraão', 'Florianópolis', 'SC', '88085160', '(48) 3248-5977', null),
  ('SC-JOINVILLE', 'sc-joinville', 'pt-BR', 'Av. José Vieira, 1228 - América', null, null, 'SC', '89204110', '(47) 3433-6219', null),
  ('SC-XANXERÊ', 'sc-xanxere', 'pt-BR', 'R. Antonio Ogliari, 155', 'Veneza', 'Xanxerê', 'SC', '89820000', '(49) 3433-1444', null),
  ('DF-BRASÍLIA 1 - Brasília', 'df-brasilia-1-brasilia', 'ja', 'EQS 403/404 - Área Especial para Templo - Asa Sul', null, null, 'DF', '70237400', '(61) 99908-3174', null),
  ('GO-GOIÁS - Goiânia', 'go-goias-goiania', 'ja', 'R. Número 1, 101 - Qd F 1 - Lote 10 - Setor Leste Universitário', null, null, 'GO', '74603067', '(62) 3261-4909', null),
  ('MS-MATO GROSSO 1 - Campo Grande', 'ms-mato-grosso-1-campo-grande', 'ja', 'R. Antônio Maria Coelho, 1119', 'Centro', 'Campo Grande', 'MS', '79002221', '(67) 99259-4216', null),
  ('MS-MATO GROSSO 2 - Dourados', 'ms-mato-grosso-2-dourados', 'ja', 'R. Monte Alegre, 2270', 'Vila Progresso', 'Dourados', 'MS', '79825040', '(67) 3421-8083', null),
  ('PA-PARÁ - Belém', 'pa-para-belem', 'ja', 'Av. Generalíssimo Deodoro, 1526', 'Nazaré', 'Belém', 'PA', '66035090', '(91) 3353-9881', null),
  ('SP-ABC - ABC', 'sp-abc-abc', 'ja', 'R. Martim Afonso de Souza, 322', 'Vila Pires', 'Santo André', 'SP', '09195230', '(11) 4972-2513', null),
  ('SP-CENTRAL 1 - São José dos Campos', 'sp-central-1-sao-jose-dos-campos', 'ja', 'Av. Engº Prudente Meirelles de Moraes, 501 - S/A-1', 'V. Andy''Ana', 'São José dos Campos', 'SP', '12243750', '(12) 3913-7148', null),
  ('SP-CENTRAL 2 - Mogi das Cruzes', 'sp-central-2-mogi-das-cruzes', 'ja', 'R. Eng. Eugênio Mota, 69', 'Centro', 'Mogi das Cruzes', 'SP', '08730120', '(11) 4724-8735', null),
  ('SP-NOROESTE 1 - Araçatuba', 'sp-noroeste-1-aracatuba', 'ja', 'R. Dr. Luiz Nogueira Martins, 470', null, 'Araçatuba', 'SP', '16025025', '(18) 3623-1088', null),
  ('SP-NOROESTE 2 - Bauru', 'sp-noroeste-2-bauru', 'ja', 'R. Monsenhor Claro 5-35, , Bauru', null, null, 'SP', '17015130', '(14) 3234-2233', null),
  ('SP-NORTE 1 - Campinas', 'sp-norte-1-campinas', 'ja', 'R. Nazaré Paulista, 750', 'Jardim das Paineiras', 'CAMPINAS', 'SP', '13084610', '(19) 3251-7234', null),
  ('SP-NORTE 2 - Atibaia', 'sp-norte-2-atibaia', 'ja', 'R. João Pires, 848', 'Centro', 'Atibaia', 'SP', '12940500', '(11) 4412-0603', null),
  ('SP-PAULISTA 1 - Tupã', 'sp-paulista-1-tupa', 'ja', 'R. Caingangs, 34', 'Vila Giovanetti', 'Tupã', 'SP', '17600494', '(14) 3496-1814', null),
  ('SP-SANTOS 1 - Santos', 'sp-santos-1-santos', 'ja', 'R. Leonardo Rothman, 17', 'Vila Matias', 'Santos', 'SP', '11015560', '(13) 3232-6687', null),
  ('SP-SÃO PAULO 1 - Jabaquara', 'sp-sao-paulo-1-jabaquara', 'ja', 'Rua Ibituruna, 595', null, 'Parque Imperial', 'SP', '04302052', '(11) 5585-0114', null),
  ('SP-SÃO PAULO 2 - Pinheiros', 'sp-sao-paulo-2-pinheiros', 'ja', 'Rua Amaro Cavalheiro, 205', 'Pinheiros', 'São Paulo', 'SP', '05425010', '(11) 3812-9374', null),
  ('SP-SÃO PAULO 3 - Interlagos', 'sp-sao-paulo-3-interlagos', 'ja', 'Av. Sen. Teotônio Vilela, 3.063', 'Cidade Dutra', 'São Paulo', 'SP', '04801010', '(11) 5662-1360', null),
  ('SP-SÃO PAULO 4 - São Miguel Paulista', 'sp-sao-paulo-4-sao-miguel-paulista', 'ja', 'R. Ten. Miguel Délia, 24A São Miguel Paulista', null, 'São Paulo', 'SP', '08021090', '(11) 2297-2751', null),
  ('SP-SÃO PAULO 5 - Imirim', 'sp-sao-paulo-5-imirim', 'ja', 'Av. Imirim, 2084', 'Vila Romero', 'São Paulo', 'SP', '02464300', '(11) 2256-8124', null),
  ('SP-SÃO PAULO 6 - Aricanduva', 'sp-sao-paulo-6-aricanduva', 'ja', 'R. Engo Guilherme C. Frender, 880', 'Aricanduva', 'São Paulo', 'SP', '03477000', '(11) 99788-9095', null),
  ('SP-SÃO PAULO SUL - Registro', 'sp-sao-paulo-sul-registro', 'ja', 'R. Euforbiáceas, 98 - Vila Nova Ribeira - Registro', null, null, 'SP', '11900000', '(13) 98126-0674', null),
  ('SP-SOROCABANA 1 - Presidente Prudente', 'sp-sorocabana-1-presidente-prudente', 'ja', 'R. Araraquara, 41', 'Vila Tabajara', 'Presidente Prudente', 'SP', null, '(18) 3222-5931', null),
  ('SP-SUDOESTE - Sorocaba', 'sp-sudoeste-sorocaba', 'ja', 'Av. Comendador Pereira Inácio, 700', 'Jd Vergueiro', 'Sorocaba', 'SP', '18030005', '(15) 3232-6895', null),
  ('PR-PARANÁ 1 - Londrina', 'pr-parana-1-londrina', 'ja', 'R. Paranagua, 2018', 'Jd. Higienopolis', 'Londrina', 'PR', '86015030', '(43) 3344-5912', null),
  ('PR-PARANÁ 2 - Maringá', 'pr-parana-2-maringa', 'ja', 'R. Marechal Deodoro, 611', 'Zona 7', 'Maringá', 'PR', '87030020', '(44) 3227-3977', null),
  ('PR-PARANÁ 5 - Curitiba', 'pr-parana-5-curitiba', 'ja', 'Av. Pref. Erasto Gaertner, 1833', 'Bacacheri', 'Curitiba', 'PR', '82515000', '(41) 3356-1414', null),
  ('PR-PARANÁ 6 - Umuarama', 'pr-parana-6-umuarama', 'ja', 'Av. Flórida, 3889', null, 'Umuarama', 'PR', '87501220', '(44) 3624-0709', null)
  ) as v(nome, slug, idioma, logradouro, bairro, cidade, uf, cep, telefone, email)
on conflict (slug) do nothing;

-- As Academias de Treinamento Espiritual são LOCAIS, não unidades: recebem
-- evento, não têm gente vinculada nem papel concedido.
insert into locais (tipo, nome, slug, logradouro, bairro, cidade, uf, cep, telefone, email)
select 'academia', v.nome, v.slug, v.logradouro, v.bairro, v.cidade, v.uf, v.cep, v.telefone, v.email
  from (values
  ('Academia de Treinamento Espiritual da Seicho-No-Ie - Ibiúna-SP', 'academia-de-treinamento-espiritual-da-seicho-no-ie-ibiuna-sp', 'Estrada Vicinal Seicho-No-Ie, nº 1350', 'Bairro Paiol Pequeno', 'Ibiúna', 'SP', null, null, 'seminarios@sni.org.br'),
  ('Academia de Treinamento Espiritual da Seicho-No-Ie - Santa Tecla-RS', 'academia-de-treinamento-espiritual-da-seicho-no-ie-santa-tecla-rs', 'Estrada Bruno Wulff, 565', 'Distrito Santa Tecla', 'Gravataí', 'RS', '94100994', null, 'seminarios@sni.org.br'),
  ('Academia de Treinamento Espiritual da Seicho-No-Ie - Santa Fé-BA', 'academia-de-treinamento-espiritual-da-seicho-no-ie-santa-fe-ba', 'Mata de São João, núcleo JK', 'Caixa Postal 43', 'Santa fé', 'BA', null, null, 'seminarios@sni.org.br'),
  ('Academia de Treinamento Espiritual da Seicho-No-Ie - Curitiba-PR', 'academia-de-treinamento-espiritual-da-seicho-no-ie-curitiba-pr', 'Estrada Delegado Bruno de Almeida, 6167', 'Caximba', 'Curitiba', 'PR', '81490000', null, 'seminarios@sni.org.br'),
  ('Academia de Treinamento Espiritual da Seicho-No-Ie - Minas Gerais-MG', 'academia-de-treinamento-espiritual-da-seicho-no-ie-minas-gerais-mg', 'R. Pedro de Matos, 155', 'Distrito de Amarantina', 'Ouro Preto', 'MG', '35412000', null, 'seminarios@sni.org.br'),
  ('Academia de Treinamento Espiritual da Seicho-No-Ie - Amazônia-AM', 'academia-de-treinamento-espiritual-da-seicho-no-ie-amazonia-am', 'Estrada da Belágua, 590, Capararu Benevides - PA', null, null, 'PA', '68795000', null, 'seminarios@sni.org.br'),
  ('Academia de Treinamento Espiritual da Seicho-No-Ie - Goiás-GO', 'academia-de-treinamento-espiritual-da-seicho-no-ie-goias-go', 'Rua Londrina, 42, Jardim Belo Horizonte', null, 'Aparecida de Goiânia', 'GO', '74976070', null, 'seminarios@sni.org.br')
  ) as v(nome, slug, logradouro, bairro, cidade, uf, cep, telefone, email)
on conflict (slug) do nothing;

