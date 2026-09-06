import { describe, expect, it } from "vitest";
import {
  cnpjValido,
  filialCnpj,
  formatarCnpj,
  mesmaRaiz,
  raizCnpj,
  somenteDigitos,
} from "@/lib/dominio/cnpj";

// O CNPJ da Sede Central, publicado no rodapé do site institucional. É a
// matriz: filial 0001. Toda unidade da instituição compartilha a raiz dele.
const SEDE = "61.278.388/0001-81";

describe("cnpjValido", () => {
  it("aceita CNPJ com dígito verificador correto, com ou sem máscara", () => {
    expect(cnpjValido(SEDE)).toBe(true);
    expect(cnpjValido("61278388000181")).toBe(true);
  });
  it("recusa dígito verificador errado", () => {
    expect(cnpjValido("61278388000182")).toBe(false);
  });
  it("recusa placeholders de dígitos repetidos", () => {
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
  });
  it("recusa tamanho errado, vazio e nulo", () => {
    expect(cnpjValido("6127838800018")).toBe(false);
    expect(cnpjValido("")).toBe(false);
    expect(cnpjValido(null)).toBe(false);
  });
});

// Toda unidade é filial da Sede Central: muda o número depois da barra, não a
// raiz. É o que deixa um CNPJ de outra empresa ser recusado no cadastro, sem
// consultar a Receita.
describe("raiz e filial", () => {
  it("separa a raiz da pessoa jurídica do número da filial", () => {
    expect(raizCnpj(SEDE)).toBe("61278388");
    expect(filialCnpj(SEDE)).toBe("0001");
  });
  it("reconhece a filial como sendo da mesma pessoa jurídica", () => {
    expect(mesmaRaiz(SEDE, "61.278.388/0012-04")).toBe(true);
  });
  it("recusa CNPJ de outra empresa", () => {
    expect(mesmaRaiz(SEDE, "11.222.333/0001-81")).toBe(false);
  });
  it("raiz incompleta nunca casa — nem consigo mesma", () => {
    expect(mesmaRaiz("612", "612")).toBe(false);
    expect(mesmaRaiz(null, null)).toBe(false);
  });
});

describe("formatação", () => {
  it("guarda só dígitos e formata na saída", () => {
    expect(somenteDigitos(" 61.278.388/0001-81 ")).toBe("61278388000181");
    expect(formatarCnpj("61278388000181")).toBe(SEDE);
  });
  it("não inventa máscara para valor que não é CNPJ", () => {
    expect(formatarCnpj("123")).toBe("123");
  });
});
