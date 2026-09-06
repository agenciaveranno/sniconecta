import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./tipos";

/**
 * Cliente com `service_role`: IGNORA o RLS. Só no servidor, só quando o RLS
 * impede legitimamente (conteúdo público, tabela sem GRANT, resolução
 * CPF → e-mail, criação de conta). Registre auditoria ao usar.
 */
export function criarClienteServico() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) {
    throw new Error("Sem SUPABASE_SERVICE_ROLE_KEY: operações de servidor não conseguem ler o banco.");
  }
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
