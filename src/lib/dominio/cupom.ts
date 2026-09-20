import { descontoPercentual } from "./dinheiro";

/**
 * Cupom de desconto: se vale, e quanto tira.
 *
 * Regra pura porque o mesmo cupom vai ser digitado em dois lugares — o balcão
 * e o checkout público — e precisa dar o MESMO desconto nos dois. Escrita em
 * cada tela, a primeira correção faria o site cobrar diferente do balcão para
 * o mesmo código.
 */

export type Cupom = {
  id: number;
  codigo: string;
  tipo: "percentual" | "valor";
  /** Percentual (0..100) ou centavos, conforme `tipo`. */
  valor: number;
  /** Quando preenchido, o cupom só vale para ESTE tipo de ingresso. */
  ingresso_tipo_id: number | null;
  max_usos_total: number | null;
  max_usos_por_cpf: number | null;
  /** ISO, ou nulo para "sem começo"/"sem fim". */
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  ativo: boolean;
};

export type ItemComPreco = {
  tipoId: number;
  quantidade: number;
  valorCentavos: number;
};

export type VereditoCupom =
  | { vale: true; descontoCentavos: number }
  | { vale: false; motivo: string };

/**
 * ⚠️ `agora` é PARÂMETRO, não `new Date()` lá dentro. Uma função que lê o
 * relógio não se testa: o caso "cupom que vence hoje às 23h" passaria ou
 * falharia conforme a hora em que o CI rodasse.
 */
export function conferirCupom(
  cupom: Cupom,
  itens: ItemComPreco[],
  {
    agora,
    usosTotais = 0,
    usosDestaPessoa = 0,
  }: { agora: Date; usosTotais?: number; usosDestaPessoa?: number }
): VereditoCupom {
  if (!cupom.ativo) {
    return { vale: false, motivo: `O cupom ${cupom.codigo} está desativado.` };
  }

  if (cupom.vigencia_inicio && agora < new Date(cupom.vigencia_inicio)) {
    return { vale: false, motivo: `O cupom ${cupom.codigo} ainda não começou a valer.` };
  }
  if (cupom.vigencia_fim && agora > new Date(cupom.vigencia_fim)) {
    return { vale: false, motivo: `O cupom ${cupom.codigo} está fora do prazo.` };
  }

  if (cupom.max_usos_total !== null && usosTotais >= cupom.max_usos_total) {
    return { vale: false, motivo: `O cupom ${cupom.codigo} esgotou os usos.` };
  }
  if (cupom.max_usos_por_cpf !== null && usosDestaPessoa >= cupom.max_usos_por_cpf) {
    return {
      vale: false,
      motivo: `Esta pessoa já usou o cupom ${cupom.codigo} o máximo de vezes permitido.`,
    };
  }

  // ⚠️ A BASE do desconto é só o que o cupom alcança. Um cupom preso a um tipo
  // de ingresso que desse 50% sobre o carrinho inteiro descontaria também o
  // jantar e o transporte — e o cupom da "meia entrada" pagaria o jantar de
  // quem soubesse somar no mesmo pedido.
  const alcancados = cupom.ingresso_tipo_id
    ? itens.filter((i) => i.tipoId === cupom.ingresso_tipo_id)
    : itens;

  const base = alcancados.reduce((s, i) => s + i.valorCentavos * i.quantidade, 0);

  if (base === 0) {
    return {
      vale: false,
      motivo: `O cupom ${cupom.codigo} não vale para nenhum dos ingressos escolhidos.`,
    };
  }

  const bruto =
    cupom.tipo === "percentual"
      ? descontoPercentual(base, cupom.valor)
      : cupom.valor;

  // ⚠️ Nunca desconta mais do que a base. Um cupom de R$ 100 num ingresso de
  // R$ 40 viraria devolução: o total ficaria negativo, e o estorno depois
  // calcularia em cima de um número que nunca entrou no caixa.
  return { vale: true, descontoCentavos: Math.min(bruto, base) };
}

/** Como o cupom se lê numa lista: "10%" ou "R$ 15,00". */
export function descreverCupom(cupom: Pick<Cupom, "tipo" | "valor">): string {
  return cupom.tipo === "percentual"
    ? `${cupom.valor}%`
    : (cupom.valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * ⚠️ O código é comparado em CAIXA ALTA, e o índice único do banco usa
 * `lower(codigo)`. Quem digita no balcão não distingue maiúscula de minúscula,
 * e sem normalizar o mesmo cupom recusaria por causa de um Caps Lock.
 */
export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}
