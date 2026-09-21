import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Toda coluna que a carga escreve tem de existir no banco.
 *
 * ⚠️ Já custou duas execuções em produção: a fase `pessoas` mandava um campo
 * `endereco` que o esquema não tem, e parava na primeira linha. O ensaio nunca
 * pega isso — ele não executa SQL nenhum, então um nome de coluna errado passa
 * despercebido até a hora de gravar. E como a carga interrompe as fases
 * seguintes, o erro da fase 2 só apareceria depois de consertar o da fase 1,
 * uma execução por vez.
 *
 * Este teste lê as duas pontas e compara. É estático, roda em milissegundos, e
 * vê TODAS as fases de uma vez — inclusive as que ainda não rodaram.
 */

const PALAVRAS = new Set([
  "constraint", "primary", "unique", "foreign", "check", "exclude", "like", "references",
]);

/** tabela → colunas, lido de `create table` e `alter table … add column`. */
function colunasDoBanco(): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  const dir = "supabase/migrations";
  for (const arquivo of readdirSync(dir).sort()) {
    if (!arquivo.endsWith(".sql")) continue;
    const sql = readFileSync(`${dir}/${arquivo}`, "utf8");

    for (const m of sql.matchAll(/create table (?:if not exists )?([\w.]+)\s*\(([\s\S]*?)\n\);/g)) {
      const tabela = m[1].includes(".") ? m[1] : `public.${m[1]}`;
      const cols = mapa.get(tabela) ?? new Set<string>();
      for (const linha of m[2].split("\n")) {
        const c = linha.match(/^\s{2,}([a-z_][a-z0-9_]*)\s+\S/);
        if (c && !PALAVRAS.has(c[1])) cols.add(c[1]);
      }
      mapa.set(tabela, cols);
    }

    for (const m of sql.matchAll(/alter table\s+([\w.]+)\s+add column\s+(?:if not exists\s+)?([a-z_][a-z0-9_]*)/g)) {
      const tabela = m[1].includes(".") ? m[1] : `public.${m[1]}`;
      const cols = mapa.get(tabela) ?? new Set<string>();
      cols.add(m[2]);
      mapa.set(tabela, cols);
    }
  }
  return mapa;
}

/**
 * Cada inserção do script, nas DUAS formas que ele usa:
 *
 *  · uma linha por vez — `insert into tabela (a, b, c) values (...)`
 *  · em lote — `insert into tabela ${destino(lote, "a", "b", "c")}`
 *
 * ⚠️ A segunda forma existe porque dezesseis mil idas e voltas pelo pooler
 * levam mais de uma hora. Quando ela entrou, este teste PAROU de enxergar as
 * duas maiores inserções da carga e passou calado, com dois testes a menos —
 * é por isso que as colunas do lote são escritas à mão em vez de deduzidas do
 * primeiro objeto: para continuarem visíveis daqui.
 */
function insercoesDaCarga(): { tabela: string; colunas: string[] }[] {
  const script = readFileSync("scripts/migrar-mysql.ts", "utf8");

  const uma = [...script.matchAll(/insert into ([\w.]+)\s*\(([^)]*)\)/g)].map((m) => ({
    tabela: m[1].includes(".") ? m[1] : `public.${m[1]}`,
    colunas: m[2].split(",").map((c) => c.trim()).filter((c) => /^[a-z_][a-z0-9_]*$/.test(c)),
  }));

  const lote = [...script.matchAll(/insert into ([\w.]+)\s*\$\{([^}]*)\}/g)].map((m) => ({
    tabela: m[1].includes(".") ? m[1] : `public.${m[1]}`,
    colunas: [...m[2].matchAll(/"([a-z_][a-z0-9_]*)"/g)].map((c) => c[1]),
  }));

  return [...uma, ...lote].filter((i) => i.colunas.length > 0);
}

describe("as colunas que a carga escreve", () => {
  const banco = colunasDoBanco();
  const insercoes = insercoesDaCarga();

  it("o parser achou as tabelas e as inserções", () => {
    // Se um dia o formato do SQL mudar e o parser não achar nada, o teste
    // passaria vazio e diria que está tudo bem. Esta asserção é o pé no chão.
    expect(banco.get("public.pessoas")?.has("cpf")).toBe(true);
    expect(banco.get("public.pessoas")?.has("passaporte")).toBe(true);
    expect(insercoes.length).toBeGreaterThan(8);
    // ⚠️ As duas maiores inserções da carga são em LOTE. Se o parser deixar de
    // reconhecê-las, este teste passaria vazio justamente onde mais importa.
    expect(insercoes.some((i) => i.tabela === "public.pessoas")).toBe(true);
    expect(insercoes.some((i) => i.tabela === "public.pessoa_unidade_vinculos")).toBe(true);
  });

  for (const { tabela, colunas } of insercoesDaCarga()) {
    it(`${tabela}: toda coluna existe no esquema`, () => {
      const existentes = banco.get(tabela);
      expect(existentes, `tabela ${tabela} não foi encontrada nas migrações`).toBeTruthy();
      const faltando = colunas.filter((c) => !existentes!.has(c));
      expect(faltando, `${tabela} não tem: ${faltando.join(", ")}`).toEqual([]);
    });
  }
});
