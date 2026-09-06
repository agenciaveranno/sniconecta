"use client";

import { useEffect } from "react";

/**
 * Rede de segurança para o convite que aterrissa no lugar errado.
 *
 * ⚠️ O endereço de retorno do convite é o "Site URL" do painel do Supabase, e
 * uma configuração errada ali manda a pessoa para a raiz ou para o login em
 * vez de `/auth/confirmar`. O token viaja no FRAGMENTO da URL, que o servidor
 * não enxerga: para ele, é uma visita comum, e a pessoa vê a tela de entrada
 * sem entender por que o convite "não funcionou" — com o acesso ali, na barra
 * de endereços, sendo descartado.
 *
 * Este componente lê o fragmento e encaminha para a tela que sabe usá-lo.
 * Quinze linhas que evitam uma hora de conversa de suporte.
 */
export default function ResgatarConvite() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token=") && !hash.includes("error_description=")) return;
    window.location.replace(`/auth/confirmar${window.location.search}${hash}`);
  }, []);

  return null;
}
