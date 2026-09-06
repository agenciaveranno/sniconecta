import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase/server";

// Sair por POST de formulário (funciona sem JavaScript). Fica fora do proxy
// de sessão como toda rota de login.
export async function POST(req: Request) {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
