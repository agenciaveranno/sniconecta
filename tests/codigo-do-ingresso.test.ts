import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O código do ingresso nasce no banco, e a porta sabe procurar por ele.
 *
 * ⚠️ Nada disto quebra o CI sozinho. Uma inscrição gravada sem código dá venda
 * certa, troco certo e relatório certo — o defeito aparece na porta, com a
 * pessoa segurando um ingresso que ninguém lê. E o exemplo mostrado ao
 * operador, se divergir do formato de verdade, ensina a digitar errado.
 */

const ACOES = readFileSync("src/modulos/eventos/acoes.ts", "utf8");
const CONSULTAS = readFileSync("src/modulos/eventos/consultas.ts", "utf8");
const PORTA = readFileSync("src/app/eventos/checkin/page.tsx", "utf8");

const MIGRACOES = readdirSync("supabase/migrations")
  .filter((a) => a.endsWith(".sql"))
  .map((a) => readFileSync(`supabase/migrations/${a}`, "utf8"))
  .join("\n");

/** O formato que a decisão 0021 fixou. */
const FORMATO = /^SNI-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

describe("quem gera o código é o banco", () => {
  it("a coluna tem default", () => {
    expect(MIGRACOES).toMatch(
      /alter column qr_code set default eventos\.novo_qr\(\)/
    );
  });

  it("a função que sorteia existe", () => {
    expect(MIGRACOES).toContain("create or replace function eventos.novo_qr()");
  });

  it("a aplicação NÃO escreve o código", () => {
    // ⚠️ Gerado também em TypeScript, o formato passaria a existir em dois
    // lugares: a venda, a transferência e o checkout teriam cada um a sua
    // cópia, e a primeira que divergisse produziria ingresso ilegível.
    //
    // ⚠️ A asserção olha os COMANDOS DE ESCRITA, e não o arquivo inteiro. A
    // primeira versão proibia `qr_code:` em qualquer lugar — e passou a
    // reprovar código correto no dia em que a venda começou a LER o código
    // para pôr no e-mail. Proibir a leitura nunca foi a regra.
    const colunasDeInsert = [...ACOES.matchAll(/insert into eventos\.\w+\s*\(([^)]*)\)/g)]
      .map((m) => m[1]);
    for (const colunas of colunasDeInsert) {
      expect(colunas, "insert escreve qr_code à mão").not.toContain("qr_code");
    }

    const atualizacoes = [...ACOES.matchAll(/update eventos\.\w+([\s\S]*?)`/g)].map((m) => m[1]);
    for (const corpo of atualizacoes) {
      expect(corpo, "update escreve qr_code à mão").not.toContain("qr_code");
    }

    // A lista de colunas do ajudante de inserção em lote (`tx(linhas, "a", "b")`).
    expect(ACOES, "qr_code na lista de colunas do insert em lote")
      .not.toContain('"qr_code"');
  });

  it("o backfill não reescreve o que já tem código", () => {
    // Reescrever os códigos da carga invalidaria ingressos que já circularam.
    const update = MIGRACOES.slice(MIGRACOES.indexOf("update eventos.inscricoes"));
    expect(update.slice(0, 300)).toContain("where qr_code is null");
  });
});

describe("a porta acha pelo código", () => {
  it("a consulta procura por qr_code e por número do convite", () => {
    expect(CONSULTAS).toContain("upper(i.qr_code) = ${busca.documento}");
    expect(CONSULTAS).toContain("upper(i.numero_convite) = ${busca.documento}");
  });

  it("existe índice para a busca, senão a porta varre a tabela", () => {
    expect(MIGRACOES).toMatch(/create index[^;]*on eventos\.inscricoes \(upper\(qr_code\)\)/);
  });

  it("o código volta na linha, para o operador conferir com o papel", () => {
    expect(CONSULTAS).toMatch(/i\.qr_code\s*$/m);
    expect(PORTA).toContain("i.qr_code");
  });
});

describe("o exemplo na tela é do formato de verdade", () => {
  it("o placeholder da porta casa com o que o banco gera", () => {
    // ⚠️ Um exemplo fora do formato ensina o operador a digitar errado, e o
    // erro volta como "não encontrei" — que ele vai ler como ingresso falso.
    const exemplo = PORTA.match(/placeholder="([^",]+)/)?.[1];
    expect(exemplo, "não achei placeholder na porta — o extrator cegou").toBeTruthy();
    expect(exemplo!, `o exemplo "${exemplo}" não é do formato da decisão 0021`)
      .toMatch(FORMATO);
  });

  it("a decisão 0021 está escrita", () => {
    const doc = readFileSync("docs/decisoes/0021-o-codigo-do-ingresso.md", "utf8");
    expect(doc).toContain("SNI-XXXX-XXXX-XXXX-XXXX");
  });
});

describe("a capacidade que não libera nada deixou de existir", () => {
  it("eventos.configurar saiu da matriz e do menu", () => {
    const permissoes = readFileSync("src/lib/permissoes.ts", "utf8");
    const registro = readFileSync("src/modulos/registro.ts", "utf8");
    // A nota que explica a ausência pode citar o nome; o que não pode é ele
    // voltar a ser um valor da união ou um item de lista.
    expect(permissoes).not.toMatch(/\|\s*"eventos\.configurar"/);
    expect(permissoes).not.toMatch(/^\s*"eventos\.configurar",/m);
    expect(registro).not.toMatch(/capacidade: "eventos\.configurar"/);
  });
});
