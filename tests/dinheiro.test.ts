import { describe, expect, it } from "vitest";
import { centavosDe, descontoPercentual, formatarCentavos, ratear } from "@/lib/dominio/dinheiro";

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

describe("repartir um valor entre linhas", () => {
  it("a soma bate EXATAMENTE com o total, mesmo sem divisão exata", () => {
    // ⚠️ R$ 10,00 entre três: 3,33 + 3,33 + 3,34. Com `Math.round` linha a
    // linha daria 9,99, e o centavo que sobra vira diferença entre o que a
    // tela mostrou e o que o banco guardou.
    const partes = ratear(1000, [1000, 1000, 1000]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(partes).toEqual([334, 333, 333]);
  });

  it("reparte proporcionalmente ao peso", () => {
    expect(ratear(3000, [10000, 5000])).toEqual([2000, 1000]);
  });

  it("peso zero não recebe nada", () => {
    expect(ratear(1000, [1000, 0])).toEqual([1000, 0]);
  });

  it("sem peso nenhum devolve zeros em vez de NaN", () => {
    // Dividir por zero daria NaN em toda linha, que o banco recusaria com uma
    // mensagem sobre tipo — longe da causa.
    expect(ratear(1000, [0, 0])).toEqual([0, 0]);
    expect(ratear(1000, [])).toEqual([]);
  });

  it("total zero não reparte nada", () => {
    expect(ratear(0, [100, 200])).toEqual([0, 0]);
  });

  it("qualquer repartição fecha a soma", () => {
    // Varre combinações que costumam sobrar centavo.
    for (const total of [1, 7, 99, 100, 1000, 12345]) {
      for (const pesos of [[1, 1, 1], [3, 5, 7], [1, 2, 3, 4, 5, 6, 7]]) {
        expect(ratear(total, pesos).reduce((a, b) => a + b, 0), `${total} entre ${pesos}`).toBe(total);
      }
    }
  });
});
