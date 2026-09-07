/**
 * Passaporte: identifica quem não tem CPF (decisão 0013).
 *
 * ⚠️ NÃO existe verificador matemático. CPF tem dígito conferível, passaporte
 * não — cada país emite no seu formato, com letras e dígitos em ordens
 * diferentes. Validar mais que forma recusaria documento legítimo com a pessoa
 * parada na frente do balcão, que é pior do que aceitar um erro de digitação:
 * o erro se corrige na tela, a recusa manda a pessoa embora.
 */

/**
 * Caixa alta e sem separador. É a mesma normalização que o índice único do
 * banco enxerga — sem ela, "ab123456" e "AB123456" viram duas pessoas.
 */
export function normalizarPassaporte(entrada: string): string {
  return (entrada ?? "").replace(/[\s.\-/]/g, "").toUpperCase();
}

/** Forma aceita pelo banco: 5 a 20 letras maiúsculas ou dígitos. */
export function passaporteValido(entrada: string): boolean {
  return /^[A-Z0-9]{5,20}$/.test(normalizarPassaporte(entrada));
}

/**
 * Como se mostra na tela. Passaporte não tem máscara própria: devolver o
 * documento como ele é evita inventar uma pontuação que o país emissor não usa.
 */
export function formatarPassaporte(valor: string | null | undefined): string {
  return valor ? normalizarPassaporte(valor) : "—";
}
