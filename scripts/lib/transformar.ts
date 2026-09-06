/**
 * Transformações PURAS da migração MySQL → Postgres. Sem rede, sem banco:
 * recebem a linha de origem e devolvem a linha de destino ou o motivo da
 * rejeição. É o que os testes cobrem.
 */
import { cpfValido, somenteDigitos } from "../../src/lib/dominio/cpf";
import { centavosDe } from "../../src/lib/dominio/dinheiro";

export interface ParticipanteMysql {
  id: number;
  nomeCompleto: string;
  codSNI: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  regional: string | null;
  organizacao: string | null;
  associacaoLocal: string | null;
  primeiraVez: number | null;
  dataNascimento: string | Date | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  createdAt: string | Date | null;
}

export interface PessoaDestino {
  legado_id: number;
  cpf: string;
  cod_sni: string | null;
  nome: string;
  email: string | null;
  telefone: string | null;
  nascimento: string | null;      // YYYY-MM-DD
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  regional_nome: string | null;   // texto livre de origem; resolvido para regionais.id na fase seguinte
  organizacao_nome: string | null;
  associacao_local: string | null;
  primeira_vez: boolean;
  criado_em: string | null;
}

export type MotivoRejeicao = "sem_cpf" | "cpf_invalido" | "sem_nome";

export type ResultadoPessoa =
  | { ok: true; pessoa: PessoaDestino; avisos: string[] }
  | { ok: false; motivo: MotivoRejeicao; legado_id: number };

const limpar = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

/** Datas do MySQL não têm fuso; aqui viram só a data (nascimento) ou ISO. */
export function dataIso(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function transformarParticipante(p: ParticipanteMysql): ResultadoPessoa {
  const nome = limpar(p.nomeCompleto);
  if (!nome) return { ok: false, motivo: "sem_nome", legado_id: p.id };

  const cpf = somenteDigitos(p.cpf);
  if (!cpf) return { ok: false, motivo: "sem_cpf", legado_id: p.id };
  if (!cpfValido(cpf)) return { ok: false, motivo: "cpf_invalido", legado_id: p.id };

  const avisos: string[] = [];
  const emailBruto = limpar(p.email)?.toLowerCase() ?? null;
  const email = emailBruto && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailBruto) ? emailBruto : null;
  if (emailBruto && !email) avisos.push(`e-mail descartado por formato: ${emailBruto}`);

  const codSni = limpar(p.codSNI);
  if (codSni && !/^\d+$/.test(codSni)) avisos.push(`CodSNI com caractere não numérico: ${codSni}`);

  return {
    ok: true,
    avisos,
    pessoa: {
      legado_id: p.id,
      cpf,
      cod_sni: codSni,
      nome,
      email,
      telefone: limpar(p.telefone),
      nascimento: dataIso(p.dataNascimento),
      endereco: limpar(p.endereco),
      bairro: limpar(p.bairro),
      cidade: limpar(p.cidade),
      estado: limpar(p.estado)?.toUpperCase().slice(0, 2) ?? null,
      regional_nome: limpar(p.regional),
      organizacao_nome: limpar(p.organizacao),
      associacao_local: limpar(p.associacaoLocal),
      primeira_vez: Number(p.primeiraVez) === 1,
      criado_em: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    },
  };
}

/** DECIMAL(10,2) do MySQL (string ou número) → centavos. Nulo vira 0. */
export function centavos(v: string | number | null | undefined): number {
  return centavosDe(v) ?? 0;
}

/** TINYINT(1) → boolean. */
export function bool(v: unknown): boolean {
  return Number(v) === 1 || v === true;
}
