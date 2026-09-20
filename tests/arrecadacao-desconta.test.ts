import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CONSULTAS = readFileSync("src/modulos/eventos/consultas.ts", "utf8");

/**
 * Arrecadação é `valor_original - desconto`, em toda consulta, sempre.
 *
 * ⚠️ Hoje todo desconto é zero — a venda balcão não aplica cupom e a carga
 * trouxe zero. Uma soma sem o desconto dá o MESMO número agora e passa a
 * mentir no dia em que o primeiro cupom for usado, sem ninguém perceber,
 * porque o número continua saindo. É o pior tipo de erro de relatório: o que
 * não avisa.
 */
describe("arrecadação desconta, em toda consulta", () => {
  it("nenhuma soma de valor_original esquece o desconto", () => {
    // Pega cada `sum(...)` que mencione o valor original e exige o desconto
    // dentro do MESMO parêntese.
    const somas = CONSULTAS.match(/sum\([\s\S]*?\)/g) ?? [];
    const comValor = somas.filter((s) => s.includes("valor_original_centavos"));

    expect(comValor.length, "não achei soma de arrecadação nenhuma — o parser cegou").toBeGreaterThan(0);

    for (const soma of comValor) {
      expect(soma, `soma sem desconto: ${soma.replace(/\s+/g, " ")}`)
        .toContain("desconto_centavos");
    }
  });

  it("cortesia fica de fora da arrecadação", () => {
    // ⚠️ A carga trouxe cortesias do sistema antigo COM valor preenchido.
    // Contá-las faria a Sede ver dinheiro que nunca entrou no caixa.
    const somas = (CONSULTAS.match(/sum\([\s\S]*?\)/g) ?? [])
      .filter((s) => s.includes("valor_original_centavos"));
    for (const soma of somas) {
      expect(soma, `soma que conta cortesia: ${soma.replace(/\s+/g, " ")}`)
        .toContain("tipo_venda <> 'cortesia'");
    }
  });
});
