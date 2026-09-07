"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirCapacidade, pessoaAtual } from "@/lib/auth";
import { removerCredencial, salvarCredencial } from "@/lib/credenciais";
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
  cep: z.string().trim().optional().transform((v) => (v ? v.replace(/\D/g, "") || null : null)),
  logradouro: z.string().trim().optional().transform((v) => v || null),
  numero: z.string().trim().optional().transform((v) => v || null),
  complemento: z.string().trim().optional().transform((v) => v || null),
  bairro: z.string().trim().optional().transform((v) => v || null),
  cidade: z.string().trim().optional().transform((v) => v || null),
  uf: z.string().trim().toUpperCase().optional().transform((v) => v || null),
  idioma: z.string().trim().optional().transform((v) => v || "pt-BR"),

  telefone: z.string().trim().optional().transform((v) => v || null),
  email: z.string().trim().optional().transform((v) => v?.toLowerCase() || null),
  whatsapp: z.string().trim().optional().transform((v) => v || null),
  // ⚠️ URL vazia vira NULL, nunca string vazia: o `check` do banco exige
  // `^https?://` quando preenchido, e `''` não é nulo nem é URL — recusaria o
  // cadastro inteiro de quem não tem Instagram.
  site: z.string().trim().optional().transform((v) => v || null),
  facebook: z.string().trim().optional().transform((v) => v || null),
  instagram: z.string().trim().optional().transform((v) => v || null),
  tiktok: z.string().trim().optional().transform((v) => v || null),
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

/**
 * Guarda a conta Cielo da unidade, quando a tela mandou uma.
 *
 * Separado do `insert` da unidade porque mora em outra tabela, sem GRANT: quem
 * escreve é o servidor com `service_role`. Merchant ID em branco significa
 * "esta unidade não recebe por conta própria" e simplesmente não grava nada —
 * é o caso de toda Associação Local.
 *
 * ⚠️ Roda DEPOIS de a unidade existir e só falha o passo dela: uma Regional
 * cadastrada com a chave da Cielo digitada errada não pode desaparecer junto
 * com o erro. A pessoa reabre e corrige só a conta.
 */
async function guardarCielo(formData: FormData, unidadeId: string) {
  const eu = await pessoaAtual();
  if (!eu?.pode("configuracao.gerir")) return;

  const merchantId = String(formData.get("cielo_merchant_id") ?? "").trim();
  // ⚠️ Merchant ID em branco APAGA a conta. É o único jeito de a entidade
  // parar de receber: se apenas ignorasse o campo vazio, quem limpou o
  // cadastro sairia da tela achando que desligou a venda, e o dinheiro
  // continuaria caindo na conta antiga. Vale também quando o tipo muda para
  // um que não recebe em conta própria — o bloco some e o campo vem vazio.
  if (!merchantId) {
    await removerCredencial("cielo", { unidade: unidadeId });
    return;
  }

  await salvarCredencial(
    "cielo",
    { unidade: unidadeId },
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

/**
 * O pai da unidade.
 *
 * ⚠️ A REGIONAL NÃO PERGUNTA onde fica: toda Regional é da Sede Central, por
 * definição da instituição. A tela não mostra o campo (não há segunda resposta
 * possível), então é aqui que ele é preenchido — e é aqui, e não na tela,
 * porque `formData` vem do navegador: um seletor escondido continua sendo um
 * valor que alguém pode mandar diferente.
 */
async function paiDe(tipo: string, informado: string | null): Promise<string | null> {
  if (tipo !== "regional") return informado;

  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("unidades")
    .select("id")
    .eq("tipo", "sede_central")
    .limit(1)
    .maybeSingle();
  if (!data) falhar("A Sede Central não está cadastrada — sem ela não há onde pendurar uma Regional.");
  return data.id;
}

const CAMPOS_COMUNS = (d: z.infer<typeof schema>) => ({
  organizacao_id: d.organizacao,
  nome: d.nome,
  codigo: d.codigo,
  slug: d.slug,
  cep: d.cep,
  logradouro: d.logradouro,
  numero: d.numero,
  complemento: d.complemento,
  bairro: d.bairro,
  cidade: d.cidade,
  uf: d.uf,
  idioma: d.idioma,
  cnpj: d.cnpj,
  telefone: d.telefone,
  email: d.email,
  whatsapp: d.whatsapp,
  site: d.site,
  facebook: d.facebook,
  instagram: d.instagram,
  tiktok: d.tiktok,
});

export async function criarUnidade(formData: FormData) {
  await exigirCapacidade("estrutura.gerir");

  const dados = schema.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message);

  const supabase = await criarClienteServidor();
  const { data: criada, error } = await supabase
    .from("unidades")
    .insert({
      tipo: dados.data.tipo,
      pai_id: await paiDe(dados.data.tipo, dados.data.pai),
      ...CAMPOS_COMUNS(dados.data),
    })
    .select("id")
    .single();
  if (error) falhar(traduzirErro(error.message));

  if (criada) await guardarCielo(formData, criada.id);

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
      pai_id: await paiDe(dados.data.tipo, dados.data.pai),
      ...CAMPOS_COMUNS(dados.data),
    })
    .eq("id", id);
  if (error) falhar(traduzirErro(error.message));

  await guardarCielo(formData, id);

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
