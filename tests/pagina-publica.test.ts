import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { semComentarios } from "./util/fonte";
import { rotaPublica } from "@/proxy";

/**
 * A superfície pública do evento.
 *
 * ⚠️ É a única tela do sistema que QUALQUER UM abre, sem sessão. O erro aqui
 * não derruba nada: ele publica. Uma coluna a mais no `select`, um motivo
 * interno numa frase, uma contagem de estoque — e o vazamento fica no ar
 * indexado, sem log, sem aviso, sem ninguém perceber que aconteceu.
 */

const CONSULTAS = semComentarios(readFileSync("src/modulos/eventos/consultas.ts", "utf8"));
const PAGINA = semComentarios(readFileSync("src/app/e/[id]/page.tsx", "utf8"));

function corpoDe(fonte: string, nome: string): string {
  const inicio = fonte.indexOf(`export async function ${nome}(`);
  expect(inicio, `não achei ${nome} — o extrator cegou`).toBeGreaterThan(-1);
  const resto = fonte.slice(inicio + 1);
  const fim = resto.indexOf("\nexport ");
  return fim === -1 ? resto : resto.slice(0, fim);
}

const PUBLICAS = ["eventoPublico", "ingressosPublicos", "combosPublicos"] as const;

describe("a rota é pública mesmo", () => {
  it("o proxy deixa /e/ passar sem sessão", () => {
    // Sem isto, o cartaz leva para a tela de login — e quem não tem conta,
    // que é o público inteiro, não vê o preço.
    expect(rotaPublica("/e/12")).toBe(true);
  });

  it("e as outras continuam protegidas", () => {
    expect(rotaPublica("/eventos/venda")).toBe(false);
    expect(rotaPublica("/admin/pessoas")).toBe(false);
  });
});

describe("as consultas públicas escolhem coluna por coluna", () => {
  it("nenhuma usa select *", () => {
    // ⚠️ Um `select *` aqui publicaria o promotor, a conta que recebe, as
    // observações internas e o que a carga deixou em `migracao_extras` — e o
    // vazamento não apareceria em teste nenhum, porque a página só mostra o
    // que usa. O que não é escolhido não sai.
    for (const fn of PUBLICAS) {
      // ⚠️ `e.*` também conta. A primeira versão só procurava `select *` e
      // passava com `select e.*` — que publica exatamente as mesmas colunas.
      expect(corpoDe(CONSULTAS, fn), `${fn} usa select *`)
        .not.toMatch(/select\s+(\w+\.)?\*/);
    }
  });

  it("nenhuma traz coluna interna", () => {
    const proibidas = [
      "migracao_extras", "observacoes", "landing",
      "promotor_organizacao_id,", "promotor_unidade_id,", "promotor_local_id,",
      "voucher_", "credencial",
    ];
    for (const fn of PUBLICAS) {
      const corpo = corpoDe(CONSULTAS, fn);
      for (const coluna of proibidas) {
        expect(corpo, `${fn} publica ${coluna}`).not.toContain(coluna);
      }
    }
  });

  it("só evento ativo, e desativado responde como inexistente", () => {
    // Distinguir "não existe" de "existe e está desligado" conta a quem tem o
    // endereço que ele existiu.
    expect(corpoDe(CONSULTAS, "eventoPublico")).toContain("and e.ativo");
    expect(PAGINA).toContain("notFound()");
  });

  it("só ingresso marcado para venda pública", () => {
    // ⚠️ Sem o filtro, o ingresso de cortesia da comissão e o preço especial
    // do balcão apareceriam no site para qualquer um comprar.
    const corpo = corpoDe(CONSULTAS, "ingressosPublicos");
    expect(corpo).toContain("t.ativo and t.exibir_venda_publica");
  });
});

describe("o que a página NÃO conta", () => {
  it("não publica quantos ingressos restam", () => {
    // ⚠️ Contagem de estoque é informação de operação: publicada, ela conta
    // para concorrente e para curioso o tamanho e o desempenho do evento,
    // todo dia, sem ninguém ter decidido publicar isso. Sai "esgotado", e só.
    expect(PAGINA).not.toContain("disponivel");
    expect(PAGINA).not.toContain("restam");
    expect(corpoDe(CONSULTAS, "ingressosPublicos")).not.toMatch(/as\s+disponivel/);
  });

  it("não publica o motivo interno de o evento não vender", () => {
    // `porQueNaoVende` devolve a conversa da equipe com ela mesma: "falta
    // dizer quem promove, é o promotor que define em qual conta Cielo o
    // dinheiro cai". Publicado, conta o estado do cadastro ao mundo.
    expect(PAGINA).not.toContain("porQueNaoVende");
    expect(PAGINA).not.toContain("Cielo");
    expect(PAGINA).not.toContain("promotor que");
  });

  it("não pede capacidade — e também não oferece nada de dentro", () => {
    expect(PAGINA).not.toContain("exigirCapacidade");
    expect(PAGINA).not.toContain("Painel");
  });
});

describe("a página diz o que ela ainda não faz", () => {
  it("não há botão de comprar", () => {
    // Promessa quebrada em silêncio é o que este módulo passou a sessão
    // inteira desfazendo: um botão que não leva a lugar nenhum é o pior deles.
    expect(PAGINA).not.toMatch(/<form/);
    expect(PAGINA).toContain("entra em breve");
  });

  it("e o combo sem item de venda pública não aparece", () => {
    // Ele anunciaria um pacote que o site não tem como entregar.
    expect(corpoDe(CONSULTAS, "combosPublicos")).toContain("c.itens.length > 0");
  });
});
