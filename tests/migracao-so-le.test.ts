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
