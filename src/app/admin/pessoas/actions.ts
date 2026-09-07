"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { COOKIE_SENHA } from "./cookies";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { definirSenhaDePessoa, revogarAcesso, sincronizarEmailDeLogin } from "@/lib/acesso";
import { registrar } from "@/lib/auditoria";
import { apagarAnexo, guardarAnexo } from "@/lib/anexos";
import { exigirCapacidade } from "@/lib/auth";
import { somenteDigitosCep } from "@/lib/dominio/endereco-formato";
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
  // `somenteDigitosCep` é o par servidor da máscara que o navegador usa, e
  // corta em 8 dígitos: CEP colado com sufixo entrava inteiro.
  cep: z.string().optional().transform((v) => somenteDigitosCep(v) || null),
  logradouro: z.string().optional().transform(vazioVira),
  numero: z.string().optional().transform(vazioVira),
  complemento: z.string().optional().transform(vazioVira),
  bairro: z.string().optional().transform(vazioVira),
  cidade: z.string().optional().transform(vazioVira),
  uf: z.string().optional().transform((v) => (v ? v.trim().toUpperCase() || null : null)),

  // ── Família ──
  nome_pai: z.string().optional().transform(vazioVira),
  nome_mae: z.string().optional().transform(vazioVira),
  nome_conjuge: z.string().optional().transform(vazioVira),
  estado_civil: z.string().optional().transform((v) =>
    v && ["solteiro", "casado", "uniao_estavel", "divorciado", "viuvo"].includes(v) ? v : null),

  // ── Na Seicho-No-Ie ──
  entrada_sni: z.string().optional().transform(vazioVira),
  motivo_entrada: z.string().optional().transform(vazioVira),

  // ── Vida civil ──
  profissao: z.string().optional().transform(vazioVira),
  empresa: z.string().optional().transform(vazioVira),
  formacao: z.string().optional().transform((v) =>
    v && ["fundamental", "medio", "superior", "pos", "mestrado", "doutorado"].includes(v) ? v : null),

  // ⚠️ Vazio vira NULL, nunca string vazia: `''` passaria no unique uma vez e
  // derrubaria a segunda pessoa sem login.
  login: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null))
    .refine((v) => v === null || /^[a-zA-Z][a-zA-Z0-9._-]{2,29}$/.test(v),
      "O login começa com letra e tem de 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado."),

  telefone2: z.string().optional().transform(vazioVira),
  falecimento: z.string().optional().transform(vazioVira),
  falecimento_causa: z.string().optional().transform(vazioVira),
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
  if (mensagem.includes("pessoas_login_key")) {
    return "Esse login já é de outra pessoa. Escolha outro.";
  }
  if (mensagem.includes("login_formato")) {
    return "O login começa com letra e tem de 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado.";
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

  // ⚠️ O id é gerado AQUI, e o insert não pede `returning`. A policy
  // `pessoas_le` só enxerga quem está numa unidade que o operador administra —
  // e a pessoa recém-inserida ainda não tem vínculo nenhum. O Postgres aplica a
  // policy de SELECT à linha devolvida por `insert … returning`, então o
  // `.select("id").single()` que estava aqui fazia o banco RECUSAR o cadastro
  // inteiro: nenhum operador fora da Sede conseguia cadastrar pessoa, e a
  // mensagem culpava o alcance de uma pessoa que nunca chegou a existir.
  const id = randomUUID();
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("pessoas").insert({ ...dados.data, id });
  if (error) falhar(traduzirErro(error.message));

  const unidade = String(formData.get("unidade") ?? "");
  if (unidade) {
    const { error: erroVinculo } = await supabase
      .from("pessoa_unidade_vinculos")
      .insert({ pessoa_id: id, unidade_id: unidade });
    // O vínculo falhar não desfaz o cadastro: a pessoa existe, e amarrar à
    // unidade é uma edição a mais. Sumir com o cadastro seria pior.
    if (erroVinculo) falhar(`Pessoa cadastrada, mas sem unidade: ${traduzirErro(erroVinculo.message)}`);
  }

  await registrar({ atorId: eu.id, acao: "pessoa.criada", entidade: "pessoas", entidadeId: id });
  revalidatePath(ROTA);
  // Vai para a FICHA, e não de volta para a lista: quem acabou de cadastrar
  // quase sempre tem mais o que preencher — anexo, foto, o resto dos campos.
  redirect(`${ROTA}/${id}?ok=${encodeURIComponent("Pessoa cadastrada.")}`);
}

export async function editarPessoa(formData: FormData) {
  const eu = await exigirCapacidade("pessoa.gerir");

  const id = String(formData.get("id") ?? "");
  if (!id) falhar("Pessoa não informada.");

  const dados = schema.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message);

  // ⚠️ `.select()` no update NÃO é enfeite: é como se sabe que alguma coisa foi
  // escrita. A RLS não recusa um update fora de alcance — ela o reduz a ZERO
  // linhas, sem erro nenhum. Sem esta conferência a tela dizia "Ficha salva."
  // com o banco intacto, e quem editava a própria ficha sem administrar
  // unidade nenhuma via isso em toda gravação.
  const supabase = await criarClienteServidor();
  const { data: alteradas, error } = await supabase
    .from("pessoas")
    .update(dados.data)
    .eq("id", id)
    .select("id");
  if (error) falhar(traduzirErro(error.message));
  if (!alteradas?.length) {
    falhar("Nada foi salvo: esta pessoa está fora das unidades que você administra.");
  }

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
  revalidatePath(`${ROTA}/${id}`);
  redirect(`${ROTA}/${id}?ok=${encodeURIComponent("Ficha salva.")}`);
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

  // ⚠️ Mesma armadilha do `editarPessoa`: `papeis_escreve` é só da Sede, mas o
  // botão aparece para quem tem `papel.conceder`. Sem conferir a linha alterada,
  // a coordenadora "revogava" um papel que continuava ativo.
  const supabase = await criarClienteServidor();
  const { data: revogados, error } = await supabase
    .from("papeis")
    .update({ ativo: false })
    .eq("id", papelId)
    .select("id");
  if (error) falhar(traduzirErro(error.message));
  if (!revogados?.length) {
    falhar("O papel NÃO foi revogado: só a Sede Central revoga papel. Peça a quem responde por ela.");
  }

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

  // ⚠️ Senha digitada VENCE a caixa "gerar uma para mim". Antes o `gerar`
  // vinha marcado por padrão e atropelava o campo: quem escolhia uma senha de
  // propósito a via trocada por outra, sem aviso.
  const digitada = String(formData.get("senha") ?? "");
  const gerar = digitada.trim().length === 0;
  const resultado = await definirSenhaDePessoa({
    pessoaId,
    atorId: eu.id,
    senha: gerar ? null : digitada,
    confirmacao: gerar ? null : String(formData.get("confirmacao") ?? ""),
  });

  if (!resultado.ok) falhar(resultado.erro ?? "Não foi possível definir o acesso.");

  revalidatePath(ROTA);
  if (resultado.senhaGerada) {
    // ⚠️ A senha NÃO vai na URL. Estava indo em `?ok=`, e endereço fica na
    // barra do navegador, no histórico, no cabeçalho Referer de tudo que a
    // página carrega e no log de acesso de qualquer intermediário — o oposto
    // do que o comentário desta função promete. Vai num cookie que o servidor
    // lê uma vez e que expira sozinho em um minuto.
    (await cookies()).set(COOKIE_SENHA, `${resultado.email}|${resultado.senhaGerada}`, {
      maxAge: 60,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: ROTA,
    });
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


// ─── Anexos da ficha ─────────────────────────────────────────────────────────

/**
 * Erro e recado voltam para a FICHA, não para a lista: quem estava anexando
 * documento perderia o contexto inteiro sendo jogado de volta para a busca.
 */
function falharNaFicha(pessoaId: string, mensagem: string): never {
  redirect(`${ROTA}/${pessoaId}?aba=anexos&erro=${encodeURIComponent(mensagem)}`);
}

export async function anexarDocumento(formData: FormData) {
  const eu = await exigirCapacidade("pessoa.gerir");

  const pessoaId = String(formData.get("pessoa_id") ?? "");
  if (!pessoaId) falhar("Pessoa não informada.");

  const tipo = String(formData.get("tipo") ?? "outros");
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) falharNaFicha(pessoaId, "Escolha um arquivo.");

  // ⚠️ A capacidade não basta: `pessoa.gerir` é nacional ou de unidade, e o
  // RLS é quem decide QUAIS pessoas cada operador alcança. Sem esta leitura
  // pelo cliente do usuário, quem administra uma Regional anexaria documento
  // na ficha de alguém de outra — o upload é feito com a chave de serviço, que
  // ignora policy.
  const supabase = await criarClienteServidor();
  const { data: alcanca } = await supabase.from("pessoas").select("id").eq("id", pessoaId).maybeSingle();
  if (!alcanca) falharNaFicha(pessoaId, "Você não alcança essa pessoa: ela está fora das unidades que você administra.");

  const r = await guardarAnexo({
    pessoaId,
    tipo,
    descricao: String(formData.get("descricao") ?? ""),
    arquivo,
    atorId: eu.id,
  });
  if (!r.ok) falharNaFicha(pessoaId, r.erro);

  await registrar({
    atorId: eu.id,
    acao: "pessoa.anexo_adicionado",
    entidade: "pessoa_anexos",
    entidadeId: r.id,
    // ⚠️ O NOME do arquivo não entra na auditoria: "exame-de-sangue.pdf" é
    // dado sensível, e trilha de auditoria é lida por mais gente que a ficha.
    detalhe: { pessoa_id: pessoaId, tipo },
  });
  revalidatePath(`${ROTA}/${pessoaId}`);
  redirect(`${ROTA}/${pessoaId}?aba=anexos&ok=${encodeURIComponent("Documento anexado.")}`);
}

export async function removerAnexo(formData: FormData) {
  const eu = await exigirCapacidade("pessoa.gerir");

  const id = String(formData.get("id") ?? "");
  const pessoaId = String(formData.get("pessoa_id") ?? "");
  if (!id || !pessoaId) falhar("Anexo não informado.");

  const supabase = await criarClienteServidor();
  const { data: alcanca } = await supabase.from("pessoas").select("id").eq("id", pessoaId).maybeSingle();
  if (!alcanca) falharNaFicha(pessoaId, "Você não alcança essa pessoa.");

  // ⚠️ O `pessoaId` vai JUNTO. A conferência acima é sobre o que veio no
  // formulário; o apagamento é pela chave de serviço, que ignora policy. Sem
  // amarrar os dois, bastava trocar o `id` no formulário para apagar o
  // documento de alguém fora do alcance — a conferência olhava uma pessoa e o
  // apagamento tocava outra.
  const r = await apagarAnexo(id, pessoaId);
  if (!r.ok) falharNaFicha(pessoaId, r.erro ?? "Não foi possível apagar.");

  await registrar({
    atorId: eu.id,
    acao: "pessoa.anexo_removido",
    entidade: "pessoa_anexos",
    entidadeId: id,
    detalhe: { pessoa_id: pessoaId },
  });
  revalidatePath(`${ROTA}/${pessoaId}`);
  redirect(`${ROTA}/${pessoaId}?aba=anexos&ok=${encodeURIComponent("Documento removido.")}`);
}
