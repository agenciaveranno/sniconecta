import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * `src/lib/cripto.ts` importa `server-only`, que estoura fora de um contexto
 * de servidor do Next. O `vi.mock` não alcança um import estático de módulo
 * sem transformar o arquivo, então o caminho limpo é importar dinamicamente
 * depois de neutralizar o guard — e é só isso que este alias faz.
 */
async function carregar() {
  return import("@/lib/cripto");
}

const CHAVE = "uma-chave-de-testes-com-mais-de-32-caracteres";

describe("cifragem de credencial", () => {
  let anterior: string | undefined;

  beforeEach(() => {
    anterior = process.env.CREDENCIAIS_ENCRYPTION_KEY;
    process.env.CREDENCIAIS_ENCRYPTION_KEY = CHAVE;
  });
  afterEach(() => {
    if (anterior === undefined) delete process.env.CREDENCIAIS_ENCRYPTION_KEY;
    else process.env.CREDENCIAIS_ENCRYPTION_KEY = anterior;
  });

  it("o que entra é o que volta", async () => {
    const { cifrar, decifrar } = await carregar();
    const senha = "S3nh@ do Office 365 — com acento e espaço";
    expect(decifrar(cifrar(senha))).toBe(senha);
  });

  it("a mesma senha cifra diferente a cada vez", async () => {
    // IV aleatório. Sem isso, duas localidades com a mesma senha teriam o
    // mesmo texto cifrado no banco, e comparar as linhas já entregaria a
    // informação de que são iguais.
    const { cifrar } = await carregar();
    expect(cifrar("igual")).not.toBe(cifrar("igual"));
  });

  it("texto adulterado é recusado, não decifrado em lixo", async () => {
    // É por isto que o modo é GCM e não CBC: quem consegue ESCREVER no banco
    // poderia trocar a senha cifrada por outra e redirecionar os envios.
    const { cifrar, decifrar } = await carregar();
    const guardado = cifrar("original");
    const partes = guardado.split(".");
    // Vira o último caractere do texto cifrado.
    const ultimo = partes[3].slice(-1) === "A" ? "B" : "A";
    partes[3] = partes[3].slice(0, -1) + ultimo;
    expect(() => decifrar(partes.join("."))).toThrow();
  });

  it("recusa formato desconhecido em vez de adivinhar", async () => {
    const { decifrar } = await carregar();
    expect(() => decifrar("senha-em-claro")).toThrow(/formato desconhecido/i);
    expect(() => decifrar("v9.a.b.c")).toThrow(/formato desconhecido/i);
  });

  it("chave de outro sistema não decifra", async () => {
    const { cifrar } = await carregar();
    const guardado = cifrar("segredo");
    process.env.CREDENCIAIS_ENCRYPTION_KEY = "outra-chave-igualmente-longa-para-testes";
    const { decifrar } = await carregar();
    expect(() => decifrar(guardado)).toThrow();
  });

  describe("sem chave utilizável", () => {
    it("estoura em vez de guardar em claro", async () => {
      delete process.env.CREDENCIAIS_ENCRYPTION_KEY;
      const { cifrar, cifragemDisponivel } = await carregar();
      expect(cifragemDisponivel()).toBe(false);
      expect(() => cifrar("x")).toThrow(/CREDENCIAIS_ENCRYPTION_KEY/);
    });

    it("chave curta é recusada — atacar a frase curta é o caminho fácil", async () => {
      process.env.CREDENCIAIS_ENCRYPTION_KEY = "curta";
      const { cifragemDisponivel } = await carregar();
      expect(cifragemDisponivel()).toBe(false);
    });
  });
});
