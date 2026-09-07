/**
 * Onde cada produto da livraria entra no catálogo da instituição.
 *
 * ⚠️ Módulo à parte do script porque isto PRECISA de teste de comportamento. A
 * regra tem uma armadilha real — ver `DECISOES_DA_SEDE` — e testar o texto do
 * código em vez do resultado não pegaria uma inversão de sinal.
 */

/** Prateleira de vitrine, não tipo de produto. */
const VITRINE = /^(lan[çc]amentos?|promo[çc][õo]es?|ofertas?|destaques?|mais vendidos?|novidades?)$/i;

/** Sem acento, sem caixa, sem espaço dobrado — para comparar nome com nome. */
export function chave(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O que a Sede decidiu, um a um, sobre produtos que a loja NÃO classifica.
 *
 * ⚠️ Lista explícita porque não há dado de onde derivar: estes títulos estão só
 * em "Lançamentos", que é prateleira de vitrine — cabe livro e cabe pingente. A
 * loja não diz o que eles são, e uma pessoa decidiu olhando. Encodar a decisão
 * dela é honesto; inventar uma regra que a reproduza por acaso, não.
 *
 * ⚠️ E o casamento é pelo nome INTEIRO. "Kit: Livro A Fé que muda o seu destino
 * + Pingente de Acrílico Azul" CONTÉM "A Fé que muda o seu Destino": por
 * trecho, um kit com pingente dentro viraria livro — e ninguém notaria, porque
 * o nome dele começa com "Kit: Livro".
 *
 * Some sozinha no dia em que a loja classificar o produto: quem tem categoria
 * de verdade nem chega a ser consultado aqui.
 */
export const DECISOES_DA_SEDE = new Map<string, { raiz: string; assunto: string | null }>(
  [
    "A fé que muda o seu Destino",
    "Podemos Ser Mais Felizes",
    "Educação da vida: Um tesouro valioso",
    "A Potencialidade Latente do Ser Humano",
  ].map((nome) => [chave(nome), { raiz: "Livros", assunto: null }])
);

export type Classificacao = {
  raiz: string;
  assunto: string | null;
  /** Só em prateleira de vitrine: a loja não diz o que este produto é. */
  vitrineSoZinha: boolean;
};

export function classificar(nome: string, categorias: string[]): Classificacao {
  const decidido = DECISOES_DA_SEDE.get(chave(nome));
  if (decidido) return { ...decidido, vitrineSoZinha: false };

  const tem = (re: RegExp) => categorias.some((c) => re.test(c.trim()));

  // ⚠️ ASSINATURA DE REVISTA NÃO É COTA DE REVISTA. A assinatura são 12
  // exemplares enviados pelo Correio — produto, com preço, comprado na
  // livraria. A cota é o mínimo mensal retirado na Associação Local conforme a
  // função doutrinária, e mora no módulo de revistas. Mesmo substantivo, coisas
  // diferentes: sem categoria própria, a assinatura ficaria ao lado do incenso,
  // e quem conferisse as revistas do mês acharia que há duas verdades sobre
  // revista no sistema.
  if (tem(/assinatura/i)) {
    return { raiz: "Assinaturas de Revista", assunto: null, vitrineSoZinha: false };
  }

  // ⚠️ A loja guarda os infantis em "Contos infantis", FORA da árvore de
  // Livros. Seguir a loja ao pé da letra os deixaria entre incenso e talismã, e
  // ninguém procura livro infantil ali. Decisão da Sede: `Livros / Livros
  // Infantis`.
  if (tem(/contos?\s*infantis|infanto/i)) {
    return { raiz: "Livros", assunto: "Livros Infantis", vitrineSoZinha: false };
  }

  // ⚠️ O que está SÓ em vitrine não tem classificação de verdade: vai para
  // Artigos Religiosos — destino de tudo que não é livro — e SE ANUNCIA no
  // relatório, para alguém decidir em vez de o script chutar pelo título.
  const semVitrine = categorias.filter((c) => !VITRINE.test(c.trim()));
  const vitrineSoZinha = categorias.length > 0 && semVitrine.length === 0;

  const eLivro = semVitrine.some((c) => /livro|book/i.test(c));
  if (!eLivro) return { raiz: "Artigos Religiosos", assunto: null, vitrineSoZinha };

  // A subcategoria é a mais funda que NÃO é a palavra "Livros" em si.
  const assunto = [...semVitrine].reverse().find((c) => !/^livros?$/i.test(c.trim()));
  return { raiz: "Livros", assunto: assunto ?? null, vitrineSoZinha: false };
}
