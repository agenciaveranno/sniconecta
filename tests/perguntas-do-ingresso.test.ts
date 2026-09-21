import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TIPOS_DE_CAMPO } from "@/lib/dominio/campos";
import { semComentarios } from "./util/fonte";

/**
 * As perguntas do ingresso, das duas pontas.
 *
 * ⚠️ O erro aqui é silencioso do jeito pior: a resposta É GRAVADA, só que
 * errada. Um controle que não acompanha o tipo deixa digitar fora da lista; um
 * rótulo que não é fotografado faz a resposta antiga passar a dizer outra
 * coisa quando alguém renomeia a pergunta; uma pergunta apagada em vez de
 * desativada deixa as respostas órfãs. Nada disso quebra nada.
 */

const ACOES = readFileSync("src/modulos/eventos/acoes.ts", "utf8");
const CONSULTAS = readFileSync("src/modulos/eventos/consultas.ts", "utf8");
// ⚠️ SEM COMENTÁRIOS. O comentário que explica "não é um `select multiple`"
// contém a palavra `multiple`, e a asserção de ausência reprovava um arquivo
// correto. É a quarta vez nesta sessão — ver `tests/util/fonte.ts`.
const CAMPOS = semComentarios(
  readFileSync("src/app/eventos/pessoas/CamposResposta.tsx", "utf8")
);
const ABA = readFileSync("src/app/eventos/admin/[id]/page.tsx", "utf8");
const FORM = readFileSync("src/app/eventos/admin/CamposPergunta.tsx", "utf8");


function corpoDe(fonte: string, nome: string): string {
  const inicio = fonte.indexOf(`export async function ${nome}(`);
  expect(inicio, `não achei ${nome} — o extrator cegou`).toBeGreaterThan(-1);
  const resto = fonte.slice(inicio + 1);
  const fim = resto.indexOf("\nexport ");
  return fim === -1 ? resto : resto.slice(0, fim);
}

describe("a resposta guarda a pergunta de então", () => {
  const salvar = corpoDe(ACOES, "salvarRespostas");

  it("grava o rótulo junto, não só o campo_id", () => {
    // ⚠️ A fundação escreveu isso na coluna: "o campo pode ser renomeado
    // depois, e a resposta precisa continuar dizendo a que pergunta
    // respondeu". Renomear "Tamanho da camiseta" para "Tamanho do uniforme"
    // não pode fazer as respostas antigas mudarem de sentido.
    expect(salvar).toContain("rotulo: pergunta.rotulo");
    expect(salvar).toMatch(/"inscricao_id",\s*"campo_id",\s*"rotulo",\s*"valor"/);
  });

  it("é tudo ou nada, numa transação", () => {
    // Metade gravada é pior que nada: quem abre a ficha vê três de cinco
    // respondidas e não sabe se as outras foram deixadas em branco de propósito.
    expect(salvar).toContain("sql.begin(");
    const tx = salvar.slice(salvar.indexOf("sql.begin("));
    expect(tx).toContain("delete from eventos.inscricao_respostas");
    expect(tx).toContain("insert into eventos.inscricao_respostas");
  });

  it("confere pela regra pura, e não à mão", () => {
    expect(salvar).toContain("conferirResposta(");
    expect(ACOES).toContain('from "@/lib/dominio/campos"');
  });

  it("a escolha múltipla é lida com getAll, senão só a primeira chega", () => {
    // ⚠️ `formData.get` devolve UM valor. Num grupo de caixas, as outras
    // marcadas simplesmente somem — e a pessoa vê a resposta encolher sozinha.
    expect(salvar).toContain("formData.getAll(");
  });
});

describe("a pergunta é desativada, não apagada", () => {
  it("não existe ação que apague", () => {
    // ⚠️ `inscricao_respostas.campo_id` é `on delete set null`: apagar deixa as
    // respostas órfãs. Elas continuam no banco com o rótulo gravado, mas
    // ninguém mais consegue agrupá-las por pergunta num relatório.
    expect(ACOES).not.toContain("delete from eventos.ingresso_campos");
    expect(ACOES).toContain("alternarPerguntaAtiva");
  });

  it("a tela mostra quantas respostas a pergunta já tem", () => {
    expect(CONSULTAS).toContain("from eventos.inscricao_respostas r");
    expect(ABA).toContain("{p.respostas}");
  });
});

describe("o controle acompanha o tipo da pergunta", () => {
  it("cada tipo tem tratamento na tela de responder", () => {
    // ⚠️ Um campo de texto para "escolha uma" deixa digitar o que quiser — e o
    // servidor recusa depois, com a pessoa achando que a tela quebrou.
    for (const [tipo] of TIPOS_DE_CAMPO) {
      if (tipo === "texto") continue; // é o padrão do `else` final
      expect(CAMPOS, `sem tratamento para ${tipo}`).toContain(`"${tipo}"`);
    }
  });

  it("escolha várias é grupo de caixas, não select multiple", () => {
    // Seletor múltiplo exige segurar Ctrl para marcar mais de um, e no celular
    // é pior ainda.
    expect(CAMPOS).not.toContain("multiple");
    expect(CAMPOS).toContain('type="checkbox"');
  });

  it("o separador da múltipla vem do domínio, não escrito na tela", () => {
    // Gravado com vírgula numa tela e ponto-e-vírgula noutra, nenhum relatório
    // separa de volta.
    expect(CAMPOS).toContain("SEPARADOR_MULTIPLA");
  });

  it("a lista de tipos do formulário vem do domínio", () => {
    // ⚠️ A asserção é sobre o USO, não sobre o import. `toContain
    // ("TIPOS_DE_CAMPO")` passava com a lista importada e ignorada — o
    // formulário montava a própria e o teste se dava por satisfeito. Foi o que
    // a mutação mostrou.
    expect(semComentarios(FORM)).toContain("TIPOS_DE_CAMPO.map(");
    // E nenhuma lista de pares escrita à mão no arquivo: é essa a forma que
    // uma cópia da lista do domínio teria. (Procurar cada tipo pelo nome
    // reprovava o `?? "texto"` do valor padrão, que é legítimo.)
    expect(semComentarios(FORM), "lista de pares escrita à mão no formulário")
      .not.toMatch(/\[\s*\[\s*"/);
  });
});

describe("a ficha não paga uma viagem por inscrição", () => {
  it("as perguntas de todas as inscrições vêm numa consulta", () => {
    const fn = corpoDe(CONSULTAS, "perguntasDasInscricoes");
    expect(fn).toContain("= any(${ids})");
    const ficha = readFileSync("src/app/eventos/pessoas/page.tsx", "utf8");
    expect(ficha).toContain("perguntasDasInscricoes(inscricoes.map");
  });

  it("a pergunta aparece mesmo sem resposta", () => {
    // ⚠️ `join` fechado mostraria só o que já foi respondido — e a pergunta
    // nova nunca apareceria para ser respondida.
    const fn = corpoDe(CONSULTAS, "perguntasDasInscricoes");
    expect(fn).toContain("left join eventos.inscricao_respostas");
  });
});
