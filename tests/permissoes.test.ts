import { describe, expect, it } from "vitest";
import { MATRIZ, PAPEIS_NACIONAIS, capacidadesDe } from "@/lib/permissoes";

// A matriz é dado. Estes testes protegem as decisões que custariam caro se
// mudassem sem ninguém notar.
describe("matriz de capacidades", () => {
  it("sede alcança tudo que qualquer outro papel alcança", () => {
    const sede = new Set(MATRIZ.sede);
    for (const [tipo, caps] of Object.entries(MATRIZ)) {
      for (const c of caps) expect(sede.has(c), `${tipo} tem ${c} mas sede não`).toBe(true);
    }
  });
  it("operador de eventos vende e faz check-in, mas não configura nem estorna", () => {
    const op = capacidadesDe("eventos_operador");
    expect(op).toContain("eventos.vender");
    expect(op).toContain("eventos.checkin");
    expect(op).not.toContain("eventos.configurar");
    expect(op).not.toContain("eventos.estornos.gerir");
  });
  it("papel do Ciclo não enxerga o financeiro de eventos, e vice-versa (minimização LGPD)", () => {
    expect(capacidadesDe("coordenador")).not.toContain("eventos.inscricoes.ver");
    expect(capacidadesDe("eventos_admin")).not.toContain("ciclo.financeiro.ver");
  });
  it("papéis de eventos são nacionais: não dependem de localidade", () => {
    expect(PAPEIS_NACIONAIS.has("eventos_admin")).toBe(true);
    expect(PAPEIS_NACIONAIS.has("coordenador")).toBe(false);
  });
});
