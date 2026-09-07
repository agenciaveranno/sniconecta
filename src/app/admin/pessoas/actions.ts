"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { definirSenhaDePessoa, revogarAcesso, sincronizarEmailDeLogin } from "@/lib/acesso";
import { registrar } from "@/lib/auditoria";
import { exigirCapacidade } from "@/lib/auth";
import { cpfValido, somenteDigitos as somenteDigitosCpf } from "@/lib/dominio/cpf";
import { codSniValido, normalizarCodSni } from "@/lib/dominio/codsni";
import { normalizarPassaporte, passaporteValido } from "@/lib/dominio/passaporte";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { TipoPapel } from "@/lib/permissoes";

const ROTA = "/admin/pessoas";

function falhar(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}
function avisar(mensagem: string): never {
  redirect(`${ROTA}?ok=${encodeURIComponent(mensagem)}`);
}

const vazioVira = (v?: string) => (v && v.trim().length > 0 ? v.trim() : null);

const schema = z.object({
  nome: z.string().trim().min(3, "Informe o nome completo."),
  nome_social: z.string().optional().transform(vazioVira),
  // ⚠️ Os dois são opcionais AQUI e exatamente um é exigido no `superRefine`
  // abaixo. A tela manda um ou outro — o campo que não aparece é desmontado,
  // não escondido — e marcar qualquer um como obrigatório recusaria metade
  // dos cadastros legítimos.
  cpf: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? somenteDigitosCpf(v) : null)),
  passaporte: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? normalizarPassaporte(v) : null)),
  // ⚠️ CodSNI vazio vira NULL, nunca string vazia: `''` passaria no unique
  // uma vez só e derrubaria a segunda pessoa sem CodSNI.
  cod_sni: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? normalizarCodSni(v) : null))
    .refine((v) => v === null || codSniValido(v), "O CodSNI tem só dígitos."),
  email: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim().toLowerCase() : null))
    .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Esse e-mail não parece válido."),
  telefone: z.string().optional().transform(vazioVira),
  nascimento: z.string().optional().transform(vazioVira),
  sexo: z.string().optional().transform((v) => (v && ["F", "M", "O"].includes(v) ? v : null)),
  cep: z.string().optional().transform((v) => (v ? v.replace(/\D/g, "") || null : null)),
  logradouro: z.string().optional().transform(vazioVira),
  numero: z.string().optional().transform(vazioVira),
  complemento: z.string().optional().transform(vazioVira),
  bairro: z.string().optional().transform(vazioVira),
  cidade: z.string().optional().transform(vazioVira),
  uf: z.string().optional().transform((v) => (v ? v.trim().toUpperCase() || null : null)),
}).superRefine((d, ctx) => {
  // Exatamente um documento (decisão 0013). Com os dois, a mesma pessoa cabe
  // duas vezes na tabela sem colidir em nada; com nenhum, não há como
  // reconciliar a segunda inscrição dela com a primeira.
  if (d.cpf && d.passaporte) {
    ctx.addIssue({ code: "custom", path: ["cpf"],
      message: "A pessoa se identifica por CPF ou por passaporte, não pelos dois." });
    return;
  }
  if (!d.cpf && !d.passaporte) {
    ctx.addIssue({ code: "custom", path: ["cpf"],
      message: "Informe o CPF. Se a pessoa é estrangeira, ligue a chave e informe o passaporte." });
    return;
  }
  if (d.cpf && !cpfValido(d.cpf)) {
    ctx.addIssue({ code: "custom", path: ["cpf"],
      message: "Esse CPF não existe. Confira os números." });
  }
  // ⚠️ Passaporte NÃO tem dígito verificador: cada país emite no seu formato.
  // Só a forma é conferida — recusar mais que isso barraria documento
  // legítimo com a pessoa parada na frente do balcão.
  if (d.passaporte && !passaporteValido(d.passaporte)) {
    ctx.addIssue({ code: "custom", path: ["passaporte"],
      message: "O passaporte tem de 5 a 20 letras ou números, sem espaço nem traço." });
  }
});

function traduzirErro(mensagem: string): string {
  if (mensagem.includes("pessoas_cpf_key")) {
    return "Esse CPF já está cadastrado. Procure a pessoa na lista em vez de criar de novo.";
  }
  if (mensagem.includes("uq_pessoa_passaporte")) {
    return "Esse passaporte já está cadastrado. Procure a pessoa na lista em vez de criar de novo.";
  }
  if (mensagem.includes("documento_unico")) {
    return "A pessoa se identifica por CPF ou por passaporte, não pelos dois nem por nenhum.";
  }
  if (mensagem.includes("pessoas_cod_sni_key")) return "Esse CodSNI já é de outra pessoa.";
  if (mensagem.includes("uq_pessoa_email_com_conta")) {
    return "Esse e-mail já é a conta de outra pessoa. Quem compartilha caixa em família pode ficar com o mesmo e-mail no cadastro, mas só uma pessoa por e-mail pode ter acesso ao sistema.";
  }
  if (mensagem.includes("row-level security") || mensagem.includes("permission denied")) {
    return "Você não alcança essa pessoa: ela está fora das unidades que você administra.";
  }
  return `Não foi possível salvar: ${mensagem}`;
}

export async function criarPessoa(formData: FormData) {
  const eu = await exigirCapacidade("pessoa.gerir");

  const dados = schema.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message);

  const supabase = await criarClienteServidor();
  const { data: criada, error } = await supabase
    .from("pessoas")
    .insert(dados.data)
    .select("id")
    .single();
  if (error) falhar(traduzirErro(error.message));

  const unidade = String(formData.get("unidade") ?? "");
  if (criada && unidade) {
    const { error: erroVinculo } = await supabase
      .from("pessoa_unidade_vinculos")
      .insert({ pessoa_id: criada.id, unidade_id: unidade });
    // O vínculo falhar não desfaz o cadastro: a pessoa existe, e amarrar à
    // unidade é uma edição a mais. Sumir com o cadastro seria pior.
    if (erroVinculo) falhar(`Pessoa cadastrada, mas sem unidade: ${traduzirErro(erroVinculo.message)}`);
  }

  await registrar({ atorId: eu.id, acao: "pessoa.criada", entidade: "pessoas", entidadeId: criada?.id });
  revalidatePath(ROTA);
}

export async function editarPessoa(formData: FormData) {
  const eu = await exigirCapacidade("pessoa.gerir");

  const id = String(formData.get("id") ?? "");
  if (!id) falhar("Pessoa não informada.");

  const dados = schema.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message);

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("pessoas").update(dados.data).eq("id", id);
  if (error) falhar(traduzirErro(error.message));

  // ⚠️ O e-mail do cadastro é por onde se entra. Trocar só aqui deixaria a
  // pessoa trancada fora com a senha certa, e o Supabase responderia
  // "credenciais inválidas" — a mesma frase de senha errada.
  if (dados.data.email) {
    const sinc = await sincronizarEmailDeLogin(id, dados.data.email);
    if (sinc.erro) {
      await registrar({
        atorId: eu.id,
        acao: "acesso.email_dessincronizado",
        entidade: "pessoas",
        entidadeId: id,
        detalhe: { erro: sinc.erro },
      });
    }
  }

  await registrar({ atorId: eu.id, acao: "pessoa.editada", entidade: "pessoas", entidadeId: id });
  revalidatePath(ROTA);
}

/**
 * Move a pessoa de unidade encerrando o vínculo anterior.
 *
 * Nunca apaga o vínculo velho: é ele que explica em que Associação Local a
 * pessoa estava quando fez o curso de 2024. Encerrar preserva o histórico e
 * satisfaz o índice que garante um vínculo ativo por pessoa.
 */
export async function moverPessoa(formData: FormData) {
  const eu = await exigirCapacidade("pessoa.gerir");

  const id = String(formData.get("id") ?? "");
  const unidade = String(formData.get("unidade") ?? "");
  if (!id || !unidade) falhar("Informe a pessoa e a unidade.");

  const supabase = await criarClienteServidor();

  const { error: erroFecha } = await supabase
    .from("pessoa_unidade_vinculos")
    .update({ data_fim: new Date().toISOString().slice(0, 10) })
    .eq("pessoa_id", id)
    .is("data_fim", null);
  if (erroFecha) falhar(traduzirErro(erroFecha.message));

  const { error } = await supabase
    .from("pessoa_unidade_vinculos")
    .insert({ pessoa_id: id, unidade_id: unidade });
  if (error) falhar(traduzirErro(error.message));

  await registrar({
    atorId: eu.id,
    acao: "pessoa.movida",
    entidade: "pessoas",
    entidadeId: id,
    detalhe: { unidade_id: unidade },
  });
  revalidatePath(ROTA);
}

export async function concederPapel(formData: FormData) {
  const eu = await exigirCapacidade("papel.conceder");

  const pessoaId = String(formData.get("pessoa") ?? "");
  const tipo = String(formData.get("tipo") ?? "") as TipoPapel;
  const unidade = String(formData.get("unidade") ?? "") || null;
  if (!pessoaId || !tipo) falhar("Informe a pessoa e o papel.");

  const supabase = await criarClienteServidor();
  const { error } = await supabase
    .from("papeis")
    .insert({ pessoa_id: pessoaId, tipo, unidade_id: unidade, concedido_por: eu.id });

  if (error) {
    if (error.message.includes("uq_papel")) falhar("Essa pessoa já tem esse papel aqui.");
    if (error.message.includes("papel_nacional_sem_unidade")) {
      falhar("Esse papel vale no país inteiro: não se concede numa unidade.");
    }
    if (error.message.includes("papel_de_unidade_exige_unidade")) {
      falhar("Esse papel vale numa unidade: escolha qual.");
    }
    falhar(traduzirErro(error.message));
  }

  await registrar({
    atorId: eu.id,
    acao: "papel.concedido",
    entidade: "pessoas",
    entidadeId: pessoaId,
    detalhe: { tipo, unidade_id: unidade },
  });
  revalidatePath(ROTA);
}

/**
 * Revoga desativando, não apagando.
 *
 * `papeis.ativo = false` mantém quem concedeu e quando — a pergunta "quem deu
 * acesso a essa pessoa?" continua tendo resposta depois da revogação, que é
 * justamente quando ela costuma ser feita.
 */
export async function revogarPapel(formData: FormData) {
  const eu = await exigirCapacidade("papel.conceder");

  const papelId = String(formData.get("papel") ?? "");
  if (!papelId) falhar("Papel não informado.");

  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("papeis").update({ ativo: false }).eq("id", papelId);
  if (error) falhar(traduzirErro(error.message));

  await registrar({ atorId: eu.id, acao: "papel.revogado", entidade: "papeis", entidadeId: papelId });
  revalidatePath(ROTA);
}

/**
 * Cria a conta ou redefine a senha.
 *
 * ⚠️ A senha gerada volta UMA vez, na tela, e some. Não fica em log nem em
 * auditoria: trilha que guarda credencial deixa de ser trilha e vira alvo.
 */
export async function definirAcesso(formData: FormData) {
  const eu = await exigirCapacidade("acesso.gerir");

  const pessoaId = String(formData.get("pessoa") ?? "");
  if (!pessoaId) falhar("Pessoa não informada.");

  const gerar = formData.get("gerar") === "1";
  const resultado = await definirSenhaDePessoa({
    pessoaId,
    atorId: eu.id,
    senha: gerar ? null : String(formData.get("senha") ?? ""),
    confirmacao: gerar ? null : String(formData.get("confirmacao") ?? ""),
  });

  if (!resultado.ok) falhar(resultado.erro ?? "Não foi possível definir o acesso.");

  revalidatePath(ROTA);
  if (resultado.senhaGerada) {
    avisar(
      `${resultado.contaCriada ? "Acesso criado" : "Senha redefinida"} para ${resultado.email}. ` +
        `Senha: ${resultado.senhaGerada} — anote agora, ela não aparece de novo.`
    );
  }
  avisar(resultado.contaCriada ? "Acesso criado." : "Senha redefinida.");
}

export async function tirarAcesso(formData: FormData) {
  const eu = await exigirCapacidade("acesso.gerir");

  const pessoaId = String(formData.get("pessoa") ?? "");
  if (!pessoaId) falhar("Pessoa não informada.");
  if (pessoaId === eu.id) {
    falhar("Você não pode tirar o próprio acesso — ficaria sem como voltar.");
  }

  const resultado = await revogarAcesso(pessoaId, eu.id);
  if (!resultado.ok) falhar(resultado.erro ?? "Não foi possível tirar o acesso.");

  revalidatePath(ROTA);
  avisar("Acesso removido. A pessoa continua no cadastro, com todo o histórico.");
}
