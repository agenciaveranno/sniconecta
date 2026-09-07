import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODULOS } from "@/modulos/registro";

/**
 * Todo item do menu marcado `pronto` precisa ter rota de verdade.
 *
 * ⚠️ Este teste nasceu de um erro real: a barra lateral anunciava o mapa
 * inteiro do sistema — Ciclo, Eventos, Auditoria — e nove dos treze itens
 * davam 404. Quem entrou pela primeira vez clicou em "Pessoas" e caiu num erro,
 * sem ter como distinguir "ainda não foi feito" de "quebrou". Um 404 no menu
 * não estraga uma tela: estraga a confiança nas outras doze.
 *
 * O registro é a promessa; `src/app/` é o que existe. Este teste mantém as
 * duas coisas coladas — e é mecânico porque a divergência é silenciosa: nada
 * no build reclama de um `href` que não leva a lugar nenhum.
 */
describe("registro de módulos", () => {
  const prontos = MODULOS.flatMap((m) => m.itens.filter((i) => i.pronto));

  it("há pelo menos um item pronto (senão o painel nasce vazio)", () => {
    expect(prontos.length).toBeGreaterThan(0);
  });

  it.each(prontos.map((i) => [i.href, i.rotulo] as const))(
    "%s (%s) tem página",
    (href) => {
      const base = `src/app${href}`;
      const existe =
        existsSync(`${base}/page.tsx`) ||
        existsSync(`${base}/page.ts`) ||
        existsSync(`${base}/route.ts`);
      expect(existe).toBe(true);
    }
  );

  it("nenhum href se repete entre módulos", () => {
    const todos = MODULOS.flatMap((m) => m.itens.map((i) => i.href));
    expect(todos).toHaveLength(new Set(todos).size);
  });
});
