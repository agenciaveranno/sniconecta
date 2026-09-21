import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIGRACOES_ESPERADAS } from "@/lib/migracoes";

/**
 * A lista de migrações esperadas não pode ficar para trás da pasta.
 *
 * ⚠️ Ela é escrita à mão de propósito — `supabase/migrations/` não entra no
 * pacote que a Vercel publica, e um `readdirSync` em produção devolveria
 * "nenhuma migração esperada": a resposta tranquilizadora e errada. O preço de
 * escrever à mão é esquecer, e é isto que não deixa esquecer.
 */
describe("a lista de migrações esperadas está em dia", () => {
  const naPasta = readdirSync("supabase/migrations")
    .filter((a) => a.endsWith(".sql"))
    .map((a) => a.split("_")[0])
    .sort();

  it("toda migração da pasta está na lista", () => {
    const faltando = naPasta.filter((v) => !MIGRACOES_ESPERADAS.includes(v));
    expect(
      faltando,
      `acrescente em src/lib/migracoes.ts: ${faltando.map((v) => `"${v}",`).join(" ")}`
    ).toEqual([]);
  });

  it("nenhuma migração da lista sumiu da pasta", () => {
    // Migração aplicada não se apaga: o banco de produção já a executou, e a
    // lista deixaria de conferir o que ele tem.
    const sumiram = MIGRACOES_ESPERADAS.filter((v) => !naPasta.includes(v));
    expect(sumiram, `sumiram da pasta: ${sumiram.join(", ")}`).toEqual([]);
  });

  it("a lista enxerga alguma coisa", () => {
    // Um extrator que parasse de casar passaria verde comparando vazio com
    // vazio — foi assim que `colunas-das-telas` nasceu vigiando zero.
    expect(naPasta.length, "não li migração nenhuma da pasta").toBeGreaterThan(15);
    expect(MIGRACOES_ESPERADAS.length).toBe(naPasta.length);
  });

  it("as versões são carimbos de data e hora, e ordenáveis como texto", () => {
    // ⚠️ É o que faz `sort()` dar a ordem de aplicação. Uma versão fora do
    // formato ordenaria em qualquer lugar, e a comparação com o banco viraria
    // adivinhação.
    for (const v of MIGRACOES_ESPERADAS) expect(v).toMatch(/^\d{14}$/);
  });
});
