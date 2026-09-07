import { NextResponse } from "next/server";
import { consultarCep } from "@/lib/cep";
import { pessoaAtual } from "@/lib/auth";

/**
 * Consulta de CEP para as telas de cadastro.
 *
 * ⚠️ Exige sessão, e não capacidade. Preencher endereço não é uma ação sobre
 * dado de ninguém — quem cadastra pessoa, unidade ou local precisa disto, e
 * exigir capacidade específica obrigaria a listar todas elas aqui e esquecer
 * uma no próximo cadastro que surgisse.
 *
 * ⚠️ Mas exige sessão SIM: aberta, a rota viraria um proxy de consulta de CEP
 * de graça para quem passasse, na conta da instituição.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ cep: string }> }) {
  const eu = await pessoaAtual();
  if (!eu) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  const { cep } = await ctx.params;
  const achado = await consultarCep(cep);
  if (!achado) return NextResponse.json({ achado: null });

  return NextResponse.json(
    { achado },
    // Endereço de CEP muda raramente. O navegador pode guardar por um dia sem
    // risco de mostrar rua errada, e isso poupa ida ao servidor quando alguém
    // cadastra várias pessoas do mesmo prédio.
    { headers: { "cache-control": "private, max-age=86400" } }
  );
}
