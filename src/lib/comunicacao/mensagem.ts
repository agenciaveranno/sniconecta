/**
 * Como um texto vira e-mail.
 *
 * ⚠️ Regra pura, e a parte que mais dá errado sem ninguém ver: o corpo é
 * escrito por gente, e vai parar dentro de HTML. Um nome com `&` ou um
 * comentário com `<` viram marcação — e o que chega na caixa de entrada é meia
 * mensagem, ou uma mensagem com um link que ninguém escreveu.
 *
 * Aqui não há rede, nem SMTP, nem banco: é o único pedaço do envio que dá para
 * testar de verdade, e por isso ele existe separado do transporte.
 */

/** ⚠️ `&` PRIMEIRO: escapá-lo depois desfaria os escapes seguintes. */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * O remetente no formato que o SMTP espera.
 *
 * ⚠️ O nome vai entre ASPAS e com as aspas internas escapadas. Um remetente
 * chamado `SEICHO-NO-IE "SNI"` sem isso quebra o cabeçalho ao meio, e o
 * servidor recusa a mensagem inteira com um erro de sintaxe que não menciona
 * o nome.
 */
export function remetente(nome: string, email: string): string {
  const limpo = nome.trim().replace(/[\r\n]/g, " ").replace(/"/g, '\\"');
  return `"${limpo}" <${email.trim()}>`;
}

/**
 * ⚠️ O assunto NÃO pode ter quebra de linha. Uma quebra no meio do assunto
 * termina o cabeçalho e transforma o resto em cabeçalhos novos — é assim que
 * se injeta um `Bcc:` numa mensagem que ninguém revisou.
 */
export function assuntoSeguro(assunto: string): string {
  return assunto.replace(/[\r\n]+/g, " ").trim().slice(0, 200);
}

/**
 * O HTML da mensagem, a partir do texto puro.
 *
 * ⚠️ Texto puro é a fonte, e o HTML é derivado — nunca o contrário. A fila
 * guarda `corpo` em texto porque é o que o WhatsApp também usa, e porque é o
 * que sobra legível quando o cliente de e-mail recusa o HTML.
 */
export function corpoHtml(texto: string): string {
  const paragrafos = texto
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escaparHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return [
    '<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;',
    'background:#F8F9FB;font-family:system-ui,-apple-system,sans-serif;',
    'font-size:15px;line-height:1.5;color:#1A1F2E">',
    '<div style="max-width:560px;margin:0 auto;background:#fff;padding:24px;',
    'border-radius:12px;border:1px solid #D9DDE6">',
    paragrafos,
    "</div></body></html>",
  ].join("");
}
