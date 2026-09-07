"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirCapacidade } from "@/lib/auth";
import { guardarCieloDoFormulario } from "@/lib/credenciais";
import { criarClienteServidor } from "@/lib/supabase/server";

const ROTA = "/admin/organizacoes";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da organização."),
  nome_curto: z.string().trim().optional().transform((v) => v || null),
  codigo: z.string().trim().optional().transform((v) => v || null),
  ordem: z.coerce.number().int().min(0).max(999).default(0),
  descricao: z.string().trim().optional().transform((v) => v || null),
  // ⚠️ "1"/"0" e não checkbox: checkbox desmarcado NÃO é enviado pelo
  // navegador, então a ausência do campo significaria "não mexeu" e nunca
  // "desmarcou" — e a marca jamais poderia ser tirada.
  e_organizacao: z.string().optional().transform((v) => v === "1"),
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

  if (criada) await guardarCieloDoFormulario(formData, { organizacao: criada.id });

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

  await guardarCieloDoFormulario(formData, { organizacao: id });

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
