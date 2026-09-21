import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O combo sai do cadastro e chega ao banco inteiro.
 *
 * ⚠️ É a fatia em que o erro NÃO APARECE. Um combo que se perde no caminho não
 * derruba nada: a venda é aceita, o troco é dado, e o que falta só se descobre
 * na porta, no dia, com a pessoa segurando o comprovante do pacote que ela
 * pagou. Typecheck, teste de domínio e build passam por cima disso — o nome de
 * um campo de formulário e o nome de uma coluna num `insert` são texto para
 * todos eles.
 *
 * Este teste lê as duas pontas de cada emenda e confere que elas casam.
 */

const ACOES = readFileSync("src/modulos/eventos/acoes.ts", "utf8");
const CONSULTAS = readFileSync("src/modulos/eventos/consultas.ts", "utf8");
const TELA = readFileSync("src/app/eventos/venda/page.tsx", "utf8");

/** O corpo de uma função exportada, do `export async function` ao próximo. */
function corpoDe(fonte: string, nome: string): string {
  const inicio = fonte.indexOf(`export async function ${nome}(`);
  expect(inicio, `não achei ${nome} — o extrator cegou`).toBeGreaterThan(-1);
  const resto = fonte.slice(inicio + 1);
  const fim = resto.indexOf("\nexport ");
  return fim === -1 ? resto : resto.slice(0, fim);
}

const VENDER = corpoDe(ACOES, "venderNoBalcao");

describe("o combo escolhido na tela chega à venda", () => {
  it("a tela e a ação usam o MESMO prefixo de campo", () => {
    // ⚠️ Prefixos diferentes não quebram nada: o campo chega, ninguém o lê, e
    // a venda sai cobrando só os avulsos. A pessoa paga o combo e leva os
    // ingressos que couberam no resto do formulário.
    const naTela = TELA.match(/name=\{`(\w+_)\$\{/g) ?? [];
    const naAcao = VENDER.match(/chave\.startsWith\("(\w+_)"\)/g) ?? [];
    const so = (achados: string[]) =>
      [...new Set(achados.map((m) => m.match(/(\w+_)/)![1]))].sort();

    expect(so(naTela), "a tela não emite campo nenhum — o extrator cegou")
      .toEqual(["combo_", "qtd_"]);
    expect(so(naAcao), "a ação não lê campo nenhum — o extrator cegou")
      .toEqual(["combo_", "qtd_"]);
  });

  it("o corte do prefixo bate com o tamanho dele", () => {
    // `chave.slice(4)` para "qtd_" e `chave.slice(6)` para "combo_": um
    // número errado aqui transforma o id em NaN, e o combo some em silêncio.
    for (const [prefixo, corte] of [["qtd_", 4], ["combo_", 6]] as const) {
      const trecho = VENDER.slice(VENDER.indexOf(`startsWith("${prefixo}")`));
      expect(trecho.slice(0, 200), `corte errado em ${prefixo}`)
        .toContain(`chave.slice(${corte})`);
    }
  });

  it("a linha gravada carrega combo_id", () => {
    // Sem a coluna no `insert`, as inscrições do pacote nascem soltas: o
    // relatório não sabe que saíram de um combo, e a contagem de pacotes
    // vendidos volta a zero para sempre.
    expect(VENDER).toContain("combo_id: l.comboId");
    expect(VENDER).toMatch(/"ingresso_tipo_id",\s*"combo_id"/);
  });
});

describe("o cupom não desconta duas vezes", () => {
  it("a consulta do cupom lê combo_id", () => {
    // ⚠️ Sem a coluna no select, `conferirCupom` recebe o campo indefinido e
    // trata cupom de combo como cupom geral — descontando o carrinho inteiro.
    const select = VENDER.slice(VENDER.indexOf("from eventos.cupons") - 400);
    expect(select.slice(0, 400)).toContain("combo_id");
  });

  it("o que vai para a conta do cupom são os avulsos, não o carrinho todo", () => {
    const chamada = VENDER.slice(VENDER.indexOf("conferirCupom("));
    expect(chamada.slice(0, 300)).toContain("avulsos.map(");
    expect(chamada.slice(0, 300)).not.toContain("conferido.itens");
  });
});

describe("as travas são pedidas sempre na mesma ordem", () => {
  it("combo antes de ingresso, e cada tabela por id", () => {
    // ⚠️ Duas tabelas travadas em ordens diferentes por duas vendas
    // simultâneas param as duas até o banco matar uma por impasse — com a fila
    // na frente do operador, e sem nada no log que explique.
    const pedacos = VENDER.split("for update");
    expect(pedacos.length, "não achei trava nenhuma — o extrator cegou")
      .toBeGreaterThan(2);
    const travadas = pedacos.slice(0, -1).map((p) => {
      const achados = [...p.matchAll(/from\s+(eventos\.\w+)/g)];
      return achados[achados.length - 1]?.[1];
    });
    expect(travadas.slice(0, 2)).toEqual(["eventos.combos", "eventos.ingresso_tipos"]);
    // ⚠️ A LINHA inteira, e não o texto solto. O comentário que explica esta
    // regra, três linhas acima no arquivo vigiado, contém as palavras "order
    // by id" — com `toContain` ele satisfazia o teste sozinho, e apagar o
    // `order by id` do SQL passava verde.
    for (const p of pedacos.slice(0, 2)) {
      expect(p, "trava sem `order by id`").toMatch(/^\s*order by id\s*$/m);
    }
  });

  it("os tipos travados incluem os que o combo entrega", () => {
    // Travar só os avulsos deixaria o estoque de dentro do pacote sem trava:
    // duas vendas do mesmo combo passariam as duas pelo último lugar.
    expect(VENDER).toContain("conferidoCombo.itensExpandidos.map((i) => i.tipoId)");
  });
});

describe("a consulta dos combos existe uma vez só", () => {
  it("a venda reusa a leitura da tela em vez de copiar o SQL", () => {
    // ⚠️ Foi assim que `tiposParaVenda` acabou com uma cópia dentro da
    // transação: duas cópias divergem na primeira correção, e o balcão passa a
    // recusar o que a tela ofereceu.
    expect(VENDER).toContain("lerCombosParaVenda(tx");
    expect(VENDER).toContain("lerTiposParaVenda(tx");
    expect(VENDER, "SQL de combo copiado para dentro da ação")
      .not.toContain("from eventos.combo_itens");
  });

  it("a leitura dos combos não esconde o inativo", () => {
    // Filtrado no SQL, o combo desativado entre a tela e o envio sumiria — e a
    // recusa sairia como "não pertence a este evento", mandando o operador
    // procurar o combo no evento errado.
    const leitura = corpoDe(CONSULTAS, "lerCombosParaVenda");
    expect(leitura).not.toMatch(/where c\.evento_id = \$\{eventoId\} and c\.ativo/);
  });
});
