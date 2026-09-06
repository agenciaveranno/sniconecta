import "server-only";
import { criarClienteServico } from "@/lib/supabase/service";

/**
 * Registra na trilha. **Nunca lança.**
 *
 * A trilha existe para responder "quem fez o quê, e quando" — e uma falha ao
 * gravá-la não pode desfazer o que a pessoa acabou de fazer. Uma matrícula que
 * volta atrás porque a auditoria caiu seria um problema maior que a lacuna na
 * trilha.
 *
 * ⚠️ `detalhe` NUNCA carrega senha, chave de API ou CPF de terceiro. A
 * pergunta que a trilha responde não precisa do valor — precisa do ator, do
 * alvo e do momento. Guardar o valor transformaria a auditoria num depósito
 * de dado sensível que ninguém protege como tal.
 */
export async function registrar(evento: {
  atorId?: string | null;
  acao: string;
  entidade?: string;
  entidadeId?: string;
  detalhe?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  try {
    await criarClienteServico().from("auditoria").insert({
      pessoa_id: evento.atorId ?? null,
      acao: evento.acao,
      entidade: evento.entidade ?? null,
      entidade_id: evento.entidadeId ?? null,
      detalhe: evento.detalhe ?? null,
      ip: evento.ip ?? null,
    });
  } catch (e) {
    console.error("[auditoria] não foi possível registrar:", evento.acao, e);
  }
}
