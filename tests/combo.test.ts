import { describe, expect, it } from "vitest";
import {
  avulsoDaUnidade, combosVendidos, conferirCombos, ingressosPorUnidade,
  type ComboParaVenda,
} from "@/lib/dominio/combo";

/** Entrada R$ 100 (×1) + Jantar R$ 50 (×1), vendidos juntos por R$ 120. */
function combo(over: Partial<ComboParaVenda> = {}): ComboParaVenda {
  return {
    id: 1,
    nome: "Entrada + Jantar",
    ativo: true,
    valorCentavos: 12000,
    quantidade: null,
    limitePorPessoa: null,
    vendaInicio: null,
    vendaFim: null,
    vendidos: 0,
    levadosPorEsta: 0,
    itens: [
      { tipoId: 1, quantidade: 1, valorCentavos: 10000 },
      { tipoId: 2, quantidade: 1, valorCentavos: 5000 },
    ],
    ...over,
  };
}

const AGORA = new Date("2026-09-20T12:00:00Z");
const ctx = { agora: AGORA };

describe("o tamanho e o preço de tabela do pacote", () => {
  it("conta os ingressos que a unidade entrega", () => {
    expect(ingressosPorUnidade(combo())).toBe(2);
    expect(ingressosPorUnidade(combo({ itens: [{ tipoId: 1, quantidade: 3, valorCentavos: 100 }] }))).toBe(3);
  });

  it("soma quanto custariam avulsos", () => {
    expect(avulsoDaUnidade(combo())).toBe(15000);
  });
});

describe("quantos PACOTES saíram", () => {
  it("divide as linhas pelo tamanho do pacote", () => {
    // ⚠️ Seis linhas de um combo de três são DOIS combos, não seis. Contar
    // linhas fazia a tela dizer "6 de 2" para um combo com lugar sobrando.
    expect(combosVendidos(6, 3)).toBe(2);
    expect(combosVendidos(2, 2)).toBe(1);
    expect(combosVendidos(0, 3)).toBe(0);
  });

  it("resto arredonda para cima: o pacote meio cancelado ainda ocupa lugar", () => {
    expect(combosVendidos(5, 3)).toBe(2);
    expect(combosVendidos(1, 3)).toBe(1);
  });

  it("combo sem item não tem por onde dividir e cada linha responde por si", () => {
    expect(combosVendidos(4, 0)).toBe(4);
  });
});

describe("o que o balcão recusa", () => {
  it("quantidade zero não é pedido", () => {
    const r = conferirCombos([combo()], [{ comboId: 1, quantidade: 0 }], ctx);
    expect(r.erros).toEqual([]);
    expect(r.escolhidos).toEqual([]);
  });

  it("combo de outro evento", () => {
    const r = conferirCombos([combo()], [{ comboId: 99, quantidade: 1 }], ctx);
    expect(r.erros[0]).toContain("não pertence");
  });

  it("combo desativado", () => {
    const r = conferirCombos([combo({ ativo: false })], [{ comboId: 1, quantidade: 1 }], ctx);
    expect(r.erros[0]).toContain("desativado");
  });

  it("combo que não entrega nada", () => {
    // Veio da carga: a tela de cadastro recusa criar um assim.
    const r = conferirCombos([combo({ itens: [] })], [{ comboId: 1, quantidade: 1 }], ctx);
    expect(r.erros[0]).toContain("não entrega ingresso nenhum");
  });

  it("combo mais caro que a soma avulsa é recusado, não vendido", () => {
    // ⚠️ Vender por R$ 200 o que separado custa R$ 150 cobra acima da tabela
    // sem ninguém saber; vender por R$ 150 daria desconto negativo, que o
    // banco recusa com uma mensagem sobre restrição que o balcão não sabe ler.
    const r = conferirCombos([combo({ valorCentavos: 20000 })], [{ comboId: 1, quantidade: 1 }], ctx);
    expect(r.erros[0]).toContain("mais do que os ingressos custam separados");
    expect(r.escolhidos).toEqual([]);
  });

  it("combo de preço igual à soma passa — não descontar não é erro", () => {
    const r = conferirCombos([combo({ valorCentavos: 15000 })], [{ comboId: 1, quantidade: 1 }], ctx);
    expect(r.erros).toEqual([]);
    expect(r.escolhidos[0].descontoCentavos).toBe(0);
  });
});

describe("a janela de venda do combo", () => {
  it("antes de abrir", () => {
    const r = conferirCombos(
      [combo({ vendaInicio: new Date("2026-09-21T00:00:00Z") })],
      [{ comboId: 1, quantidade: 1 }],
      ctx
    );
    expect(r.erros[0]).toContain("ainda não abriu");
  });

  it("depois de fechar", () => {
    const r = conferirCombos(
      [combo({ vendaFim: new Date("2026-09-19T00:00:00Z") })],
      [{ comboId: 1, quantidade: 1 }],
      ctx
    );
    expect(r.erros[0]).toContain("já fechou");
  });

  it("dentro da janela", () => {
    const r = conferirCombos(
      [combo({
        vendaInicio: new Date("2026-09-01T00:00:00Z"),
        vendaFim: new Date("2026-10-01T00:00:00Z"),
      })],
      [{ comboId: 1, quantidade: 1 }],
      ctx
    );
    expect(r.erros).toEqual([]);
  });
});

describe("estoque e limite por pessoa", () => {
  it("esgotado", () => {
    const r = conferirCombos(
      [combo({ quantidade: 2, vendidos: 2 })], [{ comboId: 1, quantidade: 1 }], ctx
    );
    expect(r.erros[0]).toContain("esgotado");
  });

  it("pede mais do que sobrou", () => {
    const r = conferirCombos(
      [combo({ quantidade: 5, vendidos: 4 })], [{ comboId: 1, quantidade: 3 }], ctx
    );
    expect(r.erros[0]).toContain("só 1 disponível");
  });

  it("quantidade nula é sem limite, e não zero", () => {
    // ⚠️ Tratar nulo como zero faria todo combo sem limite aparecer esgotado.
    const r = conferirCombos(
      [combo({ quantidade: null, vendidos: 999 })], [{ comboId: 1, quantidade: 4 }], ctx
    );
    expect(r.erros).toEqual([]);
  });

  it("limite por pessoa conta o que ela já levou em OUTRAS compras", () => {
    const r = conferirCombos(
      [combo({ limitePorPessoa: 2, levadosPorEsta: 2 })], [{ comboId: 1, quantidade: 1 }], ctx
    );
    expect(r.erros[0]).toContain("o máximo de vezes");
  });

  it("limite por pessoa também pega o excesso DENTRO de uma compra", () => {
    const r = conferirCombos(
      [combo({ limitePorPessoa: 2, levadosPorEsta: 1 })], [{ comboId: 1, quantidade: 2 }], ctx
    );
    expect(r.erros[0]).toContain("limitado a 2 por pessoa");
  });
});

describe("o que o combo entrega e quanto ele desconta", () => {
  it("expande em ingressos, multiplicando pela quantidade de pacotes", () => {
    const r = conferirCombos([combo()], [{ comboId: 1, quantidade: 3 }], ctx);
    expect(r.itensExpandidos).toEqual([
      { tipoId: 1, quantidade: 3 },
      { tipoId: 2, quantidade: 3 },
    ]);
  });

  it("o desconto é a diferença para a tabela, vezes o número de pacotes", () => {
    // R$ 150 avulso − R$ 120 do combo = R$ 30 por pacote.
    const r = conferirCombos([combo()], [{ comboId: 1, quantidade: 2 }], ctx);
    expect(r.escolhidos[0].descontoCentavos).toBe(6000);
  });

  it("o item de quantidade maior que 1 multiplica certo", () => {
    const dobrado = combo({
      itens: [{ tipoId: 1, quantidade: 2, valorCentavos: 10000 }],
      valorCentavos: 18000,
    });
    const r = conferirCombos([dobrado], [{ comboId: 1, quantidade: 2 }], ctx);
    expect(r.itensExpandidos).toEqual([{ tipoId: 1, quantidade: 4 }]);
    expect(r.escolhidos[0].descontoCentavos).toBe(4000);
  });
});
