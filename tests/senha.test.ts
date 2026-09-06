import { describe, expect, it } from "vitest";
import { MIN_SENHA, gerarSenha, validarSenha } from "@/lib/dominio/senha";

const PESSOA = {
  cpf: "52998224725",
  codSni: "1792123",
  email: "maria.silva@exemplo.com.br",
  nome: "Maria Silva",
};

describe("validarSenha", () => {
  it("aceita uma senha comum e razoável", () => {
    expect(validarSenha("Prosperidade26", "Prosperidade26", PESSOA).ok).toBe(true);
  });

  it("exige o mínimo de caracteres", () => {
    const r = validarSenha("abc123", "abc123", PESSOA);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain(String(MIN_SENHA));
  });

  it("exige confirmação idêntica", () => {
    // O caso real: a Sede define às cegas e erra a digitação. Sem esta
    // checagem, a pessoa fica trancada fora de uma conta cuja senha ninguém
    // conhece — nem quem acabou de defini-la.
    const r = validarSenha("Prosperidade26", "Prosperidade25", PESSOA);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/confirmação/i);
  });

  it("recusa espaço nas pontas", () => {
    expect(validarSenha(" Prosperidade26", " Prosperidade26", PESSOA).ok).toBe(false);
    expect(validarSenha("Prosperidade26 ", "Prosperidade26 ", PESSOA).ok).toBe(false);
  });

  describe("o atalho perigoso: usar o próprio cadastro como senha", () => {
    it("recusa o CPF", () => {
      // O CPF é o login (§4.2). Senha igual ao CPF entrega a conta a quem
      // tiver a lista de presença.
      const r = validarSenha("52998224725", "52998224725", PESSOA);
      expect(r.ok).toBe(false);
      expect(r.erro).toMatch(/CPF/);
    });

    it("recusa o CPF disfarçado dentro de outra senha", () => {
      expect(validarSenha("SNI52998224725", "SNI52998224725", PESSOA).ok).toBe(false);
    });

    it("recusa o CPF com máscara", () => {
      expect(validarSenha("529.982.247-25", "529.982.247-25", PESSOA).ok).toBe(false);
    });

    it("recusa o CodSNI, inclusive só decorado com uma letra", () => {
      expect(validarSenha("01792123", "01792123", { ...PESSOA, codSni: "01792123" }).ok).toBe(false);
      // "o CodSNI + uma letra" é o disfarce que todo mundo tenta primeiro, e
      // é a primeira coisa que alguém tentaria adivinhar.
      expect(validarSenha("1792123x", "1792123x", { ...PESSOA, codSni: "1792123" }).ok).toBe(false);
      // Já um CodSNI misturado com outros dígitos deixa de ser o CodSNI.
      expect(validarSenha("Ciclo1792123-26", "Ciclo1792123-26", { ...PESSOA, codSni: "1792123" }).ok).toBe(
        true,
      );
    });

    it("recusa o e-mail e o primeiro nome", () => {
      expect(validarSenha("maria.silva", "maria.silva", PESSOA).ok).toBe(false);
      expect(validarSenha("mariasilva", "mariasilva", { ...PESSOA, nome: "MariaSilva Souza" }).ok).toBe(
        false,
      );
    });

    it("não confunde um CPF de outra pessoa com o desta", () => {
      // A regra é sobre O CADASTRO DESTA PESSOA, não sobre dígitos em geral.
      expect(validarSenha("11144477735", "11144477735", PESSOA).ok).toBe(true);
    });
  });

  it("recusa as previsíveis de sempre", () => {
    for (const s of ["12345678", "password", "senha123", "Mudar123"]) {
      expect(validarSenha(s, s, PESSOA).ok, s).toBe(false);
    }
  });

  it("funciona sem os dados da pessoa, apenas com as regras gerais", () => {
    expect(validarSenha("Prosperidade26", "Prosperidade26").ok).toBe(true);
    expect(validarSenha("curta", "curta").ok).toBe(false);
  });
});

describe("gerarSenha", () => {
  const sequencial = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 256);

  it("respeita o tamanho pedido", () => {
    expect(gerarSenha(12, sequencial)).toHaveLength(12);
    expect(gerarSenha(20, sequencial)).toHaveLength(20);
  });

  it("não usa caracteres que se confundem ao ditar", () => {
    // O/0, l/1/I, S/5, Z/2 fora — a senha nasce para ser lida em voz alta ou
    // copiada de um papel.
    expect(gerarSenha(64, sequencial)).not.toMatch(/[O0l1I5S2Z]/);
  });

  it("o que ela gera passa na própria validação", () => {
    const s = gerarSenha(12, sequencial);
    expect(validarSenha(s, s, PESSOA).ok).toBe(true);
  });

  it("descarta os bytes que enviesariam o sorteio", () => {
    // 255 cai fora do último múltiplo inteiro do alfabeto e deve ser
    // ignorado, em vez de dobrar a chance das primeiras letras.
    const so255 = (n: number) => Uint8Array.from({ length: n }, () => 255);
    let chamadas = 0;
    const fonte = (n: number) => {
      chamadas++;
      return chamadas === 1 ? so255(n) : sequencial(n);
    };
    const s = gerarSenha(8, fonte);
    expect(s).toHaveLength(8);
    expect(chamadas).toBeGreaterThan(1);
  });
});
