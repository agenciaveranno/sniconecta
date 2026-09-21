import { describe, expect, it } from "vitest";
import { corDeMarca } from "@/lib/dominio/cor";

describe("a cor da marca", () => {
  it("hexadecimal de seis dígitos passa, em caixa alta", () => {
    expect(corDeMarca("#132460")).toBe("#132460");
    expect(corDeMarca("#b45309")).toBe("#B45309");
  });

  it("três dígitos viram seis, para o que fica gravado ter sempre a mesma forma", () => {
    expect(corDeMarca("#036")).toBe("#003366");
  });

  it("espaço em volta não atrapalha", () => {
    expect(corDeMarca("  #132460 ")).toBe("#132460");
  });

  it("vazio é ausência, não erro", () => {
    expect(corDeMarca("")).toBeNull();
    expect(corDeMarca(null)).toBeNull();
  });

  it("o que não é cor é recusado", () => {
    // ⚠️ O valor vai direto para um `style` inline. Texto de gente entrando em
    // lugar onde certos caracteres MANDAM em vez de valer é o mesmo problema
    // do `%` no ilike — aqui o estrago é uma declaração CSS inventada por quem
    // preencheu o campo.
    for (const lixo of [
      "red",
      "#12345",
      "#1234567",
      "132460",
      "rgb(1,2,3)",
      "#12346x",
      "#132460; background: url(http://x)",
      "</style><script>",
    ]) {
      expect(corDeMarca(lixo), lixo).toBeNull();
    }
  });
});
