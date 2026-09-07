"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirCapacidade } from "@/lib/auth";
import { guardarCieloDoFormulario } from "@/lib/credenciais";
import { cnpjValido, somenteDigitos } from "@/lib/dominio/cnpj";
import { centavosDe } from "@/lib/dominio/dinheiro";
import { somenteDigitosCep } from "@/lib/dominio/endereco-formato";
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
  // ⚠️ `somenteDigitosCep`, e não o `somenteDigitos` do CNPJ: aquele preserva
  // LETRAS (o CNPJ novo é alfanumérico), então "CEP 01310-100" entrava como
  // "CEP01310100" e a busca por CEP deixava de encontrar o local.
  cep: z.string().optional().transform((v) => somenteDigitosCep(v) || null),
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

  // ⚠️ "1"/"0" e não checkbox: checkbox desmarcado não é enviado pelo
  // navegador, e a ausência significaria "não mexeu" — nunca "desmarcou".
  proprio: z.string().optional().transform((v) => v !== "0"),
  capacidade: z.coerce.number().int().positive().optional().nullable().catch(null),

  contato_nome: z.string().optional().transform((v) => vazioVira(v)),
  contato_telefone: z.string().optional().transform((v) => vazioVira(v)),
  // Reais na tela, CENTAVOS no banco. ⚠️ `centavosDe` e não uma conversão
  // própria: a daqui só trocava a vírgula por ponto, então "1.250,00" — como
  // qualquer pessoa digita a diária de um salão — virava NaN e a diária sumia
  // sem erro nenhum na tela.
  diaria: z.string().optional().transform((v) => centavosDe(v ?? null)),

  whatsapp: z.string().optional().transform((v) => vazioVira(v)),
  site: z.string().optional().transform((v) => vazioVira(v)),
  facebook: z.string().optional().transform((v) => vazioVira(v)),
  instagram: z.string().optional().transform((v) => vazioVira(v)),
  tiktok: z.string().optional().transform((v) => vazioVira(v)),
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


function paraBanco(d: z.infer<typeof schema>) {
  // ⚠️ `diaria` (reais, da tela) vira `diaria_centavos` (o que o banco guarda),
  // e `unidade` vira `unidade_id`. Mandar o objeto cru faria o PostgREST
  // recusar a linha inteira por causa de duas colunas que não existem.
  const { unidade, diaria, ...resto } = d;
  return { ...resto, unidade_id: unidade, diaria_centavos: diaria };
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

  if (criado) await guardarCieloDoFormulario(formData, { local: criado.id });

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

  await guardarCieloDoFormulario(formData, { local: id });

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
