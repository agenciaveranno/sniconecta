import "server-only";
import { criarClienteServico } from "@/lib/supabase/service";

/**
 * Fila de notificações: UMA para a plataforma inteira.
 *
 * ⚠️ NUNCA ENVIAR DENTRO DA REQUISIÇÃO DA PESSOA. Um SMTP lento faz o botão
 * "Confirmar inscrição" girar por trinta segundos, e um SMTP fora do ar faz a
 * inscrição — que já foi paga — parecer que falhou. Enfileirar é instantâneo;
 * o cron entrega depois.
 *
 * Regra do repositório: uma fila só. Módulo novo não cria a segunda.
 */
export interface Notificacao {
  canal: "email" | "whatsapp";
  destinatario: string;
  assunto?: string;
  corpo: string;
  /** Nome do modelo, quando o módulo trabalha por template. */
  template?: string;
  variaveis?: Record<string, unknown>;
  /**
   * Impede duplicata. O cron manual e o agendado podem rodar juntos, e
   * conversa de WhatsApp é cobrada: mandar duas vezes custa dinheiro e
   * confunde quem recebe.
   */
  chaveUnica?: string;
  pessoaId?: string | null;
}

/**
 * Grava na fila. **Nunca lança** — nem quando o banco recusa.
 *
 * Comunicação é acessório do fluxo principal: se o aviso de matrícula não
 * puder ser enfileirado, a matrícula ainda assim aconteceu, e derrubar a
 * transação por causa do aviso seria trocar um problema pequeno por um grande.
 * A falha vai para o log do servidor, onde o diagnóstico a encontra.
 */
export async function enfileirar(n: Notificacao): Promise<void> {
  try {
    const destino = n.destinatario?.trim();
    // Destino vazio não é erro de programa: é pessoa sem e-mail, que a
    // decisão 0004 permite. Enfileirar assim só encheria a fila de falhas.
    if (!destino) return;

    const { error } = await criarClienteServico()
      .from("notificacoes")
      .insert({
        pessoa_id: n.pessoaId ?? null,
        canal: n.canal,
        destino,
        template: n.template ?? null,
        variaveis: n.variaveis ?? null,
        assunto: n.assunto ?? null,
        corpo: n.corpo,
        chave_unica: n.chaveUnica ?? null,
      });

    // Violação de `chave_unica` é o comportamento DESEJADO: a mensagem já
    // estava na fila. Não é falha, e não vai para o log.
    if (error && error.code !== "23505") {
      console.error("[fila] não foi possível enfileirar:", error.message);
    }
  } catch (e) {
    console.error("[fila] não foi possível enfileirar:", e);
  }
}

/**
 * Cancela o que ainda não saiu, por chave.
 *
 * Existe para o estorno e o cancelamento de inscrição: sem isto, a pessoa que
 * teve a compra cancelada às 14h receberia às 15h o comprovante que já estava
 * na fila.
 */
export async function cancelarPendentes(chaveUnica: string): Promise<void> {
  try {
    await criarClienteServico()
      .from("notificacoes")
      .update({ status: "cancelada" })
      .eq("chave_unica", chaveUnica)
      .eq("status", "pendente");
  } catch (e) {
    console.error("[fila] não foi possível cancelar:", e);
  }
}

export interface ResultadoFila {
  processadas: number;
  falhas: number;
  /** Por que a fila não andou, quando não andou. */
  motivo?: string;
}

/**
 * Entrega o que está pendente. Chamada só pelo cron.
 *
 * ⚠️ Ainda não envia: o transporte (SMTP e WhatsApp) entra junto com o módulo
 * de comunicação. Até lá, a fila ACUMULA — que é o comportamento certo, e não
 * o mesmo que perder. Quando o transporte chegar, tudo que estiver pendente
 * sai na primeira rodada.
 *
 * O limite de 5 tentativas vive aqui e não no banco: mensagem que falhou cinco
 * vezes tem problema de destino, não de rede, e continuar tentando só esconde
 * o erro atrás de uma fila que nunca esvazia.
 */
export async function processarFila(): Promise<ResultadoFila> {
  const { count } = await criarClienteServico()
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente")
    .lt("tentativas", 5);

  return {
    processadas: 0,
    falhas: 0,
    motivo:
      count && count > 0
        ? `${count} mensagem(ns) esperando: o transporte de e-mail ainda não foi ligado.`
        : undefined,
  };
}
