import type { ItemDaVenda } from "./venda";

/**
 * Combo: vários ingressos num preço só.
 *
 * Regra pura porque o combo é a única coisa do módulo em que o preço cobrado
 * NÃO é a soma do que se leva. Escrita dentro da venda, o checkout público
 * teria de repeti-la — e a primeira correção faria o site cobrar um valor e o
 * balcão outro pelo mesmo pacote.
 *
 * ⚠️ O combo NÃO tem estoque próprio de verdade: ele consome o estoque dos
 * ingressos que entrega. Por isso esta camada não confere ingresso nenhum —
 * ela EXPANDE o combo nos seus itens e devolve para `conferirVenda` conferir
 * junto com o que foi pedido avulso. Conferir separado deixaria passar quem
 * leva o jantar avulso e outro dentro do combo: cada conta sozinha caberia no
 * estoque, e o salão receberia duas reservas para a mesma cadeira.
 */

export type ItemDoCombo = {
  tipoId: number;
  quantidade: number;
  valorCentavos: number;
};

export type ComboParaVenda = {
  id: number;
  nome: string;
  ativo: boolean;
  /** O que se cobra pelo pacote inteiro, uma unidade. */
  valorCentavos: number;
  /** Nulo = sem limite. */
  quantidade: number | null;
  limitePorPessoa: number | null;
  vendaInicio: Date | null;
  vendaFim: Date | null;
  /** Quantas unidades já saíram. */
  vendidos: number;
  /** Quantas ESTA pessoa já levou. */
  levadosPorEsta: number;
  itens: ItemDoCombo[];
};

export type PedidoDeCombo = { comboId: number; quantidade: number };

export type ComboEscolhido = {
  combo: ComboParaVenda;
  quantidade: number;
  /** Os ingressos que estas unidades entregam, já multiplicados. */
  itens: ItemDaVenda[];
  /** Quanto o pacote tira do preço de tabela, somadas as unidades. */
  descontoCentavos: number;
};

export type ConferenciaDeCombos = {
  erros: string[];
  escolhidos: ComboEscolhido[];
  /** Os itens de todos os combos, para entrar na conferência do estoque. */
  itensExpandidos: ItemDaVenda[];
};

/** Quantos ingressos uma unidade do combo entrega. */
export function ingressosPorUnidade(combo: Pick<ComboParaVenda, "itens">): number {
  return combo.itens.reduce((s, i) => s + i.quantidade, 0);
}

/** Quanto custariam, avulsos, os ingressos de UMA unidade. */
export function avulsoDaUnidade(combo: Pick<ComboParaVenda, "itens">): number {
  return combo.itens.reduce((s, i) => s + i.valorCentavos * i.quantidade, 0);
}

/**
 * Quantas UNIDADES do combo saíram, a partir das linhas de inscrição.
 *
 * ⚠️ Contar linhas seria contar ingressos, não combos. Um combo de três
 * ingressos vendido duas vezes deixa SEIS linhas no banco: a coluna "vendidos"
 * diria 6, e o limite `quantidade` — que é um limite de PACOTES — apareceria
 * estourado com o dobro ou o triplo do que saiu de verdade. A conta que fecha
 * é dividir pelo tamanho do pacote.
 *
 * ⚠️ E o resto arredonda PARA CIMA. Cancelar um ingresso de dentro de um combo
 * deixa linhas de menos; a unidade continua ocupando o lugar dela até alguém
 * cancelar a compra inteira. Arredondar para baixo devolveria ao estoque um
 * lugar que ainda está com dono.
 */
export function combosVendidos(linhas: number, ingressosPorCombo: number): number {
  if (linhas <= 0) return 0;
  // Combo sem item (só existe vindo da carga) não tem por onde dividir: cada
  // linha responde por si, que é o mais perto da verdade que dá para chegar.
  if (ingressosPorCombo <= 0) return linhas;
  return Math.ceil(linhas / ingressosPorCombo);
}

/**
 * O que o balcão pode vender de combo, e quanto isso desconta.
 *
 * ⚠️ `agora` é PARÂMETRO, como no cupom: uma função que lê o relógio faz o
 * caso "combo que fecha hoje às 23h" passar ou falhar conforme a hora em que
 * o CI rodar.
 */
export function conferirCombos(
  combos: ComboParaVenda[],
  pedidos: PedidoDeCombo[],
  { agora }: { agora: Date }
): ConferenciaDeCombos {
  const erros: string[] = [];
  const porId = new Map(combos.map((c) => [c.id, c]));
  const escolhidos: ComboEscolhido[] = [];

  // Quantidade zero não é erro: é combo que a pessoa não levou.
  for (const pedido of pedidos.filter((p) => p.quantidade > 0)) {
    const combo = porId.get(pedido.comboId);
    if (!combo) {
      erros.push("Um dos combos escolhidos não pertence a este evento.");
      continue;
    }
    const quantidade = pedido.quantidade;

    if (!combo.ativo) {
      erros.push(`O combo "${combo.nome}" está desativado e não pode ser vendido.`);
      continue;
    }

    // ⚠️ Combo sem item veio da carga e é um preço que não entrega nada. Quem
    // pagasse levaria ingresso nenhum, e o erro só apareceria no dia, na porta.
    if (combo.itens.length === 0) {
      erros.push(`O combo "${combo.nome}" não entrega ingresso nenhum — corrija o cadastro.`);
      continue;
    }

    if (combo.vendaInicio && agora < combo.vendaInicio) {
      erros.push(`A venda do combo "${combo.nome}" ainda não abriu.`);
      continue;
    }
    if (combo.vendaFim && agora > combo.vendaFim) {
      erros.push(`A venda do combo "${combo.nome}" já fechou.`);
      continue;
    }

    // ⚠️ Combo que custa MAIS que a soma avulsa é recusado, não vendido mais
    // barato nem mais caro. Ele é erro de centavos no cadastro, e qualquer
    // valor cobrado aqui estaria errado para alguém: ou a pessoa paga acima da
    // tabela sem saber, ou o desconto fica NEGATIVO e o banco recusa a linha
    // com uma mensagem sobre restrição que ninguém no balcão sabe ler.
    const avulso = avulsoDaUnidade(combo);
    if (avulso < combo.valorCentavos) {
      erros.push(
        `O combo "${combo.nome}" está cadastrado por mais do que os ingressos custam separados — corrija o preço antes de vender.`
      );
      continue;
    }

    const restam =
      combo.quantidade === null ? null : Math.max(combo.quantidade - combo.vendidos, 0);
    if (restam !== null && quantidade > restam) {
      erros.push(
        restam === 0
          ? `O combo "${combo.nome}" está esgotado.`
          : `O combo "${combo.nome}" tem só ${restam} disponível(is), e foram pedidos ${quantidade}.`
      );
      continue;
    }

    if (
      combo.limitePorPessoa !== null &&
      combo.levadosPorEsta + quantidade > combo.limitePorPessoa
    ) {
      erros.push(
        combo.levadosPorEsta >= combo.limitePorPessoa
          ? `Esta pessoa já levou o combo "${combo.nome}" o máximo de vezes permitido.`
          : `O combo "${combo.nome}" é limitado a ${combo.limitePorPessoa} por pessoa, e esta já levou ${combo.levadosPorEsta}.`
      );
      continue;
    }

    escolhidos.push({
      combo,
      quantidade,
      itens: combo.itens.map((i) => ({
        tipoId: i.tipoId,
        quantidade: i.quantidade * quantidade,
      })),
      descontoCentavos: (avulso - combo.valorCentavos) * quantidade,
    });
  }

  return {
    erros,
    escolhidos,
    itensExpandidos: escolhidos.flatMap((e) => e.itens),
  };
}
