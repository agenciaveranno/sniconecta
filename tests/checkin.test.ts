import { describe, expect, it } from "vitest";
import { podeEntrar } from "@/lib/dominio/checkin";

describe("quem pode entrar no evento", () => {
  it("inscrição paga e sem entrada registrada passa", () => {
    expect(podeEntrar({ status: "pago", checkinEm: null })).toEqual({ pode: true });
  });

  it("pendente não entra, e a frase diz para onde mandar a pessoa", () => {
    // ⚠️ É a recusa mais comum na porta: inscrição feita no site cujo pagamento
    // não caiu. "Status inválido" deixaria quem opera sem saber se manda ao
    // balcão ou embora.
    const v = podeEntrar({ status: "pendente", checkinEm: null });
    expect(v.pode).toBe(false);
    expect(v).toMatchObject({
      motivo: "O pagamento desta inscrição não foi confirmado. Encaminhe ao balcão.",
    });
  });

  it("cancelada, expirada e transferida têm cada uma a sua frase", () => {
    // Três recusas diferentes que pediriam três encaminhamentos diferentes.
    expect(podeEntrar({ status: "cancelado", checkinEm: null }))
      .toMatchObject({ pode: false, motivo: "Esta inscrição foi cancelada." });
    expect(podeEntrar({ status: "expirado", checkinEm: null }))
      .toMatchObject({ pode: false, motivo: "Esta inscrição expirou sem pagamento." });
    expect(podeEntrar({ status: "transferido", checkinEm: null }))
      .toMatchObject({ pode: false, motivo: "Esta inscrição foi transferida — a entrada vale pela nova." });
  });

  it("quem já entrou é recusado como JÁ ENTROU, não como irregular", () => {
    // ⚠️ São coisas diferentes na porta: um ingresso repetido pede conferência,
    // um cancelado pede recusa. Misturar os dois faria a porta tratar quem
    // voltou do banheiro como quem tentou entrar com ingresso cancelado.
    const v = podeEntrar({ status: "pago", checkinEm: "2026-09-20T10:00:00Z" });
    expect(v).toEqual({
      pode: false,
      jaEntrou: true,
      motivo: "Esta inscrição já teve entrada registrada.",
    });
  });

  it("já entrou vence o status: nem cancelada depois volta a poder entrar", () => {
    const v = podeEntrar({ status: "cancelado", checkinEm: "2026-09-20T10:00:00Z" });
    expect(v).toMatchObject({ pode: false, jaEntrou: true });
  });
});
