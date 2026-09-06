/**
 * Validação e normalização de CodSNI (identificador interno da Seicho-No-Ie).
 *
 * Regras da especificação (seção 4.1):
 *  · Todos têm; é único.
 *  · "Somente dígitos, sem limite de tamanho" — armazenar como TEXT, nunca
 *    como número (estoura ou come zeros à esquerda). Validar com ^[0-9]+$.
 */

/** Remove espaços das bordas; NÃO remove zeros à esquerda (são significativos). */
export function normalizarCodSni(entrada: string): string {
  return (entrada ?? "").trim();
}

/** Verdadeiro se for uma sequência não-vazia composta apenas de dígitos. */
export function codSniValido(entrada: string): boolean {
  const v = normalizarCodSni(entrada);
  return /^[0-9]+$/.test(v);
}
