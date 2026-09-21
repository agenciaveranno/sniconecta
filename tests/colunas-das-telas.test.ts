import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Toda coluna que as TELAS do módulo leem tem de existir no banco.
 *
 * ⚠️ É o buraco que os outros testes não cobrem. `colunas-da-carga` confere o
 * script de migração; os testes de domínio conferem as regras puras. As
 * consultas do módulo `eventos` falam Postgres direto e só falham quando
 * alguém ABRE A TELA — em produção, porque não há banco no CI para exercitá-las.
 *
 * Um nome de coluna errado aqui não quebra typecheck, não quebra teste e não
 * quebra build: quebra a venda balcão com a fila na frente do operador.
 *
 * Este teste lê as duas pontas e compara, em milissegundos e sem banco.
 */

const PALAVRAS = new Set([
  "constraint", "primary", "unique", "foreign", "check", "exclude", "like", "references",
]);

/** tabela → colunas, de `create table` e `alter table … add column`. */
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

    // ⚠️ `\s+` e não um espaço só: as migrações ALINHAM o nome da tabela
    // (`alter table tipos_local   add column …`), e a versão com espaço único
    // deixava de enxergar a coluna — acusando de inexistente uma que existe.
    for (const m of sql.matchAll(
      /alter table\s+([\w.]+)\s+add column\s+(?:if not exists\s+)?([a-z_][a-z0-9_]*)/g
    )) {
      const tabela = m[1].includes(".") ? m[1] : `public.${m[1]}`;
      const cols = mapa.get(tabela) ?? new Set<string>();
      cols.add(m[2]);
      mapa.set(tabela, cols);
    }
  }
  return mapa;
}

/**
 * Os comandos SQL escritos nos arquivos do módulo.
 *
 * ⚠️ O genérico entra no padrão (`sql<Linha[]>\``): sem ele, o extrator não
 * casava com NENHUMA consulta tipada — que são quase todas — e o teste passava
 * verde vigiando zero.
 */
function blocosSql(texto: string): string[] {
  return [...texto.matchAll(/\b(?:sql|tx|destino)(?:<[^`]*?>)?`([\s\S]*?)`/g)].map((m) => m[1]);
}

const NAO_E_APELIDO = new Set([
  "on", "where", "set", "group", "order", "using", "left", "join", "inner", "outer", "for",
]);

const ARQUIVOS = ["src/modulos/eventos/consultas.ts", "src/modulos/eventos/acoes.ts"];

describe("as colunas que as telas leem existem no banco", () => {
  it("toda referência apelidada casa com uma coluna de verdade", () => {
    const banco = colunasDoBanco();
    const erradas: string[] = [];
    let conferidas = 0;

    for (const arquivo of ARQUIVOS) {
      for (const bloco of blocosSql(readFileSync(arquivo, "utf8"))) {
        // `from public.pessoas p` / `join eventos.eventos e` → p → public.pessoas
        const apelidos = new Map<string, string>();
        for (const m of bloco.matchAll(/\b(?:from|join)\s+([\w.]+)\s+(?:as\s+)?([a-z][a-z0-9_]*)\b/g)) {
          const tabela = m[1].includes(".") ? m[1] : `public.${m[1]}`;
          if (!NAO_E_APELIDO.has(m[2])) apelidos.set(m[2], tabela);
        }

        for (const [apelido, tabela] of apelidos) {
          const colunas = banco.get(tabela);
          // Tabela que o parser não conhece não vira acusação: seria acusar o
          // próprio parser de não ter lido o `create table`.
          if (!colunas) continue;
          for (const m of bloco.matchAll(new RegExp(`\\b${apelido}\\.([a-z_][a-z0-9_]*)`, "g"))) {
            conferidas++;
            if (!colunas.has(m[1])) erradas.push(`${tabela}.${m[1]} (como ${apelido}.${m[1]})`);
          }
        }
      }
    }

    // ⚠️ Afirma que ENXERGOU. Sem isto, um extrator que parasse de casar
    // passaria verde vigiando zero referência — que foi exatamente o que
    // aconteceu na primeira versão deste teste.
    expect(conferidas, "não conferi referência nenhuma — o extrator cegou").toBeGreaterThan(200);
    expect(erradas, `colunas que o banco não tem: ${erradas.join(", ")}`).toEqual([]);
  });

  it("enxerga as tabelas do módulo, e não só as comuns", () => {
    const banco = colunasDoBanco();
    expect(banco.get("eventos.inscricoes")?.has("checkin_em")).toBe(true);
    expect(banco.get("eventos.ingresso_tipos")?.has("unico_por_cpf")).toBe(true);
    expect(banco.get("eventos.cupons")?.has("max_usos_por_cpf")).toBe(true);
    // Coluna acrescentada por `alter table` com espaços alinhados.
    expect(banco.get("public.tipos_local")?.has("aceita_conta_cielo")).toBe(true);
  });
});
