import { NextRequest, NextResponse } from "next/server";
import { processarFila } from "@/lib/comunicacao/fila";

/**
 * Processa a fila de notificações. Chamada pelo Vercel Cron (GET) ou pelo
 * botão "Processar agora" (POST). Não tem sessão: autentica por
 * `Bearer $CRON_SECRET`, e fica FORA do proxy de sessão (src/proxy.ts) para
 * poder recusar com 401/503 em vez de receber a página de login.
 */
async function tratar(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    return NextResponse.json({ error: "Fila fechada: CRON_SECRET não configurado." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const resultado = await processarFila();
  return NextResponse.json(resultado);
}

export const GET = tratar;
export const POST = tratar;
