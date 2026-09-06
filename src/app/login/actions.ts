"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteServico } from "@/lib/supabase/service";
import { cpfValido, somenteDigitos } from "@/lib/dominio/cpf";

const schema = z.object({
  identificador: z.string().trim().min(3, "Informe seu CPF ou e-mail."),
  senha: z.string().min(1, "Informe a senha."),
  voltar: z.string().optional(),
});

/**
 * Login por CPF ou e-mail. O Supabase Auth só autentica por e-mail: quando o
 * identificador parece CPF, resolve-se CPF → e-mail com `service_role`.
 *
 * "Credenciais inválidas" responde tanto a senha errada quanto a conta
 * inexistente — separar as duas diria a um curioso quais e-mails existem.
 * Estados que NÃO são segredo (e-mail não confirmado, excesso de tentativas)
 * são nomeados, porque a pessoa precisa deles para agir.
 */
export async function entrar(formData: FormData) {
  const parsed = schema.safeParse({
    identificador: formData.get("identificador"),
    senha: formData.get("senha"),
    voltar: formData.get("voltar") || undefined,
  });
  if (!parsed.success) return falhar(parsed.error.issues[0].message);
  const { identificador, senha, voltar } = parsed.data;

  let email = identificador.toLowerCase();
  const digitos = somenteDigitos(identificador);
  if (digitos.length === 11 && /^\d+$/.test(identificador.replace(/[.\-\s]/g, ""))) {
    if (!cpfValido(digitos)) return falhar("Credenciais inválidas.");
    const servico = criarClienteServico();
    const { data } = await servico.from("pessoas").select("email").eq("cpf", digitos).maybeSingle();
    if (!data?.email) return falhar("Credenciais inválidas.");
    email = data.email;
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("email not confirmed")) return falhar("Seu e-mail ainda não foi confirmado. Procure quem administra o acesso.");
    if (msg.includes("rate limit") || msg.includes("too many")) return falhar("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
    if (msg.includes("signups not allowed") || msg.includes("provider")) return falhar("O acesso por e-mail está desligado no servidor. Avise quem administra o sistema.");
    return falhar("Credenciais inválidas.");
  }

  redirect(voltar && voltar.startsWith("/") ? voltar : "/painel");
}

function falhar(mensagem: string): never {
  redirect(`/login?erro=${encodeURIComponent(mensagem)}`);
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
