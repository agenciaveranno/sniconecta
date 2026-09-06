"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirCapacidade, pessoaAtual } from "@/lib/auth";
import { removerCredencial, salvarCredencial } from "@/lib/credenciais";
import { cnpjValido, somenteDigitos } from "@/lib/dominio/cnpj";
import { criarClienteServidor } from "@/lib/supabase/server";

const ROTA = "/admin/locais";

const vazioVira = (v?: string) => (v && v.trim().length > 0 ? v.trim() : null);

const schema = z.object({
  tipo: z.string().min(1, "Escolha o tipo do local."),
  nome: z.string().trim().min(2, "Informe o nome do local."),
  // Quem cuida do local. Nulo é legítimo: hotel e salão alugados são de
  // terceiros e não pertencem a unidade nenhuma.
  unidade: z.string().optional().transform((v) => vazioVira(v)),
  codigo: z.string().optional().transform((v) => vazioVira(v)),
  slug: z.string().optional().transform((v) => vazioVira(v)),
  cep: z.string().optional().transform((v) => (v ? somenteDigitos(v) || null : null)),
  logradouro: z.string().optional().transform((v) => vazioVira(v)),
  numero: z.string().optional().transform((v) => vazioVira(v)),
  complemento: z.string().optional().transform((v) => vazioVira(v)),
  bairro: z.string().optional().transform((v) => vazioVira(v)),
  cidade: z.string().optional().transform((v) => vazioVira(v)),
  uf: z.string().optional().transform((v) => (v ? v.trim().toUpperCase() || null : null)),
  telefone: z.string().optional().transform((v) => vazioVira(v)),
  email: z.string().optional().transform((v) => vazioVira(v)),
  cnpj: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? somenteDigitos(v) : null))
    .refine((v) => v === null || cnpjValido(v), "O CNPJ informado não existe. Confira os números."),
});

function falhar(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

function traduzirErro(mensagem: string): string {
  if (mensagem.includes("não é uma filial")) {
    return "Esse CNPJ é de outra empresa. A Academia é filial da SEICHO-NO-IE DO BRASIL: só muda o número depois da barra.";
  }
  if (mensagem.includes("locais_codigo_key")) return "Já existe um local com esse código.";
  if (mensagem.includes("locais_slug_key")) return "Já existe um local com esse endereço na web.";
  if (mensagem.includes("row-level security") || mensagem.includes("permission denied")) {
    return "Você não tem permissão para alterar os locais.";
  }
  return `Não foi possível salvar: ${mensagem}`;
}

/** Ver o comentário gêmeo em `admin/estrutura/actions.ts`. */
async function guardarCielo(formData: FormData, localId: string) {
  const eu = await pessoaAtual();
  if (!eu?.pode("configuracao.gerir")) return;

  const merchantId = String(formData.get("cielo_merchant_id") ?? "").trim();
  // ⚠️ Merchant ID em branco APAGA a conta. É o único jeito de a entidade
  // parar de receber: se apenas ignorasse o campo vazio, quem limpou o
  // cadastro sairia da tela achando que desligou a venda, e o dinheiro
  // continuaria caindo na conta antiga. Vale também quando o tipo muda para
  // um que não recebe em conta própria — o bloco some e o campo vem vazio.
  if (!merchantId) {
    await removerCredencial("cielo", { local: localId });
    return;
  }

  await salvarCredencial(
    "cielo",
    { local: localId },
    {
      publico: {
        merchant_id: merchantId,
        nome_loja: String(formData.get("cielo_nome_loja") ?? "").trim(),
      },
      segredo: String(formData.get("cielo_merchant_key") ?? ""),
    },
    eu.id
  );
}

function paraBanco(d: z.infer<typeof schema>) {
  const { unidade, ...resto } = d;
  return { ...resto, unidade_id: unidade };
}

export async function criarLocal(formData: FormData) {
  await exigirCapacidade("estrutura.gerir");

  const dados = schema.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message);

  const supabase = await criarClienteServidor();
  const { data: criado, error } = await supabase
    .from("locais")
    .insert(paraBanco(dados.data))
    .select("id")
    .single();
  if (error) falhar(traduzirErro(error.message));

  if (criado) await guardarCielo(formData, criado.id);

  revalidatePath(ROTA);
}

export async function editarLocal(formData: FormData) {
  await exigirCapacidade("estrutura.gerir");

  const id = String(formData.get("id") ?? "");
  if (!id) falhar("Local não informado.");

  const dados = schema.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message);

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("locais").update(paraBanco(dados.data)).eq("id", id);
  if (error) falhar(traduzirErro(error.message));

  await guardarCielo(formData, id);

  revalidatePath(ROTA);
}

/**
 * Desativa em vez de apagar: o local está escrito em todo evento que já
 * aconteceu nele. Apagar deixaria o histórico sem lugar.
 */
export async function alternarAtivo(formData: FormData) {
  await exigirCapacidade("estrutura.gerir");

  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  if (!id) falhar("Local não informado.");

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("locais").update({ ativo: !ativo }).eq("id", id);
  if (error) falhar(traduzirErro(error.message));

  revalidatePath(ROTA);
}
