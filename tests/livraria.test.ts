import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SCRIPT = readFileSync("scripts/importar-livraria.ts", "utf8");

/**
 * ⚠️ O Kit é a armadilha desta importação, e por isso ele tem teste próprio.
 *
 * "Kit: Livro A Fé que muda o seu destino + Pingente de Acrílico Azul" CONTÉM o
 * nome de um livro da lista de decisões da Sede. Se o casamento fosse por
 * trecho, um kit com pingente dentro entraria como livro — e ninguém notaria,
 * porque o nome dele começa com "Kit: Livro".
 */
describe("importação da livraria", () => {
  it("casa a decisão da Sede pelo nome INTEIRO, nunca por trecho", () => {
    // `Map.get` é igualdade exata; `includes`/`startsWith`/`some(...test)` não.
    expect(SCRIPT).toMatch(/DECISOES_DA_SEDE\.get\(chave\(nome\)\)/);
    expect(SCRIPT).not.toMatch(/DECISOES_DA_SEDE[\s\S]{0,200}?\.includes\(/);
  });

  it("normaliza acento e caixa antes de comparar", () => {
    // "A fé que muda o seu Destino" na loja e "A Fé que muda o seu destino" na
    // decisão são o mesmo título para uma pessoa e dois textos para um `===`.
    expect(SCRIPT).toMatch(/normalize\("NFD"\)/);
  });

  it("classifica pela categoria da loja, não pelo título", () => {
    // Título é texto de marketing; categoria é classificação. As duas regras
    // que a Sede pediu já existem na loja: "Contos infantis" e "Assinatura".
    expect(SCRIPT).toMatch(/contos\?\\s\*infantis/);
    expect(SCRIPT).toMatch(/tem\(\/assinatura\/i\)/);
  });

  it("trata prateleira de vitrine como ausência de classificação", () => {
    // "Lançamentos" cabe livro e cabe pingente: não é tipo de produto.
    expect(SCRIPT).toMatch(/const VITRINE = /);
    expect(SCRIPT).toMatch(/vitrineSoZinha/);
  });

  it("não deixa produto sem preço à venda", () => {
    expect(SCRIPT).toMatch(/emEstoque && preco > 0/);
  });
});
