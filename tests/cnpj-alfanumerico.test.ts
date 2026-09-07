import { describe, expect, it } from "vitest";
import {
  cnpjAlfanumerico, cnpjValido, filialCnpj, formatarCnpj,
  mascararCnpj, mesmaRaiz, raizCnpj, somenteDigitos,
} from "@/lib/dominio/cnpj";

describe("CNPJ", () => {
  it("continua aceitando o numérico de sempre", () => {
    // ⚠️ A regra nova generaliza a antiga em vez de substituí-la: se algum
    // CNPJ numérico deixasse de valer, toda unidade já cadastrada quebraria.
    expect(cnpjValido("61278388000181")).toBe(true);
    expect(cnpjValido("61.278.388/0001-81")).toBe(true);
    expect(cnpjValido("61278388000182")).toBe(false);
  });

  it("aceita o alfanumérico da Receita", () => {
    // Doze alfanuméricos + dois dígitos verificadores. O valor de cada
    // caractere é o ASCII menos 48: 'A' vale 17, 'Z' vale 42.
    expect(cnpjValido("12ABC34501DE35")).toBe(true);
    expect(cnpjValido("12.ABC.345/01DE-35")).toBe(true);
    expect(cnpjValido("12ABC34501DE36")).toBe(false);
  });

  it("recusa letra nos dois verificadores", () => {
    // Eles continuam numéricos mesmo no formato novo.
    expect(cnpjValido("12ABC34501DEA5")).toBe(false);
  });

  it("normaliza para caixa alta sem pontuação", () => {
    expect(somenteDigitos("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(cnpjValido("12abc34501de35")).toBe(true);
  });

  it("diz quando o CNPJ é alfanumérico", () => {
    expect(cnpjAlfanumerico("12ABC34501DE35")).toBe(true);
    expect(cnpjAlfanumerico("61278388000181")).toBe(false);
  });

  it("raiz e filial funcionam nos dois formatos", () => {
    expect(raizCnpj("12ABC34501DE35")).toBe("12ABC345");
    expect(filialCnpj("12ABC34501DE35")).toBe("01DE");
    expect(mesmaRaiz("12ABC34501DE35", "12.ABC.345/0002-XX")).toBe(true);
    expect(mesmaRaiz("61278388000181", "12ABC34501DE35")).toBe(false);
  });

  it("formata e mascara enquanto se digita", () => {
    expect(formatarCnpj("12ABC34501DE35")).toBe("12.ABC.345/01DE-35");
    expect(mascararCnpj("61")).toBe("61");
    expect(mascararCnpj("612783")).toBe("61.278.3");
    expect(mascararCnpj("6127838800")).toBe("61.278.388/00");
    expect(mascararCnpj("61278388000181")).toBe("61.278.388/0001-81");
    // Digitar além do fim não empurra caractere para dentro da máscara.
    expect(mascararCnpj("6127838800018199")).toBe("61.278.388/0001-81");
  });

  it("recusa placeholder de caractere repetido", () => {
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("AAAAAAAAAAAA00")).toBe(false);
  });
});
