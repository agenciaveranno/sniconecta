/**
 * As perguntas que um tipo de ingresso faz, e o que vale como resposta.
 *
 * `eventos.ingresso_campos` existe desde a fundação com seis tipos de pergunta
 * e nenhuma tela. São as informações que o evento precisa e a inscrição não
 * tem: tamanho de camiseta, restrição alimentar, ponto de embarque do ônibus.
 *
 * ⚠️ Regra pura porque a MESMA pergunta vai ser respondida em dois lugares — a
 * ficha, hoje, e o checkout público, depois. Conferida em cada tela, a
 * primeira correção faria o site aceitar o que a ficha recusa.
 */

export const TIPOS_DE_CAMPO = [
  ["texto", "Texto livre"],
  ["numero", "Número"],
  ["data", "Data"],
  ["selecao", "Escolha uma"],
  ["multipla", "Escolha várias"],
  ["booleano", "Sim ou não"],
] as const;

export type TipoDeCampo = (typeof TIPOS_DE_CAMPO)[number][0];

export function ehTipoDeCampo(v: string): v is TipoDeCampo {
  return TIPOS_DE_CAMPO.some(([t]) => t === v);
}

export const ROTULO_TIPO: Record<TipoDeCampo, string> = Object.fromEntries(
  TIPOS_DE_CAMPO
) as Record<TipoDeCampo, string>;

/** Só estes dois oferecem alternativas; nos outros, `opcoes` não faz sentido. */
export function precisaDeOpcoes(tipo: TipoDeCampo): boolean {
  return tipo === "selecao" || tipo === "multipla";
}

/**
 * As alternativas, uma por linha, como quem cadastra digita.
 *
 * ⚠️ Repetida NÃO é aceita. Duas alternativas com o mesmo texto viram dois
 * itens idênticos na tela de quem responde — e depois, no relatório, duas
 * linhas que deveriam ser uma. Quem cadastrou quis uma.
 */
export function normalizarOpcoes(texto: string): string[] {
  const vistas = new Set<string>();
  const fora: string[] = [];
  for (const linha of texto.split("\n")) {
    const limpo = linha.trim();
    if (!limpo) continue;
    const chave = limpo.toLocaleLowerCase("pt-BR");
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    fora.push(limpo);
  }
  return fora;
}

export type CampoDaPergunta = {
  id: number;
  rotulo: string;
  tipo: TipoDeCampo;
  opcoes: string[] | null;
  obrigatorio: boolean;
};

export type VereditoDaResposta =
  | { vale: true; valor: string | null }
  | { vale: false; motivo: string };

/**
 * Confere uma resposta e devolve o que deve ser gravado.
 *
 * ⚠️ Devolve o VALOR NORMALIZADO, e não só "passou". A resposta vai para uma
 * coluna de texto: sem normalizar, " Sim " e "sim" viram respostas diferentes
 * para a mesma coisa, e o relatório conta as duas separadas.
 *
 * ⚠️ E a resposta de "escolha várias" é gravada separada por `; `, uma decisão
 * que precisa estar num lugar só: gravada com vírgula numa tela e com
 * ponto-e-vírgula noutra, nenhum relatório consegue separar de volta.
 */
export const SEPARADOR_MULTIPLA = "; ";

export function conferirResposta(
  campo: CampoDaPergunta,
  bruto: string[] | string | null | undefined
): VereditoDaResposta {
  const valores = (Array.isArray(bruto) ? bruto : [bruto ?? ""])
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  if (valores.length === 0) {
    if (campo.obrigatorio) {
      return { vale: false, motivo: `Responda "${campo.rotulo}".` };
    }
    // ⚠️ Vazio vira NULO, não string vazia. Duas ausências escritas de formas
    // diferentes fazem o relatório contar "sem resposta" duas vezes.
    return { vale: true, valor: null };
  }

  switch (campo.tipo) {
    case "numero": {
      const n = Number(valores[0].replace(",", "."));
      if (!Number.isFinite(n)) {
        return { vale: false, motivo: `"${campo.rotulo}" espera um número.` };
      }
      return { vale: true, valor: String(n) };
    }

    case "data": {
      // ISO, porque é o que ordena como texto — e a coluna é texto.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(valores[0])) {
        return { vale: false, motivo: `"${campo.rotulo}" espera uma data.` };
      }
      return { vale: true, valor: valores[0] };
    }

    case "booleano":
      return { vale: true, valor: valores[0] === "sim" ? "sim" : "não" };

    case "selecao":
    case "multipla": {
      const alternativas = campo.opcoes ?? [];
      const fora = valores.filter((v) => !alternativas.includes(v));
      if (fora.length > 0) {
        // ⚠️ Recusa o que não está na lista em vez de gravar assim mesmo. O
        // valor chega de um formulário e pode ser qualquer coisa; gravado, ele
        // vira uma alternativa que nunca existiu no relatório — e ninguém
        // descobre de onde veio.
        return {
          vale: false,
          motivo: `"${fora[0]}" não é uma das alternativas de "${campo.rotulo}".`,
        };
      }
      if (campo.tipo === "selecao" && valores.length > 1) {
        return { vale: false, motivo: `"${campo.rotulo}" aceita uma alternativa só.` };
      }
      return { vale: true, valor: valores.join(SEPARADOR_MULTIPLA) };
    }

    default:
      return { vale: true, valor: valores[0].slice(0, 500) };
  }
}
