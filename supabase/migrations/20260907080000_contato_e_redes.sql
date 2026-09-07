-- ───────────────────────────────────────────────────────────────────────────
-- CONTATO E REDES SOCIAIS DA UNIDADE
--
-- A Sede Central, cada Regional e cada Associação Local têm presença própria:
-- telefone fixo que atende no horário comercial, WhatsApp por onde a maioria
-- fala hoje, e perfis que o adepto procura antes de aparecer pela primeira vez.
--
-- ⚠️ WhatsApp em coluna PRÓPRIA, e não "o telefone serve". São números
-- diferentes na maioria das unidades: o fixo atende, o celular responde. Juntar
-- os dois faria a fila de mensagens mandar WhatsApp para um número que não
-- recebe, e ninguém saberia que a mensagem não chegou.
--
-- ⚠️ Rede social como URL COMPLETA, e não como "@usuario". Cada rede monta o
-- endereço de um jeito, e guardar o arroba obrigaria a tela a saber montar a
-- URL de cada uma — e a errar quando alguma mudar o formato. URL é o que se
-- cola do navegador e o que se abre de volta.
-- ───────────────────────────────────────────────────────────────────────────

alter table unidades add column whatsapp  text;
alter table unidades add column facebook  text;
alter table unidades add column instagram text;
alter table unidades add column tiktok    text;
alter table unidades add column site      text;

comment on column unidades.whatsapp is
  'Número que RECEBE WhatsApp. Separado do telefone fixo de propósito: são '
  'números diferentes na maioria das unidades.';

-- Só http(s), e só quando preenchido. Sem isto, "instagram.com/seichonoie"
-- (sem esquema) viraria link relativo e abriria uma página do próprio sistema.
alter table unidades add constraint redes_sao_url check (
  (facebook  is null or facebook  ~* '^https?://') and
  (instagram is null or instagram ~* '^https?://') and
  (tiktok    is null or tiktok    ~* '^https?://') and
  (site      is null or site      ~* '^https?://')
);

-- Os mesmos campos nos LOCAIS: a Academia de Treinamento Espiritual tem
-- WhatsApp e Instagram próprios, e quem procura por ela procura por lá.
alter table locais add column whatsapp  text;
alter table locais add column facebook  text;
alter table locais add column instagram text;
alter table locais add column tiktok    text;
alter table locais add column site      text;

alter table locais add constraint local_redes_sao_url check (
  (facebook  is null or facebook  ~* '^https?://') and
  (instagram is null or instagram ~* '^https?://') and
  (tiktok    is null or tiktok    ~* '^https?://') and
  (site      is null or site      ~* '^https?://')
);
