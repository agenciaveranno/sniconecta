#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# Sobe um Postgres com as migrações aplicadas e um evento de mentira dentro, e
# DEIXA RODANDO. É contra ele que as consultas do módulo `eventos` são
# exercitadas de verdade.
#
# POR QUE EXISTE. O módulo `eventos` fala Postgres DIRETO, sem cliente tipado:
# nome de coluna errado, `join` trocado, `group by` incompleto e coluna
# ambígua não quebram typecheck, não quebram teste unitário e não quebram
# build. Quebram quando alguém ABRE A TELA — em produção, porque até aqui não
# havia banco nenhum no CI para exercitá-las.
#
# `colunas-das-telas` cobre o que dá para cobrir lendo texto: os nomes de
# coluna. O resto — se a consulta RODA — só o Postgres responde.
#
#   ./scripts/banco-de-teste.sh          sobe e imprime a string de conexão
#   ./scripts/banco-de-teste.sh --parar  derruba
#
# Requer postgresql instalado. Não toca em nada remoto.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

PORTA=${PORTA_TESTE:-5438}
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | head -1)
DATA=${DATA_TESTE:-/var/lib/postgresql/consultas-sniconecta}
RAIZ=$(cd "$(dirname "$0")/.." && pwd)

[ -z "$PGBIN" ] && { echo "postgresql não encontrado"; exit 1; }

if [ "${1:-}" = "--parar" ]; then
  su postgres -c "$PGBIN/pg_ctl -D $DATA stop" >/dev/null 2>&1
  rm -rf "$DATA"
  echo "banco de teste derrubado"
  exit 0
fi

echo "▸ subindo Postgres de teste na porta $PORTA" >&2
su postgres -c "$PGBIN/pg_ctl -D $DATA stop" >/dev/null 2>&1
rm -rf "$DATA"; mkdir -p "$DATA"; chown postgres:postgres "$DATA"
su postgres -c "$PGBIN/initdb -D $DATA -A trust -U postgres" >/dev/null 2>&1
su postgres -c "$PGBIN/pg_ctl -D $DATA -o '-p $PORTA -k /tmp' -l /tmp/pg-consultas.log start" >/dev/null 2>&1
sleep 2

P() { psql -h /tmp -p "$PORTA" -U postgres -v ON_ERROR_STOP=1 "$@"; }

# O mesmo stub do harness de RLS: o que o Supabase já traz pronto e um
# Postgres puro não tem.
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

echo "▸ aplicando as migrações" >&2
for m in "$RAIZ"/supabase/migrations/*.sql; do
  saida=$(P -f "$m" 2>&1) || {
    echo "  ✖ falhou em $(basename "$m")" >&2
    echo "$saida" | grep -iE "error" | head -5 | sed 's/^/       /' >&2
    exit 1
  }
done

echo "▸ semeando um evento de mentira" >&2
P -q -f "$RAIZ/scripts/semente-de-teste.sql" >/dev/null || exit 1

echo "postgresql://postgres@127.0.0.1:$PORTA/postgres"
