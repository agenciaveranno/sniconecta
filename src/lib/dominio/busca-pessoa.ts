/**
 * Como um texto digitado no balcão vira busca de pessoa.
 *
 * ⚠️ Existe porque CINCO consultas faziam a mesma preparação à mão — a porta,
 * o balcão, a ficha, o cancelamento e a troca de titular. Cinco cópias
 * divergem na primeira que alguém corrigir, e o jeito que isso aparece é a
 * porta achar quem o balcão não acha: a pessoa está na fila com o documento e
 * cada tela dá uma resposta.
 */

export type BuscaDePessoa = {
  /** Só dígitos, para casar com `pessoas.cpf`, que guarda assim. */
  digitos: string;
  /**
   * Caixa alta, para casar com `pessoas.passaporte` — e também com o código
   * do ingresso e o número do convite, que a porta procura no mesmo campo.
   */
  documento: string;
  /** Padrão de `ilike`, com os curingas já neutralizados. */
  comoNome: string;
};

/**
 * ⚠️ `%` e `_` do texto digitado são NEUTRALIZADOS.
 *
 * Em `ilike`, os dois são curinga: `_` casa com um caractere qualquer e `%`
 * com qualquer coisa. Um nome digitado com `_` passaria a casar com nomes
 * parecidos, e quem procurasse por "50%" receberia meia lista. Escapados, eles
 * voltam a ser o que a pessoa digitou.
 *
 * É o mesmo problema que `entreAspas` resolve do lado do PostgREST, do outro
 * lado do sistema — texto de gente entrando em lugar onde certos caracteres
 * mandam em vez de valer.
 */
function neutralizarCuringas(texto: string): string {
  // A contrabarra primeiro: escapá-la depois desfaria os escapes seguintes.
  return texto.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * @returns `null` quando não há o que procurar.
 *
 * ⚠️ Devolver `null` em vez de um padrão vazio é o que impede `%%` — que casa
 * com a base inteira. Uma busca sem termo trazendo dezesseis mil pessoas não é
 * resultado, é a tela travando.
 */
export function prepararBusca(termo: string): BuscaDePessoa | null {
  const limpo = termo.trim();
  if (!limpo) return null;

  return {
    digitos: limpo.replace(/\D/g, ""),
    documento: limpo.toUpperCase(),
    comoNome: `%${neutralizarCuringas(limpo)}%`,
  };
}
