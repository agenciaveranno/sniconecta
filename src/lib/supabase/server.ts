import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { chaveAnonima, urlSupabase } from "./ambiente";
import type { Database } from "./tipos";

/**
 * Cliente do servidor COM os cookies da pessoa: o RLS vale por baixo.
 * É o padrão. Use sempre que puder.
 */
export async function criarClienteServidor() {
  const jar = await cookies();
  return createServerClient<Database>(
    urlSupabase(),
    chaveAnonima(),
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => jar.set(name, value, options));
          } catch {
            // Chamado de um Server Component: cookie não pode ser escrito aqui.
            // O proxy já renovou a sessão; nada se perde.
          }
        },
      },
    }
  );
}
