import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MATRIZ,
  NOME_PAPEL,
  PAPEIS_NACIONAIS,
  capacidadesDe,
  papelPrincipal,
  type Capacidade,
  type TipoPapel,
} from "@/lib/permissoes";

const FUNDACAO = "supabase/migrations/20260906190000_fundacao_plataforma.sql";
const sql = readFileSync(FUNDACAO, "utf8");

// A matriz é dado. Estes testes protegem as decisões que custariam caro se
// mudassem sem ninguém notar.
describe("matriz de capacidades", () => {
  it("sede alcança tudo que qualquer outro papel alcança", () => {
    const sede = new Set(MATRIZ.sede);
    for (const [tipo, caps] of Object.entries(MATRIZ)) {
      for (const c of caps) expect(sede.has(c), `${tipo} tem ${c} mas sede não`).toBe(true);
    }
  });

  // Perder capacidade em silêncio é o erro mais provável aqui: a matriz é uma
  // lista longa, e um papel que encolhe só aparece quando alguém não consegue
  // trabalhar. Os números vêm da matriz do sistema do Ciclo, que a Sede já usa.
  it("cada papel mantém o alcance que tinha", () => {
    const esperado: Record<TipoPapel, number> = {
      sede: 31,
      coordenador: 12,
      orientador: 4,
      presidente_uap: 3,
      professor: 2,
      aluno: 1,
      eventos_admin: 9,
      eventos_operador: 3,
    };
    for (const [tipo, n] of Object.entries(esperado)) {
      expect(capacidadesDe(tipo as TipoPapel).length, `papel ${tipo}`).toBe(n);
    }
  });

  it("as três regras que vêm da especificação, não da nossa escolha", () => {
    // §7.4 — o Coordenador autoriza desconto sem aval da Sede.
    expect(capacidadesDe("coordenador")).toContain("ciclo.desconto.autorizar");
    // §6.3 — quem dispensa o pré-requisito é o Orientador Responsável.
    expect(capacidadesDe("orientador")).toContain("ciclo.prerequisito.dispensar");
    expect(capacidadesDe("coordenador")).not.toContain("ciclo.prerequisito.dispensar");
    // §5.3 — o aluno vê a própria matrícula.
    expect(capacidadesDe("aluno")).toEqual(["ciclo.matricula.ver"]);
  });

  it("duas portas para a mesma decisão viram descontrole", () => {
    // O Presidente de UAP enxerga o financeiro porque responde
    // institucionalmente, mas conceder desconto é só do Coordenador.
    expect(capacidadesDe("presidente_uap")).toContain("ciclo.financeiro.ver");
    expect(capacidadesDe("presidente_uap")).not.toContain("ciclo.desconto.autorizar");
  });

  it("operador de eventos vende e faz check-in, mas não configura nem estorna", () => {
    const op = capacidadesDe("eventos_operador");
    expect(op).toContain("eventos.vender");
    expect(op).toContain("eventos.checkin");
    expect(op).not.toContain("eventos.configurar");
    expect(op).not.toContain("eventos.estornos.gerir");
  });
});

// Minimização (LGPD art. 6, III): juntar curso, evento e, depois, contribuição
// na mesma pessoa só é aceitável se cada módulo enxergar o seu. É o prefixo
// que sustenta isso, e é por isso que ele é testado e não só combinado.
describe("minimização entre módulos", () => {
  const modulos = ["ciclo", "eventos"] as const;

  it("papel de um módulo não recebe capacidade de outro", () => {
    const de = (m: string) => (c: Capacidade) => c.startsWith(`${m}.`);
    expect(capacidadesDe("coordenador").filter(de("eventos"))).toEqual([]);
    expect(capacidadesDe("orientador").filter(de("eventos"))).toEqual([]);
    expect(capacidadesDe("professor").filter(de("eventos"))).toEqual([]);
    expect(capacidadesDe("aluno").filter(de("eventos"))).toEqual([]);
    expect(capacidadesDe("eventos_admin").filter(de("ciclo"))).toEqual([]);
    expect(capacidadesDe("eventos_operador").filter(de("ciclo"))).toEqual([]);
  });

  it("capacidade de módulo leva prefixo; a de plataforma não leva nenhum", () => {
    const plataforma = new Set<Capacidade>([
      "estrutura.gerir", "pessoa.gerir", "papel.conceder", "acesso.gerir",
      "configuracao.gerir", "lgpd.decidir", "auditoria.ver",
    ]);
    for (const c of new Set(Object.values(MATRIZ).flat())) {
      const temPrefixo = modulos.some((m) => c.startsWith(`${m}.`));
      expect(temPrefixo || plataforma.has(c), `capacidade "${c}" sem lugar definido`).toBe(true);
    }
  });

  it("o financeiro do Ciclo é do Ciclo — não vira o financeiro de tudo", () => {
    // Quando a Missão Sagrada entrar, ela terá missao.contribuicao.ver. Um
    // "financeiro.ver" sem prefixo faria o coordenador do curso enxergar
    // doação sem ninguém ter decidido isso.
    expect(Object.values(MATRIZ).flat()).not.toContain("financeiro.ver");
  });
});

// A matriz vive em TypeScript e o catálogo vive no banco. Se divergirem, a
// interface oferece o que o gatilho vai recusar — e o erro aparece só na
// tela de quem estava trabalhando.
describe("matriz e migração dizem a mesma coisa", () => {
  const seeds = [...sql.matchAll(/\('([a-z_]+)',\s*'[^']*',\s*'(plataforma|ciclo|eventos)',\s*'(nacional|unidade)'/g)];

  it("o seed de tipos_papel foi encontrado na migração", () => {
    expect(seeds.length).toBeGreaterThan(0);
  });

  it("todo papel do catálogo existe na matriz, e vice-versa", () => {
    const noBanco = seeds.map((m) => m[1]).sort();
    const naMatriz = Object.keys(MATRIZ).sort();
    expect(noBanco).toEqual(naMatriz);
  });

  it("quem é nacional no banco é nacional na matriz", () => {
    for (const [, codigo, , escopo] of seeds) {
      expect(
        PAPEIS_NACIONAIS.has(codigo as TipoPapel),
        `${codigo} é "${escopo}" no banco`
      ).toBe(escopo === "nacional");
    }
  });

  it("todo papel tem nome para a tela", () => {
    for (const tipo of Object.keys(MATRIZ) as TipoPapel[]) {
      expect(NOME_PAPEL[tipo], `papel ${tipo} sem rótulo`).toBeTruthy();
    }
  });
});

describe("papel principal", () => {
  it("escolhe o de maior alcance, não o primeiro da lista", () => {
    expect(papelPrincipal(["aluno", "sede", "professor"])).toBe("sede");
    expect(papelPrincipal(["professor", "coordenador"])).toBe("coordenador");
  });
  it("sem papel nenhum, não inventa um", () => {
    expect(papelPrincipal([])).toBeNull();
  });
});
