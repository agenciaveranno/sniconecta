import { describe, expect, it } from "vitest";
import { dataBR } from "@/lib/colegiados";

/**
 * ⚠️ A armadilha: `new Date("2026-09-01").toLocaleDateString("pt-BR")` devolve
 * **31/08/2026**. Data sem hora é interpretada como UTC meia-noite, e o Brasil
 * fica a oeste de Greenwich — o relógio local ainda está no dia anterior.
 *
 * Numa tela de mandatos isso não é detalhe: toda posse do dia 1º apareceria
 * como dia 31 do mês anterior, e um mandato que começa em setembro — como o do
 * CDOR — seria lido como começando em agosto. Quem confere contra a ata acha
 * que o sistema está errado, e está mesmo.
 */
describe("data do banco não anda um dia para trás", () => {
  it("o primeiro dia do mês continua sendo o primeiro", () => {
    expect(dataBR("2026-09-01")).toBe("01/09/2026");
    expect(dataBR("2026-01-01")).toBe("01/01/2026");
  });

  it("prova que o caminho ingênuo erra — é por isso que a função existe", () => {
    // Se um dia o Node passar a interpretar isto como hora local, este teste
    // reprova e a função pode ser simplificada. Enquanto reprovar aqui, não.
    const ingenuo = new Date("2026-09-01").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    expect(ingenuo).not.toBe("01/09/2026");
    expect(dataBR("2026-09-01")).not.toBe(ingenuo);
  });

  it("aceita carimbo com hora e devolve só o dia", () => {
    expect(dataBR("2026-12-25T15:30:00Z")).toBe("25/12/2026");
  });

  it("sem data, um traço — não a palavra 'null' na tela", () => {
    expect(dataBR(null)).toBe("—");
  });
});
