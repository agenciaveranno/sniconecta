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

/**
 * Um valor de busca pronto para entrar num filtro `.or()` do PostgREST.
 *
 * ⚠️ O `.or()` separa as condições por VÍRGULA. Um nome com vírgula — "Silva,
 * Maria" — partia o filtro ao meio: a consulta voltava 400 e a tela de pessoas
 * ESTOURAVA. Procurar por um nome com vírgula derrubava a lista inteira, e
 * bastava um texto bem escolhido para acrescentar condições à consulta.
 *
 * Entre aspas, a vírgula é conteúdo. A contrabarra é escapada ANTES da aspa —
 * na ordem inversa, o escape da aspa seria desfeito pelo da contrabarra.
 */
export function entreAspas(valor: string): string {
  return `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
