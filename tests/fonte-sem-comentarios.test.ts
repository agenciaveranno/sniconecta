import { describe, expect, it } from "vitest";
import { semComentarios } from "./util/fonte";

/**
 * O ajudante que os outros testes usam para não se confundir com comentários.
 *
 * ⚠️ Ele precisa do próprio teste porque é infraestrutura de vigilância: um
 * `semComentarios` que parasse de tirar comentários não falharia em lugar
 * nenhum — ele só devolveria os testes que o usam ao problema que ele existe
 * para resolver, silenciosamente.
 */
describe("o fonte sem comentários", () => {
  it("tira comentário de linha e deixa o código antes dele", () => {
    expect(semComentarios('const x = 1; // multiple\n')).toBe("const x = 1; \n");
  });

  it("tira comentário de bloco, inclusive em várias linhas", () => {
    expect(semComentarios("/* não é um select multiple */\nconst x = 1;"))
      .not.toContain("multiple");
  });

  it("o que sobra ainda tem o código", () => {
    const fonte = `
      // ⚠️ não é um \`select multiple\`
      <select name="x">
    `;
    expect(semComentarios(fonte)).toContain('<select name="x">');
    expect(semComentarios(fonte)).not.toContain("multiple");
  });

  it("erra para o lado seguro: apaga código a mais, nunca comentário a menos", () => {
    // Uma URL dentro de string perde o resto da linha. É o preço de não ser um
    // analisador de JavaScript — e faz uma asserção de PRESENÇA falhar alto,
    // em vez de uma de ausência passar caladinha.
    const cortado = semComentarios('const u = "https://exemplo.com/x";');
    expect(cortado).not.toContain("exemplo.com");
  });
});
