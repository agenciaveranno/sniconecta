import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONSULTAS = readFileSync("src/modulos/eventos/consultas.ts", "utf8");
const ACOES = readFileSync("src/modulos/eventos/acoes.ts", "utf8");
const TUDO = CONSULTAS + ACOES;

/**
 * Toda busca de pessoa passa pelo MESMO preparo.
 *
 * ⚠️ Eram cinco cópias à mão — a porta, o balcão, a ficha, o cancelamento e a
 * troca de titular. Cinco cópias divergem na primeira que alguém corrigir, e o
 * jeito que isso aparece é a porta achar quem o balcão não acha: a pessoa está
 * na fila com o documento e cada tela dá uma resposta.
 */
describe("a busca de pessoa não diverge entre telas", () => {
  it("ninguém prepara o termo à mão", () => {
    // A marca da preparação manual: tirar os não-dígitos do termo digitado.
    const manuais = TUDO.match(/\w+\.replace\(\/\\D\/g, ""\)/g) ?? [];
    expect(manuais, `preparo à mão fora do domínio: ${manuais.join(", ")}`).toEqual([]);
  });

  it("ninguém monta o padrão de ilike à mão", () => {
    // ⚠️ `"%" + termo + "%"` deixa `%` e `_` do texto digitado valendo como
    // curinga. Quem digitou o sublinhado quis o sublinhado.
    const manuais = TUDO.match(/"%"\s*\+/g) ?? [];
    expect(manuais, "padrão de ilike montado à mão").toEqual([]);
  });

  it("todo ilike de nome declara o escape", () => {
    // Sem `escape`, a contrabarra que o preparo introduz não neutraliza nada.
    const ilikes = TUDO.match(/ilike \$\{[^}]+\}[^\n]*/g) ?? [];
    expect(ilikes.length, "não achei ilike nenhum — o parser cegou").toBeGreaterThan(0);
    for (const linha of ilikes) {
      expect(linha, `ilike sem escape: ${linha.trim()}`).toContain("escape");
    }
  });

  it("o preparo é importado onde se busca pessoa", () => {
    expect(CONSULTAS).toContain('from "@/lib/dominio/busca-pessoa"');
    expect(ACOES).toContain('from "@/lib/dominio/busca-pessoa"');
  });
});
