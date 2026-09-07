/**
 * Onde a senha recém-gerada espera até ser mostrada, uma única vez.
 *
 * ⚠️ Cookie, e não `?ok=` na URL: endereço fica na barra do navegador, no
 * histórico, no cabeçalho Referer de tudo que a página carregar e no log de
 * acesso de qualquer intermediário. `path` restrito à rota de pessoas,
 * `httpOnly` para o script da página não alcançá-lo, e um minuto de vida —
 * passado isso ela some sozinha, mesmo que ninguém a leia.
 *
 * ⚠️ Módulo à parte porque `actions.ts` é `"use server"`, e arquivo com essa
 * diretiva só exporta função assíncrona. Uma constante ali derruba o build —
 * que é como este erro apareceu.
 */
export const COOKIE_SENHA = "sni-senha-gerada";
