import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { enderecoPublico } from "@/lib/endereco";

/**
 * O que está em jogo aqui é o link impresso no certificado. Ele fica em papel
 * e em PDF por anos, então "quase certo" não serve: endereço errado é um
 * documento que ninguém consegue conferir, e não há como corrigir os que já
 * foram entregues.
 */
describe("endereço público do sistema", () => {
  const guardadas: Record<string, string | undefined> = {};
  const CHAVES = ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL"];

  beforeEach(() => {
    for (const k of CHAVES) {
      guardadas[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of CHAVES) {
      if (guardadas[k] === undefined) delete process.env[k];
      else process.env[k] = guardadas[k];
    }
  });

  it("a variável explícita vence", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://ciclo.snibrasil.org.br";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "sistema-ciclo.vercel.app";
    expect(enderecoPublico()).toBe("https://ciclo.snibrasil.org.br");
  });

  it("sem domínio próprio, usa o endereço de produção da Vercel", () => {
    // É o que dispensa configuração enquanto não há domínio: o certificado
    // nasce com link válido em vez de nascer com link quebrado.
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "sistema-ciclo.vercel.app";
    expect(enderecoPublico()).toBe("https://sistema-ciclo.vercel.app");
  });

  it("não duplica o esquema quando a variável já vem com ele", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "https://sistema-ciclo.vercel.app";
    expect(enderecoPublico()).toBe("https://sistema-ciclo.vercel.app");
  });

  it("tira a barra final — o link é montado com barra do outro lado", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://ciclo.org.br/";
    expect(enderecoPublico()).toBe("https://ciclo.org.br");
  });

  it("sem nenhuma das duas, devolve vazio em vez de inventar", () => {
    // Vazio é o que o diagnóstico transforma em achado. Chutar um domínio
    // aqui produziria certificados com link errado, que é pior do que
    // certificado com link ausente: o errado parece funcionar.
    expect(enderecoPublico()).toBe("");
  });

  it("valor em branco não conta como definido", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "   ";
    expect(enderecoPublico()).toBe("");
  });
});
