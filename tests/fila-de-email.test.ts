import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { semComentarios } from "./util/fonte";

/**
 * A fila que entrega, e quem a alimenta.
 *
 * ⚠️ Errado aqui, ela erra de dois jeitos opostos e igualmente silenciosos: ou
 * some com mensagem que ninguém mandou (gastando tentativa enquanto o SMTP
 * nem está configurado), ou manda a mesma duas vezes — que é o que faz gente
 * marcar o remetente como spam, e aí nenhuma mensagem chega mais.
 */

const FILA = semComentarios(readFileSync("src/lib/comunicacao/fila.ts", "utf8"));
const EMAIL = semComentarios(readFileSync("src/lib/comunicacao/email.ts", "utf8"));
const ACOES = semComentarios(readFileSync("src/modulos/eventos/acoes.ts", "utf8"));

describe("a fila não perde o que ainda não pode sair", () => {
  it("SMTP ausente não gasta tentativa", () => {
    // ⚠️ Fila sem servidor de envio é o estado normal de um sistema
    // recém-instalado. Gastar as cinco tentativas enquanto ninguém preencheu
    // apagaria, em cinco dias, tudo que estava esperando por ele.
    // ⚠️ O recorte vai até o FIM DO BLOCO, e não N caracteres adiante: uma
    // janela fixa engolia o laço seguinte, que legitimamente tem `update`.
    const inicio = FILA.indexOf("if (!transporte) {");
    expect(inicio, "não achei a saída antecipada").toBeGreaterThan(-1);
    const bloco = FILA.slice(inicio, FILA.indexOf("\n  }", inicio));
    expect(bloco).toContain("return {");
    expect(bloco, "gasta tentativa sem ter como enviar").not.toContain("update");
  });

  it("canal sem transporte devolve a tentativa", () => {
    const whats = FILA.slice(FILA.indexOf('n.canal !== "email"'));
    expect(whats.slice(0, 400)).toContain("tentativas: n.tentativas");
  });

  it("só vira 'falhou' na última tentativa", () => {
    // Antes disso ela continua pendente, para a rodada seguinte tentar.
    expect(FILA).toContain('acabou ? "falhou" : "pendente"');
    expect(FILA).toContain("MAXIMO_TENTATIVAS");
  });
});

describe("a fila não manda duas vezes", () => {
  it("reserva a linha comparando o número de tentativas lido", () => {
    // ⚠️ Sem a reserva, o cron agendado e o botão "processar agora" mandariam
    // a mesma mensagem duas vezes.
    const reserva = FILA.slice(FILA.indexOf("const { data: reservada }"));
    expect(reserva.slice(0, 400)).toContain('.eq("status", "pendente")');
    expect(reserva.slice(0, 400)).toContain('.eq("tentativas", n.tentativas)');
    expect(FILA).toContain("if (!reservada) continue;");
  });

  it("e a reserva vem ANTES do envio", () => {
    expect(FILA.indexOf("const { data: reservada }")).toBeLessThan(FILA.indexOf("transporte.enviar("));
  });

  it("a rodada tem teto", () => {
    // Uma fila grande entregue de uma vez estoura o prazo da função no meio.
    expect(FILA).toContain("POR_RODADA");
    expect(FILA).toContain(".limit(POR_RODADA)");
  });
});

describe("o transporte", () => {
  it("abre UMA conexão para a rodada inteira", () => {
    // ⚠️ Uma conexão por mensagem faz o provedor tratar a rodada como dezenas
    // de logins seguidos — o padrão que ele bloqueia por suspeita de abuso.
    expect(FILA.match(/abrirTransporte\(\)/g)?.length).toBe(1);
    expect(EMAIL).toContain("createTransport(");
  });

  it("distingue TLS desde o primeiro byte de STARTTLS", () => {
    // Marcar `secure` na 587 dá "conexão encerrada" sem explicação nenhuma.
    expect(EMAIL).toContain('secure: p.seguranca === "ssl"');
    expect(EMAIL).toContain('requireTLS: p.seguranca === "starttls"');
  });

  it("manda texto E html", () => {
    // Só HTML cai em filtro de spam com mais facilidade, e some inteiro em
    // cliente que recusa marcação.
    const envio = EMAIL.slice(EMAIL.indexOf("sendMail("));
    expect(envio).toContain("text: m.corpo");
    expect(envio).toContain("html: corpoHtml(");
  });

  it("o assunto passa pelo saneamento de cabeçalho", () => {
    expect(EMAIL).toContain("assuntoSeguro(");
    expect(EMAIL).toContain("remetente(");
  });

  it("não lança quando o envio falha", () => {
    // Uma exceção aqui derrubaria a rodada inteira na primeira mensagem com
    // destino inválido.
    // ⚠️ A asserção olha DENTRO do catch. Procurar só por `try {` e
    // `enviou: false` no arquivo passava com um `throw e` no meio do catch —
    // sobrava o `return` de outro caminho e o teste se dava por satisfeito.
    const enviar = EMAIL.slice(EMAIL.indexOf("async enviar("));
    const catchInicio = enviar.indexOf("} catch (e) {");
    expect(catchInicio, "não achei o catch do envio").toBeGreaterThan(-1);
    const catchBloco = enviar.slice(catchInicio, enviar.indexOf("\n      }", catchInicio));
    expect(catchBloco, "o catch relança e derruba a rodada inteira").not.toContain("throw");
    expect(catchBloco).toContain("enviou: false");
  });
});

describe("o módulo eventos avisa pela fila, e nunca dentro da venda", () => {
  it("a venda enfileira o aviso", () => {
    // ⚠️ A asserção procura a CHAMADA, não o nome. `toContain("avisarDaVenda(")`
    // era satisfeito pela própria declaração da função — dava para apagar a
    // chamada e o teste continuava verde.
    expect(ACOES, "a venda não chama o aviso").toContain("await avisarDaVenda(");
    expect(ACOES).toContain('from "@/lib/comunicacao/fila"');
  });

  it("a transferência também", () => {
    // ⚠️ É o aviso mais importante do módulo: sem ele a pessoa aparece no
    // evento errado, com um comprovante que não vale mais.
    expect(ACOES, "a transferência não chama o aviso")
      .toContain("await avisarDaTransferencia(");
  });

  it("nenhuma ação chama o transporte direto", () => {
    // Um SMTP lento faria o botão girar com a fila na frente do operador.
    expect(ACOES).not.toContain("abrirTransporte");
    expect(ACOES).not.toContain("sendMail");
  });

  it("o aviso tem chave única, amarrada ao que aconteceu", () => {
    expect(ACOES).toContain("chaveUnica: `venda:${grupo}`");
    expect(ACOES).toContain("chaveUnica: `transferencia:${inscricaoId}`");
  });

  it("o e-mail leva o código em texto, não um link do painel", () => {
    // ⚠️ O comprovante com QR mora numa rota que exige sessão: um link ali
    // manda a pessoa para a tela de login de um sistema em que ela não tem
    // conta.
    const aviso = ACOES.slice(ACOES.indexOf("async function avisarDaVenda"));
    expect(aviso.slice(0, 2000)).toContain("código ${c.codigo}");
    expect(aviso.slice(0, 2000)).not.toContain("/eventos/comprovante");
  });
});
