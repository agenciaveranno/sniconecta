/**
 * O cliente do Supabase devolve `{ data, error }` e NÃO lança. Ler só o `data`
 * faz banco fora do ar, tabela ausente ou policy negando parecerem "não
 * encontrei nada" — e onde a consulta é uma verificação, esse silêncio
 * INVERTE o resultado: a checagem de duplicidade sem linhas vira "pode".
 *
 * Use em toda leitura cuja ausência de resultado influencie uma decisão.
 */
export function exigir<T>(
  resultado: { data: T | null; error: { message: string } | null },
  oQue: string
): T {
  if (resultado.error) {
    throw new Error(`Não foi possível ler ${oQue}: ${resultado.error.message}`);
  }
  if (resultado.data === null || resultado.data === undefined) {
    throw new Error(`Não foi possível ler ${oQue}: resposta vazia.`);
  }
  return resultado.data;
}
