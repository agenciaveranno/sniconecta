-- ───────────────────────────────────────────────────────────────────────────
-- A FICHA DA PESSOA
--
-- O cadastro deixa de ser um punhado de campos e passa a ser uma ficha: quem é
-- a família, quando e por que entrou na Seicho-No-Ie, o que faz da vida, e os
-- documentos que comprovam tudo isso.
--
-- ⚠️ Quase tudo é ANULÁVEL de propósito. Dezesseis mil pessoas vêm de uma base
-- que não tinha estes campos, e exigir qualquer um deles tornaria impossível
-- gravar uma pessoa que já existe. Campo obrigatório aqui não protegeria dado
-- nenhum — só impediria a carga e o cadastro de balcão.
-- ───────────────────────────────────────────────────────────────────────────

-- ── Família ──
alter table pessoas add column nome_pai     text;
alter table pessoas add column nome_mae     text;
alter table pessoas add column nome_conjuge text;

-- Lista fechada porque é para contar e filtrar. Texto livre daria "casado",
-- "Casado", "casada" e "CASADO" como quatro estados civis diferentes.
alter table pessoas add column estado_civil text
  check (estado_civil is null or estado_civil in
    ('solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo'));

-- ── Vida na Seicho-No-Ie ──
alter table pessoas add column entrada_sni date;
comment on column pessoas.entrada_sni is
  'Quando a pessoa entrou na Seicho-No-Ie. Não é a data do cadastro: quem '
  'chegou em 1978 tem cadastro de 2026.';

-- Texto livre de propósito: é depoimento, não categoria. Fechar em lista
-- perderia justamente o que ele tem de valor.
alter table pessoas add column motivo_entrada text;

-- ── Vida civil ──
alter table pessoas add column profissao text;
alter table pessoas add column empresa   text;
alter table pessoas add column formacao  text
  check (formacao is null or formacao in
    ('fundamental', 'medio', 'superior', 'pos', 'mestrado', 'doutorado'));

-- ── Login ──
--
-- ⚠️ `citext` e único: "Vinicius" e "vinicius" são a mesma pessoa tentando
-- entrar, e duas linhas para um `=`. Sem isso, duas contas com o mesmo login
-- em caixas diferentes conviveriam, e a tela de login escolheria uma delas
-- sem critério.
alter table pessoas add column login citext unique;
alter table pessoas add constraint login_formato
  check (login is null or login ~ '^[a-zA-Z][a-zA-Z0-9._-]{2,29}$');
comment on column pessoas.login is
  'Identificador alfabético para entrar no sistema, além de CPF e e-mail.';

-- ── Falecimento ──
--
-- `falecimento` (a data) já existia. A causa entra ao lado porque a Missão
-- Sagrada tem categoria de Santo Espiritual — quem faleceu continua no
-- cadastro, com contribuição própria, e some da tela é o que NÃO pode
-- acontecer.
alter table pessoas add column falecimento_causa text;

-- ───────────────────────────────────────────────────────────────────────────
-- ANEXOS DA FICHA
--
-- ⚠️ O arquivo NÃO fica no banco. Fica no Storage do Supabase, e aqui mora só
-- o caminho. Documento de identidade em coluna `bytea` incharia todo backup,
-- toda réplica e toda consulta que fizesse `select *` — e um `select *`
-- distraído passaria a trafegar dezenas de megabytes de RG.
--
-- ⚠️ SEM GRANT para o navegador. Quem lê e escreve é o servidor, que devolve
-- URL assinada de vida curta. Documento de identidade não é dado que se
-- protege por policy de leitura: se o caminho vazar, o arquivo vazou.
-- ───────────────────────────────────────────────────────────────────────────

create table pessoa_anexos (
  id          uuid primary key default gen_random_uuid(),
  pessoa_id   uuid not null references pessoas(id) on delete cascade,

  -- Catálogo fechado, e `outros` como escape: sem ele, todo documento que a
  -- lista não previu viraria um tipo novo inventado na hora.
  tipo        text not null check (tipo in (
                'rg', 'cnh', 'certidao_nascimento', 'certidao_casamento',
                'certidao_obito', 'comprovante_residencia', 'termo_nomeacao',
                'diploma', 'foto', 'outros')),
  descricao   text,

  -- Caminho no Storage. Nunca a URL: URL assinada expira, e guardar uma
  -- vencida é guardar lixo que parece link.
  caminho     text not null unique,
  nome_arquivo text not null,
  mime        text,
  tamanho     integer,

  criado_em   timestamptz not null default now(),
  criado_por  uuid references pessoas(id) on delete set null
);

create index idx_anexos_pessoa on pessoa_anexos(pessoa_id);

comment on table pessoa_anexos is
  'Documentos anexados à ficha. O arquivo mora no Storage; aqui fica o '
  'caminho e o que ele é.';

alter table pessoa_anexos enable row level security;
-- E nenhum grant: o navegador nunca fala com esta tabela.

-- ───────────────────────────────────────────────────────────────────────────
-- ONDE O ARQUIVO MORA
--
-- Balde PRIVADO. Documento de identidade não tem URL pública que se possa
-- adivinhar — quem precisa ver recebe uma URL assinada de vida curta, emitida
-- pelo servidor depois de conferir a capacidade.
--
-- ⚠️ Sem policy nenhuma no Storage, de propósito: quem lê e escreve é o
-- servidor, com a chave de serviço, que ignora policy. Escrever policy aqui
-- daria a impressão de que o navegador alcança o balde — e ele não alcança.
-- ───────────────────────────────────────────────────────────────────────────

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
      'documentos', 'documentos', false,
      -- 10 MB. Foto de celular e PDF de certidão cabem; vídeo, não — e vídeo
      -- em anexo de ficha é sempre engano.
      10485760,
      array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
    )
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
