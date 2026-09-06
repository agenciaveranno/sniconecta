"use client";

import { createBrowserClient } from "@supabase/ssr";
import { chaveAnonima, urlSupabase } from "./ambiente";
import type { Database } from "./tipos";

/** Cliente do navegador. Raro: quase tudo é Server Component ou Server Action. */
export function criarClienteNavegador() {
  return createBrowserClient<Database>(
    urlSupabase(),
    chaveAnonima()
  );
}
