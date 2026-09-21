import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

/**
 * A VENDA BALCÃO rodando contra um Postgres de verdade.
 *
 * ⚠️ É o código mais delicado do sistema e o que nunca tinha sido executado:
 * uma transação com travas em duas tabelas, conferência de estoque, cupom,
 * combo, rateio de desconto em centavos e um `insert` em lote. Cada um desses
 * passos é SQL que o typecheck não olha.
 *
 * ⚠️ E o que se prova aqui não é "não deu erro": é que o DINHEIRO FECHA. Depois
 * da venda, a soma de `valor_original − desconto` das linhas gravadas tem de
 * ser exatamente o que foi cobrado. Um rateio que perca um centavo passa em
 * qualquer teste que só olhe se a venda aconteceu.
 *
 * As três pontas que não são banco ficam de fora por mock, e só elas: a
 * sessão, o redirecionamento do Next e a fila de notificações. O miolo — a
 * transação inteira — é o de verdade.
 */

class Redirecionou extends Error {
  constructor(readonly para: string) {
    super(`redirect: ${para}`);
  }
}

vi.mock("@/lib/auth", () => ({
  exigirCapacidade: async () => ({ id: null }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirecionou(url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auditoria", () => ({ registrar: async () => {} }));
vi.mock("@/lib/comunicacao/fila", () => ({
  enfileirar: async () => {},
  cancelarPendentes: async () => {},
}));

const URL_TESTE = process.env.DATABASE_URL ?? "";
const temBanco = URL_TESTE.includes("127.0.0.1") || URL_TESTE.includes("localhost");

const EVENTO = 900;
const PESSOA = "aaaa0000-0000-0000-0000-000000000001";
const OUTRA = "aaaa0000-0000-0000-0000-000000000002";
// ⚠️ Sem inscrição nenhuma na semente. A venda de combo inclui o Jantar, que é
// "um por pessoa": feita para quem já o tem, ela é corretamente RECUSADA — e o
// teste passaria a provar o contrário do que quer.
const LIMPA = "aaaa0000-0000-0000-0000-000000000003";

/**
 * O maior `id` que a semente grava. Tudo acima disto foi esta suíte que criou.
 *
 * ⚠️ A limpeza do fim USA ESTE NÚMERO, e é o que torna a suíte re-executável
 * sem derrubar o banco. Na primeira versão ela apagava `id > 9500` — que não
 * casava com nada — e a segunda rodada encontrava a pessoa "limpa" já com o
 * ingresso que é um por pessoa, recusando uma venda que deveria passar.
 */
const ULTIMO_DA_SEMENTE = 9408;

/** O que a tela manda: um `qtd_<id>` por tipo, mais os campos do rodapé. */
function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
}

/** Roda a ação e devolve para onde ela redirecionou. */
async function vender(campos: Record<string, string>): Promise<URL> {
  const { venderNoBalcao } = await import("@/modulos/eventos/acoes");
  try {
    await venderNoBalcao(formulario(campos));
  } catch (e) {
    if (e instanceof Redirecionou) return new URL(e.para, "http://x");
    throw e;
  }
  throw new Error("a venda não redirecionou — ela sempre redireciona");
}

describe.skipIf(!temBanco)("a venda balcão, do formulário ao banco", () => {
  let conexao: typeof import("@/lib/db").conexao;

  beforeAll(async () => {
    ({ conexao } = await import("@/lib/db"));
  });

  afterAll(async () => {
    // Deixa o banco como estava, para a outra suíte não depender da ordem.
    await conexao()`delete from eventos.inscricoes where id > ${ULTIMO_DA_SEMENTE}`;
    await conexao().end();
  });

  it("vende um ingresso e grava o que cobrou", async () => {
    const volta = await vender({
      evento_id: String(EVENTO),
      pessoa_id: PESSOA,
      forma: "dinheiro",
      qtd_9001: "2",
    });
    expect(volta.searchParams.get("erro"), "a venda foi recusada").toBeNull();
    expect(volta.searchParams.get("ok")).toContain("2 ingresso(s)");

    const linhas = await conexao()<
      { valor_original_centavos: number; desconto_centavos: number; qr_code: string | null }[]
    >`
      select valor_original_centavos, desconto_centavos, qr_code
        from eventos.inscricoes
       where evento_id = ${EVENTO} and id > ${ULTIMO_DA_SEMENTE}
       order by id desc limit 2
    `;
    expect(linhas).toHaveLength(2);
    // ⚠️ O dinheiro fecha: 2 × R$ 100, sem desconto.
    const cobrado = linhas.reduce(
      (s, l) => s + l.valor_original_centavos - l.desconto_centavos,
      0
    );
    expect(cobrado).toBe(20000);
    // ⚠️ E cada linha nasceu com CÓDIGO, pelo default do banco (decisão 0021).
    for (const l of linhas) {
      expect(l.qr_code, "inscrição nasceu sem código").toMatch(
        /^SNI-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/
      );
    }
  });

  it("o desconto do cupom é repartido e fecha com o total", async () => {
    // ⚠️ É a conta que este módulo mais teme: um rateio com `Math.round` linha
    // a linha perde centavo, e o relatório deixa de fechar com o caixa por um
    // valor que ninguém acha de onde veio.
    const volta = await vender({
      evento_id: String(EVENTO),
      pessoa_id: PESSOA,
      forma: "pix",
      qtd_9001: "3",
      cupom: "VERAO10",
    });
    expect(volta.searchParams.get("erro")).toBeNull();

    const linhas = await conexao()<{ v: number; d: number }[]>`
      select valor_original_centavos as v, desconto_centavos as d
        from eventos.inscricoes
       where evento_id = ${EVENTO} and id > ${ULTIMO_DA_SEMENTE} and cupom_id is not null
       order by id desc limit 3
    `;
    expect(linhas).toHaveLength(3);
    // 3 × 10.000 = 30.000, menos 10% = 27.000. E as partes têm de SOMAR o
    // desconto exato: 3.000, nem 2.999 nem 3.001.
    expect(linhas.reduce((s, l) => s + l.d, 0)).toBe(3000);
    expect(linhas.reduce((s, l) => s + l.v - l.d, 0)).toBe(27000);
  });

  it("o cupom de combo é recusado, e nada é gravado", async () => {
    // ⚠️ Antes do #56, este cupom descontava o carrinho inteiro.
    const antes = await contar();
    const volta = await vender({
      evento_id: String(EVENTO),
      pessoa_id: PESSOA,
      forma: "dinheiro",
      qtd_9001: "1",
      cupom: "PACOTE20",
    });
    expect(volta.searchParams.get("erro")).toContain("combo");
    expect(await contar(), "a transação não foi desfeita").toBe(antes);
  });

  it("'um por pessoa' vale ENTRE compras, não só dentro de uma", async () => {
    // A pessoa 9402 já tem o Jantar (`unico_por_cpf`) na semente.
    const antes = await contar();
    const volta = await vender({
      evento_id: String(EVENTO),
      pessoa_id: OUTRA,
      forma: "dinheiro",
      qtd_9001: "1",
      qtd_9002: "1",
    });
    expect(volta.searchParams.get("erro")).toContain("um por pessoa");
    expect(await contar()).toBe(antes);
  });

  it("adicional não anda sozinho", async () => {
    const antes = await contar();
    const volta = await vender({
      evento_id: String(EVENTO),
      pessoa_id: PESSOA,
      forma: "dinheiro",
      qtd_9002: "1",
    });
    expect(volta.searchParams.get("erro")).toContain("principal");
    expect(await contar()).toBe(antes);
  });

  it("cortesia não cobra, e o valor de tabela entra zerado", async () => {
    // ⚠️ É o defeito que a carga trouxe e que este módulo corrigiu três vezes:
    // cortesia com valor preenchido infla a arrecadação e abre estorno de
    // dinheiro que ninguém pagou.
    const volta = await vender({
      evento_id: String(EVENTO),
      pessoa_id: PESSOA,
      forma: "cortesia",
      qtd_9001: "1",
      observacao: "convidada da Regional",
    });
    expect(volta.searchParams.get("ok")).toContain("cortesia");

    const [linha] = await conexao()<
      { v: number; d: number; tipo_venda: string; cortesia_motivo: string | null }[]
    >`
      select valor_original_centavos as v, desconto_centavos as d,
             tipo_venda, cortesia_motivo
        from eventos.inscricoes
       where evento_id = ${EVENTO} and id > ${ULTIMO_DA_SEMENTE} and tipo_venda = 'cortesia'
       order by id desc limit 1
    `;
    expect(linha.tipo_venda).toBe("cortesia");
    expect(linha.v).toBe(0);
    expect(linha.d).toBe(0);
    expect(linha.cortesia_motivo).toBe("convidada da Regional");
  });

  it("o combo desconta, e o desconto fica nas linhas dele", async () => {
    const volta = await vender({
      evento_id: String(EVENTO),
      pessoa_id: LIMPA,
      forma: "maquininha",
      combo_9201: "1",
    });
    expect(volta.searchParams.get("erro")).toBeNull();
    expect(volta.searchParams.get("ok")).toContain("(1 combo(s))");

    const linhas = await conexao()<{ v: number; d: number; combo_id: number | null }[]>`
      select valor_original_centavos as v, desconto_centavos as d, combo_id
        from eventos.inscricoes
       where evento_id = ${EVENTO} and id > ${ULTIMO_DA_SEMENTE} and combo_id = 9201
       order by id desc limit 2
    `;
    expect(linhas).toHaveLength(2);
    // Avulso 15.000, combo 12.000: o desconto é 3.000, repartido entre as duas.
    expect(linhas.reduce((s, l) => s + l.d, 0)).toBe(3000);
    expect(linhas.reduce((s, l) => s + l.v - l.d, 0)).toBe(12000);
  });

  it("estoque esgotado recusa, e não grava meia venda", async () => {
    const antes = await contar();
    const volta = await vender({
      evento_id: String(EVENTO),
      pessoa_id: PESSOA,
      forma: "dinheiro",
      qtd_9001: "999",
    });
    expect(volta.searchParams.get("erro")).toMatch(/disponível|esgotad/);
    expect(await contar(), "gravou parte da venda recusada").toBe(antes);
  });

  async function contar(): Promise<number> {
    const [{ n }] = await conexao()<{ n: number }[]>`
      select count(*)::int as n from eventos.inscricoes where evento_id = ${EVENTO}
    `;
    return n;
  }
});
