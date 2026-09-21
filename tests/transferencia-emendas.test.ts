import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A transferência entre eventos, das duas pontas.
 *
 * ⚠️ É a operação com mais jeito de dar certo estando errada: a tela confirma,
 * a pessoa vai embora satisfeita, e o que sobrou de errado aparece semanas
 * depois — na porta do evento novo, ou na fila da tesouraria, ou num relatório
 * de arrecadação que não fecha com o caixa.
 */

const ACOES = readFileSync("src/modulos/eventos/acoes.ts", "utf8");
const TELA = readFileSync("src/app/eventos/transferir/page.tsx", "utf8");

function corpoDe(fonte: string, nome: string): string {
  const inicio = fonte.indexOf(`export async function ${nome}(`);
  expect(inicio, `não achei ${nome} — o extrator cegou`).toBeGreaterThan(-1);
  const resto = fonte.slice(inicio + 1);
  const fim = resto.indexOf("\nexport ");
  return fim === -1 ? resto : resto.slice(0, fim);
}

const TRANSFERIR = corpoDe(ACOES, "transferirEntreEventos");

describe("o ingresso novo não herda o código do velho", () => {
  it("a inserção não copia qr_code", () => {
    // ⚠️ Dois ingressos com o mesmo código deixam a porta sem saber qual vale:
    // ela acha os dois, e o operador escolhe no chute. O código novo nasce do
    // default do banco (decisão 0021).
    expect(TRANSFERIR, "a transferência está copiando o qr_code")
      .not.toMatch(/qr_code\s*[,)]/);
    expect(TRANSFERIR).not.toContain("linha.qr_code");
  });
});

describe("as duas pontas ficam amarradas", () => {
  it("a velha vira 'transferido' e aponta para a nova", () => {
    // ⚠️ Apagar a velha perderia o rastro: o comprovante antigo circulou, e
    // alguém chega na porta com ele. A porta precisa dizer "foi transferida,
    // vale a nova" em vez de "não encontrei".
    expect(TRANSFERIR).toContain("status = 'transferido'");
    expect(TRANSFERIR).toContain("transferido_para_id = ${nova.id}");
  });

  it("a nova aponta de volta para a velha", () => {
    expect(TRANSFERIR).toContain("transferido_de_id");
  });

  it("a gravação é guardada pela situação anterior", () => {
    // Se alguém cancelou ou transferiu entre a conferência e a gravação, o
    // comando não acha linha — em vez de sobrescrever o que o outro fez e
    // deixar duas inscrições novas vivas.
    expect(TRANSFERIR).toMatch(/where id = \$\{id\} and status = \$\{linha\.status\}/);
  });
});

describe("transferir consome vaga como vender", () => {
  it("trava o estoque do ingresso de destino", () => {
    const antes = TRANSFERIR.slice(0, TRANSFERIR.indexOf("for update", TRANSFERIR.indexOf("ingresso_tipos")));
    expect(antes, "o estoque de destino não é travado").toContain("eventos.ingresso_tipos");
  });

  it("aplica as MESMAS regras da venda ao destino", () => {
    // ⚠️ Sem isto, a transferência é a porta dos fundos do balcão: entra num
    // ingresso esgotado, ou num "um por pessoa" que a pessoa já tem.
    expect(TRANSFERIR).toContain("conferirVenda(");
    expect(TRANSFERIR).toContain("exige_principal");
  });
});

describe("a fila de estorno recebe o valor, não um recálculo", () => {
  it("a transferência registra quanto deve ser devolvido", () => {
    // ⚠️ Recalcular devolveria o ingresso INTEIRO de quem continua indo a um
    // evento: o que se deve, quando o destino é mais barato, é só a sobra.
    expect(TRANSFERIR).toContain("'valor_centavos', ${acerto.estornoCentavos}");
  });

  it("o cancelamento também registra", () => {
    const cancelar = corpoDe(ACOES, "cancelarInscricao");
    expect(cancelar).toContain("'valor_centavos', ${devolver}");
  });

  it("e a fila lê o registrado", () => {
    const fila = readFileSync("src/app/eventos/estornos/page.tsx", "utf8");
    expect(fila).toContain("valorNaFila(");
  });
});

describe("a tela e a ação falam a mesma língua", () => {
  it("todo campo que a ação lê é emitido pela tela", () => {
    const lidos = [...TRANSFERIR.matchAll(/formData\.get\("(\w+)"\)/g)].map((m) => m[1]);
    expect(lidos.length, "a ação não lê campo nenhum — o extrator cegou")
      .toBeGreaterThan(4);
    for (const campo of new Set(lidos)) {
      expect(TELA, `a tela não emite o campo "${campo}"`)
        .toMatch(new RegExp(`name="${campo}"`));
    }
  });

  it("campo em branco é decisão pendente, não zero", () => {
    // ⚠️ Tratar vazio como zero faria a casa absorver a diferença por omissão:
    // o operador confirma sem reparar no campo, e a arrecadação some sem
    // ninguém ter escolhido isso.
    expect(TRANSFERIR).toContain('cobradoBruto === "" ? null');
    expect(TRANSFERIR).toMatch(/cobrado === null/);
  });
});
