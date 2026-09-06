import type { Metadata } from "next";
import { Figtree, IBM_Plex_Mono, Platypi } from "next/font/google";
import "./globals.css";
import { SCRIPT_TEMA_INICIAL } from "@/lib/tema";

// As três vozes do design system v2.7 (src/design/tokens.css):
// Figtree = ferramenta, Platypi = instituição, IBM Plex Mono = dado.
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-figtree",
  display: "swap",
});
const platypi = Platypi({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-platypi",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "SNI Conecta", template: "%s · SNI Conecta" },
  description: "Plataforma da SEICHO-NO-IE DO BRASIL",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${figtree.variable} ${platypi.variable} ${plexMono.variable}`}>
      <head>
        {/* Tema antes da primeira pintura — evita abrir claro e piscar para o escuro. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
