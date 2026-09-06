"use server";

import { redirect } from "next/navigation";
import { registrar } from "@/lib/auditoria";
import { pessoaAtual } from "@/lib/auth";
import { validarSenha } from "@/lib/dominio/senha";
import { criarClienteServidor } from "@/lib/supabase/server";

const ROTA = "/definir-senha";

function falhar(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Primeira senha de quem chegou por convite.
 *
 * Não pede a senha atual — não existe uma. Quem chega aqui provou o e-mail
 * clicando no link, e é essa prova que autoriza. Trocar a senha depois, já
 * dentro do sistema, é outra tela (`/minha-conta`) e aí sim exige a atual.
 */
export async function definirPrimeiraSenha(formData: FormData) {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    falhar("Sua sessão de convite expirou. Peça um novo convite a quem administra o acesso.");
  }

  const nova = String(formData.get("nova") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  // A pessoa pode ainda não ter linha em `pessoas` — é o caso de uma conta
  // criada com e-mail que não bate com nenhum cadastro. A senha se define
  // assim mesmo; quem resolve o vínculo é quem administra.
  const eu = await pessoaAtual();
  const veredito = validarSenha(nova, confirmacao, {
    email: data.user.email,
    nome: eu?.nome,
  });
  if (!veredito.ok) falhar(veredito.erro!);

  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) falhar(`Não foi possível definir a senha: ${error.message}`);

  await registrar({
    atorId: eu?.id ?? null,
    acao: "acesso.primeira_senha_definida",
    entidade: "pessoas",
    entidadeId: eu?.id,
  });

  redirect("/painel");
}
