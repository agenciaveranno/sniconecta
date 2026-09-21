import { describe, expect, it } from "vitest";
import {
  acertarTransferencia, podeTransferir, type InscricaoParaTransferir,
} from "@/lib/dominio/transferencia";

/** Inteira de R$ 100, paga, sem desconto, ainda não entrou. */
function inscricao(over: Partial<InscricaoParaTransferir> = {}): InscricaoParaTransferir {
  return {
    status: "pago",
    tipoVenda: "balcao",
    valorOriginalCentavos: 10000,
    descontoCentavos: 0,
    checkinEm: null,
    eventoId: 1,
    ...over,
  };
}

const acerto = (over: Partial<Parameters<typeof acertarTransferencia>[0]> = {}) =>
  acertarTransferencia({
    inscricao: inscricao(),
    novoValorCentavos: 10000,
    cobradoAgoraCentavos: 0,
    ...over,
  });

describe("quem pode ser transferido", () => {
  it("paga e pendente podem", () => {
    expect(podeTransferir(inscricao())).toEqual({ pode: true });
    expect(podeTransferir(inscricao({ status: "pendente" }))).toEqual({ pode: true });
  });

  it("quem já entrou não pode, e a frase diz o caminho", () => {
    // ⚠️ Transferir apagaria uma presença que aconteceu: o relatório do evento
    // de ontem perderia alguém que esteve lá.
    const r = podeTransferir(inscricao({ checkinEm: "2026-09-20T10:00:00Z" }));
    expect(r.pode).toBe(false);
    expect(r).toMatchObject({ motivo: expect.stringContaining("desfaça o check-in") });
  });

  it("cancelada, expirada e já transferida não podem", () => {
    for (const status of ["cancelado", "expirado", "transferido"] as const) {
      expect(podeTransferir(inscricao({ status })).pode, status).toBe(false);
    }
  });
});

describe("a invariante do dinheiro: original − desconto = pago + cobrado agora", () => {
  const fecha = (a: ReturnType<typeof acerto>, cobrado: number) =>
    a.valorOriginalCentavos - a.descontoCentavos;

  it("mesmo preço, nada a acertar", () => {
    const a = acerto();
    expect(a.erros).toEqual([]);
    expect(fecha(a, 0)).toBe(10000);
    expect(a.estornoCentavos).toBe(0);
  });

  it("destino mais caro, diferença toda cobrada", () => {
    const a = acerto({ novoValorCentavos: 15000, cobradoAgoraCentavos: 5000 });
    expect(a.diferencaCentavos).toBe(5000);
    expect(a.descontoCentavos).toBe(0);
    expect(fecha(a, 5000)).toBe(15000); // 10.000 pagos + 5.000 agora
  });

  it("destino mais caro, a casa absorve a diferença", () => {
    const a = acerto({ novoValorCentavos: 15000, cobradoAgoraCentavos: 0 });
    // O que não foi cobrado vira desconto — senão a arrecadação subiria R$ 50
    // sem ninguém ter recebido nada.
    expect(a.descontoCentavos).toBe(5000);
    expect(fecha(a, 0)).toBe(10000);
  });

  it("destino mais caro, diferença cobrada pela metade", () => {
    const a = acerto({ novoValorCentavos: 15000, cobradoAgoraCentavos: 2500 });
    expect(a.descontoCentavos).toBe(2500);
    expect(fecha(a, 2500)).toBe(12500);
  });

  it("não deixa cobrar mais do que falta", () => {
    // ⚠️ Cobrar acima da diferença deixaria o desconto NEGATIVO, que o banco
    // recusa com uma mensagem sobre restrição que o balcão não sabe ler.
    const a = acerto({ novoValorCentavos: 15000, cobradoAgoraCentavos: 9000 });
    expect(a.erros[0]).toContain("no máximo 50,00");
  });
});

describe("destino mais barato abre devolução", () => {
  it("a sobra vira estorno, e não desconto", () => {
    // Ficar com a sobra calado faria a arrecadação registrar menos do que
    // entrou no caixa, e a diferença nunca teria dono.
    const a = acerto({ novoValorCentavos: 6000 });
    expect(a.estornoCentavos).toBe(4000);
    expect(a.descontoCentavos).toBe(0);
    expect(a.valorOriginalCentavos).toBe(6000);
  });

  it("e não aceita cobrança nenhuma", () => {
    const a = acerto({ novoValorCentavos: 6000, cobradoAgoraCentavos: 100 });
    expect(a.erros[0]).toContain("Não há diferença a cobrar");
  });
});

describe("cortesia e pendente não movimentam dinheiro", () => {
  it("cortesia continua valendo zero, mesmo com preço de tabela preenchido", () => {
    // ⚠️ A carga trouxe cortesias COM valor. Sem esta regra, transferir uma
    // delas abriria estorno de dinheiro que nunca foi pago — o mesmo defeito
    // que já apareceu três vezes neste módulo.
    const a = acerto({
      inscricao: inscricao({ tipoVenda: "cortesia" }),
      novoValorCentavos: 6000,
    });
    expect(a.pagoCentavos).toBe(0);
    expect(a.estornoCentavos).toBe(0);
    expect(a.descontoCentavos).toBe(6000); // continua de graça
  });

  it("pendente não ganha desconto fantasma nem devolução", () => {
    const a = acerto({
      inscricao: inscricao({ status: "pendente" }),
      novoValorCentavos: 15000,
    });
    expect(a.descontoCentavos).toBe(0);
    expect(a.estornoCentavos).toBe(0);
    expect(a.valorOriginalCentavos).toBe(15000);
  });

  it("pendente recusa cobrança: o pagamento é venda, não transferência", () => {
    const a = acerto({
      inscricao: inscricao({ status: "pendente" }),
      novoValorCentavos: 15000,
      cobradoAgoraCentavos: 15000,
    });
    expect(a.erros.join(" ")).toContain("ainda não foi paga");
  });
});
