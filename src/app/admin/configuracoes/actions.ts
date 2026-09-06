"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigirCapacidade } from "@/lib/auth";
import { removerCredencial, salvarCredencial, smtpPublico } from "@/lib/credenciais";

const ROTA = "/admin/configuracoes";

function falhar(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Servidor de envio da instituição.
 *
 * ⚠️ Isto é CONFIGURAÇÃO, não variável de ambiente: a senha do SMTP muda sem
 * aviso, e ninguém vai abrir um deploy por causa disso — enquanto o deploy não
 * sai, nenhum comprovante e nenhum certificado chega a ninguém. A senha vai
 * cifrada, numa tabela sem GRANT.
 */
export async function salvarSmtp(formData: FormData) {
  const eu = await exigirCapacidade("configuracao.gerir");

  const dados = smtpPublico.safeParse({
    host: formData.get("host"),
    porta: formData.get("porta"),
    seguranca: formData.get("seguranca"),
    usuario: formData.get("usuario"),
    remetente_nome: formData.get("remetente_nome"),
    remetente_email: formData.get("remetente_email"),
  });
  if (!dados.success) falhar(dados.error.issues[0].message);

  try {
    await salvarCredencial(
      "smtp",
      { instituicao: true },
      { publico: dados.data, segredo: String(formData.get("senha") ?? "") },
      eu.id
    );
  } catch (e) {
    falhar(e instanceof Error ? e.message : "Não foi possível guardar o servidor de envio.");
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?ok=1`);
}

/**
 * Apaga a configuração inteira. Existe para o caso de troca de provedor: sem
 * isto, um host antigo ficaria de pé com a senha nova e as mensagens sairiam
 * para o lugar errado até alguém perceber.
 */
export async function apagarSmtp() {
  await exigirCapacidade("configuracao.gerir");
  await removerCredencial("smtp", { instituicao: true });
  revalidatePath(ROTA);
}
