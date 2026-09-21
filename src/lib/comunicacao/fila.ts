import "server-only";
import { criarClienteServico } from "@/lib/supabase/service";
import { abrirTransporte } from "./email";

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
 * Quantas por rodada. O cron é diário e a função tem prazo: uma fila grande
 * entregue de uma vez estoura o limite no meio, e o que ficou pela metade
 * volta a ser pendente — o que está certo, mas nunca acaba de sair.
 */
const POR_RODADA = 50;

/** Cinco tentativas. Ver a nota em `processarFila`. */
const MAXIMO_TENTATIVAS = 5;

/**
 * Entrega o que está pendente. Chamada só pelo cron.
 *
 * O limite de tentativas vive aqui e não no banco: mensagem que falhou cinco
 * vezes tem problema de destino, não de rede, e continuar tentando só esconde
 * o erro atrás de uma fila que nunca esvazia.
 *
 * ⚠️ SMTP não configurado NÃO é falha, e não gasta tentativa. É o estado
 * normal de um sistema recém-instalado, e a fila ACUMULA — que é o
 * comportamento certo, e não o mesmo que perder. Gastar as cinco tentativas
 * enquanto ninguém preencheu o servidor de envio apagaria, em cinco dias,
 * tudo que estava esperando por ele.
 */
export async function processarFila(): Promise<ResultadoFila> {
  const supabase = criarClienteServico();

  const { data: pendentes, error } = await supabase
    .from("notificacoes")
    .select("id, canal, destino, assunto, corpo, tentativas")
    .eq("status", "pendente")
    .lt("tentativas", MAXIMO_TENTATIVAS)
    .order("criado_em", { ascending: true })
    .limit(POR_RODADA);

  if (error) return { processadas: 0, falhas: 0, motivo: error.message };
  if (!pendentes || pendentes.length === 0) return { processadas: 0, falhas: 0 };

  const transporte = await abrirTransporte();
  if (!transporte) {
    return {
      processadas: 0,
      falhas: 0,
      motivo: `${pendentes.length} mensagem(ns) esperando: o servidor de envio ainda não foi preenchido em Configurações.`,
    };
  }

  let processadas = 0;
  let falhas = 0;

  for (const n of pendentes) {
    // ⚠️ RESERVA ANTES DE ENVIAR, comparando o número de tentativas que foi
    // lido. Se outra rodada já pegou esta linha, o `update` não acha nada e
    // esta passa adiante — sem isto, o cron agendado e o botão "processar
    // agora" mandariam a mesma mensagem duas vezes. Conversa de WhatsApp é
    // cobrada, e e-mail repetido é o que faz gente marcar como spam.
    const { data: reservada } = await supabase
      .from("notificacoes")
      .update({ tentativas: n.tentativas + 1 })
      .eq("id", n.id)
      .eq("status", "pendente")
      .eq("tentativas", n.tentativas)
      .select("id")
      .maybeSingle();
    if (!reservada) continue;

    // ⚠️ WhatsApp ainda não tem transporte. A linha fica PENDENTE e sem gastar
    // tentativa — marcá-la como falha apagaria, em cinco rodadas, mensagens
    // que só esperam o canal existir.
    if (n.canal !== "email") {
      await supabase
        .from("notificacoes")
        .update({ tentativas: n.tentativas, ultimo_erro: "Canal ainda sem transporte." })
        .eq("id", n.id);
      continue;
    }

    const r = await transporte.enviar({
      para: n.destino,
      assunto: n.assunto ?? "SNI Conecta",
      corpo: n.corpo,
    });

    if (r.enviou) {
      processadas++;
      await supabase
        .from("notificacoes")
        .update({ status: "enviada", enviado_em: new Date().toISOString(), ultimo_erro: null })
        .eq("id", n.id);
    } else {
      falhas++;
      const acabou = n.tentativas + 1 >= MAXIMO_TENTATIVAS;
      await supabase
        .from("notificacoes")
        // Só vira `falhou` na última: antes disso ela continua pendente, para
        // a rodada seguinte tentar de novo.
        .update({ status: acabou ? "falhou" : "pendente", ultimo_erro: r.motivo.slice(0, 500) })
        .eq("id", n.id);
    }
  }

  return {
    processadas,
    falhas,
    motivo: falhas > 0 ? `${falhas} falha(s) — ver \`ultimo_erro\` na fila.` : undefined,
  };
}
