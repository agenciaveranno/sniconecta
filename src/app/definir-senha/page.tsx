import { redirect } from "next/navigation";
import { IconLock } from "@tabler/icons-react";
import { Botao, Campo, Input, Recado } from "@/componentes/ui";
import { Entidade } from "@/componentes/ui";
import { pessoaAtual } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { definirPrimeiraSenha } from "./actions";

export const metadata = { title: "Definir senha" };

/**
 * Primeira senha, logo depois do convite.
 *
 * Fora do painel de propósito: quem chega aqui pode ainda não ter papel
 * nenhum, e a barra lateral apareceria vazia — dando a impressão de que o
 * sistema está quebrado logo no primeiro contato.
 */
export default async function DefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const eu = await pessoaAtual();

  return (
    <div
      className="sni-auth-bg"
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div className="card solid" style={{ width: "100%", maxWidth: 440, padding: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 className="t-page">Defina sua senha</h1>
          <p className="t-support" style={{ marginTop: 6 }}>
            <Entidade />
          </p>
        </div>

        <p className="hint" style={{ marginBottom: 20 }}>
          {eu ? `Bem-vindo, ${eu.nome.split(/\s+/)[0]}. ` : ""}
          Escolha uma senha para entrar em {data.user.email}. É com ela que você
          acessa daqui em diante.
        </p>

        <Recado erro={erro} />

        <form action={definirPrimeiraSenha} className="sni-form">
          <Campo label="Senha" obrigatorio dica="Ao menos 8 caracteres. Não pode ser seu CPF nem seu CodSNI.">
            <Input name="nova" type="password" autoComplete="new-password" minLength={8} required autoFocus />
          </Campo>
          <Campo label="Repita a senha" obrigatorio>
            <Input name="confirmacao" type="password" autoComplete="new-password" required />
          </Campo>
          <Botao type="submit" icone={<IconLock size={18} className="ti" />} style={{ width: "100%" }}>
            Definir senha e entrar
          </Botao>
        </form>
      </div>
    </div>
  );
}
