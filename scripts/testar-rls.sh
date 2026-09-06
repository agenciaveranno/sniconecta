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
insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-000000000001','sede@x'),
  ('c0000000-0000-0000-0000-000000000002','coord.sul@x'),
  ('c0000000-0000-0000-0000-000000000003','coord.campinas@x'),
  ('c0000000-0000-0000-0000-000000000004','orientador.sul@x'),
  ('c0000000-0000-0000-0000-000000000005','aluna.curitiba@x'),
  ('c0000000-0000-0000-0000-000000000006','coord.nucleo@x');

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

echo "── Identidade (decisões 0002 e 0004)"
escrita "CPF fora do formato é recusado" $SEDE \
  "insert into pessoas (cpf, nome) values ('123','X');" NEGADO
escrita "e-mail vazio é recusado (o unique cairia na segunda pessoa)" $SEDE \
  "insert into pessoas (cpf, nome, email) values ('11144477735','X','');" NEGADO
escrita "duas pessoas sem e-mail convivem" $SEDE \
  "insert into pessoas (cpf, nome) values ('64152962057','A'),('37515868048','B');" OK
escrita "conta sem e-mail é recusada" $SEDE \
  "insert into pessoas (cpf, nome, auth_user_id) values ('64152962057','X','c0000000-0000-0000-0000-000000000001');" NEGADO
escrita "dois vínculos ativos para a mesma pessoa são recusados" $SEDE \
  "insert into pessoa_unidade_vinculos (pessoa_id, unidade_id) values ('d0000000-0000-0000-0000-000000000005','33330000-0000-0000-0000-000000000002');" NEGADO

# ── Superfície de GRANT (decisão 0007) ─────────────────────────────────────
# Tabela que ganhe privilégio para anon ou authenticated sem estar aqui
# reprova. É isto que substitui, mecanicamente, o isolamento de um schema.
echo
echo "── Superfície de GRANT"
# Tabelas e visões que PODEM ser lidas ou escritas pelo navegador. Toda a
# lista é decisão registrada: quem entrar aqui sem estar no arquivo da
# migração reprova.
PERMITIDAS="auditoria,configuracoes,consentimentos_lgpd,funcoes_doutrinarias,locais,organizacoes,papeis,pessoa_funcao_atual,pessoa_funcao_hist,pessoa_unidade_vinculos,pessoa_vinculo_atual,pessoas,solicitacoes_exclusao,tipos_papel,tipos_unidade,unidades"
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

echo
if [ "$falhas" -eq 0 ]; then
  echo "✅ RLS íntegro — herança correta na árvore, sem vazamento entre unidades."
else
  echo "❌ $falhas verificação(ões) falharam."
  exit 1
fi
