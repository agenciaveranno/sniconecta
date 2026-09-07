import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O Next substitui `process.env.NEXT_PUBLIC_*` no pacote do navegador em tempo
 * de compilação, procurando a referência LITERAL no código. `process.env[nome]`
 * — com a chave vindo de uma variável — não é encontrado, e o navegador recebe
 * `undefined` mesmo com tudo configurado na hospedagem.
 *
 * É uma falha cruel: o servidor continua funcionando, os testes passam, o
 * build passa, e só quebra no navegador de quem clicou no link. Foi assim que
 * um convite chegou e não abriu.
 *
 * Este teste é mecânico de propósito. Não há tipo nem lint que pegue isso, e a
 * forma errada é mais curta que a certa — é o tipo de atalho que volta.
 */
describe("leitura de variáveis de ambiente", () => {
  const fontes = [
    "src/lib/supabase/ambiente.ts",
    "src/lib/supabase/client.ts",
    "src/lib/supabase/server.ts",
    "src/proxy.ts",
  ];

  it.each(fontes)("%s lê process.env por nome literal, nunca por índice", (arquivo) => {
    const codigo = readFileSync(arquivo, "utf8");
    // Ignora a linha do próprio comentário que explica a armadilha.
    const ocorrencias = codigo
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
      .filter((l) => /process\.env\s*\[/.test(l));
    expect(ocorrencias).toEqual([]);
  });
});
