import { describe, expect, it } from "vitest";
import {
  assuntoSeguro, corpoHtml, escaparHtml, remetente,
} from "@/lib/comunicacao/mensagem";

describe("o texto de gente entrando no HTML", () => {
  it("escapa o que vira marcação", () => {
    expect(escaparHtml('<b>x</b> & "y"')).toBe("&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;");
  });

  it("o & vem PRIMEIRO, senão desfaz os escapes seguintes", () => {
    // Na outra ordem, o `&` que `&lt;` introduz viraria `&amp;lt;` e o leitor
    // veria a sequência crua em vez do sinal de menor.
    expect(escaparHtml("<")).toBe("&lt;");
    expect(escaparHtml("&lt;")).toBe("&amp;lt;");
  });

  it("um comentário com marcação não injeta link no e-mail", () => {
    const html = corpoHtml('Obs: <a href="http://x">clique</a>');
    expect(html).not.toContain("<a href");
    expect(html).toContain("&lt;a href=&quot;http://x&quot;&gt;");
  });

  it("parágrafo vira <p> e quebra simples vira <br>", () => {
    const html = corpoHtml("um\ndois\n\ntrês");
    expect(html).toContain("um<br>dois");
    expect(html.match(/<p /g)?.length).toBe(2);
  });
});

describe("os cabeçalhos", () => {
  it("o nome do remetente vai entre aspas, com as internas escapadas", () => {
    // ⚠️ Sem isso, um remetente com aspas quebra o cabeçalho ao meio e o
    // servidor recusa a mensagem inteira.
    expect(remetente('SEICHO-NO-IE "SNI"', "x@y.com")).toBe('"SEICHO-NO-IE \\"SNI\\"" <x@y.com>');
  });

  it("quebra de linha no nome não passa", () => {
    expect(remetente("SNI\r\nBcc: alguem@x", "x@y.com")).not.toMatch(/[\r\n]/);
  });

  it("o assunto perde a quebra de linha", () => {
    // ⚠️ Uma quebra no meio do assunto termina o cabeçalho e transforma o
    // resto em cabeçalhos novos — é assim que se injeta um `Bcc:`.
    expect(assuntoSeguro("Seu ingresso\r\nBcc: alguem@x")).toBe("Seu ingresso Bcc: alguem@x");
    expect(assuntoSeguro("a\nb")).not.toMatch(/[\r\n]/);
  });

  it("o assunto não cresce sem fim", () => {
    expect(assuntoSeguro("x".repeat(500)).length).toBe(200);
  });
});
