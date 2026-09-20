import { describe, expect, it } from "vitest";
import {
  conferirCupom, descreverCupom, normalizarCodigo,
  type Cupom, type ItemComPreco,
} from "@/lib/dominio/cupom";

function cupom(over: Partial<Cupom> = {}): Cupom {
  return {
    id: 1,
    codigo: "VERAO10",
    tipo: "percentual",
    valor: 10,
    ingresso_tipo_id: null,
    max_usos_total: null,
    max_usos_por_cpf: null,
    vigencia_inicio: null,
    vigencia_fim: null,
    ativo: true,
    ...over,
  };
}

const AGORA = new Date("2026-09-20T12:00:00Z");
const ctx = { agora: AGORA };

/** Inteira R$ 100 (×1) + Jantar R$ 50 (×1) = R$ 150. */
const CARRINHO: ItemComPreco[] = [
  { tipoId: 1, quantidade: 1, valorCentavos: 10000 },
  { tipoId: 2, quantidade: 1, valorCentavos: 5000 },
];

describe("quanto o cupom tira", () => {
  it("percentual sobre o carrinho inteiro", () => {
    expect(conferirCupom(cupom(), CARRINHO, ctx)).toEqual({ vale: true, descontoCentavos: 1500 });
  });

  it("valor fixo em centavos", () => {
    expect(conferirCupom(cupom({ tipo: "valor", valor: 2500 }), CARRINHO, ctx))
      .toEqual({ vale: true, descontoCentavos: 2500 });
  });

  it("multiplica pela quantidade", () => {
    const r = conferirCupom(cupom(), [{ tipoId: 1, quantidade: 3, valorCentavos: 10000 }], ctx);
    expect(r).toEqual({ vale: true, descontoCentavos: 3000 });
  });

  it("cupom preso a um tipo desconta SÓ aquele tipo", () => {
    // ⚠️ É o buraco que pagaria o jantar de graça: 50% sobre o carrinho
    // inteiro descontaria também o que o cupom não alcança. A base é só a
    // "Inteira" — 50% de R$ 100, não de R$ 150.
    const meia = cupom({ codigo: "MEIA", tipo: "percentual", valor: 50, ingresso_tipo_id: 1 });
    expect(conferirCupom(meia, CARRINHO, ctx)).toEqual({ vale: true, descontoCentavos: 5000 });
  });

  it("nunca desconta mais do que a base", () => {
    // ⚠️ Cupom de R$ 100 num ingresso de R$ 40 viraria devolução: o total
    // ficaria negativo, e o estorno calcularia em cima de dinheiro que nunca
    // entrou no caixa.
    const r = conferirCupom(
      cupom({ tipo: "valor", valor: 10000 }),
      [{ tipoId: 1, quantidade: 1, valorCentavos: 4000 }],
      ctx
    );
    expect(r).toEqual({ vale: true, descontoCentavos: 4000 });
  });

  it("cupom que não alcança nada do carrinho é recusado, não vira zero", () => {
    // Desconto zero silencioso faria a pessoa achar que o cupom foi aceito.
    const so3 = cupom({ ingresso_tipo_id: 3 });
    expect(conferirCupom(so3, CARRINHO, ctx)).toEqual({
      vale: false,
      motivo: "O cupom VERAO10 não vale para nenhum dos ingressos escolhidos.",
    });
  });
});

describe("quando o cupom não vale", () => {
  it("desativado", () => {
    expect(conferirCupom(cupom({ ativo: false }), CARRINHO, ctx))
      .toEqual({ vale: false, motivo: "O cupom VERAO10 está desativado." });
  });

  it("antes do começo e depois do fim", () => {
    expect(conferirCupom(cupom({ vigencia_inicio: "2026-10-01T00:00:00Z" }), CARRINHO, ctx))
      .toMatchObject({ vale: false, motivo: "O cupom VERAO10 ainda não começou a valer." });
    expect(conferirCupom(cupom({ vigencia_fim: "2026-09-01T00:00:00Z" }), CARRINHO, ctx))
      .toMatchObject({ vale: false, motivo: "O cupom VERAO10 está fora do prazo." });
  });

  it("dentro da vigência vale", () => {
    const c = cupom({ vigencia_inicio: "2026-09-01T00:00:00Z", vigencia_fim: "2026-10-01T00:00:00Z" });
    expect(conferirCupom(c, CARRINHO, ctx)).toMatchObject({ vale: true });
  });

  it("esgotou os usos totais", () => {
    const c = cupom({ max_usos_total: 100 });
    expect(conferirCupom(c, CARRINHO, { ...ctx, usosTotais: 100 }))
      .toMatchObject({ vale: false, motivo: "O cupom VERAO10 esgotou os usos." });
    expect(conferirCupom(c, CARRINHO, { ...ctx, usosTotais: 99 })).toMatchObject({ vale: true });
  });

  it("limite por pessoa é separado do limite total", () => {
    const c = cupom({ max_usos_por_cpf: 1 });
    expect(conferirCupom(c, CARRINHO, { ...ctx, usosTotais: 500, usosDestaPessoa: 1 }))
      .toMatchObject({ vale: false, motivo: "Esta pessoa já usou o cupom VERAO10 o máximo de vezes permitido." });
    expect(conferirCupom(c, CARRINHO, { ...ctx, usosTotais: 500, usosDestaPessoa: 0 }))
      .toMatchObject({ vale: true });
  });
});

describe("como o cupom se lê e se digita", () => {
  it("descreve percentual e valor de jeitos diferentes", () => {
    expect(descreverCupom({ tipo: "percentual", valor: 10 })).toBe("10%");
    // ⚠️ `toLocaleString` separa "R$" do número com espaço NÃO-QUEBRÁVEL
    // (U+00A0), não com espaço comum. Mesmo padrão de `dinheiro.test.ts`.
    expect(descreverCupom({ tipo: "valor", valor: 1500 }).replace(/\u00a0/g, " "))
      .toBe("R$ 15,00");
  });

  it("o código normaliza caixa e espaço", () => {
    // ⚠️ O índice único do banco usa `lower(codigo)`. Sem normalizar, o mesmo
    // cupom recusaria por causa de um Caps Lock.
    expect(normalizarCodigo("  verao10 ")).toBe("VERAO10");
  });
});
