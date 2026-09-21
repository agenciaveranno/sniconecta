import { describe, expect, it } from "vitest";
import { desenharCodigo, MARGEM, matrizDoCodigo } from "@/lib/dominio/qr";

const CODIGO = "SNI-A1B2-C3D4-E5F6-7890";

describe("o código vira matriz", () => {
  it("a matriz é quadrada", () => {
    const m = matrizDoCodigo(CODIGO);
    expect(m.length).toBeGreaterThan(20);
    for (const linha of m) expect(linha.length).toBe(m.length);
  });

  it("o mesmo texto dá sempre o mesmo desenho", () => {
    // ⚠️ Se não desse, dois comprovantes do mesmo ingresso teriam desenhos
    // diferentes — e a desconfiança na porta seria justificada.
    expect(matrizDoCodigo(CODIGO)).toEqual(matrizDoCodigo(CODIGO));
  });

  it("textos diferentes dão desenhos diferentes", () => {
    expect(matrizDoCodigo(CODIGO)).not.toEqual(matrizDoCodigo("SNI-0000-0000-0000-0001"));
  });

  it("os três marcadores de canto estão escuros", () => {
    // O olho do canto é 7×7 com a borda escura: é por ele que o leitor acha a
    // orientação. Se ele sumir, o desenho não é um QR.
    const m = matrizDoCodigo(CODIGO);
    const n = m.length;
    for (const [y, x] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      expect(m[y][x], `canto ${y},${x}`).toBe(true);
    }
  });

  it("texto vazio é recusado, e não vira um QR de nada", () => {
    expect(() => matrizDoCodigo("   ")).toThrow();
  });

  it("um código bem maior ainda cabe", () => {
    // Versão 0 escolhe a menor que couber. Fixar a versão faria um código um
    // caractere maior deixar de caber, sem aviso.
    expect(() => matrizDoCodigo("x".repeat(300))).not.toThrow();
  });
});

describe("o desenho leva a margem do padrão", () => {
  it("o lado soma a margem dos dois lados", () => {
    const m = matrizDoCodigo(CODIGO);
    const d = desenharCodigo(CODIGO);
    expect(d.lado).toBe(m.length + MARGEM * 2);
  });

  it("nenhum ponto invade a margem", () => {
    // ⚠️ A margem faz parte da norma: sem o vão branco, o leitor não acha onde
    // o desenho começa, e o QR colado na borda do papel simplesmente não lê.
    const d = desenharCodigo(CODIGO);
    for (const p of d.pontos) {
      expect(p.x).toBeGreaterThanOrEqual(MARGEM);
      expect(p.y).toBeGreaterThanOrEqual(MARGEM);
      expect(p.x).toBeLessThan(d.lado - MARGEM);
      expect(p.y).toBeLessThan(d.lado - MARGEM);
    }
  });

  it("tem ponto o bastante para ser um QR", () => {
    expect(desenharCodigo(CODIGO).pontos.length).toBeGreaterThan(100);
  });
});
