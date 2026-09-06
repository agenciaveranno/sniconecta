import { describe, expect, it } from "vitest";
import { cpfValido, formatarCpf, somenteDigitos } from "@/lib/dominio/cpf";

// O banco só valida o formato do CPF. Se o dígito verificador não for
// conferido na entrada, um CPF digitado errado vira pessoa legítima — e o
// CPF certo, quando chegar, vira uma segunda pessoa.
describe("cpfValido", () => {
  it("aceita CPF com dígito verificador correto, com ou sem máscara", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
  });
  it("recusa dígito verificador errado", () => {
    expect(cpfValido("52998224726")).toBe(false);
  });
  it("recusa placeholders de dígitos repetidos, mesmo com DV formalmente válido", () => {
    expect(cpfValido("00000000000")).toBe(false);
    expect(cpfValido("11111111111")).toBe(false);
  });
  it("recusa tamanho errado, vazio e nulo", () => {
    expect(cpfValido("1234567890")).toBe(false);
    expect(cpfValido("")).toBe(false);
    expect(cpfValido(null)).toBe(false);
  });
});

describe("formatação", () => {
  it("guarda só dígitos e formata na saída", () => {
    expect(somenteDigitos(" 529.982.247-25 ")).toBe("52998224725");
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
  });
  it("não inventa máscara para valor que não é CPF", () => {
    expect(formatarCpf("123")).toBe("123");
  });
});
