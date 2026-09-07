import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A migração NUNCA escreve na origem.
 *
 * ⚠️ Por que isto é um teste e não uma recomendação. A base do Credenciamento
 * está NO AR: pessoas comprando ingresso enquanto a carga roda. Um `UPDATE`
 * acidental ali não corrompe um rascunho — derruba a venda de quem está no
 * checkout naquele minuto, e não há como desfazer.
 *
 * A recomendação de sempre é usar um usuário somente leitura no MySQL, e ela
 * continua valendo. Mas depender só disso é depender de alguém ter criado o
 * usuário certo — e quem não criou não recebe aviso nenhum. Este teste vale
 * mesmo quando a conexão é de administrador: se algum dia entrar escrita no
 * script, o CI reprova antes de qualquer execução.
 */
describe("carga do Credenciamento", () => {
  const codigo = readFileSync("scripts/migrar-mysql.ts", "utf8");

  it("só usa a conexão de origem para consultar e para fechar", () => {
    const usos = [...codigo.matchAll(/\borigem\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(usos)].sort()).toEqual(["end", "query"]);
  });

  it("toda consulta à origem começa com SELECT", () => {
    const consultas = [...codigo.matchAll(/origem\.query(?:<[^>]*>)?\(\s*([`"'])([\s\S]*?)\1/g)]
      .map((m) => m[2].trim());
    expect(consultas.length).toBeGreaterThan(0);
    for (const c of consultas) expect(c).toMatch(/^SELECT\b/i);
  });

  it("não há comando de escrita de MySQL em lugar nenhum do script", () => {
    // Cobre o caso em que alguém monte a consulta fora de `origem.query(`.
    const proibidos = /\b(INSERT\s+INTO\s+`|UPDATE\s+`|DELETE\s+FROM\s+`|TRUNCATE|DROP\s+TABLE)/i;
    expect(codigo).not.toMatch(proibidos);
  });
});

/**
 * O script CARREGA.
 *
 * ⚠️ Parece bobo e não é. A primeira execução real da carga morreu antes de
 * ler uma linha, com "Top-level await is currently not supported with the cjs
 * output format" — erro de COMPILAÇÃO, não de execução. `tsc --noEmit`
 * passava, os testes passavam, o build passava: nada disso executa o script.
 *
 * Rodar sem as variáveis de ambiente prova que o arquivo compila e chega até
 * a primeira decisão, sem tocar em banco nenhum.
 */
describe("o script de carga", () => {
  it("carrega e recusa começar sem as conexões", () => {
    let saida = "";
    let codigo = 0;
    try {
      saida = execFileSync("npx", ["tsx", "scripts/migrar-mysql.ts", "--dry-run"], {
        encoding: "utf8",
        env: { ...process.env, MIGRACAO_MYSQL_URL: "", DATABASE_URL: "" },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      const erro = e as { status?: number; stdout?: string; stderr?: string };
      codigo = erro.status ?? 1;
      saida = `${erro.stdout ?? ""}${erro.stderr ?? ""}`;
    }
    expect(saida).toContain("Nada foi lido nem gravado");
    expect(saida).not.toMatch(/Transform failed|not supported/i);
    expect(codigo).toBe(1);
  });
});
