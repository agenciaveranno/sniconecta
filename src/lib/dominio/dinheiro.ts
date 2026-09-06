/**
 * Dinheiro é inteiro em centavos. Nunca float, nunca numeric.
 * O sistema de origem guardava DECIMAL(10,2); estas funções fazem a ponte
 * na migração e na entrada de dados.
 */

/** "123.45", 123.45, "1.234,56" → 12345. Vazio ou inválido → null. */
export function centavosDe(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : null;
  let s = v.trim().replace(/[R$\s]/g, "");
  // "1.234,56" (pt-BR) → "1234.56"; "1234.56" fica como está.
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function formatarCentavos(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "—";
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Desconto percentual em centavos, arredondado ao centavo. */
export function descontoPercentual(centavos: number, percentual: number): number {
  return Math.round((centavos * percentual) / 100);
}
