import { describe, expect, it } from "vitest";
import {
  conferirResposta, ehTipoDeCampo, normalizarOpcoes, precisaDeOpcoes,
  SEPARADOR_MULTIPLA, type CampoDaPergunta,
} from "@/lib/dominio/campos";

const campo = (over: Partial<CampoDaPergunta> = {}): CampoDaPergunta => ({
  id: 1,
  rotulo: "Tamanho da camiseta",
  tipo: "texto",
  opcoes: null,
  obrigatorio: false,
  ...over,
});

describe("os tipos de pergunta", () => {
  it("reconhece os seis da fundação e recusa o resto", () => {
    for (const t of ["texto", "numero", "data", "selecao", "multipla", "booleano"]) {
      expect(ehTipoDeCampo(t), t).toBe(true);
    }
    expect(ehTipoDeCampo("arquivo")).toBe(false);
  });

  it("só escolha simples e múltipla têm alternativas", () => {
    expect(precisaDeOpcoes("selecao")).toBe(true);
    expect(precisaDeOpcoes("multipla")).toBe(true);
    expect(precisaDeOpcoes("texto")).toBe(false);
  });
});

describe("as alternativas, uma por linha", () => {
  it("tira linha vazia e espaço em volta", () => {
    expect(normalizarOpcoes(" P \n\n M \nG \n")).toEqual(["P", "M", "G"]);
  });

  it("repetida não entra, mesmo com caixa diferente", () => {
    // ⚠️ Duas alternativas iguais viram dois itens idênticos na tela de quem
    // responde — e depois, no relatório, duas linhas que deveriam ser uma.
    expect(normalizarOpcoes("Vegetariano\nvegetariano\nVEGETARIANO")).toEqual(["Vegetariano"]);
  });
});

describe("o que vale como resposta", () => {
  it("obrigatória em branco é recusada, com o rótulo na frase", () => {
    const r = conferirResposta(campo({ obrigatorio: true }), "");
    expect(r.vale).toBe(false);
    expect(r).toMatchObject({ motivo: expect.stringContaining("Tamanho da camiseta") });
  });

  it("opcional em branco vira NULO, e não string vazia", () => {
    // ⚠️ Duas ausências escritas de formas diferentes fazem o relatório contar
    // "sem resposta" duas vezes.
    expect(conferirResposta(campo(), "   ")).toEqual({ vale: true, valor: null });
  });

  it("número aceita vírgula e grava com ponto", () => {
    expect(conferirResposta(campo({ tipo: "numero" }), "1,5")).toEqual({ vale: true, valor: "1.5" });
  });

  it("número recusa texto", () => {
    expect(conferirResposta(campo({ tipo: "numero" }), "grande").vale).toBe(false);
  });

  it("data exige o formato que ordena como texto", () => {
    expect(conferirResposta(campo({ tipo: "data" }), "2026-09-21"))
      .toEqual({ vale: true, valor: "2026-09-21" });
    expect(conferirResposta(campo({ tipo: "data" }), "21/09/2026").vale).toBe(false);
  });

  it("sim ou não grava só duas formas", () => {
    expect(conferirResposta(campo({ tipo: "booleano" }), "sim")).toEqual({ vale: true, valor: "sim" });
    expect(conferirResposta(campo({ tipo: "booleano" }), "qualquer coisa"))
      .toEqual({ vale: true, valor: "não" });
  });
});

describe("escolha entre alternativas", () => {
  const camisa = campo({ tipo: "selecao", opcoes: ["P", "M", "G"] });

  it("alternativa da lista passa", () => {
    expect(conferirResposta(camisa, "M")).toEqual({ vale: true, valor: "M" });
  });

  it("o que não está na lista é RECUSADO, não gravado assim mesmo", () => {
    // ⚠️ O valor chega de um formulário e pode ser qualquer coisa. Gravado,
    // vira uma alternativa que nunca existiu no relatório — e ninguém
    // descobre de onde veio.
    const r = conferirResposta(camisa, "GG");
    expect(r.vale).toBe(false);
    expect(r).toMatchObject({ motivo: expect.stringContaining("GG") });
  });

  it("escolha simples aceita uma só", () => {
    expect(conferirResposta(camisa, ["P", "M"]).vale).toBe(false);
  });

  it("escolha múltipla junta com o separador combinado", () => {
    // ⚠️ Gravado com vírgula numa tela e com ponto-e-vírgula noutra, nenhum
    // relatório consegue separar de volta.
    const dietas = campo({ tipo: "multipla", opcoes: ["Vegetariano", "Sem glúten"] });
    expect(conferirResposta(dietas, ["Vegetariano", "Sem glúten"])).toEqual({
      vale: true,
      valor: `Vegetariano${SEPARADOR_MULTIPLA}Sem glúten`,
    });
  });
});
