import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ⚠️ Procurar coluna vazia com `.match({ coluna: null })` ou `.eq(coluna, null)`
 * NÃO procura por vazio. O PostgREST traduz os dois para `coluna=eq.null`, e o
 * Postgres lê `null` como TEXTO: a consulta morre com
 * `invalid input syntax for type uuid: "null"`.
 *
 * Foi assim que a tela de Configurações passou a dar erro 500 em produção: a
 * credencial do SMTP é da instituição, e as três colunas de dono são vazias.
 * O erro não aparece em `npm test` nem em `npm run build` — só quando alguém
 * abre a tela —, então quem o pega é este teste, lendo o código.
 *
 * Vazio se procura com `.is(coluna, null)`.
 */
function fontes(): string[] {
  return globSync("src/**/*.{ts,tsx}");
}

/**
 * O código sem os comentários.
 *
 * ⚠️ Sem isto o guarda acusa a própria explicação: o comentário que descreve o
 * erro escreve `.match({ coluna: null })` de propósito, e um guarda que reprova
 * quem o documenta ensina a não documentar.
 */
function semComentarios(codigo: string): string {
  return codigo
    .split("\n")
    .filter((linha) => {
      const util = linha.trim();
      return !util.startsWith("*") && !util.startsWith("//") && !util.startsWith("/*");
    })
    .join("\n");
}

/** O texto entre os parênteses de cada `.match(` do arquivo. */
function argumentosDeMatch(codigo: string): string[] {
  const achados: string[] = [];
  const marca = ".match(";
  let de = codigo.indexOf(marca);
  while (de !== -1) {
    let profundidade = 0;
    let i = de + marca.length - 1;
    for (; i < codigo.length; i++) {
      if (codigo[i] === "(") profundidade++;
      else if (codigo[i] === ")") {
        profundidade--;
        if (profundidade === 0) break;
      }
    }
    achados.push(codigo.slice(de + marca.length, i));
    de = codigo.indexOf(marca, i);
  }
  return achados;
}

describe("consulta ao Supabase", () => {
  it("nunca procura coluna vazia com .match({ coluna: null })", () => {
    const culpados: string[] = [];
    for (const arquivo of fontes()) {
      const codigo = semComentarios(readFileSync(arquivo, "utf-8"));
      for (const argumento of argumentosDeMatch(codigo)) {
        if (/\bnull\b/.test(argumento)) culpados.push(`${arquivo}: .match(${argumento})`);
      }
    }
    expect(culpados).toEqual([]);
  });

  it("nunca procura coluna vazia com .eq(coluna, null)", () => {
    const culpados: string[] = [];
    for (const arquivo of fontes()) {
      const codigo = readFileSync(arquivo, "utf-8");
      // Fora de comentário: a linha não pode começar com * nem //.
      for (const linha of codigo.split("\n")) {
        const util = linha.trim();
        if (util.startsWith("*") || util.startsWith("//")) continue;
        if (/\.eq\([^)]*,\s*null\s*\)/.test(util)) culpados.push(`${arquivo}: ${util}`);
      }
    }
    expect(culpados).toEqual([]);
  });

  it("enxerga os arquivos que deveria — senão passaria vazio", () => {
    // ⚠️ Um teste que não lê arquivo nenhum passa sempre. Esta asserção é o que
    // impede o guarda inteiro de virar enfeite quando o caminho mudar.
    const lidos = fontes();
    expect(lidos).toContain("src/lib/credenciais.ts");
    expect(lidos.length).toBeGreaterThan(20);
  });
});
