import { describe, expect, it } from "vitest";
import { bool, centavos, transformarParticipante, type ParticipanteMysql } from "../scripts/lib/transformar";

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
