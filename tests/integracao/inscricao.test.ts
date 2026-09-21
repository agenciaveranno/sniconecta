import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

/**
 * Check-in, cancelamento e transferência, contra um Postgres de verdade.
 *
 * ⚠️ São as três escritas que mexem no que já foi vendido — e cada uma tem um
 * comando SQL que nunca tinha sido executado: o `jsonb_build_object` que grava
 * o valor do estorno, a trava em duas tabelas da transferência, a guarda
 * `where status = <o de antes>` que impede duas telas de se sobrescreverem.
 * Nada disso o typecheck olha.
 */

class Redirecionou extends Error {
  constructor(readonly para: string) {
    super(`redirect: ${para}`);
  }
}

vi.mock("@/lib/auth", () => ({ exigirCapacidade: async () => ({ id: null }) }));
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
const ULTIMO_DA_SEMENTE = 9408;

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
}

async function rodar(
  acao: (f: FormData) => Promise<void>,
  campos: Record<string, string>
): Promise<URL> {
  try {
    await acao(formulario(campos));
  } catch (e) {
    if (e instanceof Redirecionou) return new URL(e.para, "http://x");
    throw e;
  }
  throw new Error("a ação não redirecionou — todas redirecionam");
}

describe.skipIf(!temBanco)("o que acontece depois da venda", () => {
  let conexao: typeof import("@/lib/db").conexao;
  let acoes: typeof import("@/modulos/eventos/acoes");

  beforeAll(async () => {
    ({ conexao } = await import("@/lib/db"));
    acoes = await import("@/modulos/eventos/acoes");
  });

  afterAll(async () => {
    // Desfaz tudo o que esta suíte criou ou mexeu, para ela poder rodar de
    // novo sem derrubar o banco.
    await conexao()`delete from eventos.inscricoes where id > ${ULTIMO_DA_SEMENTE}`;
    await conexao()`
      update eventos.inscricoes
         set checkin_em = null, status = 'pago', estorno_status = null,
             transferido_para_id = null, transferido_em = null
       where id = 9402
    `;
    await conexao().end();
  });

  it("registra a entrada e recusa a segunda", async () => {
    const primeira = await rodar(acoes.registrarCheckin, {
      evento_id: String(EVENTO),
      id: "9402",
      busca: "Yoko",
    });
    expect(primeira.searchParams.get("erro")).toBeNull();

    const [linha] = await conexao()<{ checkin_em: Date | null }[]>`
      select checkin_em from eventos.inscricoes where id = 9402
    `;
    expect(linha.checkin_em, "a entrada não foi gravada").not.toBeNull();

    // ⚠️ A segunda tem de ser recusada PELO BANCO, e não só pela tela: duas
    // pessoas na porta, na mesma inscrição, chegam as duas com a tela
    // dizendo "pode entrar".
    const segunda = await rodar(acoes.registrarCheckin, {
      evento_id: String(EVENTO),
      id: "9402",
      busca: "Yoko",
    });
    expect(segunda.searchParams.get("erro")).toBeTruthy();
  });

  it("desfaz a entrada registrada por engano", async () => {
    const volta = await rodar(acoes.desfazerCheckin, {
      evento_id: String(EVENTO),
      id: "9402",
      busca: "Yoko",
    });
    expect(volta.searchParams.get("erro")).toBeNull();
    const [linha] = await conexao()<{ checkin_em: Date | null }[]>`
      select checkin_em from eventos.inscricoes where id = 9402
    `;
    expect(linha.checkin_em).toBeNull();
  });

  it("cancelar abre estorno com o valor REGISTRADO", async () => {
    // Cria uma inscrição só para cancelar, para não mexer na semente.
    const [nova] = await conexao()<{ id: number }[]>`
      insert into eventos.inscricoes
        (pessoa_id, evento_id, ingresso_tipo_id, tipo_venda, status,
         valor_original_centavos, desconto_centavos)
      values ('aaaa0000-0000-0000-0000-000000000004', ${EVENTO}, 9001,
              'balcao', 'pago', 10000, 2000)
      returning id
    `;

    const volta = await rodar(acoes.cancelarInscricao, {
      id: String(nova.id),
      motivo: "pedido da pessoa",
      busca: "Carlos",
    });
    expect(volta.searchParams.get("erro")).toBeNull();

    const [linha] = await conexao()<
      { status: string; estorno_status: string | null; estorno: { valor_centavos?: number } | null }[]
    >`
      select status, estorno_status, estorno from eventos.inscricoes where id = ${nova.id}
    `;
    expect(linha.status).toBe("cancelado");
    expect(linha.estorno_status).toBe("pendente");
    // ⚠️ 10.000 − 2.000 de desconto: a fila deve R$ 80, não R$ 100.
    expect(linha.estorno?.valor_centavos).toBe(8000);

    // ⚠️ E o segundo clique não pode reabrir o estorno: `where status <>
    // 'cancelado'` na própria gravação é o que impede a mesma devolução de
    // entrar duas vezes na fila da tesouraria.
    const denovo = await rodar(acoes.cancelarInscricao, {
      id: String(nova.id),
      motivo: "de novo",
      busca: "Carlos",
    });
    // A frase que sai é a de `podeCancelar` ("já está cancelada"), e não a do
    // guarda `where status <> 'cancelado'` ("já estava") — que só se alcança
    // numa corrida de verdade, com as duas telas passando pela conferência
    // antes de qualquer uma gravar. As duas recusam; aqui vale qualquer uma.
    expect(denovo.searchParams.get("erro")).toMatch(/já est(á|ava) cancelada/);
  });

  it("cancelar cortesia não abre estorno de dinheiro que ninguém pagou", async () => {
    // ⚠️ A carga trouxe cortesias COM valor de tabela preenchido. Sem a regra,
    // cancelar uma delas põe na fila da tesouraria uma devolução sem
    // contrapartida.
    const [nova] = await conexao()<{ id: number }[]>`
      insert into eventos.inscricoes
        (pessoa_id, evento_id, ingresso_tipo_id, tipo_venda, status,
         valor_original_centavos, desconto_centavos)
      values ('aaaa0000-0000-0000-0000-000000000004', ${EVENTO}, 9001,
              'cortesia', 'pago', 10000, 0)
      returning id
    `;
    await rodar(acoes.cancelarInscricao, {
      id: String(nova.id),
      motivo: "não vai",
      busca: "Carlos",
    });
    const [linha] = await conexao()<{ estorno_status: string | null }[]>`
      select estorno_status from eventos.inscricoes where id = ${nova.id}
    `;
    expect(linha.estorno_status).toBeNull();
  });

  it("transferir move a inscrição e amarra as duas pontas", async () => {
    const [destino] = await conexao()<{ id: number }[]>`
      with e as (
        insert into eventos.eventos (nome, data_inicial, data_final, promotor_unidade_id)
        values ('Evento de Destino', now(), now(),
                (select id from unidades where tipo = 'regional' limit 1))
        returning id
      ) select id from e
    `;
    const [tipo] = await conexao()<{ id: number }[]>`
      with t as (
        insert into eventos.ingresso_tipos (evento_id, nome, valor_centavos, papel)
        values (${destino.id}, 'Inteira do Destino', 6000, 'principal')
        returning id
      ) select id from t
    `;
    const [origem] = await conexao()<{ id: number }[]>`
      with i as (
        insert into eventos.inscricoes
          (pessoa_id, evento_id, ingresso_tipo_id, tipo_venda, status,
           valor_original_centavos, desconto_centavos)
        values ('aaaa0000-0000-0000-0000-000000000004', ${EVENTO}, 9001,
                'balcao', 'pago', 10000, 0)
        returning id
      ) select id from i
    `;

    const volta = await rodar(acoes.transferirEntreEventos, {
      id: String(origem.id),
      novo_evento_id: String(destino.id),
      novo_tipo_id: String(tipo.id),
      motivo: "mudou de data",
    });
    expect(volta.searchParams.get("erro")).toBeNull();

    const [velha] = await conexao()<
      {
        status: string; transferido_para_id: number | null;
        estorno_status: string | null; estorno: { valor_centavos?: number } | null;
      }[]
    >`
      select status, transferido_para_id, estorno_status, estorno
        from eventos.inscricoes where id = ${origem.id}
    `;
    expect(velha.status).toBe("transferido");
    expect(velha.transferido_para_id).not.toBeNull();
    // ⚠️ Destino mais barato (R$ 60 contra R$ 100 pagos): a SOBRA vai para a
    // fila, e é só a sobra — não o ingresso inteiro de quem continua indo.
    expect(velha.estorno_status).toBe("pendente");
    expect(velha.estorno?.valor_centavos).toBe(4000);

    const [nova] = await conexao()<
      { evento_id: number; transferido_de_id: number | null; qr_code: string | null; v: number }[]
    >`
      select evento_id, transferido_de_id, qr_code, valor_original_centavos as v
        from eventos.inscricoes where id = ${velha.transferido_para_id}
    `;
    expect(nova.evento_id).toBe(destino.id);
    expect(nova.transferido_de_id).toBe(origem.id);
    expect(nova.v).toBe(6000);
    // ⚠️ Código PRÓPRIO, não copiado: dois ingressos com o mesmo código
    // deixariam a porta sem saber qual vale.
    expect(nova.qr_code).toMatch(/^SNI-/);

    await conexao()`delete from eventos.inscricoes where evento_id = ${destino.id}`;
    await conexao()`delete from eventos.ingresso_tipos where evento_id = ${destino.id}`;
    await conexao()`delete from eventos.eventos where id = ${destino.id}`;
  });

  it("quem já entrou não é transferido nem cancelado", async () => {
    // ⚠️ Apagaria uma presença que aconteceu: o relatório do evento passaria a
    // dizer que entrou menos gente do que entrou.
    const semTransferir = await rodar(acoes.transferirEntreEventos, {
      id: "9401",
      novo_evento_id: String(EVENTO),
      novo_tipo_id: "9002",
      motivo: "tentativa",
    });
    expect(semTransferir.searchParams.get("erro")).toContain("já entrou");

    const semCancelar = await rodar(acoes.cancelarInscricao, {
      id: "9401",
      motivo: "tentativa",
      busca: "Maria",
    });
    expect(semCancelar.searchParams.get("erro")).toContain("já entrou");
  });
});
