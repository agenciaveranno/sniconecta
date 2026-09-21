import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

/**
 * O cadastro do módulo, do zero, contra um Postgres de verdade.
 *
 * ⚠️ São as últimas escritas do módulo que nunca tinham sido executadas. Elas
 * parecem simples — um `insert` por tela — e não são: o combo grava em DUAS
 * tabelas dentro de uma transação, as respostas apagam e reinserem, a marca do
 * comprovante escreve `jsonb`, e o cupom lê o valor de dois jeitos diferentes
 * conforme o tipo. Nada disso o typecheck olha.
 *
 * O teste segue a ordem de quem usa o sistema: cria um evento, põe ingresso,
 * combo, cupom e pergunta dentro, responde, monta a comissão, edita tudo e
 * desativa. Se algum passo quebrar, quebra onde a pessoa faria.
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

/** ⚠️ Nenhuma ação devolve o id: elas redirecionam. O id vem do banco. */
async function ultimo(
  sql: ReturnType<typeof import("@/lib/db").conexao>,
  tabela: string
): Promise<number> {
  const [linha] = await sql<{ id: number }[]>`
    select id from ${sql.unsafe(tabela)} order by id desc limit 1
  `;
  return linha.id;
}

describe.skipIf(!temBanco)("cadastrar um evento do zero", () => {
  let conexao: typeof import("@/lib/db").conexao;
  let a: typeof import("@/modulos/eventos/acoes");
  let eventoId = 0;
  let tipoId = 0;

  beforeAll(async () => {
    ({ conexao } = await import("@/lib/db"));
    a = await import("@/modulos/eventos/acoes");
  });

  afterAll(async () => {
    if (eventoId) {
      // ⚠️ O COMBO VEM ANTES. `combo_itens.ingresso_tipo_id` é `on delete
      // restrict`: apagar o evento tenta cascatear nos tipos de ingresso e o
      // banco RECUSA enquanto houver item de combo apontando para eles. Não é
      // defeito — é a garantia de que ninguém apaga um ingresso que um pacote
      // vendido prometia. (E apagar evento não é operação do sistema:
      // desativar é.)
      await conexao()`
        delete from eventos.combo_itens
         where combo_id in (select id from eventos.combos where evento_id = ${eventoId})
      `;
      await conexao()`delete from eventos.combos where evento_id = ${eventoId}`;
      await conexao()`delete from eventos.inscricoes where evento_id = ${eventoId}`;
      await conexao()`delete from eventos.eventos where id = ${eventoId}`;
    }
    await conexao().end();
  });

  it("cria o evento", async () => {
    const volta = await rodar(a.criarEvento, {
      nome: "Congresso de Integração",
      data_inicial: "2026-12-01",
      data_final: "2026-12-03",
      promotor: `unidade:${
        (await conexao()<{ id: string }[]>`select id from unidades where tipo='regional' limit 1`)[0].id
      }`,
    });
    expect(volta.searchParams.get("erro")).toBeNull();
    eventoId = await ultimo(conexao(), "eventos.eventos");
  });

  it("recusa término antes do início, com frase de gente", async () => {
    // ⚠️ "violates check constraint datas_coerentes" não diz a quem cadastra
    // que o término ficou antes do início.
    const volta = await rodar(a.criarEvento, {
      nome: "Evento Impossível",
      data_inicial: "2026-12-10",
      data_final: "2026-12-01",
    });
    expect(volta.searchParams.get("erro")).toContain("término não pode ser antes");
  });

  it("põe dois ingressos dentro", async () => {
    await rodar(a.criarTipoIngresso, {
      evento_id: String(eventoId),
      nome: "Inteira",
      papel: "principal",
      valor: "80,00",
      quantidade: "50",
      exibir_venda_publica: "on",
    });
    tipoId = await ultimo(conexao(), "eventos.ingresso_tipos");

    await rodar(a.criarTipoIngresso, {
      evento_id: String(eventoId),
      nome: "Almoço",
      papel: "adicional",
      valor: "35,00",
      unico_por_cpf: "on",
      exige_principal: "on",
    });

    const tipos = await conexao()<{ nome: string; valor_centavos: number }[]>`
      select nome, valor_centavos from eventos.ingresso_tipos
       where evento_id = ${eventoId} order by id
    `;
    // ⚠️ "80,00" tem de virar 8000, e não 80. `centavosDe` é quem sabe ler o
    // formato que a tela aceita.
    expect(tipos.map((t) => t.valor_centavos)).toEqual([8000, 3500]);
  });

  it("recusa idade máxima menor que a mínima", async () => {
    const volta = await rodar(a.criarTipoIngresso, {
      evento_id: String(eventoId),
      nome: "Faixa Torta",
      papel: "principal",
      valor: "10,00",
      idade_min: "30",
      idade_max: "10",
    });
    expect(volta.searchParams.get("erro")).toContain("idade máxima");
  });

  it("o combo grava nas duas tabelas, ou em nenhuma", async () => {
    const almoco = await ultimo(conexao(), "eventos.ingresso_tipos");
    await rodar(a.criarCombo, {
      evento_id: String(eventoId),
      nome: "Congresso + Almoço",
      valor: "100,00",
      [`item_${tipoId}`]: "1",
      [`item_${almoco}`]: "1",
    });
    const comboId = await ultimo(conexao(), "eventos.combos");
    const itens = await conexao()<{ n: number }[]>`
      select count(*)::int as n from eventos.combo_itens where combo_id = ${comboId}
    `;
    expect(itens[0].n, "o combo entrou sem os itens").toBe(2);

    // ⚠️ Combo SEM item é recusado na entrada: o banco aceitaria (os itens
    // moram em outra tabela) e quem comprasse pagaria por ingresso nenhum.
    const vazio = await rodar(a.criarCombo, {
      evento_id: String(eventoId),
      nome: "Combo Vazio",
      valor: "50,00",
    });
    expect(vazio.searchParams.get("erro")).toBeTruthy();
  });

  it("o cupom lê percentual e valor de jeitos diferentes", async () => {
    // ⚠️ Lidos do mesmo jeito, "10" viraria dez CENTAVOS num cupom de dez
    // reais.
    await rodar(a.criarCupom, {
      evento_id: String(eventoId),
      codigo: "dez",
      tipo: "percentual",
      valor: "10",
    });
    await rodar(a.criarCupom, {
      evento_id: String(eventoId),
      codigo: "QUINZE",
      tipo: "valor",
      valor: "15,00",
    });
    const cupons = await conexao()<{ codigo: string; valor: number }[]>`
      select codigo, valor from eventos.cupons where evento_id = ${eventoId} order by id
    `;
    expect(cupons[0]).toEqual({ codigo: "DEZ", valor: 10 });
    expect(cupons[1]).toEqual({ codigo: "QUINZE", valor: 1500 });
  });

  it("a pergunta guarda as alternativas, e a resposta guarda o rótulo de então", async () => {
    await rodar(a.criarPergunta, {
      evento_id: String(eventoId),
      ingresso_tipo_id: String(tipoId),
      rotulo: "Tamanho da camiseta",
      tipo: "selecao",
      opcoes: "P\nM\nG\nM",
      ordem: "1",
    });
    const campoId = await ultimo(conexao(), "eventos.ingresso_campos");
    const [campo] = await conexao()<{ opcoes: string[] }[]>`
      select opcoes from eventos.ingresso_campos where id = ${campoId}
    `;
    // A repetida não entra: viraria duas linhas iguais no relatório.
    expect(campo.opcoes).toEqual(["P", "M", "G"]);

    const [inscricao] = await conexao()<{ id: number }[]>`
      with i as (
        insert into eventos.inscricoes
          (pessoa_id, evento_id, ingresso_tipo_id, status, valor_original_centavos)
        values ('aaaa0000-0000-0000-0000-000000000004', ${eventoId}, ${tipoId}, 'pago', 8000)
        returning id
      ) select id from i
    `;

    await rodar(a.salvarRespostas, {
      inscricao_id: String(inscricao.id),
      [`campo_${campoId}`]: "M",
    });
    const [resposta] = await conexao()<{ rotulo: string; valor: string }[]>`
      select rotulo, valor from eventos.inscricao_respostas
       where inscricao_id = ${inscricao.id}
    `;
    // ⚠️ O RÓTULO vai gravado junto: renomear a pergunta depois não pode fazer
    // a resposta antiga dizer que respondia outra coisa.
    expect(resposta).toEqual({ rotulo: "Tamanho da camiseta", valor: "M" });

    // Fora da lista é RECUSADO, não gravado assim mesmo.
    const fora = await rodar(a.salvarRespostas, {
      inscricao_id: String(inscricao.id),
      [`campo_${campoId}`]: "GG",
    });
    expect(fora.searchParams.get("erro")).toContain("GG");
  });

  it("a comissão aceita quem não tem cadastro", async () => {
    // ⚠️ A origem gravava só o nome. Exigir o vínculo faria a tela recusar o
    // que já está no banco.
    await rodar(a.adicionarMembroComissao, {
      evento_id: String(eventoId),
      nome: "Voluntário Sem Cadastro",
      setor: "Recepção",
      funcao: "Credenciamento",
    });
    const [membro] = await conexao()<{ nome: string; pessoa_id: string | null }[]>`
      select nome, pessoa_id from eventos.comissao_membros
       where evento_id = ${eventoId} order by id desc limit 1
    `;
    expect(membro.pessoa_id).toBeNull();

    const id = await ultimo(conexao(), "eventos.comissao_membros");
    await rodar(a.editarMembroComissao, {
      evento_id: String(eventoId),
      id: String(id),
      nome: "Voluntário Conciliado",
      documento: "39053344705",
    });
    const [depois] = await conexao()<{ pessoa_id: string | null }[]>`
      select pessoa_id from eventos.comissao_membros where id = ${id}
    `;
    expect(depois.pessoa_id, "o documento não vinculou a pessoa").not.toBeNull();

    await rodar(a.removerMembroComissao, { evento_id: String(eventoId), id: String(id) });
    const [{ n }] = await conexao()<{ n: number }[]>`
      select count(*)::int as n from eventos.comissao_membros where id = ${id}
    `;
    expect(n).toBe(0);
  });

  it("a marca do comprovante grava as cinco chaves, e recusa cor inválida", async () => {
    await rodar(a.salvarMarcaDoComprovante, {
      evento_id: String(eventoId),
      cor_primaria: "#036",
      instrucoes: "Chegue 30 minutos antes.",
      mostrar_participante: "on",
      mostrar_evento: "on",
      mostrar_qrcode: "on",
    });
    const [evento] = await conexao()<
      { voucher_cor_primaria: string; voucher_mostrar: Record<string, boolean> }[]
    >`
      select voucher_cor_primaria, voucher_mostrar from eventos.eventos where id = ${eventoId}
    `;
    // Três dígitos viram seis, para o que fica gravado ter sempre a mesma forma.
    expect(evento.voucher_cor_primaria).toBe("#003366");
    // ⚠️ Caixa desmarcada não chega no formulário: as cinco chaves são
    // escritas sempre, senão desmarcar viraria "ausente" e o bloco voltaria.
    expect(Object.keys(evento.voucher_mostrar).sort()).toEqual([
      "evento", "ingresso", "pagamento", "participante", "qrcode",
    ]);
    expect(evento.voucher_mostrar.pagamento).toBe(false);

    const ruim = await rodar(a.salvarMarcaDoComprovante, {
      evento_id: String(eventoId),
      cor_primaria: "red; background: url(http://x)",
    });
    expect(ruim.searchParams.get("erro")).toContain("hexadecimal");
  });

  it("editar troca o que mudou e mantém o resto", async () => {
    await rodar(a.editarEvento, {
      id: String(eventoId),
      nome: "Congresso de Integração (2ª edição)",
      data_inicial: "2026-12-01",
      data_final: "2026-12-04",
    });
    await rodar(a.editarTipoIngresso, {
      evento_id: String(eventoId),
      id: String(tipoId),
      nome: "Inteira",
      papel: "principal",
      valor: "90,00",
      exibir_venda_publica: "on",
    });
    const [evento] = await conexao()<{ nome: string }[]>`
      select nome from eventos.eventos where id = ${eventoId}
    `;
    const [tipo] = await conexao()<{ valor_centavos: number }[]>`
      select valor_centavos from eventos.ingresso_tipos where id = ${tipoId}
    `;
    expect(evento.nome).toContain("2ª edição");
    expect(tipo.valor_centavos).toBe(9000);

    const cupomId = await ultimo(conexao(), "eventos.cupons");
    await rodar(a.editarCupom, {
      evento_id: String(eventoId), id: String(cupomId),
      codigo: "QUINZE", tipo: "valor", valor: "20,00",
    });
    await rodar(a.alternarCupomAtivo, {
      evento_id: String(eventoId), id: String(cupomId), ativo: "true",
    });
    const [cupom] = await conexao()<{ valor: number; ativo: boolean }[]>`
      select valor, ativo from eventos.cupons where id = ${cupomId}
    `;
    expect(cupom).toEqual({ valor: 2000, ativo: false });

    const comboId = await ultimo(conexao(), "eventos.combos");
    await rodar(a.editarCombo, {
      evento_id: String(eventoId), id: String(comboId),
      nome: "Congresso + Almoço", valor: "110,00",
      [`item_${tipoId}`]: "2",
    });
    // ⚠️ Editar TROCA a composição inteira: dois itens viraram um, com
    // quantidade 2. Conciliar item a item deixaria órfão o que saiu.
    const itens = await conexao()<{ ingresso_tipo_id: number; quantidade: number }[]>`
      select ingresso_tipo_id, quantidade from eventos.combo_itens where combo_id = ${comboId}
    `;
    expect(itens).toEqual([{ ingresso_tipo_id: tipoId, quantidade: 2 }]);
    await rodar(a.alternarComboAtivo, {
      evento_id: String(eventoId), id: String(comboId), ativo: "true",
    });

    const campoId = await ultimo(conexao(), "eventos.ingresso_campos");
    await rodar(a.editarPergunta, {
      evento_id: String(eventoId), id: String(campoId),
      rotulo: "Tamanho do uniforme", tipo: "selecao", opcoes: "P\nM\nG", obrigatorio: "on",
    });
    await rodar(a.alternarPerguntaAtiva, {
      evento_id: String(eventoId), id: String(campoId), ativo: "true",
    });
    const [campo] = await conexao()<{ rotulo: string; ativo: boolean }[]>`
      select rotulo, ativo from eventos.ingresso_campos where id = ${campoId}
    `;
    expect(campo).toEqual({ rotulo: "Tamanho do uniforme", ativo: false });

    // ⚠️ E a resposta antiga continua dizendo a que pergunta respondeu: o
    // rótulo foi fotografado no momento em que ela foi dada.
    const [resposta] = await conexao()<{ rotulo: string }[]>`
      select rotulo from eventos.inscricao_respostas where campo_id = ${campoId}
    `;
    expect(resposta.rotulo).toBe("Tamanho da camiseta");
  });

  it("desativar não apaga", async () => {
    // Apagar levaria junto as inscrições que já existem, e o relatório do ano
    // passado deixaria de fechar.
    await rodar(a.alternarEventoAtivo, { id: String(eventoId), ativo: "true" });
    const [evento] = await conexao()<{ ativo: boolean }[]>`
      select ativo from eventos.eventos where id = ${eventoId}
    `;
    expect(evento.ativo).toBe(false);
    await rodar(a.alternarEventoAtivo, { id: String(eventoId), ativo: "false" });

    await rodar(a.alternarTipoIngressoAtivo, {
      evento_id: String(eventoId), id: String(tipoId), ativo: "true",
    });
    const [tipo] = await conexao()<{ ativo: boolean }[]>`
      select ativo from eventos.ingresso_tipos where id = ${tipoId}
    `;
    expect(tipo.ativo).toBe(false);
  });
});

/**
 * ⚠️ Roda SEM banco, e vigia a lista acima — como a do #67 faz com as
 * consultas. Ação nova escrita e esquecida aqui passaria a existir sem nunca
 * ter tocado um Postgres.
 */
describe("toda ação do módulo é exercitada contra o banco", () => {
  it("nenhuma ficou de fora", () => {
    const fonte = readFileSync("src/modulos/eventos/acoes.ts", "utf8");
    const exportadas = [...fonte.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
    expect(exportadas.length, "não li ação nenhuma — o extrator cegou").toBeGreaterThan(20);

    const suites = ["cadastro", "venda", "inscricao"]
      .map((n) => readFileSync(`tests/integracao/${n}.test.ts`, "utf8"))
      .join("\n");

    const faltando = exportadas.filter(
      (f) => !suites.includes(`a.${f},`) && !suites.includes(`acoes.${f},`) &&
             !suites.includes(`${f}(formulario`) && !suites.includes(`{ ${f} }`)
    );
    expect(
      faltando,
      `sem exercício contra o banco: ${faltando.join(", ")}`
    ).toEqual([]);
  });
});
