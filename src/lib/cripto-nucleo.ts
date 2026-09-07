import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * O NÚCLEO da cifra, sem `server-only`.
 *
 * ⚠️ Existe separado por uma razão prática: `server-only` só resolve dentro do
 * Next, e o script de carga é Node puro. Importar `cripto.ts` de lá quebra com
 * "Cannot find module 'server-only'" — no meio da migração, depois de cinco
 * fases terem rodado.
 *
 * Quem escreve código de aplicação continua importando `cripto.ts`, que
 * mantém a barreira. Este arquivo é para o que roda fora do Next.
 *
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
  // ⚠️ `trim()` é obrigatório e precisa ser IGUAL no outro sistema que cifra
  // com esta mesma chave. A chave é colada à mão num painel de hospedagem, e
  // uma quebra de linha invisível no fim muda o SHA-256 — o texto cifrado de
  // um lado deixa de abrir do outro, com um erro que fala em autenticação e
  // não em espaço em branco.
  const segredo = process.env.CREDENCIAIS_ENCRYPTION_KEY?.trim();
  if (!segredo || segredo.length < 32) {
    throw new Error("CREDENCIAIS_ENCRYPTION_KEY ausente ou curta (mínimo 32 caracteres): credenciais não podem ser guardadas.");
  }
  return createHash("sha256").update(segredo).digest();
}

/**
 * Diz se dá para cifrar, sem estourar.
 *
 * A tela de configurações precisa saber ANTES de oferecer o campo de senha:
 * sem chave, guardar credencial é impossível, e a pessoa que preencheu o
 * formulário inteiro receberia um erro só no fim.
 */
export function cifragemDisponivel(): boolean {
  try {
    chave();
    return true;
  } catch {
    return false;
  }
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
    // ⚠️ "formato desconhecido" e não "falha ao decifrar": o caso real é
    // credencial gravada em claro por algum caminho que escapou, ou cifrada
    // por uma versão futura. Confundir isso com chave errada mandaria quem
    // depura procurar no lugar errado.
    throw new Error(
      "Credencial guardada num formato desconhecido por este sistema — nada foi decifrado."
    );
  }
  const decipher = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(corpo, "base64url")), decipher.final()]).toString("utf8");
}
