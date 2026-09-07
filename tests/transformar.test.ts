import { describe, expect, it } from "vitest";
import { bool, centavos, chaveNucleo, cielo, texto, transformarParticipante, type ParticipanteMysql } from "../scripts/lib/transformar";

const base: ParticipanteMysql = {
  id: 42,
  nomeCompleto: "  Ana Souza ",
  codSNI: "123456",
  cpf: "529.982.247-25",
  telefone: "(11) 99999-0000",
  email: "Ana@Exemplo.com",
  regional: "Regional Sul",
  organizacao: "Associação X",
  associacaoLocal: null,
  primeiraVez: 1,
  dataNascimento: "1960-05-01",
  endereco: "Rua A, 1",
  bairro: "Centro",
  cidade: "São Paulo",
  estado: "sp",
  createdAt: "2025-01-02T03:04:05.000Z",
};

// A migração é repetível e sem dado pessoal no relatório: por isso toda
// rejeição é um MOTIVO tipado, nunca uma exceção com o conteúdo da linha.
describe("transformarParticipante", () => {
  it("normaliza a linha boa: CPF só dígitos, e-mail minúsculo, UF maiúscula, nome sem espaços", () => {
    const r = transformarParticipante(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pessoa).toMatchObject({
      legado_id: 42, cpf: "52998224725", cod_sni: "123456", nome: "Ana Souza",
      email: "ana@exemplo.com", estado: "SP", nascimento: "1960-05-01", primeira_vez: true,
      regional_nome: "Regional Sul",
    });
    expect(r.avisos).toEqual([]);
  });

  it("rejeita sem CPF e CPF inválido com motivo tipado", () => {
    expect(transformarParticipante({ ...base, cpf: "" })).toEqual({ ok: false, motivo: "sem_cpf", legado_id: 42 });
    expect(transformarParticipante({ ...base, cpf: "52998224726" })).toEqual({ ok: false, motivo: "cpf_invalido", legado_id: 42 });
    expect(transformarParticipante({ ...base, cpf: "00000000000" })).toEqual({ ok: false, motivo: "cpf_invalido", legado_id: 42 });
  });

  it("e-mail em branco vira NULL (nunca string vazia) e e-mail malformado é descartado com aviso", () => {
    const vazio = transformarParticipante({ ...base, email: "  " });
    expect(vazio.ok && vazio.pessoa.email).toBeNull();
    const ruim = transformarParticipante({ ...base, email: "ana@" });
    expect(ruim.ok && ruim.pessoa.email).toBeNull();
    expect(ruim.ok && ruim.avisos[0]).toMatch(/formato/);
  });

  it("CodSNI vazio vira NULL; CodSNI com letra passa com aviso, não rejeita", () => {
    const vazio = transformarParticipante({ ...base, codSNI: "" });
    expect(vazio.ok && vazio.pessoa.cod_sni).toBeNull();
    const letra = transformarParticipante({ ...base, codSNI: "12A" });
    expect(letra.ok && letra.pessoa.cod_sni).toBe("12A");
    expect(letra.ok && letra.avisos.length).toBe(1);
  });
});

describe("conversões de tipo do MySQL", () => {
  it("DECIMAL string → centavos; nulo → 0", () => {
    expect(centavos("150.00")).toBe(15000);
    expect(centavos(null)).toBe(0);
  });
  it("TINYINT(1) → boolean", () => {
    expect(bool(1)).toBe(true);
    expect(bool("1")).toBe(true);
    expect(bool(0)).toBe(false);
    expect(bool(null)).toBe(false);
  });
});

// ─── Conversões da carga de eventos ───────────────────────────────────────

describe("centavos", () => {
  it("converte DECIMAL sem perder o centavo do arredondamento binário", () => {
    // ⚠️ 19.90 * 100 em ponto flutuante dá 1989.9999999999998. Truncar
    // tiraria um centavo de CADA ingresso vendido, e a soma do fechamento não
    // bateria — por um valor pequeno demais para alguém desconfiar do código.
    expect(centavos(19.9)).toBe(1990);
    expect(centavos("19.90")).toBe(1990);
    expect(centavos(0.07)).toBe(7);
    expect(centavos(1234.56)).toBe(123456);
  });
  it("nulo, vazio e lixo viram zero, não NaN", () => {
    // NaN gravado numa coluna `integer` derruba a carga inteira no meio.
    expect(centavos(null)).toBe(0);
    expect(centavos("")).toBe(0);
    expect(centavos("abc")).toBe(0);
    expect(centavos(undefined)).toBe(0);
  });
});

describe("texto", () => {
  it("apara, e vazio vira null — nunca string vazia", () => {
    expect(texto("  Maria  ")).toBe("Maria");
    expect(texto("   ")).toBe(null);
    expect(texto(null)).toBe(null);
  });
});

describe("cielo", () => {
  it("junta as colunas soltas e omite as ausentes", () => {
    const r = cielo({ cieloOrderId: "ABC", cieloBrand: "Visa", cieloTid: null });
    expect(r).toEqual({ order_id: "ABC", bandeira: "Visa" });
  });
  it("descarta a imagem do QR do PIX", () => {
    // longtext com base64, dezenas de kB por linha, para um QR vencido.
    const r = cielo({ cieloPixQrCode: "000201...", cieloPixQrImage: "data:image/png;base64,AAAA" });
    expect(r.pix_qrcode).toBe("000201...");
    expect(Object.keys(r)).not.toContain("pix_qrimage");
    expect(JSON.stringify(r)).not.toContain("base64");
  });
});

// ─── Casamento de nomes da estrutura ──────────────────────────────────────

describe("chaveNucleo", () => {
  it("iguala grafias que uma pessoa lê como a mesma Regional", () => {
    // ⚠️ Sem isto, a carga criaria uma Regional duplicada ao lado da
    // verdadeira, e os relatórios passariam a somar metade em cada uma — erro
    // que só aparece quando alguém estranha um total, meses depois.
    const paulo = chaveNucleo("Regional São Paulo");
    expect(chaveNucleo("REGIONAL SAO PAULO")).toBe(paulo);
    expect(chaveNucleo("  regional   são paulo  ")).toBe(paulo);
    expect(chaveNucleo("São Paulo")).toBe(paulo);
  });
  it("iguala a Organização com e sem o rótulo", () => {
    const prosp = chaveNucleo("Associação da Prosperidade");
    expect(chaveNucleo("Prosperidade")).toBe(prosp);
    expect(chaveNucleo("ASSOCIAÇÃO DA PROSPERIDADE")).toBe(prosp);
  });
  it("não junta o que é diferente de verdade", () => {
    expect(chaveNucleo("Regional Norte")).not.toBe(chaveNucleo("Regional Nordeste"));
    expect(chaveNucleo("Associação dos Jovens")).not.toBe(chaveNucleo("Associação Pomba Branca"));
  });
  it("vazio continua vazio, e não vira uma unidade sem nome", () => {
    expect(chaveNucleo(null)).toBe("");
    expect(chaveNucleo("   ")).toBe("");
    expect(chaveNucleo("Regional")).toBe("");
  });
});
