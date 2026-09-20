"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirCapacidade } from "@/lib/auth";
import { guardarCieloDoFormulario } from "@/lib/credenciais";
import {
  adicionarChavePix, alternarConta, criarConta, editarConta, removerChavePix,
} from "@/lib/contas";
import { somenteDigitosCep } from "@/lib/dominio/endereco-formato";
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
  // `somenteDigitosCep` é o par servidor da máscara que o navegador usa, e
  // corta em 8 dígitos: CEP colado com sufixo entrava inteiro.
  cep: z.string().optional().transform((v) => somenteDigitosCep(v) || null),
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
 * ⚠️ A recusa volta para a tela de ONDE veio. Com destino fixo, quem estava
 * editando uma unidade na página dela era jogado na árvore com um aviso solto,
 * e o que havia digitado sumia sem ter sido gravado.
 */
function falhar(mensagem: string, rota: string = ROTA): never {
  redirect(`${rota}?erro=${encodeURIComponent(mensagem)}`);
}

/** A página de uma unidade, com a aba certa. */
function rotaDaUnidade(id: string, aba?: string): string {
  return aba ? `${ROTA}/${id}?aba=${aba}` : `${ROTA}/${id}`;
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

  if (criada) await guardarCieloDoFormulario(formData, { unidade: criada.id });

  revalidatePath(ROTA);
}

export async function editarUnidade(formData: FormData) {
  await exigirCapacidade("estrutura.gerir");

  const id = String(formData.get("id") ?? "");
  if (!id) falhar("Unidade não informada.");

  const volta = rotaDaUnidade(id);
  const dados = schema.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message, volta);

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("unidades")
    .update({
      tipo: dados.data.tipo,
      pai_id: await paiDe(dados.data.tipo, dados.data.pai),
      ...CAMPOS_COMUNS(dados.data),
    })
    .eq("id", id);
  if (error) falhar(traduzirErro(error.message), volta);

  // ⚠️ Continua passando pelo guardião da Cielo, e continua sendo um NADA: o
  // formulário de dados não desenha o bloco, então não manda a marca
  // `cielo_na_tela` e a conta fica onde está. A chamada fica de propósito —
  // se um dia o bloco voltar para esta tela, ela já está ligada.
  await guardarCieloDoFormulario(formData, { unidade: id });

  revalidatePath(ROTA);
  revalidatePath(volta);
  redirect(`${volta}?ok=${encodeURIComponent("Cadastro salvo.")}`);
}

/**
 * Por onde a unidade recebe dinheiro — aba própria, formulário próprio.
 *
 * ⚠️ A capacidade aqui é `configuracao.gerir`, e não `estrutura.gerir`: quem
 * cadastra a estrutura não necessariamente manda na conta que recebe. O
 * guardião de dentro de `guardarCieloDoFormulario` confere de novo, e é de
 * propósito — esta é a porta, aquele é o cofre.
 */
export async function salvarPagamentoUnidade(formData: FormData) {
  await exigirCapacidade("configuracao.gerir");

  const id = String(formData.get("id") ?? "");
  if (!id) falhar("Unidade não informada.");

  const volta = rotaDaUnidade(id, "pagamento");
  await guardarCieloDoFormulario(formData, { unidade: id });

  revalidatePath(volta);
  redirect(`${volta}&ok=${encodeURIComponent("Dados de pagamento salvos.")}`);
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

// ─── Contas bancárias, chaves Pix ───────────────────────────────────────────
//
// ⚠️ A capacidade destas ações é `configuracao.gerir`, e não `estrutura.gerir`:
// quem cadastra a estrutura da instituição não necessariamente manda em por
// onde o dinheiro dela entra. É a mesma separação da conta Cielo.

const schemaConta = z.object({
  apelido: z.string().trim().min(2, "Dê um apelido à conta — é por ele que ela aparece nas listas."),
  // ⚠️ Três dígitos, completando com zero à esquerda: quem digita "1" para o
  // Banco do Brasil está certo na intenção e errado no formato, e recusar
  // obrigaria a adivinhar a regra. Todo arquivo bancário do país espera "001".
  banco_codigo: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      const digitos = (v ?? "").replace(/\D/g, "");
      return digitos ? digitos.slice(-3).padStart(3, "0") : null;
    }),
  banco_nome: z.string().trim().optional().transform((v) => v || null),
  agencia: z.string().trim().optional().transform((v) => v || null),
  agencia_dv: z.string().trim().optional().transform((v) => v || null),
  conta: z.string().trim().optional().transform((v) => v || null),
  conta_dv: z.string().trim().optional().transform((v) => v || null),
  tipo: z.enum(["corrente", "poupanca", "pagamento"]).default("corrente"),
  titular: z.string().trim().optional().transform((v) => v || null),
  // O banco exige alfanumérico em caixa alta, de 11 a 14 — CPF, CNPJ e o CNPJ
  // alfanumérico novo da Receita. A máscara que a pessoa digita some aqui.
  titular_documento: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "") || null)
    .refine(
      (v) => v === null || /^[0-9A-Z]{11,14}$/.test(v),
      "O documento do titular deve ser um CPF ou CNPJ."
    ),
  observacoes: z.string().trim().optional().transform((v) => v || null),
});

/** Para onde a tela volta depois de mexer em conta: a aba de Pagamento. */
function voltaPagamento(unidadeId: string): string {
  return rotaDaUnidade(unidadeId, "pagamento");
}

export async function criarContaBancaria(formData: FormData) {
  await exigirCapacidade("configuracao.gerir");

  const unidade = String(formData.get("unidade") ?? "");
  if (!unidade) falhar("Unidade não informada.");
  const volta = voltaPagamento(unidade);

  const dados = schemaConta.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message, volta);

  const r = await criarConta(unidade, dados.data);
  if (!r.ok) falhar(r.erro, volta);

  revalidatePath(volta);
  redirect(`${volta}&ok=${encodeURIComponent("Conta cadastrada.")}`);
}

export async function editarContaBancaria(formData: FormData) {
  await exigirCapacidade("configuracao.gerir");

  const unidade = String(formData.get("unidade") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!unidade || !id) falhar("Conta não informada.");
  const volta = voltaPagamento(unidade);

  const dados = schemaConta.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message, volta);

  const r = await editarConta(id, dados.data);
  if (!r.ok) falhar(r.erro, volta);

  revalidatePath(volta);
  redirect(`${volta}&ok=${encodeURIComponent("Conta salva.")}`);
}

export async function alternarContaBancaria(formData: FormData) {
  await exigirCapacidade("configuracao.gerir");

  const unidade = String(formData.get("unidade") ?? "");
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  if (!unidade || !id) falhar("Conta não informada.");
  const volta = voltaPagamento(unidade);

  const r = await alternarConta(id, ativo);
  if (!r.ok) falhar(r.erro, volta);

  revalidatePath(volta);
  redirect(`${volta}&ok=${encodeURIComponent(ativo ? "Conta desativada." : "Conta reativada.")}`);
}

export async function adicionarPix(formData: FormData) {
  await exigirCapacidade("configuracao.gerir");

  const unidade = String(formData.get("unidade") ?? "");
  const conta = String(formData.get("conta") ?? "");
  const chave = String(formData.get("pix_chave") ?? "").trim();
  if (!unidade || !conta) falhar("Conta não informada.");
  const volta = voltaPagamento(unidade);
  if (!chave) falhar("Informe a chave Pix.", volta);

  // O tipo vem de um <select> nosso, mas quem envia formulário é o navegador
  // de quem quiser: validar aqui é o que impede um tipo inventado de chegar ao
  // banco e ser recusado com uma mensagem que fala de `check constraint`.
  const tipo = z
    .enum(["cpf", "cnpj", "email", "telefone", "aleatoria"])
    .safeParse(formData.get("pix_tipo"));
  if (!tipo.success) falhar("Escolha o tipo da chave Pix.", volta);

  const r = await adicionarChavePix(conta, tipo.data, chave);
  if (!r.ok) falhar(r.erro, volta);

  revalidatePath(volta);
  redirect(`${volta}&ok=${encodeURIComponent("Chave Pix cadastrada.")}`);
}

export async function removerPix(formData: FormData) {
  await exigirCapacidade("configuracao.gerir");

  const unidade = String(formData.get("unidade") ?? "");
  const id = String(formData.get("pix") ?? "");
  if (!unidade || !id) falhar("Chave não informada.");
  const volta = voltaPagamento(unidade);

  const r = await removerChavePix(id);
  if (!r.ok) falhar(r.erro, volta);

  revalidatePath(volta);
  redirect(`${volta}&ok=${encodeURIComponent("Chave Pix removida.")}`);
}
