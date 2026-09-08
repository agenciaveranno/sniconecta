import { describe, expect, it } from "vitest";

/**
 * ⚠️ `startsWith("/")` não basta: "//evil.example" começa com barra e o
 * navegador o resolve como endereço EXTERNO. Quem entrasse de verdade, pela
 * tela de verdade, era entregue ao site do atacante logo depois — que é o
 * momento em que uma página de "sua sessão expirou" convence qualquer um.
 */
const seguro = (voltar: string) => /^\/[^/\\]/.test(voltar);

describe("para onde o login pode devolver a pessoa", () => {
  it("aceita o caminho que o proxy produz", () => {
    expect(seguro("/admin/pessoas")).toBe(true);
    expect(seguro("/painel")).toBe(true);
  });

  it("recusa o endereço de protocolo relativo, que é externo", () => {
    expect(seguro("//evil.example")).toBe(false);
  });

  it("recusa a contrabarra, que o parser de URL trata como barra", () => {
    expect(seguro("/\\evil.example")).toBe(false);
    expect(seguro("/\\/evil.example")).toBe(false);
  });

  it("recusa endereço absoluto e barra sozinha", () => {
    expect(seguro("https://evil.example")).toBe(false);
    expect(seguro("/")).toBe(false);
    expect(seguro("")).toBe(false);
  });
});
