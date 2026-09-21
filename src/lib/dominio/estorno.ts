/**
 * Cancelar uma inscrição, e o dinheiro que isso devolve.
 *
 * Regra pura porque decide duas coisas que não se desfazem sozinhas: some uma
 * presença do relatório, e nasce uma dívida com quem pagou.
 */

export type InscricaoParaCancelar = {
  status: "pendente" | "pago" | "cancelado" | "expirado" | "transferido";
  tipoVenda: string;
  valorOriginalCentavos: number;
  descontoCentavos: number;
  /** Nulo = ainda não entrou no evento. */
  checkinEm: string | null;
};

export type VeredictoCancelamento = { pode: true } | { pode: false; motivo: string };

/**
 * ⚠️ Quem JÁ ENTROU não se cancela direto. A pessoa consumiu o evento, e
 * cancelar apagaria a presença registrada: o relatório passaria a dizer que
 * entrou menos gente do que entrou, e ninguém desconfia de um número que só
 * diminuiu.
 *
 * Quando a entrada foi registrada por engano — dois nomes parecidos na porta —
 * o caminho é desfazer o check-in primeiro. A mensagem diz isso, porque quem
 * está cancelando não tem como adivinhar que existe um "desfazer" em outra
 * tela.
 */
export function podeCancelar(i: InscricaoParaCancelar): VeredictoCancelamento {
  if (i.checkinEm) {
    return {
      pode: false,
      motivo:
        "Esta pessoa já entrou no evento. Se a entrada foi registrada por engano, desfaça o check-in antes de cancelar.",
    };
  }
  switch (i.status) {
    case "pago":
    case "pendente":
      return { pode: true };
    case "cancelado":
      return { pode: false, motivo: "Esta inscrição já está cancelada." };
    case "expirado":
      return { pode: false, motivo: "Esta inscrição expirou sozinha — não há o que cancelar." };
    case "transferido":
      return {
        pode: false,
        motivo: "Esta inscrição foi transferida. Cancele a inscrição nova, que é a que vale.",
      };
  }
}

/**
 * Quanto se deve devolver ao cancelar.
 *
 * ⚠️ Desconta o cupom, pela mesma razão do relatório: devolver o valor de
 * tabela de quem pagou com desconto seria devolver mais do que entrou.
 *
 * ⚠️ Cortesia devolve ZERO qualquer que seja o valor de tabela — e a carga
 * trouxe cortesias do sistema antigo COM valor preenchido. Sem esta linha, o
 * cancelamento de uma cortesia importada abriria um estorno de dinheiro que
 * nunca foi pago.
 *
 * ⚠️ Pendente também devolve zero: não chegou a pagar. Abrir estorno para ela
 * poria na fila da tesouraria uma devolução sem contrapartida.
 */
export function valorAEstornar(i: InscricaoParaCancelar): number {
  if (i.status !== "pago") return 0;
  if (i.tipoVenda === "cortesia") return 0;
  return Math.max(i.valorOriginalCentavos - i.descontoCentavos, 0);
}

/**
 * Quanto a fila da tesouraria deve devolver por esta linha.
 *
 * ⚠️ PREFERE O VALOR REGISTRADO no momento em que o estorno foi aberto, e só
 * recalcula quando não há registro. Recalcular sempre funciona enquanto a
 * devolução for "tudo o que a pessoa pagou" — e passa a mentir na primeira que
 * não for. A transferência entre eventos abre exatamente esse caso: quando o
 * ingresso de destino custa menos, o que se deve é a SOBRA, não o valor
 * inteiro. Sem o registro, a fila ofereceria à tesouraria a devolução do
 * ingresso todo de alguém que continua indo a um evento.
 *
 * O fallback existe para as linhas que a carga trouxe e para as que foram
 * abertas antes deste registro existir.
 */
export function valorNaFila(
  i: Omit<InscricaoParaCancelar, "status" | "checkinEm"> & {
    estorno: { valor_centavos?: number | null } | null;
  }
): number {
  const registrado = i.estorno?.valor_centavos;
  if (typeof registrado === "number" && Number.isFinite(registrado) && registrado >= 0) {
    return Math.trunc(registrado);
  }
  return valorAEstornar({ ...i, status: "pago", checkinEm: null });
}

/** Cancelar abre estorno só quando há o que devolver. */
export function abreEstorno(i: InscricaoParaCancelar): boolean {
  return valorAEstornar(i) > 0;
}

export const SITUACOES_ESTORNO = ["pendente", "feito", "recusado"] as const;
export type SituacaoEstorno = (typeof SITUACOES_ESTORNO)[number];
