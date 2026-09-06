import "server-only";
import postgres from "postgres";

/**
 * Conexão direta ao Postgres para o módulo `eventos`, pelo POOLER do Supabase
 * em modo transação (porta 6543). `prepare: false` é obrigatório nesse modo:
 * prepared statements não sobrevivem à troca de conexão entre transações.
 *
 * Por que direto e não PostgREST: o módulo tem transações com `FOR UPDATE`
 * (reserva na compra, estorno, cancelamento em grupo), relatórios com joins
 * pesados e deduplicação em lote. O cliente Supabase não faz transação.
 *
 * O RLS das tabelas de `eventos` fica ligado, sem GRANT para `authenticated`:
 * esta conexão é a única porta, e a autorização acontece por capacidade
 * antes de qualquer consulta (ver docs/decisoes/0003-acesso-ao-banco.md).
 */
const globalParaDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

function criar() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Sem DATABASE_URL: o módulo eventos não alcança o banco.");
  return postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    // Datas do banco chegam como timestamptz; nada de string sem fuso.
    transform: { undefined: null },
  });
}

export const sql = globalParaDb.sql ?? criar();
if (process.env.NODE_ENV !== "production") globalParaDb.sql = sql;
