import { describe, expect, it } from "vitest";
import { entreAspas } from "../src/lib/supabase/consulta";

/**
 * O filtro `.or()` do PostgREST separa as condições por VÍRGULA. Um nome com
 * vírgula — "Silva, Maria" — partia o filtro ao meio: a consulta voltava 400 e
 * a tela de pessoas ESTOURAVA. Entre aspas, a vírgula é conteúdo.
 *
 */

describe("valor de busca dentro do filtro do PostgREST", () => {
  it("põe aspas em volta, para a vírgula não virar separador", () => {
    expect(entreAspas("%Silva, Maria%")).toBe('"%Silva, Maria%"');
  });

  it("escapa a aspa que vier no texto, senão ela fecha o valor no meio", () => {
    expect(entreAspas('%O "Doutor"%')).toBe('"%O \\"Doutor\\"%"');
  });

  it("escapa a contrabarra antes de tudo, para não desfazer o escape seguinte", () => {
    expect(entreAspas("%a\\b%")).toBe('"%a\\\\b%"');
  });

  it("um texto sem nada de especial atravessa inteiro", () => {
    expect(entreAspas("%Maria%")).toBe('"%Maria%"');
  });
});
