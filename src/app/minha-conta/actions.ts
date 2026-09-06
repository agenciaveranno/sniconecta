"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { registrar } from "@/lib/auditoria";
import { pessoaAtual } from "@/lib/auth";
import { validarSenha } from "@/lib/dominio/senha";
import { criarClienteServidor } from "@/lib/supabase/server";

const ROTA = "/minha-conta";

function falhar(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Troca da própria senha.
 *
 * ⚠️ EXIGE A SENHA ATUAL, e não é burocracia: a sessão pode estar aberta num
 * computador emprestado, no balcão do evento, na sala da Regional. Sem a
 * conferência, quem passa por uma tela destrancada troca a senha e toma a
 * conta — e a pessoa legítima descobre no dia seguinte, sem entrar.
 *
 * Não usa `service_role`: quem troca a senha é a própria pessoa, com a sessão
 * dela. Gastar o privilégio máximo numa operação que a sessão já pode fazer
 * seria abrir uma porta sem precisar.
 */
export async function trocarMinhaSenha(formData: FormData) {
  const eu = await pessoaAtual();
  if (!eu) redirect("/login");
  if (!eu.email) falhar("Sua conta não tem e-mail. Procure quem administra o acesso.");

  const atual = String(formData.get("atual") ?? "");
  const nova = String(formData.get("nova") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (!atual) falhar("Informe sua senha atual.");

  const veredito = validarSenha(nova, confirmacao, { email: eu.email, nome: eu.nome });
  if (!veredito.ok) falhar(veredito.erro!);

  if (nova === atual) falhar("A senha nova é igual à atual. Escolha outra.");

  const supabase = await criarClienteServidor();

  // Confere a senha atual re-autenticando. `signInWithPassword` renova a
  // sessão desta requisição em vez de criar outra — a pessoa continua onde
  // estava.
  const { error: erroAtual } = await supabase.auth.signInWithPassword({
    email: eu.email,
    password: atual,
  });
  if (erroAtual) falhar("A senha atual não confere.");

  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) falhar(`Não foi possível trocar a senha: ${error.message}`);

  // Sem a senha, e nem um trecho dela: a trilha responde quem e quando.
  await registrar({
    atorId: eu.id,
    acao: "acesso.senha_trocada_pela_propria_pessoa",
    entidade: "pessoas",
    entidadeId: eu.id,
  });

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=${encodeURIComponent("Senha trocada. Ela já vale no próximo acesso.")}`);
}
