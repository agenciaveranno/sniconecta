import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O comprovante é a única tela deste sistema que sai do computador.
 *
 * ⚠️ E o erro dela não aparece no CI de jeito nenhum: um QR que só é desenhado
 * depois que o script roda imprime um quadrado branco; um aviso de cancelada
 * escrito só para a tela imprime um papel com a mesma cara do válido; um botão
 * sem `@media print` imprime "Imprimir" no meio do comprovante. Nada disso
 * quebra build, typecheck nem teste de domínio.
 */

const PAGINA = readFileSync("src/app/eventos/comprovante/[id]/page.tsx", "utf8");
const QR = readFileSync("src/componentes/CodigoQR.tsx", "utf8");
const IMPRIMIR = readFileSync("src/componentes/BotaoImprimir.tsx", "utf8");
const CSS = readFileSync("src/design/componentes.css", "utf8");

describe("o desenho sai pronto do servidor", () => {
  it("o QR não é componente de cliente", () => {
    // ⚠️ Gerado no navegador, ele aparece DEPOIS da página — e o Ctrl+P
    // disparado antes do script sai com um quadrado branco no lugar do código.
    //
    // ⚠️ A DIRETIVA, não o texto solto: ela só vale no começo de uma linha, no
    // alto do arquivo. Procurando o texto em qualquer lugar, o COMENTÁRIO que
    // explica esta regra — que cita a diretiva — reprovava um arquivo
    // correto. É a terceira vez nesta sessão que um comentário sobre a regra
    // se confunde com a regra; a lição é sempre a mesma: ancorar a asserção na
    // forma sintática, não no texto.
    const diretiva = /^\s*"use client"/m;
    expect(QR).not.toMatch(diretiva);
    expect(PAGINA).not.toMatch(diretiva);
  });

  it("só o botão de imprimir é cliente, porque window.print não existe no servidor", () => {
    expect(IMPRIMIR).toContain('"use client"');
    expect(IMPRIMIR).toContain("window.print()");
  });

  it("o comprovante não vem dentro do painel", () => {
    // Barra lateral e barra superior existem para navegar, e ninguém navega
    // num papel: impressas, gastariam meia folha com menu.
    expect(PAGINA).not.toContain("<Painel");
  });
});

describe("o código também vai em texto", () => {
  it("o número aparece embaixo do desenho", () => {
    // ⚠️ Câmera falha, papel amassa, tinta acaba — e o operador da porta
    // digita. Sem o texto, um QR borrado é um ingresso perdido.
    expect(PAGINA).toContain("sni-comprovante-codigo-texto");
    expect(PAGINA).toMatch(/sni-comprovante-codigo-texto[^>]*>\s*\{c\.qr_code\}/);
  });

  it("sem código, diz que não tem em vez de imprimir um quadrado vazio", () => {
    expect(PAGINA).toContain("sni-comprovante-sem-codigo");
    expect(PAGINA).toContain("procure pelo nome ou");
  });
});

describe("o papel diz quando não vale", () => {
  it("a faixa de inválido existe e só aparece na impressão", () => {
    // ⚠️ Na tela quem avisa é o `Alerta`; impresso, ele some entre os outros
    // blocos — e o comprovante cancelado fica com a mesma cara do válido na
    // mão de quem chega na porta.
    expect(PAGINA).toContain("sni-comprovante-invalido");
    expect(CSS).toMatch(/\.sni-comprovante-invalido\s*\{\s*display:\s*none/);
    const print = CSS.slice(CSS.indexOf("@media print"));
    expect(print).toMatch(/\.sni-comprovante-invalido\s*\{[^}]*display:\s*block/);
  });

  it("toda situação que não é 'pago' tem frase própria", () => {
    for (const s of ["pendente", "transferido", "cancelado"]) {
      expect(PAGINA, `sem frase para ${s}`).toContain(`"${s}"`);
    }
  });
});

describe("o que não vai para o papel", () => {
  it("a barra de navegação e o botão somem na impressão", () => {
    expect(PAGINA).toContain("sni-sem-impressao");
    expect(IMPRIMIR).toContain("sni-sem-impressao");
    const print = CSS.slice(CSS.indexOf("@media print"));
    expect(print).toMatch(/\.sni-sem-impressao\s*\{[^}]*display:\s*none/);
  });

  it("a cor de fundo é forçada a sair", () => {
    // ⚠️ O navegador descarta fundos por padrão para economizar tinta, e a
    // faixa da cor do evento — que distingue um comprovante do outro — sumiria.
    const print = CSS.slice(CSS.indexOf("@media print"));
    expect(print).toContain("print-color-adjust: exact");
  });
});

describe("a lista de blocos existe uma vez só", () => {
  const ACAO = readFileSync("src/modulos/eventos/acoes.ts", "utf8");
  const ABA = readFileSync("src/app/eventos/admin/[id]/page.tsx", "utf8");
  const DOMINIO = readFileSync("src/lib/dominio/comprovante.ts", "utf8");

  it("as três pontas importam do domínio, e nenhuma escreve a própria", () => {
    // ⚠️ A lista é a mesma para a tela que marca as caixas, a ação que grava e
    // o papel que imprime. Escrita em três lugares, a primeira chave
    // acrescentada num deles vira uma caixa que marca e não aparece.
    expect(DOMINIO).toContain("BLOCOS_DO_COMPROVANTE");
    for (const [onde, fonte] of [["ação", ACAO], ["aba", ABA]] as const) {
      expect(fonte, `${onde} não importa do domínio`)
        .toContain('from "@/lib/dominio/comprovante"');
      expect(fonte, `${onde} declara a própria lista`)
        .not.toContain("const BLOCOS_DO_COMPROVANTE");
    }
  });

  it("ausente é MOSTRAR, nas duas pontas", () => {
    // ⚠️ Tratar ausência como "esconder" faria o comprovante emagrecer sozinho
    // no dia em que a lista crescesse.
    expect(DOMINIO).toContain("!== false");
    expect(PAGINA).toContain("mostraBloco(");
    expect(ABA).toContain("!== false");
  });

  it("a ação grava as cinco chaves, e não só as que chegaram", () => {
    // ⚠️ Caixa desmarcada NÃO CHEGA no formulário — o navegador não a envia.
    // Montar o objeto só com o que chegou faria desmarcar virar "ausente", e o
    // bloco voltaria a aparecer na leitura seguinte.
    expect(ACAO).toContain("BLOCOS_DO_COMPROVANTE.map");
    expect(ACAO).toContain("!== null");
  });
});

describe("a cor da marca é conferida nas duas pontas", () => {
  it("na gravação e na leitura, e nas DUAS cores", () => {
    // ⚠️ O valor entra numa propriedade CSS. Conferir só ao gravar deixa
    // passar o que chegar por outro caminho — carga, correção à mão no banco,
    // tela nova.
    //
    // ⚠️ E cada cor é afirmada por NOME. Um `toContain("corDeMarca(")` solto
    // passava com uma das duas conferidas e a outra crua: sobrava chamada no
    // arquivo, e o teste se dava por satisfeito. Foi o que a mutação mostrou.
    const ACAO = readFileSync("src/modulos/eventos/acoes.ts", "utf8");
    expect(ACAO).toMatch(/const primaria = corDeMarca\(/);
    expect(ACAO).toMatch(/const secundaria = corDeMarca\(/);
    expect(PAGINA).toContain("corDeMarca(c.voucher_cor_primaria)");
    expect(PAGINA).toContain("corDeMarca(c.voucher_cor_secundaria)");
  });
});
