/**
 * O que o comprovante mostra, e em que ordem.
 *
 * ⚠️ Mora aqui, e não junto da ação que grava, por uma razão do Next: arquivo
 * com `"use server"` só pode exportar função assíncrona — exportar esta lista
 * de lá derruba o build inteiro com "a 'use server' file can only export async
 * functions", uma frase que não diz qual export é o culpado.
 *
 * E é o lugar certo de qualquer forma: a lista é a MESMA para a tela que
 * marca as caixas, para a ação que grava e para o papel que imprime. Escrita
 * em três lugares, a primeira chave acrescentada num deles viraria uma caixa
 * que marca e não aparece.
 */
export const BLOCOS_DO_COMPROVANTE = [
  ["participante", "Participante e documento"],
  ["evento", "Datas e local"],
  ["ingresso", "Tipo de ingresso"],
  ["pagamento", "Valor e forma de pagamento"],
  ["qrcode", "Código do ingresso"],
] as const;

export type BlocoDoComprovante = (typeof BLOCOS_DO_COMPROVANTE)[number][0];

/**
 * ⚠️ Ausente é MOSTRAR. `voucher_mostrar` chegou da fundação com as cinco
 * chaves, mas uma linha da carga ou uma chave nova acrescentada depois vem sem
 * ela — e tratar ausência como "esconder" faria o comprovante emagrecer
 * sozinho no dia em que a lista crescesse.
 */
export function mostraBloco(
  mostrar: Record<string, boolean | undefined> | null | undefined,
  bloco: BlocoDoComprovante
): boolean {
  return mostrar?.[bloco] !== false;
}
