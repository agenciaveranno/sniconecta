"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirCapacidade, pessoaAtual } from "@/lib/auth";
import { removerCredencial, salvarCredencial } from "@/lib/credenciais";
import { criarClienteServidor } from "@/lib/supabase/server";

const ROTA = "/admin/organizacoes";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da organização."),
  nome_curto: z.string().trim().optional().transform((v) => v || null),
  codigo: z.string().trim().optional().transform((v) => v || null),
  ordem: z.coerce.number().int().min(0).max(999).default(0),
});

function falhar(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

function traduzirErro(mensagem: string): string {
  if (mensagem.includes("organizacoes_nome_key")) return "Já existe uma organização com esse nome.";
  if (mensagem.includes("organizacoes_codigo_key")) return "Já existe uma organização com esse código.";
  if (mensagem.includes("row-level security") || mensagem.includes("permission denied")) {
    return "Só a Sede Central cadastra organização.";
  }
  return `Não foi possível salvar: ${mensagem}`;
}

/** Ver o comentário gêmeo em `admin/estrutura/actions.ts`. */
async function guardarCielo(formData: FormData, organizacaoId: string) {
  const eu = await pessoaAtual();
  if (!eu?.pode("configuracao.gerir")) return;

  const merchantId = String(formData.get("cielo_merchant_id") ?? "").trim();
  // ⚠️ Merchant ID em branco APAGA a conta. É o único jeito de a entidade
  // parar de receber: se apenas ignorasse o campo vazio, quem limpou o
  // cadastro sairia da tela achando que desligou a venda, e o dinheiro
  // continuaria caindo na conta antiga. Vale também quando o tipo muda para
  // um que não recebe em conta própria — o bloco some e o campo vem vazio.
  if (!merchantId) {
    await removerCredencial("cielo", { organizacao: organizacaoId });
    return;
  }

  await salvarCredencial(
    "cielo",
    { organizacao: organizacaoId },
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

export async function criarOrganizacao(formData: FormData) {
  await exigirCapacidade("estrutura.gerir");

  const dados = schema.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message);

  const supabase = await criarClienteServidor();
  const { data: criada, error } = await supabase
    .from("organizacoes")
    .insert(dados.data)
    .select("id")
    .single();
  if (error) falhar(traduzirErro(error.message));

  if (criada) await guardarCielo(formData, criada.id);

  revalidatePath(ROTA);
}

export async function editarOrganizacao(formData: FormData) {
  await exigirCapacidade("estrutura.gerir");

  const id = String(formData.get("id") ?? "");
  if (!id) falhar("Organização não informada.");

  const dados = schema.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message);

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("organizacoes").update(dados.data).eq("id", id);
  if (error) falhar(traduzirErro(error.message));

  await guardarCielo(formData, id);

  revalidatePath(ROTA);
}

/**
 * Desativa em vez de apagar: a organização está escrita no vínculo de cada
 * pessoa e na Associação Local. Apagar levaria junto o histórico de quem
 * passou por ela.
 */
export async function alternarAtivo(formData: FormData) {
  await exigirCapacidade("estrutura.gerir");

  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  if (!id) falhar("Organização não informada.");

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("organizacoes").update({ ativo: !ativo }).eq("id", id);
  if (error) falhar(traduzirErro(error.message));

  revalidatePath(ROTA);
}
