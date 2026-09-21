import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { semComentarios } from "./util/fonte";

/**
 * O relatório das respostas.
 *
 * ⚠️ É o relatório mais fácil de estar errado sem parecer: ele devolve
 * NÚMEROS, e número errado é indistinguível de número certo para quem lê. A
 * cozinha compra pelo que este relatório disser.
 */

const CONSULTAS = semComentarios(readFileSync("src/modulos/eventos/consultas.ts", "utf8"));
const PAGINA = semComentarios(readFileSync("src/app/eventos/relatorios/page.tsx", "utf8"));

function corpoDe(fonte: string, nome: string): string {
  const inicio = fonte.indexOf(`export async function ${nome}(`);
  expect(inicio, `não achei ${nome} — o extrator cegou`).toBeGreaterThan(-1);
  const resto = fonte.slice(inicio + 1);
  const fim = resto.indexOf("\nexport ");
  return fim === -1 ? resto : resto.slice(0, fim);
}

const FN = corpoDe(CONSULTAS, "respostasDoEvento");

describe("só conta quem vai", () => {
  it("as respostas contadas são de inscrição paga", () => {
    // ⚠️ Inscrição cancelada respondeu e não vai. Somar faria a cozinha
    // preparar refeição para quem desistiu — dinheiro jogado fora no dia.
    expect(FN).toContain("i.status = 'pago'");
  });

  it("o alcance também é de pagas", () => {
    const alcance = FN.slice(FN.indexOf("as alcance") - 260, FN.indexOf("as alcance"));
    expect(alcance).toContain("x.status = 'pago'");
  });
});

describe("escolha múltipla soma cada alternativa", () => {
  it("a linha é separada antes de contar", () => {
    // ⚠️ Contada inteira, cada combinação vira uma categoria própria — e o
    // relatório mostra "Vegetariano; Sem glúten: 1" em vez de somar cada uma.
    expect(FN).toContain("SEPARADOR_MULTIPLA");
    expect(FN).toContain('pergunta.tipo === "multipla"');
  });

  it("o separador vem do domínio, não escrito aqui", () => {
    expect(CONSULTAS).toContain('from "@/lib/dominio/campos"');
    expect(FN).not.toContain('split("; ")');
  });
});

describe("o que falta responder aparece", () => {
  it("a linha 'sem resposta' existe na tela", () => {
    // ⚠️ Sem ela o relatório parece completo, e some a diferença entre
    // "ninguém é vegetariano" e "ninguém foi perguntado".
    expect(PAGINA).toContain("semResposta");
    expect(PAGINA).toContain("p.alcance - p.respostas.length");
  });

  it("a porcentagem é do alcance, não do total de respostas", () => {
    // "12 vegetarianos" não diz nada: 12 de 15 é um cardápio, 12 de 400 é um
    // detalhe.
    expect(PAGINA).toContain("/ p.alcance)");
    expect(PAGINA).not.toContain("/ p.respostas.length)");
  });

  it("resposta nula não vira resposta em branco", () => {
    // O `left join` traz a pergunta sem resposta, com `valor` nulo. Somar
    // nulos faria "0 respostas" virar "1 resposta vazia".
    expect(FN).toContain("l.valor !== null");
  });
});

describe("texto não vira categoria", () => {
  it("tally só para escolha e sim/não", () => {
    // Cada resposta de texto é única: contá-las como categorias daria uma
    // tabela com trezentas linhas de contagem 1.
    expect(PAGINA).toContain("precisaDeOpcoes(p.tipo)");
    expect(PAGINA).toContain('p.tipo === "booleano"');
  });
});
