import { describe, expect, it } from "vitest";
import {
  podeTrocarTitular,
  type InscricaoParaTrocar, type NovoTitular,
} from "@/lib/dominio/titular";

const MARIA = "11111111-1111-1111-1111-111111111111";
const JOAO = "22222222-2222-2222-2222-222222222222";

function inscricao(over: Partial<InscricaoParaTrocar> = {}): InscricaoParaTrocar {
  return {
    status: "pago",
    checkinEm: null,
    pessoaId: MARIA,
    ingressoTipoId: 7,
    unicoPorCpf: false,
    ...over,
  };
}

function novo(over: Partial<NovoTitular> = {}): NovoTitular {
  return { id: JOAO, jaTemDestesTipos: [], ...over };
}

describe("trocar o titular de um ingresso", () => {
  it("inscrição paga, sem entrada, troca", () => {
    expect(podeTrocarTitular(inscricao(), novo())).toEqual({ pode: true });
  });

  it("pendente também troca — o ingresso continua existindo", () => {
    expect(podeTrocarTitular(inscricao({ status: "pendente" }), novo())).toEqual({ pode: true });
  });

  it("quem JÁ ENTROU não muda de dono", () => {
    // ⚠️ A presença registrada é de uma pessoa específica. Trocar depois faria
    // o relatório dizer que entrou quem não entrou, e a lista de presença
    // passaria a mentir sobre um fato que aconteceu.
    const v = podeTrocarTitular(inscricao({ checkinEm: "2026-09-20T10:00:00Z" }), novo());
    expect(v).toEqual({
      pode: false,
      motivo: "Esta inscrição já teve entrada registrada — a presença é de quem entrou.",
    });
  });

  it("cancelada, expirada e transferida não trocam", () => {
    expect(podeTrocarTitular(inscricao({ status: "cancelado" }), novo()))
      .toMatchObject({ pode: false, motivo: "Inscrição cancelada não muda de titular." });
    expect(podeTrocarTitular(inscricao({ status: "expirado" }), novo()))
      .toMatchObject({ pode: false, motivo: "Inscrição expirada não muda de titular." });
    expect(podeTrocarTitular(inscricao({ status: "transferido" }), novo()))
      .toMatchObject({ pode: false, motivo: "Esta inscrição foi transferida. Troque o titular da inscrição nova." });
  });

  it("trocar para a mesma pessoa é recusado, não é no-op silencioso", () => {
    // Gravar a troca da pessoa por ela mesma poria um "titular anterior" igual
    // ao atual no histórico, e quem lesse acharia que houve uma troca.
    expect(podeTrocarTitular(inscricao(), novo({ id: MARIA })))
      .toMatchObject({ pode: false, motivo: "O novo titular é a mesma pessoa que já está na inscrição." });
  });

  it("um por pessoa vale na troca como vale na venda", () => {
    // ⚠️ Sem isto, passar o jantar para quem já tem um seria o caminho torto
    // para furar a regra: a venda recusaria, a troca deixaria.
    const jantar = inscricao({ unicoPorCpf: true, ingressoTipoId: 7 });
    expect(podeTrocarTitular(jantar, novo({ jaTemDestesTipos: [7] })))
      .toMatchObject({ pode: false, motivo: "O novo titular já tem este ingresso neste evento, e ele é um por pessoa." });
  });

  it("um por pessoa não atrapalha quem tem OUTRO tipo", () => {
    const jantar = inscricao({ unicoPorCpf: true, ingressoTipoId: 7 });
    expect(podeTrocarTitular(jantar, novo({ jaTemDestesTipos: [9] }))).toEqual({ pode: true });
  });

  it("ingresso sem tipo resolvido não trava a troca", () => {
    // A carga trouxe inscrição com `ingresso_tipo_id` nulo. Tratar nulo como
    // colisão impediria a troca de quem veio do sistema antigo, sem motivo.
    const semTipo = inscricao({ unicoPorCpf: true, ingressoTipoId: null });
    expect(podeTrocarTitular(semTipo, novo({ jaTemDestesTipos: [7] }))).toEqual({ pode: true });
  });

  it("entrada registrada vence tudo, inclusive a troca para a mesma pessoa", () => {
    const v = podeTrocarTitular(
      inscricao({ checkinEm: "2026-09-20T10:00:00Z" }),
      novo({ id: MARIA })
    );
    expect(v).toMatchObject({ pode: false, motivo: expect.stringContaining("entrada registrada") });
  });
});
