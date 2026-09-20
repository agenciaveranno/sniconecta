import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O AGENTS.md manda: "Server Action e rota de API começam com
 * `exigirCapacidade(...)` na primeira linha. O guard do layout não protege
 * endpoint."
 *
 * ⚠️ É a regra mais fácil de esquecer e a mais cara de esquecer. Server Action
 * é um ENDPOINT: o navegador de qualquer pessoa autenticada pode chamá-la
 * direto, sem passar pela tela que a desenhou. Uma ação sem porteiro apaga
 * conta bancária de Regional para quem só deveria ver o telefone — e o layout,
 * que confere capacidade para MOSTRAR a página, não é chamado nesse caminho.
 */

/** Ações exportadas de um arquivo "use server", com o corpo de cada uma. */
function acoesDe(conteudo: string): { nome: string; corpo: string }[] {
  const achadas: { nome: string; corpo: string }[] = [];
  const re = /export\s+async\s+function\s+(\w+)\s*\([^)]*\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(conteudo)) !== null) {
    // Até a próxima exportação (ou o fim): basta para ver a primeira linha útil.
    const resto = conteudo.slice(m.index + m[0].length);
    const fim = resto.search(/\nexport\s/);
    achadas.push({ nome: m[1], corpo: fim === -1 ? resto : resto.slice(0, fim) });
  }
  return achadas;
}

describe("toda Server Action tem porteiro", () => {
  const arquivos = globSync("src/**/*.ts").filter((a) =>
    readFileSync(a, "utf-8").startsWith('"use server"')
  );

  it("enxerga os arquivos de ação que deveria", () => {
    // Sem isto, um erro de leitura faria a asserção abaixo passar por lista
    // vazia — e o defeito voltaria calado.
    expect(arquivos.length).toBeGreaterThan(5);
  });

  it("nenhuma ação exportada começa sem conferir a capacidade", () => {
    // ⚠️ As exceções são NOMEADAS, uma a uma, e cada uma diz por que pode. Uma
    // lista de padrões deixaria a próxima ação entrar de carona.
    const liberadas = new Set([
      // Entrar e sair não podem exigir capacidade: quem as chama ainda não tem
      // sessão nenhuma. Elas se protegem sozinhas, pelo Supabase Auth.
      "entrar",
      "sair",
      "definirPrimeiraSenha",
      "trocarMinhaSenha",
      "resgatarConvite",
    ]);

    const culpados: string[] = [];
    for (const a of arquivos) {
      for (const { nome, corpo } of acoesDe(readFileSync(a, "utf-8"))) {
        if (liberadas.has(nome)) continue;
        // A primeira instrução com código (comentário não conta) tem de ser a
        // do porteiro.
        const primeira = corpo
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"))[0];
        if (!primeira?.includes("exigirCapacidade")) culpados.push(`${a}:${nome}`);
      }
    }
    expect(culpados).toEqual([]);
  });
});
