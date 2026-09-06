import { describe, expect, it } from "vitest";
import { centavosDe, descontoPercentual, formatarCentavos } from "@/lib/dominio/dinheiro";

// Dinheiro é inteiro em centavos. A origem guardava DECIMAL(10,2) e o driver
// devolvia string; a ponte precisa aceitar as duas formas sem perder centavo.
describe("centavosDe", () => {
  it("converte string decimal do banco e número", () => {
    expect(centavosDe("123.45")).toBe(12345);
    expect(centavosDe(123.45)).toBe(12345);
    expect(centavosDe("0.10")).toBe(10);
  });
  it("aceita formato brasileiro digitado em tela", () => {
    expect(centavosDe("1.234,56")).toBe(123456);
    expect(centavosDe("R$ 50,00")).toBe(5000);
  });
  it("não sofre do erro clássico de ponto flutuante", () => {
    expect(centavosDe(1.1 + 2.2)).toBe(330);
  });
  it("vazio e inválido viram null, nunca zero silencioso", () => {
    expect(centavosDe("")).toBeNull();
    expect(centavosDe(null)).toBeNull();
    expect(centavosDe("abc")).toBeNull();
  });
});

describe("desconto e formatação", () => {
  it("arredonda ao centavo", () => {
    expect(descontoPercentual(9999, 10)).toBe(1000);
    expect(descontoPercentual(333, 33)).toBe(110);
  });
  it("formata em reais", () => {
    expect(formatarCentavos(12345).replace(/ /g, " ")).toBe("R$ 123,45");
    expect(formatarCentavos(null)).toBe("—");
  });
});
