import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { conexao } from "@/lib/db";
import * as C from "@/modulos/eventos/consultas";

/**
 * As consultas do módulo `eventos` rodando contra um Postgres DE VERDADE.
 *
 * ⚠️ POR QUE ISTO EXISTE. O módulo fala Postgres direto, sem cliente tipado:
 * `join` trocado, `group by` incompleto, coluna ambígua e função de agregação
 * no lugar errado NÃO quebram typecheck, NÃO quebram teste unitário e NÃO
 * quebram build. Quebram quando alguém ABRE A TELA — em produção, porque até
 * aqui não havia banco nenhum no CI para exercitá-las.
 *
 * `colunas-das-telas` cobre o que dá para cobrir lendo texto: os NOMES das
 * colunas. Se a consulta RODA, só o Postgres responde.
 *
 *   sudo ./scripts/banco-de-teste.sh     # imprime a string de conexão
 *   DATABASE_URL=<ela> npx vitest run tests/integracao
 *
 * ⚠️ Sem `DATABASE_URL` a suíte é PULADA, e não silenciosamente aprovada: o
 * `it` anunciado como skipped aparece na saída. Um teste de integração que
 * "passa" sem banco é a pior das duas coisas — ele diz que exercitou.
 */

const URL_TESTE = process.env.DATABASE_URL ?? "";
const temBanco = URL_TESTE.includes("127.0.0.1") || URL_TESTE.includes("localhost");

const EVENTO = 900;
const EVENTO_VAZIO = 901;
const PESSOA = "aaaa0000-0000-0000-0000-000000000001";
const INSCRICAO = 9401;

describe.skipIf(!temBanco)("toda consulta do módulo roda no Postgres", () => {
  afterAll(async () => {
    await conexao().end();
  });

  beforeAll(async () => {
    // ⚠️ Confere a SEMENTE antes de tudo. Sem isto, uma semente que deixasse
    // de aplicar faria cada consulta devolver vazio — e vazio passa em quase
    // toda asserção, deixando a suíte verde sem ter exercitado nada.
    const [{ quantas }] = await conexao()<{ quantas: number }[]>`
      select count(*)::int as quantas from eventos.inscricoes where evento_id = ${EVENTO}
    `;
    expect(quantas, "a semente não aplicou — a suíte estaria vigiando vazio").toBe(8);
  });

  /**
   * Cada consulta com um argumento que existe na semente. O valor de retorno
   * importa pouco: o que se prova aqui é que o Postgres ACEITA o comando.
   */
  const CHAMADAS: Record<string, () => Promise<unknown>> = {
    eventosDoPainel: () => C.eventosDoPainel(50),
    totalDeEventos: () => C.totalDeEventos(),
    opcoesDePromotor: () => C.opcoesDePromotor(),
    eventosParaEdicao: () => C.eventosParaEdicao(),
    locaisAtivos: () => C.locaisAtivos(),
    tiposDeIngresso: () => C.tiposDeIngresso(EVENTO),
    eventoDaPagina: () => C.eventoDaPagina(EVENTO),
    tiposParaVenda: () => C.tiposParaVenda(EVENTO),
    lerTiposParaVenda: () => C.lerTiposParaVenda(conexao(), EVENTO),
    tiposQueAPessoaJaTem: () => C.tiposQueAPessoaJaTem(EVENTO, PESSOA),
    procurarPessoaNoBalcao: () => C.procurarPessoaNoBalcao("Teste"),
    pessoaDoBalcao: () => C.pessoaDoBalcao(PESSOA),
    eventosParaVenda: () => C.eventosParaVenda(),
    inscricoesNaPorta: () => C.inscricoesNaPorta(EVENTO, "Teste"),
    contagemDaPorta: () => C.contagemDaPorta(EVENTO),
    resumoDoEvento: () => C.resumoDoEvento(EVENTO),
    porTipoDeIngresso: () => C.porTipoDeIngresso(EVENTO),
    porFormaDePagamento: () => C.porFormaDePagamento(EVENTO),
    estornosPendentes: () => C.estornosPendentes(),
    inscricoesParaCancelar: () => C.inscricoesParaCancelar("Teste"),
    cuponsDoEvento: () => C.cuponsDoEvento(EVENTO),
    tiposParaCupom: () => C.tiposParaCupom(EVENTO),
    inscricoesDaPessoa: () => C.inscricoesDaPessoa(PESSOA),
    inscricaoParaTransferir: () => C.inscricaoParaTransferir(INSCRICAO),
    eventoPublico: () => C.eventoPublico(EVENTO),
    ingressosPublicos: () => C.ingressosPublicos(EVENTO),
    combosPublicos: () => C.combosPublicos(EVENTO),
    perguntasDoEvento: () => C.perguntasDoEvento(EVENTO),
    perguntasDaInscricao: () => C.perguntasDaInscricao(INSCRICAO),
    respostasDoEvento: () => C.respostasDoEvento(EVENTO),
    perguntasDasInscricoes: () => C.perguntasDasInscricoes([INSCRICAO, 9402]),
    marcaDoComprovante: () => C.marcaDoComprovante(EVENTO),
    comprovanteDaInscricao: () => C.comprovanteDaInscricao(INSCRICAO),
    procurarParticipante: () => C.procurarParticipante("Teste"),
    comissaoDoEvento: () => C.comissaoDoEvento(EVENTO),
    catalogoDaComissao: () => C.catalogoDaComissao(),
    combosDoEvento: () => C.combosDoEvento(EVENTO),
    combosParaVenda: () => C.combosParaVenda(EVENTO, PESSOA),
    lerCombosParaVenda: () => C.lerCombosParaVenda(conexao(), EVENTO, PESSOA),
  };

  for (const [nome, chamar] of Object.entries(CHAMADAS)) {
    it(`${nome} roda`, async () => {
      await expect(chamar()).resolves.toBeDefined();
    });
  }

  // ── O que a semente foi feita para morder ──
  //
  // ⚠️ "A consulta roda" é a metade barata. A outra metade é se ela responde
  // CERTO — e os casos que este módulo já errou são sempre os mesmos: a
  // cortesia com preço, a linha sem tipo de ingresso, o que não é de venda
  // pública, e a contagem que confunde linha com pacote.

  it("a cortesia com preço preenchido não entra na arrecadação", async () => {
    // ⚠️ É o defeito que este módulo cometeu TRÊS vezes: a carga trouxe
    // cortesias com valor de tabela, e somá-las mostra à Sede dinheiro que
    // nunca entrou no caixa.
    const resumo = await C.resumoDoEvento(EVENTO);
    const porTipo = await C.porTipoDeIngresso(EVENTO);
    const cortesia = porTipo.find((t) => t.nome === "Cortesia");
    expect(cortesia?.pagos, "a cortesia conta como presença").toBe(1);
    expect(cortesia?.arrecadado_centavos, "a cortesia entrou na arrecadação").toBe(0);
    // Inteira 10.000 + Jantar (5.000−1.000) + combo (10.000−1.500 e
    // 5.000−1.500) = 26.000. Fora: a cortesia, a pendente, a cancelada e a
    // importada sem valor.
    expect(resumo.arrecadado_centavos).toBe(26000);
  });

  it("a inscrição sem tipo de ingresso aparece na porta", async () => {
    // ⚠️ A carga deixou linhas assim. Um `join` fechado as faria sumir — com
    // a pessoa na frente do balcão segurando o ingresso.
    const achadas = await C.inscricoesNaPorta(EVENTO, "Yoko");
    expect(achadas.some((i) => i.ingresso === null)).toBe(true);
  });

  it("a página pública esconde o que não é de venda pública", async () => {
    const ingressos = await C.ingressosPublicos(EVENTO);
    expect(ingressos.map((i) => i.nome)).not.toContain("Cortesia");
    // E o combo cujos itens não são públicos some inteiro: ele anunciaria um
    // pacote que o site não tem como entregar.
    const combos = await C.combosPublicos(EVENTO);
    expect(combos.map((c) => c.nome)).toEqual(["Inteira + Jantar"]);
  });

  it("evento desativado responde como inexistente", async () => {
    await conexao()`update eventos.eventos set ativo = false where id = ${EVENTO_VAZIO}`;
    expect(await C.eventoPublico(EVENTO_VAZIO)).toBeNull();
    await conexao()`update eventos.eventos set ativo = true where id = ${EVENTO_VAZIO}`;
  });

  it("'vendidos' do combo conta PACOTES, não linhas", async () => {
    // ⚠️ Duas linhas de um combo de dois ingressos são UM pacote. Contar
    // linhas fazia a aba dizer "2 de 30" para um combo vendido uma vez.
    const combos = await C.combosDoEvento(EVENTO);
    const combo = combos.find((c) => c.id === 9201);
    expect(combo?.vendidos).toBe(1);
    expect(combo?.avulso_centavos).toBe(15000);
  });

  it("'escolha várias' soma cada alternativa separada", async () => {
    // Contada inteira, a combinação vira uma categoria própria.
    const respostas = await C.respostasDoEvento(EVENTO);
    const dieta = respostas.find((r) => r.rotulo === "Restrição alimentar");
    expect(dieta?.contagem.map((c) => c.valor).sort()).toEqual(["Sem glúten", "Vegetariano"]);
  });

  it("a fila de estorno usa o valor REGISTRADO", async () => {
    const fila = await C.estornosPendentes();
    const nossa = fila.find((e) => e.id === 9405);
    expect(nossa?.estorno?.valor_centavos).toBe(10000);
  });

  it("o membro de comissão sem pessoa vinculada aparece", async () => {
    // ⚠️ A origem gravava só o nome. Exigir o vínculo faria a tela recusar o
    // que já está no banco, e a conciliação nunca começaria.
    const comissao = await C.comissaoDoEvento(EVENTO);
    expect(comissao.some((m) => m.nome === "Alguém da Carga")).toBe(true);
  });

  it("o evento sem nada também não derruba nenhuma", async () => {
    // ⚠️ Evento sem ingresso, sem inscrição e sem promotor é o estado de todo
    // evento no primeiro minuto de vida. Uma agregação que suponha ao menos
    // uma linha quebra exatamente aí — na tela mais nova do sistema.
    await expect(C.resumoDoEvento(EVENTO_VAZIO)).resolves.toBeDefined();
    await expect(C.porTipoDeIngresso(EVENTO_VAZIO)).resolves.toEqual([]);
    await expect(C.combosDoEvento(EVENTO_VAZIO)).resolves.toEqual([]);
    await expect(C.ingressosPublicos(EVENTO_VAZIO)).resolves.toEqual([]);
    await expect(C.respostasDoEvento(EVENTO_VAZIO)).resolves.toEqual([]);
  });
});

/**
 * ⚠️ Esta parte roda SEM banco, de propósito: ela vigia a lista acima. Uma
 * consulta nova acrescentada a `consultas.ts` e esquecida aqui passaria a
 * existir sem nunca ter tocado um Postgres — e voltaríamos ao ponto de
 * partida, com a suíte parecendo completa.
 */
describe("a lista de chamadas não fica para trás do módulo", () => {
  it("toda consulta exportada está exercitada", () => {
    const fonte = readFileSync("src/modulos/eventos/consultas.ts", "utf8");
    const exportadas = [...fonte.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
    expect(exportadas.length, "não li consulta nenhuma — o extrator cegou")
      .toBeGreaterThan(30);

    const arquivo = readFileSync("tests/integracao/consultas.test.ts", "utf8");
    const exercitadas = new Set(
      [...arquivo.matchAll(/^\s{4}(\w+): \(\) =>/gm)].map((m) => m[1])
    );
    const faltando = exportadas.filter((f) => !exercitadas.has(f));
    expect(
      faltando,
      `sem exercício contra o banco: ${faltando.join(", ")} — acrescente em CHAMADAS`
    ).toEqual([]);
  });
});
