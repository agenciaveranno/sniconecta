/**
 * Quem pode entrar no evento.
 *
 * Regra pura porque a porta é o pior lugar para descobrir uma regra: tem fila
 * atrás, e quem opera não tem como abrir o banco para conferir. A mesma função
 * vai servir à leitura de QR quando ela entrar — e escrita duas vezes, as duas
 * portas passariam a discordar sobre a mesma inscrição.
 */

export type InscricaoNaPorta = {
  status: "pendente" | "pago" | "cancelado" | "expirado" | "transferido";
  /** Nulo = ainda não entrou. */
  checkinEm: string | null;
};

export type Veredito =
  | { pode: true }
  /** `jaEntrou` separa "não pode" de "já passou por aqui": a porta trata os dois diferente. */
  | { pode: false; motivo: string; jaEntrou?: true };

/**
 * ⚠️ `pendente` NÃO entra, e esta é a recusa que mais aparece: é a inscrição
 * feita no site cujo pagamento não caiu. A frase diz isso em vez de "status
 * inválido", porque quem está na porta precisa saber se manda a pessoa ao
 * balcão ou embora.
 */
export function podeEntrar(inscricao: InscricaoNaPorta): Veredito {
  if (inscricao.checkinEm) {
    return {
      pode: false,
      jaEntrou: true,
      motivo: "Esta inscrição já teve entrada registrada.",
    };
  }

  switch (inscricao.status) {
    case "pago":
      return { pode: true };
    case "pendente":
      return {
        pode: false,
        motivo: "O pagamento desta inscrição não foi confirmado. Encaminhe ao balcão.",
      };
    case "cancelado":
      return { pode: false, motivo: "Esta inscrição foi cancelada." };
    case "expirado":
      return { pode: false, motivo: "Esta inscrição expirou sem pagamento." };
    case "transferido":
      return {
        pode: false,
        motivo: "Esta inscrição foi transferida — a entrada vale pela nova.",
      };
  }
}
