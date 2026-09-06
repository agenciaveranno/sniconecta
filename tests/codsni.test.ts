import { describe, it, expect } from "vitest";
import { codSniValido, normalizarCodSni } from "../src/lib/dominio/codsni";

describe("CodSNI", () => {
  it("aceita apenas dígitos, sem limite de tamanho", () => {
    expect(codSniValido("12345")).toBe(true);
    expect(codSniValido("000123")).toBe(true); // zeros à esquerda preservados
    expect(codSniValido("9".repeat(40))).toBe(true); // sem limite
  });

  it("preserva zeros à esquerda na normalização", () => {
    expect(normalizarCodSni("  007  ")).toBe("007");
  });

  it("rejeita não-dígitos e vazio", () => {
    expect(codSniValido("12a45")).toBe(false);
    expect(codSniValido("")).toBe(false);
    expect(codSniValido("12.345")).toBe(false);
  });
});
