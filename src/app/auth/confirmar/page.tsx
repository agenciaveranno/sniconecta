"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlertCircle } from "@tabler/icons-react";
import { Alerta, BotaoLink } from "@/componentes/ui";
import { criarClienteNavegador } from "@/lib/supabase/client";

/**
 * Onde o convite e a recuperação de senha aterrissam.
 *
 * ⚠️ PRECISA SER CLIENTE, e isso não é escolha de estilo. O Supabase devolve
 * a sessão de duas formas conforme quem gerou o link:
 *
 *   · `?code=…`         quando o fluxo começou no nosso aplicativo (PKCE)
 *   · `#access_token=…` quando o convite saiu do painel do Supabase
 *
 * A segunda é um FRAGMENTO de URL, e fragmento nunca chega ao servidor — o
 * navegador não o envia. Uma rota de servidor veria a URL sem nada e trataria
 * um convite válido como link quebrado. Só o navegador enxerga o que veio ali.
 */
export default function ConfirmarPage() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const concluir = async () => {
      const supabase = criarClienteNavegador();
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      // O Supabase avisa da recusa pela própria URL: link expirado, já usado,
      // e-mail que não confere. Sem ler isto, todos virariam a mesma tela
      // muda, e a pessoa pediria outro convite que falharia igual.
      const recusa = hash.get("error_description") ?? url.searchParams.get("error_description");
      if (recusa) {
        setErro(traduzir(recusa));
        return;
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const codigo = url.searchParams.get("code");
      const tipo = hash.get("type") ?? url.searchParams.get("type");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) return setErro(traduzir(error.message));
      } else if (codigo) {
        const { error } = await supabase.auth.exchangeCodeForSession(codigo);
        if (error) return setErro(traduzir(error.message));
      } else {
        setErro(
          "Este endereço não traz um convite. Se você clicou num link de e-mail, " +
            "ele pode ter sido cortado pelo programa de e-mail — copie e cole o link inteiro."
        );
        return;
      }

      // Quem chega por convite ou recuperação ainda não tem senha própria. Não
      // mandar para o painel: a sessão vence e a pessoa fica sem como voltar.
      const precisaDeSenha = tipo === "invite" || tipo === "recovery" || !tipo;
      router.replace(precisaDeSenha ? "/definir-senha" : "/painel");
      router.refresh();
    };

    concluir().catch((e) => setErro(e instanceof Error ? e.message : String(e)));
  }, [router]);

  return (
    <div
      className="sni-auth-bg"
      style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div className="card solid" style={{ width: "100%", maxWidth: 460, padding: 32 }}>
        {erro ? (
          <>
            <Alerta tipo="danger" icone={<IconAlertCircle size={20} className="ti" />}>
              {erro}
            </Alerta>
            <div style={{ marginTop: 20 }}>
              <BotaoLink href="/login" variante="secondary">
                Ir para a tela de entrada
              </BotaoLink>
            </div>
          </>
        ) : (
          <p className="t-support">Confirmando seu acesso…</p>
        )}
      </div>
    </div>
  );
}

/** A recusa do Supabase vem em inglês e em termos de token. Aqui vira consequência. */
function traduzir(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("expired")) {
    return "Este convite venceu. Peça um novo a quem administra o acesso — cada convite vale por tempo limitado.";
  }
  if (m.includes("already") || m.includes("used")) {
    return "Este convite já foi usado. Se você já definiu sua senha, entre normalmente.";
  }
  if (m.includes("invalid") || m.includes("not found")) {
    return "Este convite não é válido. Confira se copiou o link inteiro, ou peça um novo.";
  }
  return `Não foi possível confirmar o acesso: ${mensagem}`;
}
