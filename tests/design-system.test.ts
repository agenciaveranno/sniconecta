import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokens = readFileSync("src/design/tokens.css", "utf-8");
const nossas = readFileSync("src/design/componentes.css", "utf-8");

describe("tokens.css é o arquivo do design system", () => {
  it("declara a versão no cabeçalho", () => {
    // Sem versão escrita, ninguém sabe se o arquivo está atrasado — foi assim
    // que o projeto ficou no v2.7 enquanto o design system ia para o v2.9.
    expect(tokens).toMatch(/DESIGN SYSTEM v\d+\.\d+/);
  });

  it("as fontes vêm do next/font, não do nome literal da família", () => {
    // ⚠️ ESTA É A ÚNICA adaptação nossa ao arquivo do design system, e ela se
    // perde a cada nova versão colada por cima. O arquivo publicado escreve
    // 'Figtree' literal, que pede a fonte ao sistema operacional de quem abre
    // a tela: onde ela não estiver instalada, o sistema inteiro cai para o
    // fallback sem avisar ninguém. Aqui as três chegam pelo next/font, que
    // baixa, hospeda e versiona os arquivos.
    for (const familia of ["figtree", "platypi", "plex-mono"]) {
      expect(tokens).toContain(`var(--font-${familia})`);
    }
    expect(tokens).not.toMatch(/--font\s*:\s*'Figtree'/);
  });

  it("traz o reset de caixa, que é a correção que o v2.9 publicou", () => {
    // Sem ele, `min-height` e `width:100%` valem para a caixa de conteúdo e o
    // padding é somado por fora: os campos crescem ~20px e ficam mais largos
    // que os selects. Foi o bug que inflou os campos em produção.
    expect(tokens).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{\s*box-sizing:\s*border-box/);
  });

  it("as duas faixas do cabeçalho usam o mesmo token de altura", () => {
    // .brand (lateral) e .topbar fecham na mesma linha horizontal. Se virarem
    // dois valores independentes, divergem na próxima mudança.
    const brand = tokens.match(/\.brand\{[^}]*\}/)?.[0] ?? "";
    const topbar = tokens.match(/\.topbar\{[^}]*\}/)?.[0] ?? "";
    expect(brand).toContain("height:var(--header-h)");
    expect(topbar).toContain("height:var(--header-h)");
  });
});

describe("componentes.css só acrescenta", () => {
  it("nenhuma regra nossa é escrita sem o prefixo sni-", () => {
    // ⚠️ Uma classe sem prefixo aqui SOBRESCREVE o design system em silêncio, e
    // a sobrescrita sobrevive à troca do tokens.css — a tela passa a ter duas
    // aparências para a mesma coisa, e ninguém sabe qual manda.
    //
    // Combinar com uma classe do sistema é permitido (`.btn-icon.sni-btn-xs`):
    // o que se proíbe é REDEFINIR uma classe do sistema sozinha.
    const seletores = nossas
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((b) => b.split("{")[0].trim())
      .filter(Boolean);

    const culpados: string[] = [];
    for (const s of seletores) {
      if (s.startsWith("@") || s.startsWith(":root") || !s.includes(".")) continue;
      for (const parte of s.split(",")) {
        const classes = parte.match(/\.[a-zA-Z][a-zA-Z0-9_-]*/g) ?? [];
        if (classes.length && !classes.some((c) => c.startsWith(".sni-"))) {
          culpados.push(parte.trim());
        }
      }
    }
    expect(culpados).toEqual([]);
  });
});

describe("o cadastro lê da esquerda", () => {
  // Regras de `componentes.css` separadas em seletor e corpo, sem comentários.
  const regras = nossas
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .map((bloco) => {
      const [seletor, corpo] = bloco.split("{");
      return { seletor: (seletor ?? "").trim(), corpo: (corpo ?? "").trim() };
    })
    .filter((r) => r.seletor && r.corpo);

  const alcanca = (r: { seletor: string }, classe: string) =>
    r.seletor.split(",").some((parte) => parte.trim().endsWith(classe));

  it("o modal corta o alinhamento herdado de onde foi aberto", () => {
    // ⚠️ O <dialog> nasce no ponto do gatilho, e o gatilho de editar mora na
    // última célula da tabela, alinhada à direita (`Celula alinhar="right"`).
    // `text-align` é herdado: sem este corte no topo do modal, o formulário
    // inteiro sai à direita — título de seção, texto de apoio, erro.
    const corta = regras.some(
      (r) => alcanca(r, ".sni-modal") && /text-align:\s*left/.test(r.corpo)
    );
    expect(corta).toBe(true);
  });

  it("nenhuma regra desenha linha embaixo do rótulo", () => {
    // ⚠️ A régua sob cada rótulo apareceu porque as declarações de alinhamento
    // foram FUNDIDAS com a regra de `.sni-abas`, e o `border-bottom` das abas
    // passou a valer para todo `.sni-label`. Rótulo não tem linha por baixo; a
    // régua é das abas.
    const comLinha = regras
      .filter((r) => alcanca(r, ".sni-label") && /border(-bottom)?\s*:/.test(r.corpo))
      .map((r) => r.seletor);
    expect(comLinha).toEqual([]);
  });

  it("enxerga as regras que deveria", () => {
    // Sem isto, um erro de leitura do arquivo faria as duas asserções acima
    // passarem por lista vazia — e o defeito voltaria calado.
    expect(regras.length).toBeGreaterThan(50);
    expect(regras.some((r) => alcanca(r, ".sni-label"))).toBe(true);
  });
});

describe("o formulário tem um ritmo só", () => {
  it("o corpo do modal e o formulário de página declaram o mesmo vão", () => {
    // ⚠️ 16px é o vão do `.form-grid` do design system. Empilhado tem de medir
    // o mesmo que lado a lado, senão o formulário lê como duas grades. Sem esta
    // declaração os blocos se encostam: só quem está dentro de um `.form-grid`
    // respira, e o rótulo de um bloco nasce colado no campo do bloco anterior.
    const regra = nossas
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((b) => ({ seletor: (b.split("{")[0] ?? "").trim(), corpo: (b.split("{")[1] ?? "").trim() }))
      .find((r) => r.seletor.includes(".sni-modal-body") && r.seletor.includes(".sni-form"));

    expect(regra).toBeDefined();
    expect(regra!.corpo).toMatch(/display:\s*grid/);
    expect(regra!.corpo).toMatch(/gap:\s*16px/);
  });

  it("nenhuma tela monta o layout do formulário por style inline", () => {
    // ⚠️ Quatro telas declaravam `display: grid; gap: 16` no próprio <form>,
    // cada uma por conta própria — a mesma dívida em quatro cópias, e a que
    // esquecesse ficava com os campos grudados. O espaçamento é do sistema.
    const culpados: string[] = [];
    for (const a of globSync("src/**/*.tsx")) {
      for (const [i, linha] of readFileSync(a, "utf-8").split("\n").entries()) {
        if (/<form\b[^>]*\bstyle=\{\{/.test(linha)) culpados.push(`${a}:${i + 1}`);
      }
    }
    expect(culpados).toEqual([]);
  });
});

describe("o navegador não preenche campo que ninguém pediu", () => {
  it("todo campo de senha declara para que serve", () => {
    // ⚠️ `autocomplete="off"` NÃO vale em campo de senha: o Chrome o ignora e
    // preenche com a credencial salva. Foi assim que a Merchant Key da Cielo
    // era gravada, cifrada, com a senha de quem estava editando — derrubando a
    // venda da entidade sem erro nenhum aparecer na tela.
    //
    // O valor tem de ser explícito: `current-password` onde a pessoa digita a
    // senha DELA, `new-password` em todo o resto — inclusive no segredo que
    // nem senha é, porque é o único valor que significa "não preencha com a
    // guardada".
    const culpados: string[] = [];
    for (const a of globSync("src/**/*.tsx")) {
      // ⚠️ Comentário fora, NUMERAÇÃO intacta: um comentário que explica a
      // armadilha cita `type="password"` em prosa, e sem isto ele seria
      // acusado de ser a armadilha. Cada comentário vira o mesmo tanto de
      // linhas em branco para o número da linha continuar apontando o lugar
      // certo quando a asserção reprovar alguém de verdade.
      const linhas = readFileSync(a, "utf-8")
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
        .replace(/\/\/[^\n]*/g, "")
        .split("\n");
      for (const [i, linha] of linhas.entries()) {
        if (!/type="password"/.test(linha)) continue;
        // O atributo pode estar na mesma linha ou nas vizinhas, porque o
        // formatador quebra a marcação quando ela cresce.
        const janela = linhas.slice(Math.max(0, i - 4), i + 5).join("\n");
        if (!/autoComplete="(current-password|new-password)"/.test(janela)) {
          culpados.push(`${a}:${i + 1}`);
        }
      }
    }
    expect(culpados).toEqual([]);
  });

  it("enxerga os campos de senha que deveria", () => {
    // Sem isto, um erro de leitura faria a asserção acima passar por lista
    // vazia — e o defeito voltaria calado.
    const quantos = globSync("src/**/*.tsx")
      .flatMap((a) =>
        readFileSync(a, "utf-8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .split("\n")
      )
      .filter((l) => /type="password"/.test(l)).length;
    expect(quantos).toBeGreaterThan(5);
  });
});

describe("nomenclatura da instituição", () => {
  it("a forma com \"do Brasil\" em minúsculas não aparece em lugar nenhum", () => {
    // Regra da Sede: sempre que "do Brasil" acompanha o nome, o conjunto
    // inteiro vai em caixa alta. `Seicho-No-Ie` sozinho é livre.
    // ⚠️ `docs/estudo/` fica de fora, e a exceção é deliberada: aqueles
    // arquivos TRANSCREVEM as telas dos sistemas antigos, onde a grafia errada
    // está, justamente para marcá-la como pendência de correção ("fere a regra
    // do AGENTS.md", "corrigir ao portar"). Proibi-la ali apagaria a lista do
    // que falta consertar. A regra vale para o que a instituição PUBLICA.
    const arquivos = [
      ...globSync("src/**/*.{ts,tsx,css}"),
      ...globSync("docs/decisoes/*.md"),
      "AGENTS.md",
    ];
    const culpados: string[] = [];
    for (const a of arquivos) {
      for (const [i, linha] of readFileSync(a, "utf-8").split("\n").entries()) {
        if (/Seicho-No-Ie\s+do\s+Brasil/i.test(linha) && !/SEICHO-NO-IE DO BRASIL/.test(linha)) {
          culpados.push(`${a}:${i + 1}`);
        }
      }
    }
    expect(culpados).toEqual([]);
  });

  it("enxerga os arquivos que deveria", () => {
    expect(globSync("src/**/*.{ts,tsx,css}").length).toBeGreaterThan(30);
  });
});
