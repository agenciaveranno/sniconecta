import { IconAlertCircle, IconBuildingCommunity, IconLock, IconLogin, IconUser } from "@tabler/icons-react";
import ResgatarConvite from "@/componentes/ResgatarConvite";
import { Alerta, Botao, Campo, Entidade, Input } from "@/componentes/ui";
import { entrar } from "./actions";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; voltar?: string }> }) {
  const { erro, voltar } = await searchParams;
  return (
    <div className="sni-auth-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="card solid" style={{ width: "100%", maxWidth: 420, padding: 32, borderRadius: "var(--r-panel)", boxShadow: "var(--sh-3)", borderColor: "var(--lg-edge)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            aria-hidden="true"
            style={{ width: 64, height: 64, margin: "0 auto 16px", borderRadius: "var(--r-card)", background: "linear-gradient(180deg, var(--navy-800), var(--navy-600))", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "var(--lg-spec-dark), var(--sh-2)" }}
          >
            <IconBuildingCommunity size={30} className="ti" />
          </div>
          <h1 className="t-page">SNI Conecta</h1>
          <p className="t-support" style={{ marginTop: 6 }}>
            <Entidade />
          </p>
        </div>

        <form action={entrar} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input type="hidden" name="voltar" value={voltar ?? ""} />
          <Campo label="CPF, passaporte ou e-mail" htmlFor="identificador">
            <div className="sni-input-icon-wrap">
              <IconUser size={19} className="ti sni-input-icon" aria-hidden="true" />
              <Input id="identificador" name="identificador" autoComplete="username" required autoFocus />
            </div>
          </Campo>
          <Campo label="Senha" htmlFor="senha">
            <div className="sni-input-icon-wrap">
              <IconLock size={19} className="ti sni-input-icon" aria-hidden="true" />
              <Input id="senha" name="senha" type="password" autoComplete="current-password" required />
            </div>
          </Campo>
          <ResgatarConvite />
          {erro && <Alerta tipo="danger" icone={<IconAlertCircle size={20} className="ti" />}>{erro}</Alerta>}
          <Botao type="submit" tamanho="lg" icone={<IconLogin size={18} className="ti" />} style={{ width: "100%" }}>
            Entrar
          </Botao>
        </form>
      </div>
    </div>
  );
}
