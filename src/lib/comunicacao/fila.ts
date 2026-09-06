import "server-only";

/**
 * Fila de notificações: UMA para a plataforma inteira.
 *
 * Contrato: `enfileirar()` grava em `notificacoes` e NUNCA lança
 * (comunicação é acessório do fluxo principal); `processarFila()` envia o
 * que está pendente, no máximo 5 tentativas, `chave_unica` impede duplicata.
 *
 * ⚠️ A implementação vem do módulo `ciclo` (src/lib/comunicacao/ do sistema
 * existente), junto com a tabela `notificacoes` e os provedores (SMTP,
 * Resend, WhatsApp). Este arquivo só fixa o contrato para o módulo `eventos`
 * já programar contra ele.
 */
export interface Notificacao {
  canal: "email" | "whatsapp";
  destinatario: string;
  assunto?: string;
  corpo: string;
  chaveUnica?: string;
  pessoaId?: string | null;
}

export async function enfileirar(n: Notificacao): Promise<void> {
  // TODO(ciclo): gravar em `notificacoes`. Nunca lançar.
  void n;
}

export async function processarFila(): Promise<{ processadas: number; falhas: number }> {
  // TODO(ciclo): trazer o processador real.
  return { processadas: 0, falhas: 0 };
}
