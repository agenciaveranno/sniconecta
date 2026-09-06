import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Credencial guardada no banco vai cifrada. AES-256-GCM e não CBC porque o
 * GCM AUTENTICA: quem consegue escrever no banco não consegue trocar a
 * credencial cifrada por outra e redirecionar envios. IV aleatório por
 * operação: duas linhas com a mesma senha não ficam iguais.
 *
 * Formato: `v1.<iv>.<tag>.<texto>` em base64url. O prefixo de versão existe
 * para o dia em que o algoritmo mudar. Sem a chave, a operação estoura:
 * nunca grava em claro.
 */
const VERSAO = "v1";

function chave(): Buffer {
  const segredo = process.env.CREDENCIAIS_ENCRYPTION_KEY;
  if (!segredo || segredo.length < 32) {
    throw new Error("CREDENCIAIS_ENCRYPTION_KEY ausente ou curta (mínimo 32 caracteres): credenciais não podem ser guardadas.");
  }
  return createHash("sha256").update(segredo).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chave(), iv);
  const corpo = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const b64 = (b: Buffer) => b.toString("base64url");
  return `${VERSAO}.${b64(iv)}.${b64(tag)}.${b64(corpo)}`;
}

export function decifrar(cifrado: string): string {
  const [versao, iv, tag, corpo] = cifrado.split(".");
  if (versao !== VERSAO || !iv || !tag || !corpo) {
    throw new Error("Credencial guardada num formato que este sistema não reconhece.");
  }
  const decipher = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(corpo, "base64url")), decipher.final()]).toString("utf8");
}
