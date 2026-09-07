import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SCRIPT = readFileSync("scripts/migrar-mysql.ts", "utf8");
const WORKFLOW = readFileSync(".github/workflows/migrar.yml", "utf8");

/** As chaves de `const FASES = { ... }`, na ordem em que o script as executa. */
function fasesDoScript(): string[] {
  const bloco = SCRIPT.split("const FASES: Record<string, () => Promise<void>> = {")[1]
    ?.split("\n};")[0];
  expect(bloco, "não achei o catálogo FASES no script").toBeTruthy();
  return [...bloco.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
}

/** As opções do menu `fase` no workflow. */
function fasesDoWorkflow(): string[] {
  const linha = WORKFLOW.split("\n").find((l) => l.trim().startsWith("options: [todas"));
  expect(linha, "não achei a lista de opções da fase no workflow").toBeTruthy();
  return linha!.split("[")[1].split("]")[0].split(",").map((s) => s.trim());
}

describe("as fases da carga", () => {
  it("o menu do workflow oferece exatamente as fases que o script tem", () => {
    // ⚠️ Já custou uma carga: o menu era texto livre, alguém pediu "todas", o
    // script não reconheceu, pulou TODAS as fases e saiu com sucesso e
    // relatório vazio. Um no-op com cara de carga concluída é pior que um
    // erro — ninguém confere o que acha que já foi feito.
    expect(fasesDoWorkflow()).toEqual(["todas", ...fasesDoScript()]);
  });

  it('o script trata "todas" e vazio como rodar tudo', () => {
    expect(SCRIPT).toMatch(/!v \|\| v === "todas" \? null : v/);
  });

  it("o script PARA quando o nome da fase não existe", () => {
    expect(SCRIPT).toMatch(/if \(soFase && !\(soFase in FASES\)\)/);
    expect(SCRIPT).toMatch(/Nenhuma fase rodou/);
  });
});
