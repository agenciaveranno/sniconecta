/**
 * O que o balcão pode vender, e por quanto.
 *
 * Regra pura: sem banco, sem tela. Quem confere é o servidor, antes de gravar
 * — e as MESMAS contas valem para a venda pública quando ela entrar. Uma
 * segunda cópia na tela de compra divergiria na primeira correção, e o jeito
 * que isso aparece é o balcão vendendo o que o site recusa, ou o contrário.
 *
 * ⚠️ Conferir aqui NÃO dispensa conferir no banco. O estoque é disputado: duas
 * pessoas no balcão, ao mesmo tempo, passam as duas por esta função com o
 * mesmo "resta 1". Quem serializa é o `select … for update` na gravação. Esta
 * camada existe para recusar cedo e explicar bem, não para garantir sozinha.
 */

export type TipoParaVenda = {
  id: number;
  nome: string;
  papel: "principal" | "adicional";
  ativo: boolean;
  valor_centavos: number;
  /** O mesmo CPF não leva dois — o caso do jantar. */
  unico_por_cpf: boolean;
  /** Só é comprável acompanhando um principal na mesma venda. */
  exige_principal: boolean;
  /** Quantos ainda cabem. `null` é sem limite; `0` é esgotado. */
  disponivel: number | null;
};

export type ItemDaVenda = { tipoId: number; quantidade: number };

export type Conferencia = {
  erros: string[];
  /** Só os itens com quantidade > 0, já casados com o tipo. */
  itens: { tipo: TipoParaVenda; quantidade: number }[];
  totalCentavos: number;
};

/**
 * @param jaTemDestesTipos ids de tipo que ESTA pessoa já tem em inscrição
 *   ativa neste evento. É o que faz `unico_por_cpf` valer entre compras
 *   diferentes, e não só dentro de uma.
 */
export function conferirVenda(
  tipos: TipoParaVenda[],
  itens: ItemDaVenda[],
  jaTemDestesTipos: number[] = []
): Conferencia {
  const erros: string[] = [];
  const porId = new Map(tipos.map((t) => [t.id, t]));

  // Quantidade zero ou negativa não é erro: é item que não foi escolhido.
  // ⚠️ E o MESMO tipo pedido duas vezes vira UMA linha somada. O carrinho
  // chega com o que foi pedido avulso e com o que os combos entregam, e o
  // jantar pode estar nos dois. Conferidas separadas, duas linhas de 1 passam
  // as duas por "resta 1" e por "um por pessoa" — e o salão recebe duas
  // reservas para a mesma cadeira.
  const somados = new Map<number, number>();
  for (const item of itens) {
    if (item.quantidade > 0) {
      somados.set(item.tipoId, (somados.get(item.tipoId) ?? 0) + item.quantidade);
    }
  }
  const escolhidos = [...somados].map(([tipoId, quantidade]) => ({ tipoId, quantidade }));

  const casados: { tipo: TipoParaVenda; quantidade: number }[] = [];
  for (const item of escolhidos) {
    const tipo = porId.get(item.tipoId);
    if (!tipo) {
      erros.push("Um dos ingressos escolhidos não pertence a este evento.");
      continue;
    }
    if (!tipo.ativo) {
      erros.push(`"${tipo.nome}" está desativado e não pode ser vendido.`);
      continue;
    }
    casados.push({ tipo, quantidade: item.quantidade });
  }

  if (casados.length === 0) {
    erros.push("Escolha pelo menos um ingresso.");
    return { erros, itens: [], totalCentavos: 0 };
  }

  const temPrincipal = casados.some((c) => c.tipo.papel === "principal");

  for (const { tipo, quantidade } of casados) {
    // ⚠️ `exige_principal` é a regra que o banco guarda; `papel` só descreve a
    // natureza. Jantar e transporte não se vendem sozinhos — quem chega no
    // balcão só para o jantar não entrou no evento.
    if (tipo.exige_principal && !temPrincipal) {
      erros.push(
        `"${tipo.nome}" só pode ser vendido junto com um ingresso principal na mesma compra.`
      );
    }

    if (tipo.unico_por_cpf) {
      if (quantidade > 1) {
        erros.push(`"${tipo.nome}" é um por pessoa — não dá para levar ${quantidade}.`);
      }
      if (jaTemDestesTipos.includes(tipo.id)) {
        erros.push(`Esta pessoa já tem "${tipo.nome}" neste evento, e é um por pessoa.`);
      }
    }

    // ⚠️ `null` é sem limite e NÃO entra aqui. Tratar nulo como zero faria
    // todo ingresso sem limite aparecer esgotado — que é o oposto do que o
    // campo em branco diz.
    if (tipo.disponivel !== null && quantidade > tipo.disponivel) {
      erros.push(
        tipo.disponivel === 0
          ? `"${tipo.nome}" está esgotado.`
          : `"${tipo.nome}" tem só ${tipo.disponivel} disponível(is), e foram pedidos ${quantidade}.`
      );
    }
  }

  const totalCentavos = casados.reduce(
    (soma, c) => soma + c.tipo.valor_centavos * c.quantidade,
    0
  );

  return { erros, itens: casados, totalCentavos };
}

/**
 * Formas de pagamento que o BALCÃO aceita.
 *
 * ⚠️ Não inclui cartão pela Cielo: no balcão a maquininha é física e a
 * conciliação acontece fora daqui. Registrar "cartão" como se tivesse passado
 * pelo gateway faria a inscrição parecer conciliada sem nunca ter sido, e o
 * estorno depois procuraria uma transação que não existe.
 */
export const FORMAS_BALCAO = ["dinheiro", "pix", "maquininha", "cortesia"] as const;
export type FormaBalcao = (typeof FORMAS_BALCAO)[number];

export const ROTULO_FORMA: Record<FormaBalcao, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  maquininha: "Maquininha (cartão presencial)",
  cortesia: "Cortesia",
};

/**
 * Cortesia é `tipo_venda`, não forma de pagamento — e some do faturamento.
 *
 * ⚠️ Cortesia lançada como venda de valor zero entraria no relatório de
 * arrecadação como uma venda que não aconteceu. O `tipo_venda` separado é o
 * que deixa "quantos entraram" e "quanto entrou" responderem coisas
 * diferentes, que é o que a Sede pergunta.
 */
export function tipoDeVenda(forma: FormaBalcao): "balcao" | "cortesia" {
  return forma === "cortesia" ? "cortesia" : "balcao";
}

/** Cortesia não cobra, qualquer que seja o valor de tabela do ingresso. */
export function totalCobrado(forma: FormaBalcao, totalCentavos: number): number {
  return forma === "cortesia" ? 0 : totalCentavos;
}
