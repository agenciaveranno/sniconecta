import "server-only";
import { criarClienteServico } from "@/lib/supabase/service";
import type { ChavePixRow, ContaBancariaRow } from "@/lib/supabase/tipos";

/**
 * Contas bancárias, chaves Pix e maquininhas das entidades.
 *
 * ⚠️ Tudo passa pelo SERVIDOR com a chave de serviço, e não é descuido: as
 * três tabelas nascem SEM GRANT para `anon` e `authenticated` (migração
 * `20260907120000_contas_bancarias.sql`). Dado bancário não se protege por
 * policy de leitura — quem alcança a tabela alcança agência, conta e chave
 * Pix de toda a instituição. Quem confere a capacidade é o chamador, antes.
 *
 * ⚠️ O que mora aqui é a IDENTIFICAÇÃO da conta. A credencial da operadora
 * (Merchant Key da Cielo) continua em `credenciais`, cifrada — ver
 * `src/lib/credenciais.ts`. Misturar as duas rebaixaria a proteção da segunda
 * ao nível da primeira.
 */

export type ChavePix = ChavePixRow;
export type ContaBancaria = ContaBancariaRow;

export type ContaComPix = ContaBancaria & { chaves: ChavePix[] };

export const TIPOS_CONTA = [
  { codigo: "corrente", nome: "Corrente" },
  { codigo: "poupanca", nome: "Poupança" },
  { codigo: "pagamento", nome: "Pagamento" },
] as const;

export const TIPOS_PIX = [
  { codigo: "cpf", nome: "CPF" },
  { codigo: "cnpj", nome: "CNPJ" },
  { codigo: "email", nome: "E-mail" },
  { codigo: "telefone", nome: "Telefone" },
  { codigo: "aleatoria", nome: "Aleatória" },
] as const;

/** Formato de tela: "0341 · 1234-5 / 67890-1". */
export function descreverConta(c: ContaBancaria): string {
  const banco = [c.banco_codigo, c.banco_nome].filter(Boolean).join(" ");
  const agencia = c.agencia ? `${c.agencia}${c.agencia_dv ? `-${c.agencia_dv}` : ""}` : null;
  const conta = c.conta ? `${c.conta}${c.conta_dv ? `-${c.conta_dv}` : ""}` : null;
  const numeros = [agencia, conta].filter(Boolean).join(" / ");
  return [banco || null, numeros || null].filter(Boolean).join(" · ") || "—";
}

/**
 * As contas de uma unidade, com as chaves Pix de cada uma.
 *
 * ⚠️ Duas consultas, e não uma por conta: a tela mostra a contagem de chaves
 * em cada linha, e uma ida ao banco por linha faria a aba de Pagamento esperar
 * tantas viagens quantas contas a Regional tiver.
 */
export async function contasDaUnidade(unidadeId: string): Promise<ContaComPix[]> {
  const servico = criarClienteServico();

  const { data: contas, error } = await servico
    .from("contas_bancarias")
    .select("*")
    .eq("unidade_id", unidadeId)
    .order("ativo", { ascending: false })
    .order("apelido");

  // ⚠️ Erro não é lista vazia. Sem esta linha, banco fora do ar vira "esta
  // Regional não tem conta" — e alguém cadastra a segunda.
  if (error) throw new Error(`Não foi possível ler as contas desta unidade: ${error.message}`);
  if (!contas || contas.length === 0) return [];

  const { data: chaves, error: erroPix } = await servico
    .from("chaves_pix")
    .select("*")
    .in("conta_id", contas.map((c) => c.id as string));
  if (erroPix) throw new Error(`Não foi possível ler as chaves Pix: ${erroPix.message}`);

  const porConta = new Map<string, ChavePix[]>();
  for (const k of (chaves ?? []) as ChavePix[]) {
    porConta.set(k.conta_id, [...(porConta.get(k.conta_id) ?? []), k]);
  }

  return (contas as ContaBancaria[]).map((c) => ({ ...c, chaves: porConta.get(c.id) ?? [] }));
}

export type Resultado = { ok: true } | { ok: false; erro: string };

/**
 * ⚠️ A recusa do banco vira frase sobre a consequência, não sobre a coluna.
 * "duplicate key value violates unique constraint chave_pix_unica" não diz a
 * quem lê que a chave já está em outra conta — e quem não entende a mensagem
 * tenta de novo igual.
 */
function traduzir(mensagem: string): string {
  if (mensagem.includes("chave_pix_unica")) {
    return "Essa chave Pix já está cadastrada em outra conta. No Banco Central ela pertence a uma conta só.";
  }
  if (mensagem.includes("serie_unica")) {
    return "Já existe uma maquininha com esse número de série nesta operadora.";
  }
  if (mensagem.includes("conta_tem_um_dono")) {
    return "A conta precisa pertencer a exatamente uma entidade.";
  }
  if (mensagem.includes("banco_codigo")) {
    return "O código do banco tem três dígitos — o Banco do Brasil é 001, não 1.";
  }
  if (mensagem.includes("titular_documento")) {
    return "O documento do titular deve ser um CPF ou CNPJ, sem pontuação.";
  }
  return mensagem;
}

export type DadosConta = {
  apelido: string;
  banco_codigo: string | null;
  banco_nome: string | null;
  agencia: string | null;
  agencia_dv: string | null;
  conta: string | null;
  conta_dv: string | null;
  tipo: ContaBancariaRow["tipo"];
  titular: string | null;
  titular_documento: string | null;
  observacoes: string | null;
};

export async function criarConta(unidadeId: string, dados: DadosConta): Promise<Resultado> {
  const servico = criarClienteServico();
  const { error } = await servico.from("contas_bancarias").insert({ unidade_id: unidadeId, ...dados });
  return error ? { ok: false, erro: traduzir(error.message) } : { ok: true };
}

export async function editarConta(id: string, dados: DadosConta): Promise<Resultado> {
  const servico = criarClienteServico();
  const { error } = await servico
    .from("contas_bancarias")
    .update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, erro: traduzir(error.message) } : { ok: true };
}

/**
 * Desativa em vez de apagar.
 *
 * ⚠️ Conta apagada levaria junto a resposta de para onde foi o dinheiro do ano
 * passado — e a maquininha que credita nela aponta para o nada. Conta
 * desativada some das listas de escolha e continua explicando o histórico.
 */
export async function alternarConta(id: string, ativo: boolean): Promise<Resultado> {
  const servico = criarClienteServico();
  const { error } = await servico
    .from("contas_bancarias")
    .update({ ativo: !ativo, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, erro: traduzir(error.message) } : { ok: true };
}

export async function adicionarChavePix(
  contaId: string,
  tipo: ChavePixRow["tipo"],
  chave: string
): Promise<Resultado> {
  const servico = criarClienteServico();
  const { error } = await servico.from("chaves_pix").insert({ conta_id: contaId, tipo, chave });
  return error ? { ok: false, erro: traduzir(error.message) } : { ok: true };
}

/**
 * Chave Pix se APAGA, ao contrário da conta.
 *
 * Ela não explica histórico nenhum: é um apelido que o Banco Central
 * reaponta para outra conta quando quer. Guardar a que não vale mais só faz a
 * tela oferecer uma chave que o dinheiro não alcança.
 */
export async function removerChavePix(id: string): Promise<Resultado> {
  const servico = criarClienteServico();
  const { error } = await servico.from("chaves_pix").delete().eq("id", id);
  return error ? { ok: false, erro: traduzir(error.message) } : { ok: true };
}
