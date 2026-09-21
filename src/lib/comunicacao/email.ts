import "server-only";
import nodemailer from "nodemailer";
import { abrirSegredo, lerCredencial } from "@/lib/credenciais";
import { assuntoSeguro, corpoHtml, remetente } from "./mensagem";

/**
 * O transporte de e-mail da fila.
 *
 * ⚠️ A CREDENCIAL É DA INSTITUIÇÃO, lida no ponto de uso, e o segredo é aberto
 * só aqui — nunca para mostrar em tela. É a mesma regra da conta Cielo: uma
 * vez exibido, o segredo está no histórico do navegador de alguém.
 *
 * ⚠️ E este módulo NÃO decide o que enviar. Ele recebe destino, assunto e
 * corpo e entrega; quem decide é a fila. Misturar as duas coisas faria cada
 * remetente novo reabrir a conexão e reler a credencial.
 */

export type ResultadoEnvio =
  | { enviou: true }
  | { enviou: false; motivo: string; configuravel: boolean };

type Transporte = {
  enviar(m: { para: string; assunto: string; corpo: string }): Promise<ResultadoEnvio>;
};

/**
 * Abre UMA conexão para a rodada inteira.
 *
 * ⚠️ Uma conexão por mensagem faz o servidor de envio tratar a rodada como
 * dezenas de logins seguidos — que é exatamente o padrão que provedor
 * bloqueia por suspeita de abuso, e o bloqueio dura horas.
 *
 * @returns `null` quando não há como enviar. Não lança: fila sem SMTP
 *   configurado é estado normal do sistema recém-instalado, não falha.
 */
export async function abrirTransporte(): Promise<Transporte | null> {
  const credencial = await lerCredencial("smtp", { instituicao: true });
  if (!credencial || !credencial.ativo) return null;

  const senha = await abrirSegredo("smtp", { instituicao: true });
  if (!senha) return null;

  const p = credencial.publico;
  const transporte = nodemailer.createTransport({
    host: p.host,
    port: p.porta,
    // ⚠️ `secure` é TLS DESDE O PRIMEIRO BYTE (porta 465). Na 587 o começo é
    // em claro e sobe com STARTTLS — marcar `secure` lá dá "conexão
    // encerrada" sem explicação nenhuma.
    secure: p.seguranca === "ssl",
    requireTLS: p.seguranca === "starttls",
    auth: { user: p.usuario, pass: senha },
    // A fila é diária: uma rodada que trave meia hora numa conexão morta
    // seguraria todas as outras mensagens atrás dela.
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  const de = remetente(p.remetente_nome, p.remetente_email);

  return {
    async enviar(m) {
      try {
        await transporte.sendMail({
          from: de,
          to: m.para,
          subject: assuntoSeguro(m.assunto),
          // ⚠️ Texto E html. Só HTML cai em filtro de spam com mais
          // facilidade, e some inteiro em cliente que recusa marcação.
          text: m.corpo,
          html: corpoHtml(m.corpo),
        });
        return { enviou: true };
      } catch (e) {
        return {
          enviou: false,
          motivo: e instanceof Error ? e.message : String(e),
          configuravel: false,
        };
      }
    },
  };
}
