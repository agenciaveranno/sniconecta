"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./tipos";

/** Cliente do navegador. Raro: quase tudo é Server Component ou Server Action. */
export function criarClienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
