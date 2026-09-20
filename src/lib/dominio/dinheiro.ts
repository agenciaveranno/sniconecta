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

/**
 * Reparte um valor inteiro entre várias linhas, proporcionalmente, SEM perder
 * nem inventar centavo.
 *
 * ⚠️ A soma do resultado é exatamente `total`. Repartir com `Math.round` linha
 * a linha não garante isso: um desconto de R$ 10,00 entre três ingressos iguais
 * daria 3,33 + 3,33 + 3,33 = 9,99, e o centavo que sobra vira diferença entre
 * o que a tela mostrou e o que o banco guardou — a conta do relatório deixa de
 * fechar com a do caixa por um centavo, e ninguém acha de onde veio.
 *
 * Usa o método do maior resto: distribui o piso de cada parte e entrega os
 * centavos que sobraram a quem tinha a maior fração descartada.
 */
export function ratear(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((a, b) => a + b, 0);
  // Sem peso nenhum não há como repartir — e dividir por zero daria NaN em
  // toda linha, que o banco recusaria com uma mensagem sobre tipo.
  if (soma <= 0 || total <= 0) return pesos.map(() => 0);

  const exato = pesos.map((p) => (total * p) / soma);
  const partes = exato.map(Math.floor);
  let resto = total - partes.reduce((a, b) => a + b, 0);

  const porMaiorFracao = exato
    .map((v, i) => ({ i, fracao: v - Math.floor(v) }))
    .sort((a, b) => b.fracao - a.fracao);

  for (const { i } of porMaiorFracao) {
    if (resto <= 0) break;
    partes[i] += 1;
    resto -= 1;
  }
  return partes;
}
