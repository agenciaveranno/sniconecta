"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import * as Icones from "@tabler/icons-react";
import type { Modulo } from "@/modulos/registro";

/**
 * Casca do painel: barra lateral institucional (navy, nos dois temas), barra
 * superior em vidro, conteúdo opaco. Recebe do servidor só os módulos que a
 * pessoa pode ver — a filtragem por capacidade acontece lá, nunca aqui.
 */
export default function AppShell({
  modulos,
  pessoa,
  titulo,
  acoes,
  children,
}: {
  modulos: Modulo[];
  pessoa: { nome: string; papel: string };
  titulo: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // Menu móvel fecha ao navegar: no clique do item, não em efeito sobre a
  // rota — efeito com setState dispara render em cascata.
  const [aberto, setAberto] = useState(false);

  const hrefs = modulos.flatMap((m) => m.itens.map((i) => i.href));
  const ativo = (href: string) =>
    pathname === href ||
    (pathname.startsWith(href + "/") &&
      !hrefs.some((h) => h !== href && h.length > href.length && (pathname === h || pathname.startsWith(h + "/"))));

  const Icone = (nome: string) => {
    const C = (Icones as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[nome];
    return C ? <C size={20} className="ti" /> : null;
  };

  return (
    <div className="sni-app-shell">
      {aberto && <div className="sni-sidebar-backdrop" onClick={() => setAberto(false)} />}

      <aside className={`sni-sidebar ${aberto ? "open" : ""}`} aria-label="Navegação principal">
        <div className="sni-sidebar-logo">
          <div className="sni-sidebar-logo-icon" aria-hidden="true">
            <Icones.IconBuildingCommunity size={20} className="ti" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="sni-sidebar-logo-text">SNI Conecta</div>
            <div className="sni-sidebar-logo-sub">Seicho-No-Ie</div>
          </div>
        </div>

        <nav className="sni-sidebar-scroll">
          {modulos.map((m) => (
            <div key={m.chave}>
              <div className="sni-sidebar-section-label">{m.rotulo}</div>
              {m.itens.map((it) => (
                <Link key={it.href} href={it.href} onClick={() => setAberto(false)} className={`sni-sidebar-item ${ativo(it.href) ? "active" : ""}`}>
                  {Icone(it.icone)}
                  <span>{it.rotulo}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sni-sidebar-bottom">
          <div className="sni-sidebar-user">
            <Link href="/minha-conta" className={`sni-sidebar-user-link ${pathname.startsWith("/minha-conta") ? "active" : ""}`} title="Minha conta">
              <div className="sni-sidebar-avatar" aria-hidden="true">{iniciais(pessoa.nome)}</div>
              <div className="sni-sidebar-user-info">
                <div className="sni-sidebar-user-name">{pessoa.nome}</div>
                <div className="sni-sidebar-user-role">{pessoa.papel}</div>
              </div>
            </Link>
            <form action="/login/sair" method="post">
              <button className="sni-sidebar-logout" aria-label="Sair" title="Sair">
                <Icones.IconLogout size={20} className="ti" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="sni-content">
        <header className="sni-topbar">
          <button className="sni-mobile-toggle" onClick={() => setAberto((v) => !v)} aria-label="Abrir menu">
            <Icones.IconMenu2 size={20} className="ti" />
          </button>
          <h1 className="sni-topbar-title">{titulo}</h1>
          <div className="sni-topbar-right">{acoes}</div>
        </header>
        <main className="sni-page">
          <div className="sni-page-wide">{children}</div>
        </main>
      </div>
    </div>
  );
}

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[p.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}
