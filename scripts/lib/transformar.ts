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

/**
 * DECIMAL(10,2) do MySQL → centavos. Nulo vira 0.
 *
 * Aceita `unknown` porque o driver devolve `unknown` para toda coluna, e
 * exigir o tipo certo aqui só empurraria um `as` para cada uma das dezenas de
 * chamadas — onde ele deixaria de ser conversão e passaria a ser afirmação
 * sem prova.
 */
export function centavos(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  return centavosDe(typeof v === "number" || typeof v === "string" ? v : String(v)) ?? 0;
}

/** TINYINT(1) → boolean. */
export function bool(v: unknown): boolean {
  return Number(v) === 1 || v === true;
}


// ─── Conversões da carga de eventos ───────────────────────────────────────
//
// Vivem aqui, e não no script, porque são as decisões que mais erram em
// silêncio: um centavo a menos por ingresso não derruba nada, e a soma do
// fechamento não bate.

/** Texto aparado; vazio vira null, nunca string vazia. */
export function texto(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v);
  return t.length > 0 ? t : null;
}

export function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function data(v: unknown): Date | string | null {
  if (v === null || v === undefined || v === "") return null;
  return v instanceof Date ? v : String(v);
}

/**
 * As doze colunas `cielo*` da origem viram um jsonb.
 *
 * ⚠️ `cieloPixQrImage` fica DE FORA. É longtext com a imagem em base64 —
 * dezenas de kilobytes por linha, para um QR que expirou há meses. A imagem
 * se regenera a partir do código quando alguém precisar.
 */
export function cielo(l: Record<string, unknown>): Record<string, unknown> {
  const campos: Record<string, unknown> = {
    order_id: texto(l.cieloOrderId),
    payment_id: texto(l.cieloPaymentId),
    metodo: texto(l.cieloPaymentMethod),
    tid: texto(l.cieloTid),
    codigo_autorizacao: texto(l.cieloAuthCode),
    bandeira: texto(l.cieloBrand),
    pix_qrcode: texto(l.cieloPixQrCode),
    pix_expira_em: l.cieloPixExpiresAt instanceof Date ? l.cieloPixExpiresAt.toISOString() : texto(l.cieloPixExpiresAt),
    retorno_codigo: texto(l.cieloReturnCode),
    retorno_mensagem: texto(l.cieloReturnMessage),
  };
  for (const k of Object.keys(campos)) if (campos[k] === null) delete campos[k];
  return campos;
}


// ─── Casamento de nomes com a estrutura institucional ─────────────────────
//
// A origem guarda Regional, Organização e Associação Local como TEXTO LIVRE.
// Estas funções decidem quando dois textos são a mesma unidade.
//
// ⚠️ É aqui que uma carga cria estrutura duplicada. "REGIONAL SÃO PAULO",
// "Regional Sao Paulo" e "São Paulo" são a mesma coisa para uma pessoa e três
// coisas para um `=`. Duplicar não derruba nada na hora — faz os relatórios
// somarem metade em cada uma, e só aparece quando alguém estranha um total.

/** Nome comparável: sem acento, sem caixa, sem espaço duplo, sem pontuação. */
export function chaveNome(v: unknown): string {
  return (texto(v) ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A mesma chave, sem as palavras que a instituição usa como rótulo.
 *
 * "Regional São Paulo" e "São Paulo" são a mesma Regional; "Associação da
 * Prosperidade" e "Prosperidade" são a mesma Organização. Comparar sem tirar
 * o rótulo duplicaria quase tudo.
 */
export function chaveNucleo(v: unknown): string {
  return chaveNome(v)
    // ⚠️ `(\s+|$)`, e não `\s+`: o texto "Regional" sozinho — lixo que a
    // origem tem — viraria uma unidade chamada "Regional" pendurada na Sede.
    // Com o `$`, ele se reduz a vazio e a pessoa é contada como sem Regional.
    .replace(/^(regional|associacao local|associacao|organizacao|nucleo|al)(\s+|$)/, "")
    .replace(/^(da|de|do|dos|das)(\s+|$)/, "")
    .trim();
}
