import { describe, expect, it } from "vitest";
import {
  MOTIVOS, porQueNaoVende, vende,
  type IngressoParaVenda,
} from "@/lib/dominio/ingressos";

const PRONTO = { temPromotor: true, ativo: true };
const principal: IngressoParaVenda = { papel: "principal", ativo: true };
const adicional: IngressoParaVenda = { papel: "adicional", ativo: true };

describe("por que um evento não vende", () => {
  it("evento com promotor e um principal ativo vende", () => {
    expect(porQueNaoVende(PRONTO, [principal])).toEqual([]);
    expect(vende(PRONTO, [principal])).toBe(true);
  });

  it("só adicional não vende — nem o adicional", () => {
    // ⚠️ É o caso que motivou a regra: um evento com jantar e transporte, e
    // nenhuma entrada. Adicional só pode ser comprado acompanhando um
    // principal, então esse evento não vende NADA — nem o jantar.
    expect(porQueNaoVende(PRONTO, [adicional])).toEqual([MOTIVOS.semPrincipal]);
  });

  it("principal desativado não conta", () => {
    expect(porQueNaoVende(PRONTO, [{ papel: "principal", ativo: false }, adicional]))
      .toEqual([MOTIVOS.semPrincipal]);
  });

  it("sem promotor não vende, mesmo com ingresso pronto", () => {
    expect(porQueNaoVende({ temPromotor: false, ativo: true }, [principal]))
      .toEqual([MOTIVOS.semPromotor]);
  });

  it("diz TODOS os motivos, não o primeiro", () => {
    // Quem prepara o evento quer a lista do que falta. Um motivo por vez, com
    // uma volta ao banco entre cada, é como se leva uma tarde para publicar.
    const motivos = porQueNaoVende({ temPromotor: false, ativo: false }, [adicional]);
    expect(motivos).toEqual([MOTIVOS.inativo, MOTIVOS.semPromotor, MOTIVOS.semPrincipal]);
  });

  it("sem nenhum tipo, não repete a falta de principal", () => {
    // ⚠️ Duas linhas para um problema só fazem quem lê procurar dois consertos.
    expect(porQueNaoVende(PRONTO, [])).toEqual([MOTIVOS.semIngresso]);
  });

  it("evento desativado não vende nem estando completo", () => {
    expect(vende({ temPromotor: true, ativo: false }, [principal])).toBe(false);
  });
});
