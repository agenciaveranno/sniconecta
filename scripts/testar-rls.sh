#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Testa o RLS de verdade: sobe um Postgres, aplica as migrações, cria pessoas
# em unidades diferentes e tenta ler e escrever como cada uma.
#
# POR QUE EXISTE. Teste unitário não alcança RLS. A matriz em
# src/lib/permissoes.ts é testada pelo vitest, mas ela decide o que a INTERFACE
# oferece. Quem de fato autoriza é o Postgres, e a única forma de verificar
# isso é falando com ele como cada pessoa — é o que este script faz.
#
# Com a estrutura em árvore (decisão 0008), o risco central deixou de ser só
# vazamento entre localidades: é herança errada. Quem coordena uma Regional
# DEVE alcançar as Associações Locais dela; quem coordena uma AL NÃO pode
# subir para a Regional nem atravessar para a AL vizinha.
#
# Confere também a SUPERFÍCIE DE GRANT (decisão 0007): tabela que ganhe
# privilégio para anon ou authenticated sem estar declarada aqui reprova a
# suíte. É o que substitui, mecanicamente, o isolamento que um schema daria.
#
#   ./scripts/testar-rls.sh
#
# Requer postgresql instalado. Não toca em nada remoto.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

PORTA=${PORTA:-5437}
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | head -1)
DATA=${DATA:-/var/lib/postgresql/rls-sniconecta}
RAIZ=$(cd "$(dirname "$0")/.." && pwd)

[ -z "$PGBIN" ] && { echo "postgresql não encontrado"; exit 1; }

limpar() { su postgres -c "$PGBIN/pg_ctl -D $DATA stop" >/dev/null 2>&1; rm -rf "$DATA"; }
trap limpar EXIT

echo "▸ subindo Postgres na porta $PORTA"
rm -rf "$DATA"; mkdir -p "$DATA"; chown postgres:postgres "$DATA"
su postgres -c "$PGBIN/initdb -D $DATA -A trust -U postgres" >/dev/null 2>&1
su postgres -c "$PGBIN/pg_ctl -D $DATA -o '-p $PORTA -k /tmp' -l /tmp/pg-sniconecta.log start" >/dev/null 2>&1
sleep 2

P() { psql -h /tmp -p "$PORTA" -U postgres "$@"; }

echo "▸ stub do que o Supabase já traz pronto"
P -q >/dev/null 2>&1 <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create extension pgcrypto;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as $f$
  select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $f$;
grant usage on schema auth to authenticated, anon;
SQL

echo "▸ aplicando as migrações"
# ⚠️ Rodar o arquivo uma vez só. psql sem transação confirma comando a
# comando, então uma segunda tentativa para "ver o erro" mostra "already
# exists" e esconde a falha de verdade.
for m in "$RAIZ"/supabase/migrations/*.sql; do
  saida=$(P -v ON_ERROR_STOP=1 -f "$m" 2>&1) || {
    echo "  ✖ falhou em $(basename "$m")"
    echo "$saida" | grep -iE "error|erro" | head -5 | sed 's/^/       /'
    exit 1
  }
done
echo "  $(ls "$RAIZ"/supabase/migrations/*.sql | wc -l) migração(ões) aplicada(s)"

# ── O seed da estrutura publicada ──────────────────────────────────────────
# Confere o que a carga trouxe ANTES de o cenário limpar a base. Sem isto, um
# seed que parasse de trazer as Regionais passaria despercebido: as migrações
# aplicariam sem erro e o banco nasceria vazio.
conta() { P -t -A -c "$1" | tr -d ' \n'; }
n_sede=$(conta "select count(*) from unidades where tipo='sede_central';")
n_reg=$(conta "select count(*) from unidades where tipo='regional';")
n_ja=$(conta "select count(*) from unidades where tipo='regional' and idioma='ja';")
n_aca=$(conta "select count(*) from locais where tipo='academia';")
n_orfa=$(conta "select count(*) from unidades where tipo='regional' and pai_id is null;")
echo "▸ seed: $n_sede sede, $n_reg regionais ($n_ja em japonês), $n_aca academias"
[ "$n_sede" = "1" ] || { echo "  ❌ esperava 1 Sede Central"; exit 1; }
[ "$n_reg" -ge 100 ] || { echo "  ❌ esperava ao menos 100 Regionais, veio $n_reg"; exit 1; }
[ "$n_ja" -ge 20 ] || { echo "  ❌ esperava ao menos 20 Regionais em japonês, veio $n_ja"; exit 1; }
[ "$n_aca" = "7" ] || { echo "  ❌ esperava 7 Academias, veio $n_aca"; exit 1; }
[ "$n_orfa" = "0" ] || { echo "  ❌ $n_orfa Regionais ficaram sem a Sede Central como pai"; exit 1; }
echo "  ✅ estrutura publicada carregada e pendurada na Sede Central"

# ── O primeiro acesso ──────────────────────────────────────────────────────
# Sem uma pessoa que já nasça com papel nacional, ninguém entra: o RLS só
# reconhece quem tem linha em `pessoas`, e a tela que cria pessoas exige estar
# dentro. Ela nasce SEM conta: quem cria a conta é o convite do Auth, e o
# gatilho amarra as duas pelo e-mail.
n_sede_pessoa=$(conta "select count(*) from papeis p join pessoas x on x.id = p.pessoa_id where p.tipo='sede' and p.unidade_id is null and p.ativo and x.auth_user_id is null;")
[ "$n_sede_pessoa" -ge 1 ] || { echo "  ❌ ninguém nasceu com acesso: o sistema subiria sem porta de entrada"; exit 1; }
P -q -c "insert into auth.users (id, email) values ('c0000000-0000-0000-0000-0000000000ff','vinirocha@outlook.com');" >/dev/null
n_ligada=$(conta "select count(*) from pessoas where email='vinirocha@outlook.com' and auth_user_id='c0000000-0000-0000-0000-0000000000ff';")
[ "$n_ligada" = "1" ] || { echo "  ❌ a conta criada no Auth não encontrou a pessoa pelo e-mail"; exit 1; }
echo "  ✅ primeiro acesso: pessoa da Sede existe e a conta se liga a ela pelo e-mail"

# ── Cenário ────────────────────────────────────────────────────────────────
# Sede Central
#   ├── Regional Sul
#   │     ├── Núcleo Curitiba              (une duas ALs do mesmo endereço)
#   │     │     ├── AL Curitiba Prosperidade
#   │     │     └── AL Curitiba Jovens
#   │     └── AL Londrina Fraternidade     (direto na Regional: Núcleo é opcional)
#   └── Regional Sudeste
#         └── AL Campinas Prosperidade
#
# O cenário existe para provar as duas formas ao mesmo tempo: a Associação
# Local que pende de um Núcleo e a que pende direto da Regional. Contar saltos
# daria a Regional errada para uma das duas.
echo "▸ cenário: núcleo com duas associações, e uma associação sem núcleo"
P -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
-- ⚠️ Limpa a estrutura que o seed carregou. As asserções contam unidades, e
-- contagem não pode depender de quantas Regionais o site publica hoje — a
-- suíte passaria a quebrar sozinha quando a instituição crescer. Que o seed
-- APLICA já foi provado no passo anterior.
delete from locais;
delete from unidades;
-- E as pessoas do primeiro acesso, pelo mesmo motivo: o cenário conta pessoas
-- e cadastra CPFs próprios. Que o primeiro acesso NASCE já foi provado acima.
delete from papeis;
delete from pessoas;
delete from auth.users;

insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-000000000001','sede@x'),
  ('c0000000-0000-0000-0000-000000000002','coord.sul@x'),
  ('c0000000-0000-0000-0000-000000000003','coord.campinas@x'),
  ('c0000000-0000-0000-0000-000000000004','orientador.sul@x'),
  ('c0000000-0000-0000-0000-000000000005','aluna.curitiba@x'),
  ('c0000000-0000-0000-0000-000000000006','coord.nucleo@x'),
  -- Conta sem pessoa: existe só para as asserções de ligação por e-mail
  -- poderem usar um `auth_user_id` livre. Com um já tomado, o unique de
  -- `auth_user_id` recusaria antes e mascararia o que se quer provar.
  ('c0000000-0000-0000-0000-000000000007','sobra@x');

insert into unidades (id, tipo, pai_id, organizacao_id, nome, slug)
select v.id, v.tipo, v.pai, o.id, v.nome, v.slug
  from (values
    ('11110000-0000-0000-0000-000000000001'::uuid,'sede_central',     null::uuid,                             null,                        'Sede Central','sede-central'),
    ('22220000-0000-0000-0000-000000000001','regional',         '11110000-0000-0000-0000-000000000001', null,                        'Regional Sul','regional-sul'),
    ('22220000-0000-0000-0000-000000000002','regional',         '11110000-0000-0000-0000-000000000001', null,                        'Regional Sudeste','regional-sudeste'),
    ('44440000-0000-0000-0000-000000000001','nucleo',           '22220000-0000-0000-0000-000000000001', null,                        'Núcleo Curitiba','nucleo-curitiba'),
    ('33330000-0000-0000-0000-000000000001','associacao_local', '44440000-0000-0000-0000-000000000001', 'Associação da Prosperidade','AL Curitiba Prosperidade','al-curitiba-prosperidade'),
    ('33330000-0000-0000-0000-000000000004','associacao_local', '44440000-0000-0000-0000-000000000001', 'Associação dos Jovens',     'AL Curitiba Jovens','al-curitiba-jovens'),
    ('33330000-0000-0000-0000-000000000002','associacao_local', '22220000-0000-0000-0000-000000000001', 'Associação Fraternidade',   'AL Londrina','al-londrina'),
    ('33330000-0000-0000-0000-000000000003','associacao_local', '22220000-0000-0000-0000-000000000002', 'Associação da Prosperidade','AL Campinas','al-campinas')
  ) as v(id, tipo, pai, org, nome, slug)
  left join organizacoes o on o.nome = v.org;

-- ⚠️ A raiz do CNPJ da Sede Central é o que define quem é filial da
-- instituição. Precisa existir aqui, no cenário, e não dentro de uma asserção:
-- toda asserção roda em transação desfeita, e sem a matriz gravada o gatilho
-- não teria raiz com que comparar — aceitaria o CNPJ de qualquer empresa.
update unidades set cnpj = '61278388000181' where tipo = 'sede_central';

insert into pessoas (id, cpf, cod_sni, nome, email, auth_user_id) values
  ('d0000000-0000-0000-0000-000000000001','52998224725','1','Sede','sede@x','c0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002','11144477735','2','Coord Sul','coord.sul@x','c0000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000003','84038152049','3','Coord Campinas','coord.campinas@x','c0000000-0000-0000-0000-000000000003'),
  ('d0000000-0000-0000-0000-000000000004','19551244768','4','Orientador Sul','orientador.sul@x','c0000000-0000-0000-0000-000000000004'),
  ('d0000000-0000-0000-0000-000000000005','40364045884','5','Aluna Curitiba','aluna.curitiba@x','c0000000-0000-0000-0000-000000000005'),
  ('d0000000-0000-0000-0000-000000000006','12345678909','6','Aluna Londrina',null,null),
  ('d0000000-0000-0000-0000-000000000007','98765432100','7','Aluna Campinas',null,null),
  ('d0000000-0000-0000-0000-000000000008','15350946056','8','Coord Núcleo','coord.nucleo@x','c0000000-0000-0000-0000-000000000006');

insert into pessoa_unidade_vinculos (pessoa_id, unidade_id) values
  ('d0000000-0000-0000-0000-000000000005','33330000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000006','33330000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000007','33330000-0000-0000-0000-000000000003');

insert into papeis (pessoa_id, tipo, unidade_id) values
  ('d0000000-0000-0000-0000-000000000001','sede',        null),
  ('d0000000-0000-0000-0000-000000000002','coordenador', '22220000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000003','coordenador', '33330000-0000-0000-0000-000000000003'),
  ('d0000000-0000-0000-0000-000000000004','orientador',  '22220000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000008','coordenador', '44440000-0000-0000-0000-000000000001');
SQL

SEDE=c0000000-0000-0000-0000-000000000001
CSUL=c0000000-0000-0000-0000-000000000002
CCAMP=c0000000-0000-0000-0000-000000000003
OSUL=c0000000-0000-0000-0000-000000000004
ALUNA=c0000000-0000-0000-0000-000000000005
CNUC=c0000000-0000-0000-0000-000000000006

falhas=0

# escrita <descrição> <uid> <sql> <OK|NEGADO>
escrita() {
  local r
  r=$(P -t 2>&1 <<SQL
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '$2';
$3
rollback;
SQL
)
  local obtido
  if echo "$r" | grep -qiE "violates row-level security|permission denied|ERRO:|ERROR:"; then obtido="NEGADO"
  elif echo "$r" | grep -qE "UPDATE 0|DELETE 0|INSERT 0 0"; then obtido="NEGADO"
  elif echo "$r" | grep -qE "UPDATE [1-9]|INSERT 0 [1-9]|DELETE [1-9]"; then obtido="OK"
  else obtido="INDEFINIDO"; fi

  if [ "$obtido" = "$4" ]; then
    echo "  ✅ $1"
  else
    echo "  ❌ $1 — esperava $4, obteve $obtido"
    echo "$r" | grep -iE "error|erro" | head -2 | sed 's/^/       /'
    falhas=$((falhas+1))
  fi
}

# leitura <descrição> <uid> <sql que devolve linhas> <quantidade esperada>
leitura() {
  local r
  r=$(P -t -A 2>&1 <<SQL
begin;
set local role authenticated;
set local "request.jwt.claim.sub" = '$2';
$3
rollback;
SQL
)
  local obtido
  obtido=$(echo "$r" | grep -E '^[0-9]+$' | head -1)
  if [ "$obtido" = "$4" ]; then
    echo "  ✅ $1"
  else
    echo "  ❌ $1 — esperava $4, obteve ${obtido:-nada}"
    falhas=$((falhas+1))
  fi
}

echo
echo "── Herança na árvore (decisão 0008: papel desce, nunca sobe)"
# Regional Sul + Núcleo Curitiba + 2 ALs do núcleo + AL Londrina = 5.
leitura "coordenadora da Regional Sul alcança tudo abaixo, com e sem núcleo" $CSUL \
  "select count(*) from app.unidades_administradas();" 5
# Núcleo + as 2 ALs dele. Londrina, que pende da Regional, fica de fora.
leitura "coordenador do Núcleo alcança só as ALs do núcleo" $CNUC \
  "select count(*) from app.unidades_administradas();" 3
leitura "coordenador do Núcleo NÃO alcança a AL fora dele" $CNUC \
  "select count(*) from app.unidades_administradas() where unidade_id = '33330000-0000-0000-0000-000000000002';" 0
leitura "coordenadora de uma AL alcança só a própria" $CCAMP \
  "select count(*) from app.unidades_administradas();" 1
leitura "orientador não administra unidade (administra_unidade = false)" $OSUL \
  "select count(*) from app.unidades_administradas();" 0

echo "── Pessoas: quem vê quem"
leitura "Sede vê as 8 pessoas" $SEDE "select count(*) from pessoas;" 8
# Coord Sul: as 2 alunas do Sul + ela mesma. Coord Campinas e as outras não.
leitura "coordenadora do Sul vê as 2 alunas do Sul e ela mesma" $CSUL \
  "select count(*) from pessoas;" 3
leitura "coordenadora de Campinas vê a aluna de lá e ela mesma" $CCAMP \
  "select count(*) from pessoas;" 2
leitura "aluna vê só a si mesma" $ALUNA "select count(*) from pessoas;" 1
leitura "orientador sem administração vê só a si mesmo" $OSUL \
  "select count(*) from pessoas;" 1

echo "── Pessoas: quem escreve"
ALTERA_CURITIBA="update pessoas set telefone='1' where id='d0000000-0000-0000-0000-000000000005';"
ALTERA_CAMPINAS="update pessoas set telefone='1' where id='d0000000-0000-0000-0000-000000000007';"
escrita "coordenadora do Sul altera aluna de Curitiba"        $CSUL  "$ALTERA_CURITIBA" OK
escrita "coordenadora do Sul NÃO altera aluna de Campinas"    $CSUL  "$ALTERA_CAMPINAS" NEGADO
escrita "coordenadora de Campinas NÃO altera aluna do Sul"    $CCAMP "$ALTERA_CURITIBA" NEGADO
escrita "orientador NÃO altera ninguém"                       $OSUL  "$ALTERA_CURITIBA" NEGADO
escrita "Sede altera qualquer uma"                            $SEDE  "$ALTERA_CAMPINAS" OK

echo "── Estrutura: só a Sede mexe"
CRIA_AL="insert into unidades (tipo, pai_id, organizacao_id, nome) values ('associacao_local','22220000-0000-0000-0000-000000000001',(select id from organizacoes where nome = 'Associação Fraternidade'),'AL Nova');"
escrita "Sede cria unidade"                       $SEDE  "$CRIA_AL" OK
escrita "coordenadora de regional NÃO cria"       $CSUL  "$CRIA_AL" NEGADO
escrita "coordenadora de AL NÃO renomeia a sua"   $CCAMP \
  "update unidades set nome='Outro' where id='33330000-0000-0000-0000-000000000003';" NEGADO

echo "── Papéis: conceder acesso é ato da Sede"
CONCEDE="insert into papeis (pessoa_id, tipo, unidade_id) values ('d0000000-0000-0000-0000-000000000005','coordenador','33330000-0000-0000-0000-000000000001');"
escrita "Sede concede papel"                      $SEDE  "$CONCEDE" OK
escrita "coordenadora NÃO concede papel"          $CSUL  "$CONCEDE" NEGADO
escrita "aluna NÃO se promove"                    $ALUNA "$CONCEDE" NEGADO

echo "── Fila e auditoria: não passam pelo navegador"
leitura "ninguém lê a fila de notificações pelo cliente" $SEDE \
  "select count(*) from (select 1 from notificacoes) x;" ""
escrita "nem a Sede escreve auditoria pelo cliente" $SEDE \
  "insert into auditoria (acao) values ('teste');" NEGADO
# ⚠️ A merchant key da Cielo e a senha do SMTP vivem aqui. Nem a Sede alcança
# pelo navegador: quem lê é o servidor, e devolve à tela só a parte pública.
leitura "nem a Sede lê credencial pelo cliente" $SEDE \
  "select count(*) from (select 1 from credenciais) x;" ""

echo "── Gatilhos de integridade da árvore"
ORG_PROSP="(select id from organizacoes where nome = 'Associação da Prosperidade')"
escrita "regional dentro de AL é recusada" $SEDE \
  "insert into unidades (tipo, pai_id, nome) values ('regional','33330000-0000-0000-0000-000000000001','Errada');" NEGADO
escrita "AL dentro de AL é recusada" $SEDE \
  "insert into unidades (tipo, pai_id, organizacao_id, nome) values ('associacao_local','33330000-0000-0000-0000-000000000001',$ORG_PROSP,'Errada');" NEGADO
escrita "núcleo dentro de núcleo é recusado" $SEDE \
  "insert into unidades (tipo, pai_id, nome) values ('nucleo','44440000-0000-0000-0000-000000000001','Errado');" NEGADO
escrita "AL direto na Regional é aceita (núcleo é opcional)" $SEDE \
  "insert into unidades (tipo, pai_id, organizacao_id, nome) values ('associacao_local','22220000-0000-0000-0000-000000000002',$ORG_PROSP,'AL Nova');" OK
escrita "unidade raiz que não é sede central é recusada" $SEDE \
  "insert into unidades (tipo, nome) values ('regional','Sem pai');" NEGADO
# ⚠️ É a regra que obriga a carga do Credenciamento a criar uma Regional de
# espera "Sede Central": sem ela, a Associação Local "Sede Central" — onde ficam
# as pessoas cuja Regional a origem não diz — seria recusada no meio da carga,
# com metade da base já gravada.
escrita "AL direto na Sede Central é recusada" $SEDE \
  "insert into unidades (tipo, pai_id, organizacao_id, nome) values ('associacao_local','11110000-0000-0000-0000-000000000001',$ORG_PROSP,'AL órfã');" NEGADO

echo "── CNPJ: toda unidade é filial da Sede Central"
escrita "Sede define o CNPJ da matriz" $SEDE \
  "update unidades set cnpj='61278388000181' where id='11110000-0000-0000-0000-000000000001';" OK
escrita "filial com a mesma raiz é aceita" $SEDE \
  "update unidades set cnpj='61278388001204' where id='22220000-0000-0000-0000-000000000001';" OK
escrita "CNPJ de outra empresa é recusado" $SEDE \
  "update unidades set cnpj='11222333000181' where id='22220000-0000-0000-0000-000000000001';" NEGADO
escrita "CNPJ fora do formato é recusado" $SEDE \
  "update unidades set cnpj='61.278.388/0001-81' where id='22220000-0000-0000-0000-000000000001';" NEGADO
escrita "Academia com CNPJ de outra empresa é recusada" $SEDE \
  "insert into locais (tipo, nome, cnpj) values ('academia','Academia Errada','11222333000181');" NEGADO
escrita "Academia com CNPJ de filial é aceita" $SEDE \
  "insert into locais (tipo, nome, cnpj) values ('academia','Academia Nova','61278388003095');" OK

echo "── Organização: cadastro editável, só pela Sede"
escrita "Sede cria organização nova" $SEDE \
  "insert into organizacoes (nome) values ('Associação Nova');" OK
escrita "coordenadora NÃO cria organização" $CSUL \
  "insert into organizacoes (nome) values ('Associação Paralela');" NEGADO

echo "── Documento: CPF ou passaporte, exatamente um (decisão 0013)"
escrita "estrangeira com passaporte é aceita" $SEDE \
  "insert into pessoas (nome, passaporte) values ('Kenji Watanabe','TR1234567');" OK
escrita "pessoa sem documento nenhum é recusada" $SEDE \
  "insert into pessoas (nome) values ('Sem documento');" NEGADO
escrita "pessoa com CPF e passaporte é recusada" $SEDE \
  "insert into pessoas (nome, cpf, passaporte) values ('Dois documentos','52998224725','FH123456');" NEGADO
# ⚠️ As duas linhas na MESMA instrução de propósito: `escrita` desfaz a
# transação, então um insert feito na asserção anterior não existe mais aqui.
escrita "passaporte repetido é recusado" $SEDE \
  "insert into pessoas (nome, passaporte) values ('Um','TR1234567'),('Outro','TR1234567');" NEGADO
escrita "passaporte com pontuação é recusado" $SEDE \
  "insert into pessoas (nome, passaporte) values ('Pontuado','FH-123456');" NEGADO
escrita "passaporte em minúscula é recusado" $SEDE \
  "insert into pessoas (nome, passaporte) values ('Minuscula','fh123456');" NEGADO
# ⚠️ Duas pessoas sem CPF precisam conviver: o índice único do CPF passou a
# aceitar NULL, e um índice cheio derrubaria a segunda estrangeira do país.
escrita "duas estrangeiras convivem" $SEDE \
  "insert into pessoas (nome, passaporte) values ('Ana Silva','XDB005112'),('Maria Costa','AB987654');" OK

echo "── Organização: da Associação Local, nunca do Núcleo"
escrita "AL sem organização é recusada" $SEDE \
  "insert into unidades (tipo, pai_id, nome) values ('associacao_local','22220000-0000-0000-0000-000000000001','Sem org');" NEGADO
escrita "núcleo com organização é recusado" $SEDE \
  "insert into unidades (tipo, pai_id, organizacao_id, nome) values ('nucleo','22220000-0000-0000-0000-000000000001',$ORG_PROSP,'Com org');" NEGADO
escrita "regional com organização é recusada" $SEDE \
  "insert into unidades (tipo, pai_id, organizacao_id, nome) values ('regional','11110000-0000-0000-0000-000000000001',$ORG_PROSP,'Com org');" NEGADO

echo "── Vínculo: uma Regional, uma Organização, uma Associação Local"
leitura "a Regional é achada mesmo com um Núcleo no meio" $SEDE \
  "select count(*) from pessoa_vinculo_atual where pessoa_id='d0000000-0000-0000-0000-000000000005' and regional_id='22220000-0000-0000-0000-000000000001';" 1
leitura "e também quando a AL pende direto da Regional" $SEDE \
  "select count(*) from pessoa_vinculo_atual where pessoa_id='d0000000-0000-0000-0000-000000000006' and regional_id='22220000-0000-0000-0000-000000000001';" 1
leitura "a organização vem da Associação Local, sem cadastro à parte" $SEDE \
  "select count(*) from pessoa_vinculo_atual v join organizacoes o on o.id=v.organizacao_id where v.pessoa_id='d0000000-0000-0000-0000-000000000005' and o.nome='Associação da Prosperidade';" 1
leitura "cada pessoa aparece uma única vez" $SEDE \
  "select count(*) from pessoa_vinculo_atual where pessoa_id='d0000000-0000-0000-0000-000000000005';" 1
escrita "papel nacional com unidade é recusado" $SEDE \
  "insert into papeis (pessoa_id, tipo, unidade_id) values ('d0000000-0000-0000-0000-000000000005','eventos_admin','33330000-0000-0000-0000-000000000001');" NEGADO
escrita "papel de unidade sem unidade é recusado" $SEDE \
  "insert into papeis (pessoa_id, tipo) values ('d0000000-0000-0000-0000-000000000005','coordenador');" NEGADO

echo "── Identidade (decisões 0002, 0004 e 0011)"
escrita "CPF fora do formato é recusado" $SEDE \
  "insert into pessoas (cpf, nome) values ('123','X');" NEGADO
escrita "e-mail vazio é recusado (string vazia não é e-mail)" $SEDE \
  "insert into pessoas (cpf, nome, email) values ('11144477735','X','');" NEGADO
escrita "duas pessoas sem e-mail convivem" $SEDE \
  "insert into pessoas (cpf, nome) values ('64152962057','A'),('37515868048','B');" OK
# A família compartilha caixa: 1.060 e-mails repetidos na base de origem.
# Recusar isto rejeitaria milhares de pessoas legítimas na carga.
escrita "mãe e filho compartilham o mesmo e-mail" $SEDE \
  "insert into pessoas (cpf, nome, email) values ('64152962057','Mãe','casa@x'),('37515868048','Filho','casa@x');" OK
escrita "conta sem e-mail é recusada" $SEDE \
  "insert into pessoas (cpf, nome, auth_user_id) values ('64152962057','X','c0000000-0000-0000-0000-000000000001');" NEGADO
# ⚠️ Duas CONTAS com o mesmo e-mail seriam duas identidades para o mesmo
# login. O Auth já impede; este índice é a cinta do nosso lado.
escrita "duas contas com o mesmo e-mail são recusadas" $SEDE \
  "insert into pessoas (cpf, nome, email, auth_user_id) values ('64152962057','A','coord.sul@x','c0000000-0000-0000-0000-000000000007');" NEGADO
# ⚠️ A pior falha possível deste sistema: entregar a sessão da mãe ao filho.
# Com e-mail repetido, a conta nova não tem como saber de quem é — então NÃO
# liga a ninguém e registra a ambiguidade para alguém resolver à mão. Ficar
# sem acesso é chato e reversível; ver a ficha de outra pessoa, não.
amb=$(P -t -A -q -c "begin;
insert into pessoas (cpf, nome, email) values ('64152962057','Mãe','casa@x'),('37515868048','Filho','casa@x');
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-0000000000aa','casa@x');
select (select count(*) from pessoas where auth_user_id = 'c0000000-0000-0000-0000-0000000000aa')
       || '/' ||
       (select count(*) from auditoria where acao = 'conta.ligacao_ambigua');
rollback;" 2>/dev/null | tr -d ' \n')
if [ "$amb" = "0/1" ]; then
  echo "  ✅ conta com e-mail de família não liga a ninguém, e a dúvida vira auditoria"
else
  echo "  ❌ conta com e-mail de família — esperava 0 ligada / 1 auditoria, obteve $amb"
  falhas=$((falhas+1))
fi

escrita "dois vínculos ativos para a mesma pessoa são recusados" $SEDE \
  "insert into pessoa_unidade_vinculos (pessoa_id, unidade_id) values ('d0000000-0000-0000-0000-000000000005','33330000-0000-0000-0000-000000000002');" NEGADO

# ── Superfície de GRANT (decisão 0007) ─────────────────────────────────────
# Tabela que ganhe privilégio para anon ou authenticated sem estar aqui
# reprova. É isto que substitui, mecanicamente, o isolamento de um schema.
echo
echo "── Ficha da pessoa: documentos fora do alcance do navegador"
# ⚠️ Documento de identidade e cache de CEP não se protegem por policy: quem
# alcança a tabela alcança o caminho do arquivo, e caminho vazado é arquivo
# vazado. A garantia é não haver GRANT nenhum.
n_grant_ficha=$(conta "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name in ('pessoa_anexos','ceps') and grantee in ('anon','authenticated');")
if [ "$n_grant_ficha" = "0" ]; then echo "  ✅ anexos e CEPs sem GRANT nenhum";
else echo "  ❌ anexos/CEPs concedidos ao navegador ($n_grant_ficha)"; falhas=$((falhas+1)); fi

n_idx_login=$(conta "select count(*) from pg_indexes where tablename='pessoas' and indexdef ilike '%login%';")
if [ "$n_idx_login" -ge 1 ]; then echo "  ✅ login tem índice único";
else echo "  ❌ login sem índice: dois logins iguais conviveriam"; falhas=$((falhas+1)); fi
escrita "login com dois logins iguais em caixas diferentes é recusado" $SEDE \
  "insert into pessoas (nome, cpf, login) values ('A','52998224725','Vinicius'),('B','11144477735','vinicius');" NEGADO
escrita "login que começa com número é recusado" $SEDE \
  "insert into pessoas (nome, cpf, login) values ('C','52998224725','1abc');" NEGADO
escrita "estado civil fora da lista é recusado" $SEDE \
  "insert into pessoas (nome, cpf, estado_civil) values ('D','52998224725','amigado');" NEGADO
escrita "anexo de tipo desconhecido é recusado" $SEDE \
  "insert into pessoa_anexos (pessoa_id, tipo, caminho, nome_arquivo) values ('d0000000-0000-0000-0000-000000000005','selfie','x/y','y.jpg');" NEGADO

echo "── Departamentos: um cadastro, duas palavras"
# ⚠️ A Organização é um Departamento MARCADO como tal. Se a marca sumir, a tela
# de Associação Local passa a oferecer "Departamento Jurídico" como opção.
n_org=$(conta "select count(*) from organizacoes where e_organizacao;")
[ "$n_org" -ge 4 ] || { echo "  ❌ esperava ao menos as 4 Organizações marcadas, veio $n_org"; falhas=$((falhas+1)); }
n_dep=$(conta "select count(*) from organizacoes where not e_organizacao;")
[ "$n_dep" -ge 14 ] || { echo "  ❌ esperava ao menos 14 Departamentos administrativos, veio $n_dep"; falhas=$((falhas+1)); }
echo "  ✅ $n_org Organizações e $n_dep Departamentos no mesmo cadastro"
escrita "Sede cria seção" $SEDE \
  "insert into secoes (organizacao_id, nome) values ($ORG_PROSP,'Seção de Eventos');" OK
escrita "coordenadora NÃO cria seção" $CSUL \
  "insert into secoes (organizacao_id, nome) values ($ORG_PROSP,'Seção Paralela');" NEGADO
escrita "duas seções com o mesmo nome no mesmo Departamento são recusadas" $SEDE \
  "insert into secoes (organizacao_id, nome) values ($ORG_PROSP,'Repetida'),($ORG_PROSP,'Repetida');" NEGADO

echo "── Mandatos: cargo é fato datado, com requisito de função"
# Uma pessoa com função baixa não pode ser Diretor-Presidente. A checagem é
# contra o HISTÓRICO na data da posse, não contra a função de hoje.
P -q -c "insert into pessoa_funcao_hist (pessoa_id, funcao_id, vigencia_inicio) values ('d0000000-0000-0000-0000-000000000005',(select id from funcoes_doutrinarias where nome='Divulgador'),'2020-01-01');" >/dev/null 2>&1
escrita "Divulgador NÃO pode ser Diretor-Presidente" $SEDE \
  "insert into mandatos (pessoa_id, cargo, data_inicio) values ('d0000000-0000-0000-0000-000000000005','dac.presidente','2026-03-01');" NEGADO
escrita "Divulgador PODE presidir Associação Local" $SEDE \
  "insert into mandatos (pessoa_id, cargo, unidade_id, data_inicio) values ('d0000000-0000-0000-0000-000000000005','al.presidente','33330000-0000-0000-0000-000000000001','2026-06-01');" OK
# ⚠️ A promoção veio DEPOIS da posse: ela não pode validar retroativamente uma
# nomeação que era irregular quando aconteceu.
escrita "promoção posterior não valida posse anterior" $SEDE \
  "insert into pessoa_funcao_hist (pessoa_id, funcao_id, vigencia_inicio) values ('d0000000-0000-0000-0000-000000000005',(select id from funcoes_doutrinarias where nome='Preletor em grau Máster'),'2030-01-01');
   insert into mandatos (pessoa_id, cargo, data_inicio) values ('d0000000-0000-0000-0000-000000000005','dac.presidente','2026-03-01');" NEGADO
escrita "com a função na data da posse, a nomeação passa" $SEDE \
  "insert into pessoa_funcao_hist (pessoa_id, funcao_id, vigencia_inicio) values ('d0000000-0000-0000-0000-000000000005',(select id from funcoes_doutrinarias where nome='Preletor em grau Máster'),'2025-01-01');
   insert into mandatos (pessoa_id, cargo, data_inicio) values ('d0000000-0000-0000-0000-000000000005','dac.presidente','2026-03-01');" OK
escrita "cargo nacional com unidade é recusado" $SEDE \
  "insert into mandatos (pessoa_id, cargo, unidade_id, data_inicio) values ('d0000000-0000-0000-0000-000000000005','dac.secretario','22220000-0000-0000-0000-000000000001','2026-03-01');" NEGADO
escrita "cargo de Regional sem unidade é recusado" $SEDE \
  "insert into mandatos (pessoa_id, cargo, data_inicio) values ('d0000000-0000-0000-0000-000000000005','supervisao.supervisor','2026-10-01');" NEGADO
# ⚠️ Os dois na MESMA instrução: `escrita` desfaz a transação, então um mandato
# aberto na asserção anterior não existe mais aqui.
escrita "dois Presidentes da mesma AL ao mesmo tempo são recusados" $SEDE \
  "insert into mandatos (pessoa_id, cargo, unidade_id, data_inicio) values ('d0000000-0000-0000-0000-000000000005','al.presidente','33330000-0000-0000-0000-000000000001','2026-06-01'),('d0000000-0000-0000-0000-000000000007','al.presidente','33330000-0000-0000-0000-000000000001','2026-06-01');" NEGADO
escrita "coordenadora NÃO dá posse" $CSUL \
  "insert into mandatos (pessoa_id, cargo, unidade_id, data_inicio) values ('d0000000-0000-0000-0000-000000000005','al.presidente','33330000-0000-0000-0000-000000000001','2026-06-01');" NEGADO
n_cargos=$(conta "select count(*) from cargos;")
[ "$n_cargos" -ge 30 ] || { echo "  ❌ esperava ao menos 30 cargos catalogados, veio $n_cargos"; falhas=$((falhas+1)); }
n_secr=$(conta "select count(*) from colegiados c where not exists (select 1 from cargos g where g.colegiado=c.codigo and g.e_secretario) and c.codigo not in ('supervisao','departamento','representacao');")
[ "$n_secr" = "0" ] || { echo "  ❌ $n_secr colegiado(s) sem cargo de Secretário — a ata não saberia quem a lavrou"; falhas=$((falhas+1)); }
echo "  ✅ $n_cargos cargos catalogados, e todo conselho tem Secretário"

echo "── Superfície de GRANT"
# Tabelas e visões que PODEM ser lidas ou escritas pelo navegador. Toda a
# lista é decisão registrada: quem entrar aqui sem estar no arquivo da
# migração reprova.
PERMITIDAS="auditoria,cargos,colegiados,configuracoes,consentimentos_lgpd,funcoes_doutrinarias,locais,mandato_atual,mandatos,organizacoes,papeis,pessoa_funcao_atual,pessoa_funcao_hist,pessoa_unidade_vinculos,pessoa_vinculo_atual,pessoas,secoes,solicitacoes_exclusao,tipos_local,tipos_papel,tipos_unidade,unidades"
inesperadas=$(P -t -A <<SQL
select string_agg(distinct table_name, ', ' order by table_name)
  from information_schema.role_table_grants
 where table_schema = 'public'
   and grantee in ('anon','authenticated')
   and table_name <> all (string_to_array('$PERMITIDAS', ','));
SQL
)
inesperadas=$(echo "$inesperadas" | tr -d ' \n')
if [ -z "$inesperadas" ]; then
  echo "  ✅ nenhuma tabela concedida fora da lista declarada"
else
  echo "  ❌ tabelas com GRANT não declarado: $inesperadas"
  falhas=$((falhas+1))
fi

anon=$(P -t -A -c "select count(*) from information_schema.role_table_grants where table_schema='public' and grantee='anon';")
if [ "$(echo "$anon" | tr -d ' ')" = "0" ]; then
  echo "  ✅ anon não alcança tabela nenhuma"
else
  echo "  ❌ anon tem privilégio em $anon tabela(s)"
  falhas=$((falhas+1))
fi

semrls=$(P -t -A <<'SQL'
select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
SQL
)
semrls=$(echo "$semrls" | tr -d ' \n')
if [ -z "$semrls" ]; then
  echo "  ✅ toda tabela de public tem RLS ligada"
else
  echo "  ❌ sem RLS: $semrls"
  falhas=$((falhas+1))
fi

# ── Módulo eventos: schema próprio, fechado ao navegador (decisões 0003/0007)
#
# O módulo fala Postgres direto pelo pooler, e a autorização acontece por
# capacidade no servidor. Nada aqui pode ser alcançável por `anon` ou
# `authenticated` — nem por engano, nem no dia em que alguém copiar um GRANT
# de outra migração.
echo
echo "── Módulo eventos: fechado ao navegador"

n_tab_ev=$(conta "select count(*) from pg_tables where schemaname='eventos';")
if [ "$n_tab_ev" -ge 15 ]; then
  echo "  ✅ schema eventos criado com $n_tab_ev tabelas"
else
  echo "  ❌ schema eventos tem só $n_tab_ev tabela(s) — a migração não aplicou inteira"
  falhas=$((falhas+1))
fi

ev_sem_rls=$(P -t -A <<'SQL'
select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'eventos' and c.relkind = 'r' and not c.relrowsecurity;
SQL
)
ev_sem_rls=$(echo "$ev_sem_rls" | tr -d ' \n')
if [ -z "$ev_sem_rls" ]; then
  echo "  ✅ toda tabela de eventos tem RLS ligada"
else
  echo "  ❌ sem RLS em eventos: $ev_sem_rls"
  falhas=$((falhas+1))
fi

ev_grants=$(conta "select count(*) from information_schema.role_table_grants where table_schema='eventos' and grantee in ('anon','authenticated');")
if [ "$ev_grants" = "0" ]; then
  echo "  ✅ nenhuma tabela de eventos concedida a anon ou authenticated"
else
  echo "  ❌ $ev_grants concessão(ões) indevidas em eventos"
  falhas=$((falhas+1))
fi

ev_uso=$(conta "select count(*) from information_schema.usage_privileges where object_schema='eventos' and grantee in ('anon','authenticated');")
if [ "$ev_uso" = "0" ]; then
  echo "  ✅ nem o schema eventos é visível para o navegador"
else
  echo "  ❌ anon/authenticated têm usage no schema eventos"
  falhas=$((falhas+1))
fi

# ⚠️ Toda inscrição aponta para uma pessoa da plataforma. É esta FK que impede
# o módulo de criar a sua própria noção de gente (decisão 0002) — sem ela,
# eventos teria participantes que o Ciclo não enxerga.
fk_pessoa=$(conta "select count(*) from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
 where tc.table_schema='eventos' and tc.constraint_type='FOREIGN KEY'
   and ccu.table_schema='public' and ccu.table_name='pessoas';")
if [ "$fk_pessoa" -ge 5 ]; then
  echo "  ✅ eventos referencia public.pessoas ($fk_pessoa chaves)"
else
  echo "  ❌ eventos quase não referencia pessoas ($fk_pessoa) — o módulo criou gente própria?"
  falhas=$((falhas+1))
fi

echo
if [ "$falhas" -eq 0 ]; then
  echo "✅ RLS íntegro — herança correta na árvore, sem vazamento entre unidades."
else
  echo "❌ $falhas verificação(ões) falharam."
  exit 1
fi
