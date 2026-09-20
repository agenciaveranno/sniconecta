/**
 * Por que um evento ainda NÃO vende.
 *
 * Regra pura, sem banco e sem tela, porque três lugares fazem a mesma pergunta
 * e precisam da mesma resposta: a gestão do evento (avisa antes), a venda
 * balcão (recusa abrir) e a página pública (não oferece o que não dá para
 * comprar). Escrita em cada uma, elas divergem na primeira correção — e o
 * jeito que isso aparece é o balcão vendendo o que o site recusa.
 *
 * ⚠️ Devolve TODOS os motivos, não o primeiro. Quem está preparando o evento
 * quer a lista do que falta; descobrir um impedimento por vez, com uma volta ao
 * banco entre cada, é como se leva uma tarde para publicar um evento.
 */

export type IngressoParaVenda = {
  /** `principal` dá entrada sozinho; `adicional` só acompanha um principal. */
  papel: "principal" | "adicional";
  ativo: boolean;
};

export type EventoParaVenda = {
  /** Quem promove diz em qual conta Cielo o dinheiro cai (decisão 0012). */
  temPromotor: boolean;
  ativo: boolean;
};

export const MOTIVOS = {
  inativo: "O evento está desativado.",
  semPromotor:
    "Falta dizer quem promove — é o promotor que define em qual conta Cielo o dinheiro cai.",
  semIngresso: "Nenhum tipo de ingresso cadastrado.",
  semPrincipal:
    "Nenhum ingresso principal ativo — adicional só pode ser comprado acompanhando um principal.",
} as const;

export function porQueNaoVende(
  evento: EventoParaVenda,
  tipos: IngressoParaVenda[]
): string[] {
  const motivos: string[] = [];

  if (!evento.ativo) motivos.push(MOTIVOS.inativo);
  if (!evento.temPromotor) motivos.push(MOTIVOS.semPromotor);

  if (tipos.length === 0) {
    motivos.push(MOTIVOS.semIngresso);
    // ⚠️ Sem NENHUM tipo, "falta um principal ativo" é a mesma notícia dita
    // duas vezes. Duas linhas para um problema só fazem quem lê procurar dois
    // consertos.
    return motivos;
  }

  if (!tipos.some((t) => t.papel === "principal" && t.ativo)) {
    motivos.push(MOTIVOS.semPrincipal);
  }

  return motivos;
}

/** Atalho legível: o evento está pronto para vender? */
export function vende(evento: EventoParaVenda, tipos: IngressoParaVenda[]): boolean {
  return porQueNaoVende(evento, tipos).length === 0;
}
