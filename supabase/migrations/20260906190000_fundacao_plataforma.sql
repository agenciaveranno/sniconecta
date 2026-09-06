-- ═══════════════════════════════════════════════════════════════════════════
-- Fundação da plataforma SNI Conecta
--
-- Por quê: os dois sistemas que viram módulos — Ciclo de Estudos e
-- Credenciamento de Eventos — têm cada um a sua ideia de pessoa, de estrutura
-- e de papel. Enquanto não houver uma só, cada módulo continua dono de um
-- cadastro paralelo, e a pessoa que faz o curso e compra o ingresso é duas
-- pessoas no banco.
--
-- O que aconteceria sem isto: a ficha 360º pedida pela Sede não existe, a
-- deduplicação por CPF não tem onde acontecer, e cada módulo novo repete a
-- decisão de identidade do seu jeito.
--
-- Decisões que este arquivo implementa:
--   0002  CPF identifica, uuid referencia
--   0004  e-mail anulável, obrigatório só quando existe conta
--   0007  plataforma em `public` sem prefixo; GRANT tabela a tabela
--   0008  estrutura institucional como árvore de unidades
--   0009  papel tem escopo de unidade; catálogo em vez de `check` fixo
--
-- ⚠️ NÃO existe `alter default privileges` aqui, de propósito (decisão 0007).
-- Toda concessão é explícita, ao lado da tabela, e o harness de RLS reprova
-- quem sobrar sem declaração.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;  -- gen_random_uuid()
create extension if not exists citext;    -- e-mail sem diferença de caixa
create extension if not exists unaccent;  -- busca de nome sem acento

create schema if not exists app;
comment on schema app is
  'Funções de autorização usadas pelas policies. SECURITY DEFINER para não '
  'disparar o RLS da própria tabela que a policy consulta.';

/**
 * Texto normalizado para busca: sem acento e sem diferença de caixa.
 *
 * ⚠️ `unaccent()` de um argumento NÃO é IMMUTABLE — depende de qual
 * dicionário está configurado na sessão, e o Postgres recusa índice sobre
 * ela. Fixando o dicionário aqui, o resultado passa a depender só da
 * entrada, e o invólucro pode ser IMMUTABLE. É o que permite indexar a
 * busca por nome, que é como a secretaria digita: "sao paulo" tem de achar
 * "São Paulo".
 */
create or replace function app.sem_acento(texto text)
returns text language sql immutable parallel safe as $$
  select lower(public.unaccent('public.unaccent'::regdictionary, coalesce(texto, '')))
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ORGANIZAÇÕES
--
-- Cada Associação Local pertence a uma Organização (Sede, set/2026). O Núcleo
-- não tem: ele é a união de Associações Locais de organizações DIFERENTES no
-- mesmo endereço, que passam a compartilhar caixa e estoque.
--
-- Por isso a organização é atributo da UNIDADE, e a da pessoa se deriva da
-- Associação Local dela. Guardar nos dois lugares deixaria a pessoa dizer que
-- é da Fraternidade enquanto a AL dela é da Prosperidade, e nada no banco
-- perceberia.
--
-- Vem antes da árvore porque `unidades` aponta para cá.
-- ───────────────────────────────────────────────────────────────────────────

create table organizacoes (
  id         uuid primary key default gen_random_uuid(),
  codigo     text unique,
  nome       text not null unique,
  nome_curto text,
  ordem      smallint not null default 0,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

comment on table organizacoes is
  'Organizações doutrinárias. Cadastro editável em tela: a Sede cria novas '
  'sem migração.';

-- ───────────────────────────────────────────────────────────────────────────
-- ESTRUTURA INSTITUCIONAL (decisão 0008)
--
-- Árvore única em vez de uma tabela por nível, porque a altura da instituição
-- não é conhecida: Núcleo aparece na fala e em nenhum dado, a base de eventos
-- mistura dois níveis na mesma coluna, e a Sede Central cuida de outros
-- países. Com árvore, nível novo é uma linha aqui; com tabela por nível,
-- seria migração com dado de produção em cima.
-- ───────────────────────────────────────────────────────────────────────────

create table tipos_unidade (
  codigo    text primary key,
  nome      text not null,
  -- Plural para a tela de estrutura não escrever "2 Regionals".
  plural    text not null,

  -- Quais tipos podem ser a unidade superior. Lista vazia = fica no topo.
  --
  -- ⚠️ É lista, e não um número de nível, porque o NÚCLEO É OPCIONAL: uma
  -- Associação Local pende direto da Regional ou de dentro de um Núcleo, e as
  -- duas formas são corretas. Com profundidade fixa, metade das Associações
  -- Locais do país seria recusada no cadastro.
  pais_permitidos text[] not null default '{}',

  -- A Associação Local pertence a uma Organização; o Núcleo não tem, porque é
  -- justamente a união de Associações Locais de organizações diferentes no
  -- mesmo endereço. Fica no catálogo, e não num `if`, para o dia em que a
  -- Sede decidir que outro degrau também tem.
  exige_organizacao boolean not null default false,

  ordem     smallint not null default 0,
  ativo     boolean not null default true
);

comment on table tipos_unidade is
  'Catálogo dos degraus da instituição. Degrau novo entra com INSERT, não com '
  'migração — ver decisão 0008.';

create table unidades (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null references tipos_unidade(codigo) on delete restrict,
  pai_id        uuid references unidades(id) on delete restrict,
  -- Obrigatória na Associação Local, proibida no Núcleo — o gatilho abaixo
  -- lê a regra do catálogo, não daqui.
  organizacao_id uuid references organizacoes(id) on delete restrict,
  nome          text not null,
  nome_curto    text,
  -- Código próprio da instituição (a numeração das Regionais, por exemplo).
  -- Único quando presente; `unique` ignora nulos.
  codigo        text unique,
  -- Entra desde já mesmo sem site público decidido: retrofitar slug depois
  -- quebra URL que já circulou.
  slug          text unique,
  cnpj          text,
  -- Endereço e contato. Ficam na unidade, não numa tabela à parte: são um
  -- por unidade e sempre lidos junto com ela.
  cep           text,
  logradouro    text,
  numero        text,
  complemento   text,
  bairro        text,
  cidade        text,
  uf            char(2),
  pais          char(2) not null default 'BR',
  telefone      text,
  email         citext,
  -- ⚠️ O idioma NÃO é enfeite: parte das Regionais conduz as atividades em
  -- japonês, e o site institucional as lista em página separada por isso.
  -- É o que decide em que língua a pessoa daquela Regional recebe o convite,
  -- o comprovante e o certificado. Texto livre, não `check`: acrescentar um
  -- idioma não pode custar migração.
  idioma        text not null default 'pt-BR',
  -- Existe porque a Sede Central cuida também de países ibero-americanos e da
  -- África latina. Enquanto for só Brasil, o padrão responde.
  fuso_horario  text not null default 'America/Sao_Paulo',
  ativo         boolean not null default true,
  -- Rastro da carga do sistema de eventos, onde a unidade era texto livre.
  legado_nome   text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint unidade_nao_e_pai_de_si check (pai_id is distinct from id),
  constraint slug_formato check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index idx_unidades_pai on unidades(pai_id);
create index idx_unidades_tipo on unidades(tipo);
create index idx_unidades_organizacao on unidades(organizacao_id);
-- Busca por nome sem acento e sem diferença de caixa, que é como a secretaria
-- digita: "sao paulo" precisa achar "São Paulo".
create index idx_unidades_nome_busca on unidades(app.sem_acento(nome));

comment on table unidades is
  'Árvore institucional: Sede Central → Regional → [Núcleo] → Associação '
  'Local. O Núcleo é opcional. Local físico (hotel, salão) NÃO entra aqui — '
  'ver tabela `locais`.';

-- Pai do tipo errado quebra todo cálculo de escopo, e nada no tipo da coluna
-- impede pendurar uma Regional dentro de uma Associação Local. A regra vem do
-- catálogo: assim, acrescentar um degrau é INSERT, não migração.
create or replace function app.validar_unidade()
returns trigger language plpgsql as $$
declare
  permitidos text[];
  exige      boolean;
  tipo_pai   text;
begin
  select pais_permitidos, exige_organizacao
    into permitidos, exige
    from tipos_unidade where codigo = new.tipo;

  if permitidos is null then
    raise exception 'Tipo de unidade desconhecido: %.', new.tipo;
  end if;

  -- Quem pode ter pai, precisa ter.
  if new.pai_id is null then
    if array_length(permitidos, 1) is not null then
      raise exception 'Unidade do tipo % precisa estar dentro de outra.', new.tipo;
    end if;
  else
    select tipo into tipo_pai from unidades where id = new.pai_id;
    if not (tipo_pai = any (permitidos)) then
      raise exception
        'Unidade do tipo % não pode ficar dentro de unidade do tipo %.',
        new.tipo, tipo_pai;
    end if;
  end if;

  if exige and new.organizacao_id is null then
    raise exception 'Unidade do tipo % precisa de uma organização.', new.tipo;
  end if;
  if not exige and new.organizacao_id is not null then
    raise exception 'Unidade do tipo % não tem organização.', new.tipo;
  end if;

  return new;
end $$;

create trigger trg_unidades_valida
  before insert or update of tipo, pai_id, organizacao_id on unidades
  for each row execute function app.validar_unidade();

/**
 * A unidade e todos os ancestrais dela, da folha até a raiz.
 *
 * É o caminho inverso de `unidades_administradas`, e serve à autorização na
 * aplicação: para saber se alguém pode agir numa Associação Local, pergunta-se
 * se ela tem o papel NELA ou em qualquer unidade acima. Subir a partir do alvo
 * custa a profundidade da árvore (três ou quatro saltos); descer a partir do
 * papel custaria a subárvore inteira.
 */
create or replace function app.ancestrais(alvo uuid)
returns table (unidade_id uuid)
language sql stable security definer set search_path = public as $$
  with recursive subida as (
    select id, pai_id from unidades where id = alvo
    union all
    select u.id, u.pai_id from unidades u join subida s on u.id = s.pai_id
  )
  select id from subida
$$;


/**
 * O ancestral de um tipo, subindo a partir da unidade.
 *
 * É como se responde "de que Regional é esta Associação Local?" sem que a
 * consulta precise saber se existe um Núcleo no meio — e o Núcleo é opcional,
 * então contar saltos daria a resposta errada em metade dos casos.
 */
create or replace function app.ancestral_do_tipo(alvo uuid, tipo_alvo text)
returns uuid language sql stable security definer set search_path = public as $$
  select u.id
    from app.ancestrais(alvo) a
    join unidades u on u.id = a.unidade_id
   where u.tipo = tipo_alvo
   limit 1
$$;

/**
 * Invólucro público de `app.ancestrais`, para a aplicação poder chamar.
 *
 * ⚠️ O PostgREST só enxerga o schema exposto, e `app` não é exposto de
 * propósito — é lá que moram as funções que ignoram o RLS. Este invólucro é a
 * única porta, e não vaza nada: devolve só identificadores de unidade, que
 * qualquer pessoa autenticada já lê em `unidades`.
 */
create or replace function public.ancestrais(alvo uuid)
returns table (unidade_id uuid)
language sql stable security definer set search_path = public as $$
  select unidade_id from app.ancestrais(alvo)
$$;

revoke execute on function public.ancestrais(uuid) from public;
grant execute on function public.ancestrais(uuid) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- LOCAIS — recurso físico, deliberadamente fora da árvore
--
-- Onde o evento acontece: Academia de Treinamento Espiritual, hotel, salão.
-- Uma Academia NÃO é uma Regional, não tem gente vinculada e não recebe
-- papel — ela recebe evento. Por isso fica aqui e não na árvore.
--
-- O Conecta antigo aprendeu isso na prática: começou com um enum
-- `regional | al | outro` no local e precisou acrescentar `academia` numa
-- migração seguinte, com tabela própria. Aqui o tipo já nasce em catálogo.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function app.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create table tipos_local (
  codigo text primary key,
  nome   text not null,
  plural text not null,
  ordem  smallint not null default 0,
  ativo  boolean not null default true
);

create table locais (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null references tipos_local(codigo) on delete restrict,
  nome        text not null,
  -- Código próprio da instituição, quando houver. Único quando presente.
  codigo      text unique,
  slug        text unique,
  -- Quem cuida do local, quando é de alguma unidade. Nulo = de terceiro.
  unidade_id  uuid references unidades(id) on delete set null,
  cep         text,
  logradouro  text,
  numero      text,
  complemento text,
  bairro      text,
  cidade      text,
  uf          char(2),
  telefone    text,
  email       citext,
  -- Para o mapa de "como chegar". O Conecta antigo já guardava as duas.
  latitude    numeric(10,7),
  longitude   numeric(10,7),
  observacoes text,
  ativo       boolean not null default true,
  legado_id   integer unique,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint local_slug_formato check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index idx_locais_unidade on locais(unidade_id);
create index idx_locais_tipo on locais(tipo);
create index idx_locais_nome_busca on locais(app.sem_acento(nome));

create trigger trg_locais_atualizado before update on locais
  for each row execute function app.tocar_atualizado_em();

-- ───────────────────────────────────────────────────────────────────────────
-- PESSOAS — a espinha (decisões 0002 e 0004)
--
-- CPF identifica: é por ele que se reconcilia, se busca e se deduplica.
-- O uuid referencia: é ele que as chaves estrangeiras apontam, porque CPF
-- como alvo de FK replicaria dado pessoal em toda tabela e todo índice, e
-- corrigir um dígito digitado errado viraria cascata.
-- ───────────────────────────────────────────────────────────────────────────

create table pessoas (
  id            uuid primary key default gen_random_uuid(),

  cpf           text not null unique,
  -- Identificador da Seicho-No-Ie. TEXT e nunca número: tipo numérico come
  -- zero à esquerda. Anulável porque o checkout público cadastra quem ainda
  -- não tem — mas único quando presente, e é a segunda chave que revela erro
  -- de digitação no CPF durante a carga.
  cod_sni       text unique,

  nome          text not null,
  nome_social   text,
  -- ⚠️ Anulável de propósito (decisão 0004): milhares de pessoas na base de
  -- eventos não têm e-mail ou o compartilham em família, e a maioria nunca
  -- fará login. Obrigatório só quando existe conta, pelo check abaixo.
  -- E-mail em branco vira NULL, NUNCA string vazia: '' passa no not null e
  -- derruba o unique na segunda pessoa sem e-mail.
  email         citext unique,
  nascimento    date,
  sexo          char(1) check (sexo is null or sexo in ('F','M','O')),
  telefone      text,
  telefone2     text,

  cep           text,
  logradouro    text,
  numero        text,
  complemento   text,
  bairro        text,
  cidade        text,
  uf            char(2),
  pais          char(2) not null default 'BR',

  foto_url      text,
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  ativo         boolean not null default true,
  falecimento   date,

  -- Carga do MySQL de eventos: id antigo para a migração ser repetível, e um
  -- saco para o que ainda não tem coluna (regional e organização em texto
  -- livre, enquanto o catálogo oficial de unidades não chega).
  legado_id       integer unique,
  migracao_extras jsonb,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- O banco confere o FORMATO; o dígito verificador é conferido na entrada,
  -- em src/lib/dominio/cpf.ts. CPF com DV errado passaria aqui, entraria como
  -- pessoa legítima, e no dia em que alguém cadastrasse o CPF certo nasceria
  -- uma segunda pessoa.
  constraint cpf_11_digitos  check (cpf ~ '^[0-9]{11}$'),
  constraint cod_sni_digitos check (cod_sni is null or cod_sni ~ '^[0-9]+$'),
  constraint email_nao_vazio check (email is null or length(btrim(email::text)) > 0),
  -- O Supabase Auth autentica por e-mail: conta sem e-mail é conta que não
  -- entra.
  constraint conta_exige_email check (auth_user_id is null or email is not null)
);

create index idx_pessoas_auth_user on pessoas(auth_user_id);
create index idx_pessoas_nome_busca on pessoas(app.sem_acento(nome));

comment on table pessoas is
  'Cadastro único. CPF identifica, id referencia. Importar não significa '
  'criar conta: conta nasce quando alguém precisa entrar.';

create trigger trg_pessoas_atualizado before update on pessoas
  for each row execute function app.tocar_atualizado_em();
create trigger trg_unidades_atualizado before update on unidades
  for each row execute function app.tocar_atualizado_em();

-- ───────────────────────────────────────────────────────────────────────────
-- VÍNCULO DA PESSOA COM A ESTRUTURA
--
-- UM vínculo ativo, e só um: a pessoa pertence a uma única Regional, uma
-- única Organização e uma única Associação Local (Sede, set/2026). Como a AL
-- já carrega a organização e pende da Regional, o vínculo com a AL responde
-- as três — e não há como os três discordarem entre si.
--
-- Histórico, e não uma coluna em `pessoas`, porque transferência é fato
-- datado: o relatório do ano passado não pode mudar quando alguém muda de
-- cidade hoje.
-- ───────────────────────────────────────────────────────────────────────────

create table pessoa_unidade_vinculos (
  id           uuid primary key default gen_random_uuid(),
  pessoa_id    uuid not null references pessoas(id) on delete cascade,
  unidade_id   uuid not null references unidades(id) on delete restrict,
  data_inicio  date not null default current_date,
  data_fim     date,
  motivo       text,
  criado_em    timestamptz not null default now(),

  constraint periodo_coerente check (data_fim is null or data_fim >= data_inicio)
);

-- Um vínculo ativo por pessoa (suposição registrada na decisão 0008): é o que
-- torna "a minha Associação Local" uma pergunta com uma resposta. Se a Sede
-- disser que pode haver mais de um, some este índice e nada mais muda.
create unique index uq_vinculo_ativo
  on pessoa_unidade_vinculos(pessoa_id) where data_fim is null;
create index idx_vinculos_unidade on pessoa_unidade_vinculos(unidade_id);

-- ───────────────────────────────────────────────────────────────────────────
-- FUNÇÃO DOUTRINÁRIA — progressão, com histórico datado
--
-- Tabela e não enum: a lista muda. Histórico e não coluna: desconto do Ciclo
-- depende da função, e uma promoção em julho não pode reescrever o preço de
-- uma matrícula de janeiro.
-- ───────────────────────────────────────────────────────────────────────────

create table funcoes_doutrinarias (
  id    uuid primary key default gen_random_uuid(),
  nome  text not null unique,
  ordem smallint not null unique,
  ativo boolean not null default true
);

create table pessoa_funcao_hist (
  id              uuid primary key default gen_random_uuid(),
  pessoa_id       uuid not null references pessoas(id) on delete cascade,
  funcao_id       uuid not null references funcoes_doutrinarias(id) on delete restrict,
  vigencia_inicio date not null,
  registrado_por  uuid references pessoas(id) on delete set null,
  criado_em       timestamptz not null default now()
);

create index idx_funcao_hist_pessoa
  on pessoa_funcao_hist(pessoa_id, vigencia_inicio desc);

-- A função vigente é o registro de vigência mais recente.
-- `security_invoker` para a view respeitar o RLS de quem consulta, e não o de
-- quem a criou.
create view pessoa_funcao_atual with (security_invoker = true) as
select distinct on (h.pessoa_id)
       h.pessoa_id, h.funcao_id, f.nome as funcao_nome, f.ordem as funcao_ordem,
       h.vigencia_inicio
  from pessoa_funcao_hist h
  join funcoes_doutrinarias f on f.id = h.funcao_id
 order by h.pessoa_id, h.vigencia_inicio desc, h.criado_em desc;

/**
 * Onde a pessoa está HOJE, com as três respostas que todo módulo precisa.
 *
 * "Uma pessoa pertence a uma única Regional, Organização e Associação Local"
 * (Sede, set/2026) — e isso vale em todos os módulos, então a resposta mora
 * num lugar só. A Regional é encontrada subindo a árvore, e não contando
 * saltos, porque o Núcleo entre ela e a Associação Local é opcional.
 *
 * `security_invoker`: a visão respeita o RLS de quem consulta, não o de quem
 * a criou.
 */
create view pessoa_vinculo_atual with (security_invoker = true) as
select v.pessoa_id,
       v.unidade_id,
       u.tipo            as unidade_tipo,
       u.nome            as unidade_nome,
       u.organizacao_id,
       o.nome            as organizacao_nome,
       app.ancestral_do_tipo(v.unidade_id, 'regional') as regional_id,
       v.data_inicio
  from pessoa_unidade_vinculos v
  join unidades u      on u.id = v.unidade_id
  left join organizacoes o on o.id = u.organizacao_id
 where v.data_fim is null;

-- ───────────────────────────────────────────────────────────────────────────
-- PAPÉIS (decisão 0009)
--
-- O papel diz o que a pessoa É na instituição; a matriz em
-- src/lib/permissoes.ts diz o que isso a autoriza a fazer. Escopo mais fino
-- que unidade — professor de uma turma, aluno de uma matrícula — é dado do
-- módulo, não papel.
-- ───────────────────────────────────────────────────────────────────────────

create table tipos_papel (
  codigo text primary key,
  nome   text not null,
  -- 'plataforma' ou o nome do módulo dono. Serve à tela de concessão e ao
  -- teste que confere que papel de um módulo não recebe capacidade de outro.
  modulo text not null,
  -- 'nacional' vale em todo lugar; 'unidade' exige unidade e desce na árvore.
  escopo text not null check (escopo in ('nacional','unidade')),
  -- A única parte da autorização que o RLS precisa saber: este papel
  -- administra a unidade em que foi concedido? A matriz completa continua em
  -- TypeScript; isto é estrutura, não política.
  administra_unidade boolean not null default false,
  ordem  smallint not null default 0,
  ativo  boolean not null default true
);

create table papeis (
  id         uuid primary key default gen_random_uuid(),
  pessoa_id  uuid not null references pessoas(id) on delete cascade,
  tipo       text not null references tipos_papel(codigo) on delete restrict,
  -- Nulo = nacional. Preenchido = vale nesta unidade e nas descendentes.
  unidade_id uuid references unidades(id) on delete cascade,
  ativo      boolean not null default true,
  concedido_por uuid references pessoas(id) on delete set null,
  criado_em  timestamptz not null default now()
);

create unique index uq_papel_nacional
  on papeis(pessoa_id, tipo) where unidade_id is null;
create unique index uq_papel_unidade
  on papeis(pessoa_id, tipo, unidade_id) where unidade_id is not null;
create index idx_papeis_pessoa on papeis(pessoa_id) where ativo;
create index idx_papeis_unidade on papeis(unidade_id) where ativo;

-- O `check` do sistema antigo era fixo nos seis tipos do Ciclo e recusava
-- papel nacional de outro módulo. Aqui a regra vem do catálogo, então papel
-- de módulo novo entra com INSERT.
create or replace function app.validar_escopo_papel()
returns trigger language plpgsql as $$
declare esperado text;
begin
  select escopo into esperado from tipos_papel where codigo = new.tipo;
  if esperado = 'nacional' and new.unidade_id is not null then
    raise exception 'O papel % é nacional e não se concede a uma unidade.', new.tipo;
  end if;
  if esperado = 'unidade' and new.unidade_id is null then
    raise exception 'O papel % precisa de uma unidade.', new.tipo;
  end if;
  return new;
end $$;

create trigger trg_papeis_valida_escopo
  before insert or update of tipo, unidade_id on papeis
  for each row execute function app.validar_escopo_papel();

-- ───────────────────────────────────────────────────────────────────────────
-- AUDITORIA, FILA E CONFIGURAÇÃO
-- ───────────────────────────────────────────────────────────────────────────

create table auditoria (
  id         bigserial primary key,
  pessoa_id  uuid references pessoas(id) on delete set null,
  acao       text not null,
  entidade   text,
  -- TEXT e não uuid: os módulos preservam ids inteiros do sistema antigo
  -- (número de pedido e de voucher já circularam em e-mail).
  entidade_id text,
  detalhe    jsonb,
  ip         inet,
  criado_em  timestamptz not null default now()
);

create index idx_auditoria_pessoa on auditoria(pessoa_id, criado_em desc);
create index idx_auditoria_entidade on auditoria(entidade, entidade_id);

comment on table auditoria is
  'Trilha de quem fez o quê. NUNCA guardar segredo aqui, nem cifrado.';

-- Uma fila para a plataforma inteira. Módulo novo não cria a segunda.
create table notificacoes (
  id            bigserial primary key,
  pessoa_id     uuid references pessoas(id) on delete set null,
  canal         text not null check (canal in ('email','whatsapp')),
  destino       text not null,
  -- Anulável: o módulo eventos precisa de corpo livre por regional, o módulo
  -- ciclo trabalha por template. A fila aceita os dois.
  template      text,
  variaveis     jsonb,
  assunto       text,
  corpo         text not null,
  status        text not null default 'pendente'
                  check (status in ('pendente','enviada','falhou','cancelada')),
  tentativas    smallint not null default 0,
  ultimo_erro   text,
  -- Impede a duplicata que o cron manual e o agendado criariam ao rodar
  -- juntos. Conversa de WhatsApp é cobrada: mandar duas vezes custa dinheiro
  -- e confunde quem recebe.
  chave_unica   text unique,
  criado_em     timestamptz not null default now(),
  enviado_em    timestamptz
);

create index idx_notificacoes_pendentes
  on notificacoes(criado_em) where status = 'pendente';

-- Configuração que é decisão do cliente mora no banco, editável em tela.
-- Segredo de infraestrutura mora em variável de ambiente.
create table configuracoes (
  id                  smallint primary key default 1 check (id = 1),
  controlador         text,
  encarregado_dpo     text,
  encarregado_email   citext,
  politica_retencao   text,
  politica_privacidade text,
  atualizado_em       timestamptz not null default now(),
  atualizado_por      uuid references pessoas(id) on delete set null
);

insert into configuracoes (id) values (1) on conflict (id) do nothing;

-- Dado de convicção religiosa é sensível (LGPD art. 11): o consentimento
-- guarda a VERSÃO do texto aceito, não só a data. Sem a versão, não se
-- reconstitui com o que a pessoa concordou.
create table consentimentos_lgpd (
  id         uuid primary key default gen_random_uuid(),
  pessoa_id  uuid not null references pessoas(id) on delete cascade,
  versao     text not null,
  aceito_em  timestamptz not null default now(),
  ip         inet,
  origem     text
);

create index idx_consentimentos_pessoa on consentimentos_lgpd(pessoa_id, aceito_em desc);

create table solicitacoes_exclusao (
  id              uuid primary key default gen_random_uuid(),
  pessoa_id       uuid references pessoas(id) on delete set null,
  nome_informado  text not null,
  email_informado citext,
  cpf_informado   text,
  situacao        text not null default 'aberta'
                    check (situacao in ('aberta','em_analise','atendida','recusada')),
  decisao         text,
  decidido_por    uuid references pessoas(id) on delete set null,
  decidido_em     timestamptz,
  criado_em       timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- FUNÇÕES DE AUTORIZAÇÃO (schema app)
--
-- Todas SECURITY DEFINER e STABLE. Sem SECURITY DEFINER, uma policy de
-- `pessoas` que consultasse `papeis` dispararia o RLS de `papeis`, que
-- consulta `pessoas` — recursão infinita. É a mesma armadilha que o módulo
-- ciclo já documentou.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function app.pessoa_atual()
returns uuid language sql stable security definer set search_path = public as $$
  select id from pessoas where auth_user_id = auth.uid()
$$;

create or replace function app.e_sede()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from papeis p
     where p.pessoa_id = app.pessoa_atual()
       and p.ativo
       and p.tipo = 'sede'
  )
$$;

/**
 * Unidades que a pessoa administra, incluindo TODAS as descendentes.
 *
 * É aqui que a árvore é percorrida, uma vez por comando (STABLE), e não em
 * cada linha avaliada. Quem coordena uma Regional alcança as Associações
 * Locais dela sem ninguém conceder papel uma a uma — que é justamente o que
 * a estrutura em árvore comprou.
 */
create or replace function app.unidades_administradas()
returns table (unidade_id uuid)
language sql stable security definer set search_path = public as $$
  with recursive raiz as (
    select p.unidade_id as id
      from papeis p
      join tipos_papel t on t.codigo = p.tipo
     where p.pessoa_id = app.pessoa_atual()
       and p.ativo
       and t.administra_unidade
       and p.unidade_id is not null
  ),
  descendentes as (
    select id from raiz
    union
    select u.id
      from unidades u
      join descendentes d on u.pai_id = d.id
  )
  select id from descendentes
$$;

/** A pessoa administra esta unidade (direta ou por herança na árvore)? */
create or replace function app.administra(alvo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select app.e_sede() or exists (
    select 1 from app.unidades_administradas() where unidade_id = alvo
  )
$$;

/** Unidade do vínculo ativo da pessoa — o "onde ela está" de hoje. */
create or replace function app.unidade_da_pessoa(alvo uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select v.unidade_id
    from pessoa_unidade_vinculos v
   where v.pessoa_id = alvo and v.data_fim is null
   limit 1
$$;

-- ⚠️ EXECUTE é concedido a PUBLIC por padrão. Estas funções ignoram RLS por
-- serem SECURITY DEFINER, então a concessão é explícita e restrita.
revoke execute on function
  app.pessoa_atual(), app.e_sede(), app.unidades_administradas(),
  app.administra(uuid), app.ancestrais(uuid), app.ancestral_do_tipo(uuid, text),
  app.unidade_da_pessoa(uuid)
  from public;
grant usage on schema app to authenticated, service_role;
grant execute on function
  app.pessoa_atual(), app.e_sede(), app.unidades_administradas(),
  app.administra(uuid), app.ancestrais(uuid), app.ancestral_do_tipo(uuid, text),
  app.unidade_da_pessoa(uuid)
  to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- RLS E GRANTS (decisão 0007)
--
-- GRANT concede, RLS restringe: são camadas distintas e ambas necessárias.
-- Sem GRANT a policy nem chega a ser avaliada; sem policy o GRANT não alcança
-- linha nenhuma. Tudo explícito, tabela a tabela.
-- ───────────────────────────────────────────────────────────────────────────

alter table tipos_unidade          enable row level security;
alter table unidades               enable row level security;
alter table organizacoes           enable row level security;
alter table tipos_local            enable row level security;
alter table locais                 enable row level security;
alter table pessoas                enable row level security;
alter table pessoa_unidade_vinculos enable row level security;
alter table funcoes_doutrinarias   enable row level security;
alter table pessoa_funcao_hist     enable row level security;
alter table tipos_papel            enable row level security;
alter table papeis                 enable row level security;
alter table auditoria              enable row level security;
alter table notificacoes           enable row level security;
alter table configuracoes          enable row level security;
alter table consentimentos_lgpd    enable row level security;
alter table solicitacoes_exclusao  enable row level security;

-- `anon` não tem privilégio em tabela alguma. Conteúdo público é servido pelo
-- servidor com `service_role`, em fluxo controlado.
grant usage on schema public to anon, authenticated;

-- ── Referência: todo autenticado lê, só a Sede escreve ─────────────────────
grant select on tipos_unidade, unidades, organizacoes, tipos_local, locais,
                funcoes_doutrinarias, tipos_papel to authenticated;
-- A visão não tem RLS própria: `security_invoker` faz valer o RLS das tabelas
-- de baixo, que é onde a regra está escrita.
grant select on pessoa_vinculo_atual, pessoa_funcao_atual to authenticated;

create policy ref_le_tipos_unidade on tipos_unidade for select to authenticated using (true);
create policy ref_le_unidades      on unidades      for select to authenticated using (true);
create policy ref_le_organizacoes  on organizacoes  for select to authenticated using (true);
create policy ref_le_tipos_local   on tipos_local   for select to authenticated using (true);
create policy ref_le_locais        on locais        for select to authenticated using (true);
create policy ref_le_funcoes       on funcoes_doutrinarias for select to authenticated using (true);
create policy ref_le_tipos_papel   on tipos_papel   for select to authenticated using (true);

-- Escrita em estrutura: a Sede. Uma regional renomeada por engano desalinha
-- relatório de todo mundo.
grant insert, update, delete on unidades, locais to authenticated;
create policy estrutura_escreve_unidades on unidades for all to authenticated
  using (app.e_sede()) with check (app.e_sede());
create policy estrutura_escreve_locais on locais for all to authenticated
  using (app.e_sede()) with check (app.e_sede());

-- ── Pessoas ────────────────────────────────────────────────────────────────
-- Quem administra uma unidade vê quem está vinculado a ela ou a uma
-- descendente. Todo mundo vê a si mesmo. A Sede vê tudo.
grant select, insert, update on pessoas to authenticated;

create policy pessoas_le on pessoas for select to authenticated
  using (
    id = app.pessoa_atual()
    or app.e_sede()
    or app.unidade_da_pessoa(id) in (select unidade_id from app.unidades_administradas())
  );

create policy pessoas_escreve on pessoas for insert to authenticated
  with check (app.e_sede() or exists (select 1 from app.unidades_administradas()));

create policy pessoas_atualiza on pessoas for update to authenticated
  using (
    app.e_sede()
    or app.unidade_da_pessoa(id) in (select unidade_id from app.unidades_administradas())
  )
  with check (
    app.e_sede()
    or app.unidade_da_pessoa(id) in (select unidade_id from app.unidades_administradas())
  );

-- ⚠️ Sem DELETE para ninguém: exclusão de pessoa é decisão de LGPD, passa por
-- `solicitacoes_exclusao` e é executada pelo servidor com auditoria. Apagar a
-- linha levaria junto certificado emitido e ingresso comprado.

-- ── Vínculos, organizações e função ────────────────────────────────────────
grant select, insert, update on pessoa_unidade_vinculos, pessoa_funcao_hist
  to authenticated;

create policy vinculos_le on pessoa_unidade_vinculos for select to authenticated
  using (pessoa_id = app.pessoa_atual() or app.administra(unidade_id));
create policy vinculos_escreve on pessoa_unidade_vinculos for all to authenticated
  using (app.administra(unidade_id)) with check (app.administra(unidade_id));

create policy funcao_hist_le on pessoa_funcao_hist for select to authenticated
  using (
    pessoa_id = app.pessoa_atual()
    or app.e_sede()
    or app.unidade_da_pessoa(pessoa_id) in (select unidade_id from app.unidades_administradas())
  );
-- Função doutrinária é progressão institucional: quem registra é a Sede.
create policy funcao_hist_escreve on pessoa_funcao_hist for insert to authenticated
  with check (app.e_sede());

-- ── Papéis: conceder acesso é ato da Sede ──────────────────────────────────
-- Conceder papel é dar acesso a dado de outras pessoas. Fica com quem responde
-- pela plataforma inteira até a Sede decidir delegar (ver decisão 0009).
grant select, insert, update on papeis to authenticated;
create policy papeis_le on papeis for select to authenticated
  using (pessoa_id = app.pessoa_atual() or app.e_sede() or app.administra(unidade_id));
create policy papeis_escreve on papeis for all to authenticated
  using (app.e_sede()) with check (app.e_sede());

-- ── Auditoria: a Sede lê; ninguém escreve pelo navegador ───────────────────
-- Toda escrita é do servidor, com `service_role`. Trilha que o próprio ator
-- pode escrever não é trilha.
grant select on auditoria to authenticated;
create policy auditoria_le on auditoria for select to authenticated using (app.e_sede());

-- ── Fila: sem GRANT nenhum ─────────────────────────────────────────────────
-- Destino e corpo de mensagem são dado pessoal, e o disparo é do servidor.
-- Nada aqui precisa passar pelo navegador.

-- ── Configuração: todo autenticado lê (a página pública de políticas
--    depende), só a Sede escreve ──────────────────────────────────────────
grant select on configuracoes to authenticated;
create policy config_le on configuracoes for select to authenticated using (true);
grant update on configuracoes to authenticated;
create policy config_escreve on configuracoes for update to authenticated
  using (app.e_sede()) with check (app.e_sede());

-- ── LGPD ───────────────────────────────────────────────────────────────────
grant select on consentimentos_lgpd to authenticated;
create policy consentimento_le on consentimentos_lgpd for select to authenticated
  using (pessoa_id = app.pessoa_atual() or app.e_sede());
-- O consentimento é gravado pelo servidor junto do ato que o motivou.

-- Pedido de exclusão traz nome, e-mail e CPF de quem pediu, e a decisão pode
-- apagar dado que sustenta certificado. Só a Sede.
grant select on solicitacoes_exclusao to authenticated;
create policy exclusao_le on solicitacoes_exclusao for select to authenticated
  using (app.e_sede());
grant insert, update on solicitacoes_exclusao to authenticated;
create policy exclusao_escreve on solicitacoes_exclusao for all to authenticated
  using (app.e_sede()) with check (app.e_sede());

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- SEEDS
--
-- Tudo aqui é DADO: a Sede corrige em tela, sem migração. As suposições estão
-- registradas na decisão 0008 com o que muda em cada resposta.
-- ───────────────────────────────────────────────────────────────────────────

-- A Sede descreveu "Regionais Doutrinárias; Núcleos e Associações Locais",
-- o que põe Núcleo e AL no mesmo degrau. Sede Internacional fica fora da
-- árvore: "não temos ingerência sobre nada".
-- A instituição, como a Sede descreveu: a Associação Local pende da Regional
-- ou de um Núcleo, e o Núcleo é opcional — existe onde duas ou mais
-- Associações Locais do mesmo endereço unificam caixa e estoque.
-- A Sede Internacional fica fora: "não temos ingerência sobre nada".
insert into tipos_unidade (codigo, nome, plural, pais_permitidos, exige_organizacao, ordem) values
  ('sede_central',     'Sede Central',     'Sedes Centrais',     '{}',                             false, 1),
  ('regional',         'Regional',         'Regionais',          '{sede_central}',                 false, 2),
  ('nucleo',           'Núcleo',           'Núcleos',            '{regional}',                     false, 3),
  ('associacao_local', 'Associação Local', 'Associações Locais', '{regional,nucleo}',              true,  4)
on conflict (codigo) do nothing;

-- Onde os eventos acontecem. A Academia de Treinamento Espiritual é o caso
-- que motiva o catálogo: é da instituição, mas não é degrau dela.
insert into tipos_local (codigo, nome, plural, ordem) values
  ('academia', 'Academia de Treinamento Espiritual', 'Academias de Treinamento Espiritual', 1),
  ('hotel',    'Hotel',                              'Hotéis',                              2),
  ('salao',    'Salão',                              'Salões',                              3),
  ('outro',    'Outro',                              'Outros',                              4)
on conflict (codigo) do nothing;

-- As quatro que existem hoje (Sede, set/2026). É ponto de partida, não lista
-- fechada: o cadastro é editável em tela e a Sede cria novas sem migração.
insert into organizacoes (nome, ordem) values
  ('Associação Pomba Branca',    1),
  ('Associação Fraternidade',    2),
  ('Associação dos Jovens',      3),
  ('Associação da Prosperidade', 4)
on conflict (nome) do nothing;

-- As 11 da especificação do Ciclo, validadas com a Sede naquele projeto.
insert into funcoes_doutrinarias (nome, ordem) values
  ('Simpatizante', 1), ('Adepto', 2), ('Divulgador', 3),
  ('Divulgador Autorizado', 4), ('Líder da Iluminação', 5),
  ('Preletor em grau Aspirante', 6), ('Preletor em grau Júnior', 7),
  ('Preletor em grau Sênior', 8), ('Preletor em grau Máster', 9),
  ('Aspirante a Preletor da Sede Internacional', 10),
  ('Preletor da Sede Internacional', 11)
on conflict (nome) do nothing;

-- Papéis. Os do Ciclo mantêm os nomes que o módulo já usa; os de eventos são
-- nacionais porque aquele domínio não tem escopo geográfico (decisão 0003).
insert into tipos_papel (codigo, nome, modulo, escopo, administra_unidade, ordem) values
  ('sede',              'Sede Central',           'plataforma', 'nacional', false, 1),
  ('coordenador',       'Coordenador do Ciclo',   'ciclo',      'unidade',  true,  2),
  ('orientador',        'Orientador Responsável', 'ciclo',      'unidade',  false, 3),
  ('presidente_uap',    'Presidente de UAP',      'ciclo',      'unidade',  false, 4),
  ('professor',         'Professor',              'ciclo',      'unidade',  false, 5),
  ('aluno',             'Aluno',                  'ciclo',      'unidade',  false, 6),
  ('eventos_admin',     'Administrador de Eventos','eventos',   'nacional', false, 7),
  ('eventos_operador',  'Operador de Eventos',    'eventos',    'nacional', false, 8)
on conflict (codigo) do nothing;
