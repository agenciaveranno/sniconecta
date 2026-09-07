import { describe, expect, it } from "vitest";
import { formatarPassaporte, normalizarPassaporte, passaporteValido } from "@/lib/dominio/passaporte";

describe("passaporte", () => {
  it("aceita as formas que os países emitem", () => {
    expect(passaporteValido("FH123456")).toBe(true); // Brasil
    expect(passaporteValido("123456789")).toBe(true); // Estados Unidos
    expect(passaporteValido("TR1234567")).toBe(true); // Japão
    expect(passaporteValido("XDB005112")).toBe(true); // Portugal
  });

  it("normaliza caixa e separador antes de comparar", () => {
    // ⚠️ Sem isso, "ab123456" e "AB123456" viram duas pessoas: o índice único
    // do banco compara o texto como está gravado.
    expect(normalizarPassaporte("ab-123 456")).toBe("AB123456");
    expect(normalizarPassaporte("fh.123/456")).toBe("FH123456");
    expect(passaporteValido("ab 123456")).toBe(true);
  });

  it("recusa o que não é documento", () => {
    expect(passaporteValido("")).toBe(false);
    expect(passaporteValido("AB12")).toBe(false); // curto demais
    expect(passaporteValido("A".repeat(21))).toBe(false); // longo demais
    expect(passaporteValido("AB@12345")).toBe(false); // símbolo
    expect(passaporteValido("ÁB123456")).toBe(false); // acento
  });

  it("mostra o documento como ele é, sem inventar máscara", () => {
    expect(formatarPassaporte("fh123456")).toBe("FH123456");
    expect(formatarPassaporte(null)).toBe("—");
  });
});
