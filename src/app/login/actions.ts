"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteServico } from "@/lib/supabase/service";
import { cpfValido, somenteDigitos } from "@/lib/dominio/cpf";
import { normalizarPassaporte, passaporteValido } from "@/lib/dominio/passaporte";

const schema = z.object({
  identificador: z.string().trim().min(3, "Informe seu CPF, passaporte ou e-mail."),
  senha: z.string().min(1, "Informe a senha."),
  voltar: z.string().optional(),
});

/**
 * Login por CPF, passaporte ou e-mail. O Supabase Auth só autentica por
 * e-mail: quando o identificador parece documento, resolve-se documento →
 * e-mail com `service_role`.
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
  const soNumero = /^\d+$/.test(identificador.replace(/[.\-\s]/g, ""));

  if (digitos.length === 11 && soNumero) {
    if (!cpfValido(digitos)) return falhar("Credenciais inválidas.");
    const servico = criarClienteServico();
    const { data } = await servico.from("pessoas").select("email").eq("cpf", digitos).maybeSingle();
    if (!data?.email) return falhar("Credenciais inválidas.");
    email = data.email;
  } else if (!identificador.includes("@")) {
    // Quem é estrangeiro não tem CPF: o passaporte é o documento dela, e sem
    // isto ela só entraria por e-mail — que é justamente o dado que muda.
    //
    // ⚠️ A ordem importa. O ramo do CPF vem antes porque um passaporte pode
    // ser só dígitos (Estados Unidos emite assim), e onze dígitos são um CPF
    // muito mais provavelmente do que um passaporte.
    const documento = normalizarPassaporte(identificador);
    if (!passaporteValido(documento)) return falhar("Credenciais inválidas.");
    const servico = criarClienteServico();
    const { data } = await servico
      .from("pessoas")
      .select("email")
      .eq("passaporte", documento)
      .maybeSingle();
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
