import { describe, expect, it } from "vitest";
import { TENTATIVAS } from "../src/lib/dominio/identificador";

/** Quais colunas seriam consultadas para este texto, na ordem. */
function tentadas(bruto: string): string[] {
  return TENTATIVAS.filter((t) => t.serve(bruto)).map((t) => t.coluna);
}

describe("de que jeito o identificador do login é procurado", () => {
  it("o login não é engolido pelo ramo do passaporte", () => {
    // ⚠️ Era este o defeito: com `if/else if`, "maria.silva" caía no ramo do
    // passaporte — `normalizarPassaporte` a transformava em "MARIASILVA", que
    // passa na validação de formato — e a busca terminava ali. O campo `login`
    // era prometido na tela, tinha check no banco, e não fazia entrar.
    expect(tentadas("maria.silva")).toContain("login");
  });

  it("CPF vem antes de passaporte: onze dígitos são CPF muito mais provavelmente", () => {
    const ordem = tentadas("529.982.247-25");
    expect(ordem[0]).toBe("cpf");
  });

  it("CPF com dígito verificador errado não é procurado como CPF", () => {
    expect(tentadas("111.111.111-11")).not.toContain("cpf");
  });

  it("passaporte continua servindo para quem não tem CPF", () => {
    expect(tentadas("FX374981")).toContain("passaporte");
  });

  it("o valor procurado é o normalizado, não o digitado", () => {
    const cpf = TENTATIVAS.find((t) => t.coluna === "cpf")!;
    expect(cpf.valor("529.982.247-25")).toBe("52998224725");
    const passaporte = TENTATIVAS.find((t) => t.coluna === "passaporte")!;
    expect(passaporte.valor("fx 374981")).toBe("FX374981");
  });

  it("texto em branco não procura nada", () => {
    expect(tentadas("   ")).toEqual([]);
  });
});
