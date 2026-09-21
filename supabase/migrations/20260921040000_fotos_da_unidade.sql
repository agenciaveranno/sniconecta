-- As fotos que o site publica de cada unidade
--
-- A aba Fotos existe na tela da unidade desde a decisão 0019, ocupada por um
-- aviso: "falta combinar quantas, em que proporção e quais delas o site usa em
-- cada lugar, para a tela não virar um depósito de imagem que ninguém sabe
-- onde aparece". Esta migração responde as três.
--
-- QUANTAS: até doze por unidade. Fachada, salão, sala de aula, cozinha,
-- estacionamento e um pouco de folga — e um teto, porque álbum sem limite vira
-- depósito, e depósito ninguém curadora.
--
-- ONDE O SITE USA: uma é a CAPA, e é a que aparece na listagem de unidades; as
-- outras entram na página da unidade, na ordem escolhida. Sem o conceito de
-- capa, o site teria de escolher sozinho — e escolheria a primeira, que é a
-- que alguém subiu com pressa.
--
-- ⚠️ BALDE PRIVADO, com URL assinada, igual ao de `documentos`. Foto de
-- fachada é pública por natureza, e um balde público seria mais simples — mas
-- o que sobe por engano numa tela de upload é documento, é foto de criança, é
-- o que ninguém quis publicar. Em balde público, isso vira URL permanente que
-- não se apaga do cache de ninguém. Privado é a escolha REVERSÍVEL: no dia em
-- que o site existir e pedir CDN, basta virar a chave; o contrário não existe.
--
-- ⚠️ O arquivo NÃO fica no banco, pela mesma razão do anexo da ficha: imagem
-- em coluna `bytea` incha backup, réplica e todo `select *` distraído.

create table unidade_fotos (
  id          uuid primary key default gen_random_uuid(),
  unidade_id  uuid not null references unidades(id) on delete cascade,

  -- Caminho no Storage. Nunca a URL: URL assinada expira, e guardar uma
  -- vencida é guardar lixo que parece link.
  caminho     text not null unique,
  nome_arquivo text not null,
  mime        text,
  tamanho     integer,

  -- O que a foto mostra. Vai como `alt` no site — sem ela, quem usa leitor de
  -- tela recebe "imagem" doze vezes seguidas.
  legenda     text,
  ordem       smallint not null default 0,

  criado_em   timestamptz not null default now(),
  criado_por  uuid references pessoas(id) on delete set null
);

create index idx_unidade_fotos on unidade_fotos(unidade_id, ordem, criado_em);

-- ⚠️ UMA capa por unidade, garantida pelo banco e não pela tela. Duas capas
-- fazem a listagem do site escolher no critério do `order by` — que muda
-- quando alguém acrescenta uma coluna — e a unidade troca de foto sozinha.
alter table unidade_fotos add column capa boolean not null default false;
create unique index uq_unidade_capa on unidade_fotos(unidade_id) where capa;

comment on table unidade_fotos is
  'Fotos que o site publica de cada unidade. O arquivo mora no Storage; aqui '
  'fica o caminho, a legenda e a ordem. Uma delas é a capa.';

alter table unidade_fotos enable row level security;
-- E nenhum grant: o navegador nunca fala com esta tabela. Quem lê e escreve é
-- o servidor, com a chave de serviço, que devolve URL assinada de vida curta.

-- ⚠️ Condicional porque `storage` é schema do SUPABASE, e o harness de RLS
-- roda num Postgres puro para poder rodar em qualquer máquina e no CI. Sem a
-- guarda, a migração passa em produção e derruba o harness — que é justamente
-- quem confere que nenhuma tabela nova ficou sem RLS.
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'fotos-unidades', 'fotos-unidades', false,
      -- 8 MB. Foto de celular cabe com folga; acima disso é arquivo que
      -- ninguém redimensionou, e o site vai reduzir de qualquer jeito.
      8388608,
      array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
    )
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
