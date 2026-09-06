// Tema claro/escuro. A escolha fica no navegador (localStorage) e é aplicada
// como `data-theme` no <html> antes da primeira pintura, para a tela não
// abrir clara e piscar. A cópia na conta da pessoa entra com Minha conta.
export type Tema = "claro" | "escuro" | "sistema";

export const TEMA_PADRAO: Tema = "claro";
export const CHAVE_LOCAL = "sni-tema";

export function ehTema(v: unknown): v is Tema {
  return v === "claro" || v === "escuro" || v === "sistema";
}

/** Texto puro, sem import: roda inline no <head>. Repete resolver() de propósito. */
export const SCRIPT_TEMA_INICIAL =
  `(function(){try{var t=localStorage.getItem(${JSON.stringify(CHAVE_LOCAL)});` +
  `var d=t==="escuro"||(t==="sistema"&&matchMedia("(prefers-color-scheme: dark)").matches);` +
  `document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})();`;

export function resolver(tema: Tema): "light" | "dark" {
  if (tema === "escuro") return "dark";
  if (tema === "sistema" && typeof window !== "undefined") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function aplicarTema(tema: Tema) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolver(tema);
  try {
    localStorage.setItem(CHAVE_LOCAL, tema);
  } catch {
    // Sem armazenamento, o tema vale só até fechar a aba.
  }
}
