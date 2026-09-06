import "server-only";
import { createClient } from "@supabase/supabase-js";
import { chaveDeServico, urlSupabase } from "./ambiente";
import type { Database } from "./tipos";

/**
 * Cliente com `service_role`: IGNORA o RLS. Só no servidor, só quando o RLS
 * impede legitimamente (conteúdo público, tabela sem GRANT, resolução
 * CPF → e-mail, criação de conta). Registre auditoria ao usar.
 */
export function criarClienteServico() {
  return createClient<Database>(urlSupabase(), chaveDeServico(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
