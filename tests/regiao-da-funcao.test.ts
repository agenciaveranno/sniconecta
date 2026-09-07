import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ⚠️ O banco está em São Paulo. Sem `regions` no `vercel.json`, a Vercel roda
 * as funções em Washington, e TODA consulta atravessa o Atlântico duas vezes —
 * cerca de 120 ms de rede pura por ida e volta, dez vezes por navegação.
 *
 * Apagar essa chave não quebra nada: o sistema continua de pé, só lento, em
 * silêncio. É exatamente o tipo de regressão que ninguém encontra olhando o
 * código — daí o teste. Decisão 0017.
 */
const REGIOES_NO_BRASIL = ["gru1"];

describe("região da função", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf-8")) as {
    regions?: string[];
  };

  it("roda no mesmo continente que o banco", () => {
    expect(config.regions ?? []).not.toEqual([]);
    for (const regiao of config.regions ?? []) {
      expect(REGIOES_NO_BRASIL).toContain(regiao);
    }
  });
});
