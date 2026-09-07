import { describe, expect, it } from "vitest";
import { chave, classificar } from "../scripts/lib/livraria";

describe("classificação da livraria", () => {
  it("põe o conto infantil em Livros, e não entre incenso e talismã", () => {
    // A loja guarda os infantis FORA da árvore de Livros. Seguir a loja ao pé
    // da letra os deixaria em Artigos Religiosos, onde ninguém procura.
    expect(classificar("A Abelha Abelinda", ["Contos infantis", "Contos Infantis"]))
      .toEqual({ raiz: "Livros", assunto: "Livros Infantis", vitrineSoZinha: false });
  });

  it("separa assinatura de revista do resto", () => {
    // ⚠️ Assinatura (12 exemplares pelo Correio) NÃO é cota (mínimo mensal
    // retirado na Associação Local). Mesmo substantivo, coisas diferentes.
    expect(classificar('Assinatura de Revista Fonte de Luz (12 meses)', ["Assinatura", "Fonte de Luz"]).raiz)
      .toBe("Assinaturas de Revista");
  });

  it("usa a subcategoria de assunto que a loja dá", () => {
    expect(classificar("A Verdade da Vida Vol. 08", ["Livros", "A Verdade da Vida"]))
      .toEqual({ raiz: "Livros", assunto: "A Verdade da Vida", vitrineSoZinha: false });
  });

  it("manda para Artigos Religiosos o que não é livro", () => {
    expect(classificar("Incenso Horyuko", ["Itens Religiosos", "Amuletos"]).raiz)
      .toBe("Artigos Religiosos");
  });

  // ─── A armadilha ───────────────────────────────────────────────────────────

  it("respeita a decisão da Sede para o que só está em vitrine", () => {
    // "Lançamentos" cabe livro e cabe pingente: não classifica nada.
    expect(classificar("A fé que muda o seu Destino", ["Lançamentos"]))
      .toEqual({ raiz: "Livros", assunto: null, vitrineSoZinha: false });
  });

  it("⚠️ NÃO transforma o Kit em livro só porque o nome contém o de um", () => {
    // Esta é a razão de o casamento ser pelo nome INTEIRO. O Kit tem pingente
    // dentro, e o nome dele começa com "Kit: Livro" — por trecho, ele viraria
    // livro e ninguém notaria.
    const r = classificar(
      "Kit: Livro A Fé que muda o seu destino + Pingente de Acrílico Azul",
      ["Lançamentos"]
    );
    expect(r.raiz).toBe("Artigos Religiosos");
    expect(r.vitrineSoZinha).toBe(true);
  });

  it("acha a decisão mesmo com acento e caixa diferentes", () => {
    // "A fé que muda o seu Destino" na loja e "A Fé que muda o seu destino" na
    // decisão são o mesmo título para uma pessoa e dois textos para um `===`.
    expect(classificar("A FÉ QUE MUDA O SEU DESTINO", ["Lançamentos"]).raiz).toBe("Livros");
    expect(chave("  A  Fé   que muda ")).toBe("a fe que muda");
  });

  it("anuncia quem está só em vitrine, para alguém decidir", () => {
    const r = classificar("Pingente Acrílico Azul", ["Lançamentos", "Lançamentos"]);
    expect(r.vitrineSoZinha).toBe(true);
    expect(r.raiz).toBe("Artigos Religiosos");
  });

  it("não confunde vitrine com ausência de categoria", () => {
    // Produto sem categoria nenhuma não é o mesmo caso: não há o que revisar,
    // a loja simplesmente não o classificou em lugar nenhum.
    expect(classificar("Solto", []).vitrineSoZinha).toBe(false);
  });
});
