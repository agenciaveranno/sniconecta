import { describe, expect, it } from "vitest";
import {
  conferirVenda, tipoDeVenda, totalCobrado,
  type TipoParaVenda,
} from "@/lib/dominio/venda";

function tipo(over: Partial<TipoParaVenda> = {}): TipoParaVenda {
  return {
    id: 1,
    nome: "Inteira",
    papel: "principal",
    ativo: true,
    valor_centavos: 10000,
    unico_por_cpf: false,
    exige_principal: false,
    disponivel: null,
    ...over,
  };
}

const inteira = tipo();
const jantar = tipo({
  id: 2, nome: "Jantar", papel: "adicional", exige_principal: true,
  unico_por_cpf: true, valor_centavos: 5000,
});

describe("conferir a venda do balcão", () => {
  it("soma em centavos, multiplicando pela quantidade", () => {
    const r = conferirVenda([inteira], [{ tipoId: 1, quantidade: 3 }]);
    expect(r.erros).toEqual([]);
    expect(r.totalCentavos).toBe(30000);
  });

  it("carrinho vazio é recusado com frase, não com total zero", () => {
    // ⚠️ Zero é um total legítimo (cortesia). "Não escolheu nada" precisa
    // dizer isso, senão a venda de nada grava uma inscrição em branco.
    const r = conferirVenda([inteira], []);
    expect(r.erros).toEqual(["Escolha pelo menos um ingresso."]);
    expect(r.itens).toEqual([]);
  });

  it("quantidade zero não é erro — é item que ninguém escolheu", () => {
    const r = conferirVenda([inteira, jantar], [
      { tipoId: 1, quantidade: 1 },
      { tipoId: 2, quantidade: 0 },
    ]);
    expect(r.erros).toEqual([]);
    expect(r.itens).toHaveLength(1);
  });

  it("jantar sozinho é recusado: não se compra sem entrar no evento", () => {
    const r = conferirVenda([inteira, jantar], [{ tipoId: 2, quantidade: 1 }]);
    expect(r.erros).toEqual([
      '"Jantar" só pode ser vendido junto com um ingresso principal na mesma compra.',
    ]);
  });

  it("jantar com a entrada na mesma compra passa", () => {
    const r = conferirVenda([inteira, jantar], [
      { tipoId: 1, quantidade: 1 },
      { tipoId: 2, quantidade: 1 },
    ]);
    expect(r.erros).toEqual([]);
    expect(r.totalCentavos).toBe(15000);
  });

  it("um por pessoa recusa dois na mesma compra", () => {
    const r = conferirVenda([inteira, jantar], [
      { tipoId: 1, quantidade: 1 },
      { tipoId: 2, quantidade: 2 },
    ]);
    expect(r.erros).toContain('"Jantar" é um por pessoa — não dá para levar 2.');
  });

  it("um por pessoa vale ENTRE compras, não só dentro de uma", () => {
    // ⚠️ Sem isto, a pessoa compra o jantar hoje e outro amanhã: cada compra
    // passa sozinha, e o salão recebe duas reservas para a mesma cadeira.
    const r = conferirVenda(
      [inteira, jantar],
      [{ tipoId: 1, quantidade: 1 }, { tipoId: 2, quantidade: 1 }],
      [2]
    );
    expect(r.erros).toContain('Esta pessoa já tem "Jantar" neste evento, e é um por pessoa.');
  });

  it("estoque insuficiente diz quanto resta", () => {
    const r = conferirVenda([tipo({ disponivel: 2 })], [{ tipoId: 1, quantidade: 5 }]);
    expect(r.erros).toEqual(['"Inteira" tem só 2 disponível(is), e foram pedidos 5.']);
  });

  it("esgotado tem frase própria", () => {
    const r = conferirVenda([tipo({ disponivel: 0 })], [{ tipoId: 1, quantidade: 1 }]);
    expect(r.erros).toEqual(['"Inteira" está esgotado.']);
  });

  it("sem limite não é esgotado", () => {
    // ⚠️ Tratar `null` como zero faria todo ingresso sem limite aparecer
    // esgotado — o oposto do que o campo em branco diz.
    const r = conferirVenda([tipo({ disponivel: null })], [{ tipoId: 1, quantidade: 999 }]);
    expect(r.erros).toEqual([]);
  });

  it("ingresso desativado não se vende", () => {
    // Os dois recados são verdadeiros e úteis: o item caiu fora, e com isso não
    // sobrou nada no carrinho. Quem lê precisa dos dois para entender por que a
    // venda não seguiu.
    const r = conferirVenda([tipo({ ativo: false })], [{ tipoId: 1, quantidade: 1 }]);
    expect(r.erros).toEqual([
      '"Inteira" está desativado e não pode ser vendido.',
      "Escolha pelo menos um ingresso.",
    ]);
  });

  it("ingresso de outro evento é recusado", () => {
    const r = conferirVenda([inteira], [{ tipoId: 99, quantidade: 1 }]);
    expect(r.erros).toEqual([
      "Um dos ingressos escolhidos não pertence a este evento.",
      "Escolha pelo menos um ingresso.",
    ]);
  });
});

describe("cortesia não é forma de pagamento de valor zero", () => {
  it("cortesia vira tipo_venda próprio", () => {
    // ⚠️ Lançada como venda de zero, entraria no relatório de arrecadação como
    // uma venda que não houve. Separada, "quantos entraram" e "quanto entrou"
    // respondem coisas diferentes.
    expect(tipoDeVenda("cortesia")).toBe("cortesia");
    expect(tipoDeVenda("dinheiro")).toBe("balcao");
    expect(tipoDeVenda("pix")).toBe("balcao");
  });

  it("cortesia não cobra, mesmo com ingresso caro", () => {
    expect(totalCobrado("cortesia", 30000)).toBe(0);
    expect(totalCobrado("dinheiro", 30000)).toBe(30000);
  });
});
