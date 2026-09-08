"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { criarClienteServidor } from "@/lib/supabase/server";
import { TENTATIVAS } from "@/lib/dominio/identificador";
import { criarClienteServico } from "@/lib/supabase/service";

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

  const email = await emailDe(identificador);
  if (!email) return falhar("Credenciais inválidas.");

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("email not confirmed")) return falhar("Seu e-mail ainda não foi confirmado. Procure quem administra o acesso.");
    if (msg.includes("rate limit") || msg.includes("too many")) return falhar("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
    if (msg.includes("signups not allowed") || msg.includes("provider")) return falhar("O acesso por e-mail está desligado no servidor. Avise quem administra o sistema.");
    return falhar("Credenciais inválidas.");
  }

  // ⚠️ `startsWith("/")` NÃO basta: "//evil.example" começa com barra e o
  // navegador o resolve como endereço EXTERNO (protocolo relativo). O mesmo
  // com "/\evil.example", porque o parser de URL trata a contrabarra como
  // barra depois da primeira. Quem entrasse de verdade, pela tela de verdade,
  // era entregue ao site do atacante logo depois — que é o momento em que uma
  // página de "sua sessão expirou, entre de novo" convence qualquer um.
  //
  // A regra é: barra seguida de algo que não seja outra barra nem contrabarra.
  // Aceita todo caminho que o proxy produz e recusa endereço de fora.
  redirect(voltar && /^\/[^/\\]/.test(voltar) ? voltar : "/painel");
}


/**
 * O e-mail da conta, a partir do que a pessoa digitou. A ordem e o formato de
 * cada tentativa moram em `@/lib/dominio/identificador`; aqui só a consulta.
 */
async function emailDe(identificador: string): Promise<string | null> {
  // E-mail é ele mesmo: não precisa procurar ninguém para descobrir.
  if (identificador.includes("@")) return identificador.trim().toLowerCase();

  const servico = criarClienteServico();
  for (const t of TENTATIVAS) {
    if (!t.serve(identificador)) continue;
    const { data } = await servico
      .from("pessoas")
      .select("email")
      .eq(t.coluna, t.valor(identificador))
      .maybeSingle();
    if (data?.email) return data.email;
  }
  return null;
}

function falhar(mensagem: string): never {
  redirect(`/login?erro=${encodeURIComponent(mensagem)}`);
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
