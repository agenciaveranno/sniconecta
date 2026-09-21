import { describe, expect, it } from "vitest";
import * as Icones from "@tabler/icons-react";
import { MODULOS } from "@/modulos/registro";
import { MATRIZ } from "@/lib/permissoes";

/**
 * O registro de módulos é dado, e dado errado aqui some da tela em silêncio.
 *
 * ⚠️ `AppShell` resolve o ícone pelo NOME, e devolve `null` quando não acha.
 * Um nome errado não quebra build, não quebra typecheck e não quebra teste: o
 * item aparece na barra lateral sem ícone nenhum, torto, e ninguém liga o
 * defeito à letra trocada no registro.
 */
describe("todo item do menu aponta para algo que existe", () => {
  const itens = MODULOS.flatMap((m) => m.itens);

  it("enxerga os itens", () => {
    expect(itens.length, "não li item nenhum — o extrator cegou").toBeGreaterThan(10);
  });

  it("todo ícone existe no pacote", () => {
    const disponiveis = Icones as unknown as Record<string, unknown>;
    const sumidos = itens.filter((i) => !disponiveis[i.icone]).map((i) => `${i.rotulo}: ${i.icone}`);
    expect(sumidos, `ícone que não existe: ${sumidos.join(", ")}`).toEqual([]);
  });

  it("toda capacidade exigida existe na matriz", () => {
    // ⚠️ Capacidade que ninguém tem esconde o item de TODO MUNDO, inclusive da
    // Sede — e a tela existe, responde, e simplesmente não aparece no menu.
    const todas = new Set(Object.values(MATRIZ).flat());
    const orfas = itens.filter((i) => !todas.has(i.capacidade)).map((i) => i.capacidade);
    expect(orfas, `capacidade fora da matriz: ${orfas.join(", ")}`).toEqual([]);
  });

  it("nenhum endereço repetido", () => {
    const hrefs = itens.map((i) => i.href);
    expect(hrefs.length - new Set(hrefs).size, "dois itens para o mesmo endereço").toBe(0);
  });
});
