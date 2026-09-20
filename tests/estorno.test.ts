import { describe, expect, it } from "vitest";
import {
  abreEstorno, podeCancelar, valorAEstornar,
  type InscricaoParaCancelar,
} from "@/lib/dominio/estorno";

function inscricao(over: Partial<InscricaoParaCancelar> = {}): InscricaoParaCancelar {
  return {
    status: "pago",
    tipoVenda: "balcao",
    valorOriginalCentavos: 10000,
    descontoCentavos: 0,
    checkinEm: null,
    ...over,
  };
}

describe("o que pode ser cancelado", () => {
  it("paga e pendente podem", () => {
    expect(podeCancelar(inscricao({ status: "pago" }))).toEqual({ pode: true });
    expect(podeCancelar(inscricao({ status: "pendente" }))).toEqual({ pode: true });
  });

  it("quem já entrou NÃO se cancela direto, e a frase diz o caminho", () => {
    // ⚠️ Cancelar apagaria a presença registrada: o relatório passaria a dizer
    // que entrou menos gente do que entrou, e ninguém desconfia de um número
    // que só diminuiu.
    const v = podeCancelar(inscricao({ checkinEm: "2026-09-20T10:00:00Z" }));
    expect(v.pode).toBe(false);
    expect(v).toMatchObject({
      motivo:
        "Esta pessoa já entrou no evento. Se a entrada foi registrada por engano, desfaça o check-in antes de cancelar.",
    });
  });

  it("já cancelada, expirada e transferida têm cada uma a sua frase", () => {
    expect(podeCancelar(inscricao({ status: "cancelado" })))
      .toMatchObject({ pode: false, motivo: "Esta inscrição já está cancelada." });
    expect(podeCancelar(inscricao({ status: "expirado" })))
      .toMatchObject({ pode: false, motivo: "Esta inscrição expirou sozinha — não há o que cancelar." });
    expect(podeCancelar(inscricao({ status: "transferido" })))
      .toMatchObject({ pode: false, motivo: "Esta inscrição foi transferida. Cancele a inscrição nova, que é a que vale." });
  });

  it("check-in vence o status: nem cancelada volta a ser cancelável", () => {
    expect(podeCancelar(inscricao({ status: "cancelado", checkinEm: "2026-09-20T10:00:00Z" })))
      .toMatchObject({ pode: false });
  });
});

describe("quanto se devolve", () => {
  it("paga sem desconto devolve o valor inteiro", () => {
    expect(valorAEstornar(inscricao())).toBe(10000);
    expect(abreEstorno(inscricao())).toBe(true);
  });

  it("desconta o cupom — devolver a tabela devolveria mais do que entrou", () => {
    expect(valorAEstornar(inscricao({ descontoCentavos: 2500 }))).toBe(7500);
  });

  it("cortesia devolve ZERO mesmo com valor de tabela preenchido", () => {
    // ⚠️ A carga trouxe cortesias do sistema antigo COM valor. Sem esta regra,
    // cancelar uma delas abriria estorno de dinheiro que nunca foi pago.
    expect(valorAEstornar(inscricao({ tipoVenda: "cortesia" }))).toBe(0);
    expect(abreEstorno(inscricao({ tipoVenda: "cortesia" }))).toBe(false);
  });

  it("pendente devolve zero: não chegou a pagar", () => {
    // Abrir estorno para ela poria na fila da tesouraria uma devolução sem
    // contrapartida.
    expect(valorAEstornar(inscricao({ status: "pendente" }))).toBe(0);
    expect(abreEstorno(inscricao({ status: "pendente" }))).toBe(false);
  });

  it("desconto maior que o valor não vira devolução negativa", () => {
    expect(valorAEstornar(inscricao({ valorOriginalCentavos: 1000, descontoCentavos: 5000 }))).toBe(0);
  });
});
