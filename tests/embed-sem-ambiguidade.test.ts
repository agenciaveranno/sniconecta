import { readFileSync, globSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ⚠️ O PostgREST recusa um embed quando há MAIS DE UMA chave estrangeira entre
 * as duas tabelas — ele não escolhe por conta própria. `papeis` aponta duas
 * vezes para `pessoas`: `pessoa_id` (de quem é o papel) e `concedido_por`
 * (quem o deu). O embed `papeis(...)` sem dizer qual derrubou `pessoaAtual()`,
 * que roda em TODA página do painel — e o painel inteiro ficou fora do ar por
 * cinco dias.
 *
 * ⚠️ NENHUM outro teste alcança isto: typecheck e vitest não falam com banco, e
 * o harness de RLS usa SQL puro, não PostgREST. Este lê o esquema das migrações
 * e o embed do código, e confronta os dois — que é a única forma de pegar a
 * classe sem subir um PostgREST.
 */

const SQL = globSync("supabase/migrations/*.sql")
  .sort()
  .map((f) => readFileSync(f, "utf-8"))
  .join("\n");

/** Quantas vezes `filha` aponta para `mae`, somando create table e alter. */
function quantasChaves(filha: string, mae: string): number {
  let total = 0;

  // `create table filha ( ... coluna uuid references mae(id) ... )`
  const corpo = SQL.match(new RegExp(`create table ${filha}\\s*\\(([\\s\\S]*?)\\n\\);`, "i"));
  if (corpo) {
    total += (corpo[1].match(new RegExp(`references\\s+${mae}\\s*\\(`, "gi")) ?? []).length;
  }

  // `alter table filha add column coluna uuid references mae(id)`
  const alteracoes = SQL.match(
    new RegExp(`alter table ${filha}[\\s\\S]{0,400}?references\\s+${mae}\\s*\\(`, "gi")
  ) ?? [];
  total += alteracoes.length;

  return total;
}

/** Os embeds de cada `.from(...).select(...)` do código. */
function embedsDoCodigo(): { arquivo: string; de: string; embed: string; desambiguado: boolean }[] {
  const achados: { arquivo: string; de: string; embed: string; desambiguado: boolean }[] = [];
  const CONSULTA = /\.from\(\s*"(\w+)"[^)]*\)[\s\S]{0,200}?\.select\(\s*"([^"]*)"/g;

  for (const arquivo of globSync("src/**/*.{ts,tsx}")) {
    const codigo = readFileSync(arquivo, "utf-8");
    for (const m of codigo.matchAll(CONSULTA)) {
      const [, de, selecao] = m;
      // `tabela(` ou `tabela!chave(` — o `!` é a desambiguação.
      for (const e of selecao.matchAll(/(\w+)(!\w+)?\s*\(/g)) {
        achados.push({ arquivo, de, embed: e[1], desambiguado: Boolean(e[2]) });
      }
    }
  }
  return achados;
}

describe("embed do PostgREST", () => {
  it("enxerga o esquema: papeis aponta DUAS vezes para pessoas", () => {
    // ⚠️ Sem esta asserção o guarda abaixo passaria vazio para sempre se a
    // leitura das migrações quebrasse — que é o modo de falha de todo teste
    // que lê arquivo.
    expect(quantasChaves("papeis", "pessoas")).toBe(2);
    expect(quantasChaves("papeis", "unidades")).toBe(1);
  });

  it("enxerga o código: encontra o embed de pessoaAtual", () => {
    const todos = embedsDoCodigo();
    expect(todos.some((e) => e.de === "pessoas" && e.embed === "papeis")).toBe(true);
  });

  it("todo embed ambíguo diz qual chave usar", () => {
    const culpados = embedsDoCodigo()
      .filter((e) => !e.desambiguado && quantasChaves(e.embed, e.de) > 1)
      .map((e) => `${e.arquivo}: .from("${e.de}") … ${e.embed}(…)`);
    expect(culpados).toEqual([]);
  });
});
