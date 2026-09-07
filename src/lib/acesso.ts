import "server-only";
import { randomBytes } from "node:crypto";
import { registrar } from "@/lib/auditoria";
import { criarClienteServico } from "@/lib/supabase/service";
import { exigir } from "@/lib/supabase/consulta";
import { gerarSenha, validarSenha } from "@/lib/dominio/senha";

/**
 * Acesso ao sistema: criar a conta de login de alguém e definir a senha dela.
 *
 * Fica aqui, e não dentro de uma tela, porque duas telas precisam do mesmo
 * comportamento — o cadastro de pessoas e a concessão de papéis. Duas
 * implementações da mesma coisa divergem, e a que divergir vai ser a que
 * esquecer a auditoria.
 *
 * ⚠️ O QUE ESTA FUNÇÃO SIGNIFICA. Definir a senha de outra pessoa é poder
 * entrar como ela: ver a ficha dela, o que ela comprou, lançar em nome dela.
 * Não há como oferecer o recurso sem oferecer isso junto — é a natureza de um
 * reset administrativo. O que dá para garantir é que **nunca aconteça em
 * silêncio**, e é por isso que toda passagem por aqui grava auditoria com
 * ator, alvo e momento, antes de devolver a senha a quem pediu.
 */

export interface ResultadoAcesso {
  ok: boolean;
  erro?: string;
  /** Devolvida só quando o servidor a gerou — senha digitada não volta. */
  senhaGerada?: string;
  email?: string;
  /** true quando a conta não existia e foi criada agora. */
  contaCriada?: boolean;
}

/** Fonte de aleatoriedade real para `gerarSenha`. */
function bytes(n: number): Uint8Array {
  return new Uint8Array(randomBytes(n));
}

type PessoaAcesso = {
  id: string;
  nome: string;
  email: string | null;
  /** Nulo em quem é estrangeiro (decisão 0013). */
  cpf: string | null;
  passaporte: string | null;
  cod_sni: string | null;
  auth_user_id: string | null;
};

/**
 * O e-mail com que a pessoa REALMENTE consegue entrar, lido do Auth.
 *
 * Existe para tornar visível o desencontro entre cadastro e Auth. Sem isto, a
 * tela mostra o e-mail de `pessoas` e dá a impressão de que é por ali que se
 * entra — quando pode não ser.
 */
export async function emailDeLogin(authUserId: string): Promise<string | null> {
  const servico = criarClienteServico();
  const { data, error } = await servico.auth.admin.getUserById(authUserId);
  if (error || !data?.user) return null;
  return data.user.email ?? null;
}

/**
 * Quem mais usa este e-mail sem ter conta.
 *
 * ⚠️ Depois da decisão 0011, e-mail repetido é normal: mil famílias
 * compartilham a caixa. Isso tem uma consequência dura aqui — o Auth exige
 * e-mail único, então **só uma pessoa da casa pode ter conta com ele**. Sem
 * esta checagem, a segunda tentativa devolveria "email address already
 * registered", que não diz a ninguém que o problema é a irmã.
 */
async function outraPessoaJaUsa(email: string, pessoaId: string): Promise<string | null> {
  const servico = criarClienteServico();
  const { data } = await servico
    .from("pessoas")
    .select("nome")
    .eq("email", email)
    .not("auth_user_id", "is", null)
    .neq("id", pessoaId)
    .limit(1)
    .maybeSingle();
  return (data as { nome: string } | null)?.nome ?? null;
}

/**
 * Mantém o e-mail do Auth igual ao do cadastro.
 *
 * ⚠️ NÃO É COSMÉTICO. É pelo e-mail que se entra. Trocar o e-mail só no
 * cadastro faz o login apontar para uma conta que não existe no Auth, e o
 * Supabase devolve "Invalid login credentials" — a mesma frase de senha
 * errada. O resultado é alguém trancado fora com a senha certa na mão, e
 * ninguém com motivo para desconfiar do e-mail.
 *
 * Silenciosa de propósito: quem chama está editando um cadastro, e uma falha
 * aqui não pode desfazer essa edição. O retorno diz o que houve para o
 * chamador registrar.
 */
export async function sincronizarEmailDeLogin(
  pessoaId: string,
  emailNovo: string
): Promise<{ sincronizado: boolean; erro?: string }> {
  const servico = criarClienteServico();

  const pessoa = exigir(
    await servico.from("pessoas").select("auth_user_id").eq("id", pessoaId).maybeSingle(),
    "o vínculo de acesso da pessoa"
  ) as { auth_user_id: string | null } | null;

  // Sem conta de login não há o que sincronizar — e não é erro.
  if (!pessoa?.auth_user_id) return { sincronizado: false };

  const { error } = await servico.auth.admin.updateUserById(pessoa.auth_user_id, {
    email: emailNovo,
    // Sem isto o Supabase deixa o endereço PENDENTE de confirmação e mantém o
    // antigo valendo — exatamente o desencontro que esta função existe para
    // impedir, só que mais difícil de enxergar.
    email_confirm: true,
  });
  if (error) return { sincronizado: false, erro: error.message };

  return { sincronizado: true };
}

export async function definirSenhaDePessoa(opcoes: {
  pessoaId: string;
  atorId: string;
  /** Nula pede uma senha gerada pelo servidor. */
  senha: string | null;
  confirmacao: string | null;
}): Promise<ResultadoAcesso> {
  const { pessoaId, atorId } = opcoes;
  const servico = criarClienteServico();

  const pessoa = exigir(
    await servico
      .from("pessoas")
      .select("id, nome, email, cpf, passaporte, cod_sni, auth_user_id")
      .eq("id", pessoaId)
      .maybeSingle(),
    "a pessoa"
  ) as PessoaAcesso | null;

  if (!pessoa) return { ok: false, erro: "Pessoa não encontrada." };
  if (!pessoa.email) {
    // O Supabase Auth autentica por e-mail: sem e-mail não existe conta possível.
    return { ok: false, erro: "Esta pessoa não tem e-mail no cadastro — informe um antes." };
  }

  if (!pessoa.auth_user_id) {
    const dona = await outraPessoaJaUsa(pessoa.email, pessoa.id);
    if (dona) {
      return {
        ok: false,
        erro: `Esse e-mail já é a conta de ${dona}. Para ter acesso próprio, ${pessoa.nome.split(/\s+/)[0]} precisa de um e-mail só dela.`,
      };
    }
  }

  const gerada = opcoes.senha === null;
  const senha = gerada ? gerarSenha(12, bytes) : opcoes.senha!;

  // A senha gerada também passa pela validação: se um dia a geração mudar e
  // produzir algo fraco, é aqui que aparece, não em produção.
  const veredito = validarSenha(senha, gerada ? senha : (opcoes.confirmacao ?? ""), {
    cpf: pessoa.cpf,
    passaporte: pessoa.passaporte,
    codSni: pessoa.cod_sni,
    email: pessoa.email,
    nome: pessoa.nome,
  });
  if (!veredito.ok) return { ok: false, erro: veredito.erro };

  let contaCriada = false;

  if (pessoa.auth_user_id) {
    // Sincroniza o e-mail JUNTO com a senha, e não só a senha: se o Auth
    // guardar outro endereço, o login aponta para uma conta que não existe e o
    // Supabase responde "Invalid login credentials" — indistinguível de senha
    // errada. Por isso a redefinição também CONSERTA quem já está nesse
    // estado: é a tela que o operador procura quando "o login não funciona".
    const { error } = await servico.auth.admin.updateUserById(pessoa.auth_user_id, {
      password: senha,
      email: pessoa.email,
      email_confirm: true,
    });
    if (error) return { ok: false, erro: error.message };
  } else {
    const { data: criado, error } = await servico.auth.admin.createUser({
      email: pessoa.email,
      password: senha,
      email_confirm: true,
    });
    if (error || !criado?.user) {
      return { ok: false, erro: error?.message ?? "Falha ao criar o acesso." };
    }
    // Vincular é a parte que não pode falhar em silêncio: conta criada sem
    // vínculo deixa a pessoa autenticando e o sistema sem saber quem ela é —
    // sem papéis, sem nada.
    const { error: erroVinculo } = await servico
      .from("pessoas")
      .update({ auth_user_id: criado.user.id })
      .eq("id", pessoaId);
    if (erroVinculo) {
      await servico.auth.admin.deleteUser(criado.user.id);
      return { ok: false, erro: "Falha ao vincular a conta. Nada foi criado; tente de novo." };
    }
    contaCriada = true;
  }

  // Nunca a senha, nem um trecho dela. O que a trilha precisa responder é
  // "quem mexeu na conta de quem, e quando" — o valor não ajuda nisso e
  // transformaria a auditoria num depósito de credenciais.
  await registrar({
    atorId,
    acao: contaCriada ? "acesso.provisionado" : "acesso.senha_redefinida",
    entidade: "pessoas",
    entidadeId: pessoaId,
    detalhe: { motivo: gerada ? "senha gerada pelo sistema" : "senha definida pelo operador" },
  });

  return {
    ok: true,
    email: pessoa.email,
    contaCriada,
    senhaGerada: gerada ? senha : undefined,
  };
}

/**
 * Tira o acesso sem apagar a pessoa.
 *
 * Apagar a conta do Auth e deixar `auth_user_id` apontando para o vazio faria
 * a pessoa sumir de toda tela que a lê pelo vínculo. Aqui o vínculo se desfaz
 * primeiro, e só então a conta some — a pessoa continua inteira no cadastro,
 * com todo o histórico, apenas sem porta de entrada.
 */
export async function revogarAcesso(pessoaId: string, atorId: string): Promise<ResultadoAcesso> {
  const servico = criarClienteServico();

  const pessoa = exigir(
    await servico.from("pessoas").select("auth_user_id").eq("id", pessoaId).maybeSingle(),
    "o vínculo de acesso da pessoa"
  ) as { auth_user_id: string | null } | null;

  if (!pessoa?.auth_user_id) return { ok: true };

  const { error } = await servico
    .from("pessoas")
    .update({ auth_user_id: null })
    .eq("id", pessoaId);
  if (error) return { ok: false, erro: error.message };

  await servico.auth.admin.deleteUser(pessoa.auth_user_id);

  await registrar({ atorId, acao: "acesso.revogado", entidade: "pessoas", entidadeId: pessoaId });

  return { ok: true };
}
