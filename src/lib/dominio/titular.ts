/**
 * Trocar o titular de um ingresso: quem comprou não vai, e passa para outra
 * pessoa.
 *
 * ⚠️ Existe para NÃO obrigar a cancelar e vender de novo. O caminho do
 * cancelamento joga o valor na fila de estorno e depois cobra outra vez: o
 * dinheiro sai e volta ao caixa sem nada ter mudado, e a tesouraria trabalha
 * uma devolução que ninguém pediu.
 */

export type InscricaoParaTrocar = {
  status: "pendente" | "pago" | "cancelado" | "expirado" | "transferido";
  /** Nulo = ainda não entrou. */
  checkinEm: string | null;
  pessoaId: string;
  /** Nulo quando a inscrição veio da carga sem tipo resolvido. */
  ingressoTipoId: number | null;
  unicoPorCpf: boolean;
};

export type NovoTitular = {
  id: string;
  /** Tipos de ingresso que a pessoa NOVA já tem vivos neste evento. */
  jaTemDestesTipos: number[];
};

export type VeredictoTroca = { pode: true } | { pode: false; motivo: string };

export function podeTrocarTitular(
  inscricao: InscricaoParaTrocar,
  novo: NovoTitular
): VeredictoTroca {
  // ⚠️ Quem já entrou não troca de dono. A presença registrada é de uma pessoa
  // específica; trocar o titular depois faria o relatório dizer que entrou
  // quem não entrou — e a lista de presença do evento passaria a mentir sobre
  // um fato que aconteceu.
  if (inscricao.checkinEm) {
    return {
      pode: false,
      motivo: "Esta inscrição já teve entrada registrada — a presença é de quem entrou.",
    };
  }

  if (inscricao.status === "cancelado") {
    return { pode: false, motivo: "Inscrição cancelada não muda de titular." };
  }
  if (inscricao.status === "expirado") {
    return { pode: false, motivo: "Inscrição expirada não muda de titular." };
  }
  if (inscricao.status === "transferido") {
    return {
      pode: false,
      motivo: "Esta inscrição foi transferida. Troque o titular da inscrição nova.",
    };
  }

  if (novo.id === inscricao.pessoaId) {
    return { pode: false, motivo: "O novo titular é a mesma pessoa que já está na inscrição." };
  }

  // ⚠️ `unico_por_cpf` vale na troca como vale na venda. Sem esta conferência,
  // passar o jantar para quem já tem um seria o caminho torto para furar a
  // regra: a venda recusaria, a troca deixaria.
  if (
    inscricao.unicoPorCpf &&
    inscricao.ingressoTipoId !== null &&
    novo.jaTemDestesTipos.includes(inscricao.ingressoTipoId)
  ) {
    return {
      pode: false,
      motivo: "O novo titular já tem este ingresso neste evento, e ele é um por pessoa.",
    };
  }

  return { pode: true };
}
