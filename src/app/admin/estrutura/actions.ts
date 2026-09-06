"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirCapacidade } from "@/lib/auth";
import { cnpjValido, somenteDigitos } from "@/lib/dominio/cnpj";
import { criarClienteServidor } from "@/lib/supabase/server";

const ROTA = "/admin/estrutura";

/**
 * Campos da unidade.
 *
 * `pai` chega vazio quando é a raiz — `<select>` não manda `null`, manda "".
 * Traduzir aqui evita que a string vazia vire uma chave estrangeira inválida
 * lá embaixo, com uma mensagem que fala de uuid e não de estrutura.
 */
const schema = z.object({
  tipo: z.string().min(1, "Escolha o tipo da unidade."),
  pai: z.string().optional().transform((v) => (v && v.length > 0 ? v : null)),
  organizacao: z.string().optional().transform((v) => (v && v.length > 0 ? v : null)),
  nome: z.string().trim().min(2, "Informe o nome da unidade."),
  codigo: z.string().trim().optional().transform((v) => v || null),
  slug: z.string().trim().optional().transform((v) => v || null),
  cidade: z.string().trim().optional().transform((v) => v || null),
  uf: z.string().trim().toUpperCase().optional().transform((v) => v || null),
  idioma: z.string().trim().optional().transform((v) => v || "pt-BR"),
  // O banco guarda o CNPJ só com dígitos, e o `check` dele olha só o formato.
  // A máscara que a pessoa digita some aqui, e o dígito verificador é
  // conferido aqui: um CNPJ com DV errado passaria pelo banco e só apareceria
  // semanas depois, na nota fiscal que volta.
  cnpj: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? somenteDigitos(v) : null))
    .refine((v) => v === null || cnpjValido(v), "O CNPJ informado não existe. Confira os números."),
});

function falhar(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * O banco recusa pai do nível errado por gatilho, e a mensagem dele fala em
 * nível numérico. Aqui a recusa vira uma frase sobre a consequência para quem
 * está cadastrando.
 */
function traduzirErro(mensagem: string): string {
  if (mensagem.includes("não pode ficar dentro")) {
    return "Essa unidade não pode ficar dentro da que você escolheu. Confira o tipo e a unidade superior.";
  }
  if (mensagem.includes("precisa de uma organização")) {
    return "Toda Associação Local pertence a uma Organização. Escolha qual.";
  }
  if (mensagem.includes("não tem organização")) {
    return "Só a Associação Local tem Organização — o Núcleo é a união das Associações Locais de um mesmo endereço.";
  }
  if (mensagem.includes("precisa estar dentro")) {
    return "Só a Sede Central fica no topo. Escolha a unidade superior.";
  }
  if (mensagem.includes("não é uma filial")) {
    return "Esse CNPJ é de outra empresa. Toda unidade é filial da SEICHO-NO-IE DO BRASIL: só muda o número depois da barra.";
  }
  if (mensagem.includes("unidades_codigo_key")) return "Já existe uma unidade com esse código.";
  if (mensagem.includes("unidades_slug_key")) return "Já existe uma unidade com esse endereço na web.";
  if (mensagem.includes("slug_formato")) {
    return "O endereço na web aceita só letras minúsculas, números e hífen.";
  }
  if (mensagem.includes("row-level security") || mensagem.includes("permission denied")) {
    return "Você não tem permissão para alterar a estrutura.";
  }
  return `Não foi possível salvar: ${mensagem}`;
}

export async function criarUnidade(formData: FormData) {
  await exigirCapacidade("estrutura.gerir");

  const dados = schema.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message);

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("unidades").insert({
    tipo: dados.data.tipo,
    pai_id: dados.data.pai,
    organizacao_id: dados.data.organizacao,
    nome: dados.data.nome,
    codigo: dados.data.codigo,
    slug: dados.data.slug,
    cidade: dados.data.cidade,
    uf: dados.data.uf,
    idioma: dados.data.idioma,
    cnpj: dados.data.cnpj,
  });
  if (error) falhar(traduzirErro(error.message));

  revalidatePath(ROTA);
}

export async function editarUnidade(formData: FormData) {
  await exigirCapacidade("estrutura.gerir");

  const id = String(formData.get("id") ?? "");
  if (!id) falhar("Unidade não informada.");

  const dados = schema.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message);

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("unidades")
    .update({
      tipo: dados.data.tipo,
      pai_id: dados.data.pai,
      organizacao_id: dados.data.organizacao,
      nome: dados.data.nome,
      codigo: dados.data.codigo,
      slug: dados.data.slug,
      cidade: dados.data.cidade,
      uf: dados.data.uf,
      idioma: dados.data.idioma,
      cnpj: dados.data.cnpj,
    })
    .eq("id", id);
  if (error) falhar(traduzirErro(error.message));

  revalidatePath(ROTA);
}

/**
 * Desativa em vez de apagar.
 *
 * Apagar unidade levaria junto o vínculo de todas as pessoas que já passaram
 * por ela — e o relatório do ano passado deixaria de fechar. Unidade
 * desativada some das listas de escolha e continua explicando o histórico.
 */
export async function alternarAtivo(formData: FormData) {
  await exigirCapacidade("estrutura.gerir");

  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  if (!id) falhar("Unidade não informada.");

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("unidades").update({ ativo: !ativo }).eq("id", id);
  if (error) falhar(traduzirErro(error.message));

  revalidatePath(ROTA);
}
