import { describe, expect, it } from "vitest";
import { prepararBusca } from "@/lib/dominio/busca-pessoa";

describe("preparar a busca de pessoa", () => {
  it("CPF com ponto e traço vira só dígitos", () => {
    // A coluna guarda só dígitos; quem digita põe a pontuação.
    expect(prepararBusca("123.456.789-00")?.digitos).toBe("12345678900");
  });

  it("passaporte vira caixa alta", () => {
    expect(prepararBusca(" ab123456 ")?.documento).toBe("AB123456");
  });

  it("nome vira padrão de ilike", () => {
    expect(prepararBusca("Maria")?.comoNome).toBe("%Maria%");
  });

  it("termo vazio devolve null em vez de casar com a base inteira", () => {
    // ⚠️ Um padrão "%%" traria dezesseis mil pessoas. Isso não é resultado, é
    // a tela travando.
    expect(prepararBusca("")).toBeNull();
    expect(prepararBusca("   ")).toBeNull();
  });
});

describe("curingas do ilike não vazam do texto digitado", () => {
  it("o sublinhado deixa de casar com qualquer caractere", () => {
    // ⚠️ `_` é curinga em ilike: "Joao_" casaria com "JoaoA", "Joao1", e por
    // aí. Quem digitou o sublinhado quis o sublinhado.
    expect(prepararBusca("Joao_")?.comoNome).toBe("%Joao\\_%");
  });

  it("o porcento deixa de trazer meia lista", () => {
    expect(prepararBusca("50%")?.comoNome).toBe("%50\\%%");
  });

  it("a contrabarra é escapada ANTES, senão desfaz os escapes seguintes", () => {
    // Escapando na outra ordem, o `\` que introduzimos para o `%` viraria
    // `\\%` — e o `%` voltaria a ser curinga.
    expect(prepararBusca("a\\b")?.comoNome).toBe("%a\\\\b%");
    expect(prepararBusca("a\\%b")?.comoNome).toBe("%a\\\\\\%b%");
  });

  it("texto comum atravessa inteiro", () => {
    expect(prepararBusca("Silva, Maria")?.comoNome).toBe("%Silva, Maria%");
  });
});
