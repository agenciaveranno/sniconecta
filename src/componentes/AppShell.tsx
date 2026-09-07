"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Icones from "@tabler/icons-react";
import type { Modulo } from "@/modulos/registro";

/**
 * Casca do painel (design system v2.9). Barra lateral institucional — navy nos
 * dois temas, e o único bloco de cor cheia do tema escuro —, barra superior em
 * vidro, conteúdo opaco.
 *
 * Recebe do servidor só os módulos que a pessoa pode ver: a filtragem por
 * capacidade acontece lá, nunca aqui.
 *
 * ⚠️ A altura das duas faixas vem do MESMO token, `--header-h`: o bloco de
 * marca da lateral e a barra superior fecham na mesma linha horizontal. Nunca
 * escrever a altura literal em nenhum dos dois — viram dois valores
 * independentes e divergem na primeira mudança.
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
    return C ? <C size={19} className="ti" /> : null;
  };

  return (
    <div className="sni-app-shell">
      {aberto && <div className="sni-sidebar-backdrop" onClick={() => setAberto(false)} />}

      <aside className={`side ${aberto ? "sni-aberta" : ""}`} aria-label="Navegação principal">
        {/*
          ⚠️ EMBLEMA, não o logotipo completo. A assinatura "SEICHO-NO-IE" que
          acompanha o logo vira borrão nesta altura e concorre com o nome do
          produto ao lado. O logotipo inteiro está em `/marca/completo.svg`,
          para relatório e impressão, onde há altura para ele.

          E sem subtítulo: "Seicho-No-Ie" embaixo de "SNI Conecta" repetia em
          miúdo o que o emblema já diz em cheio.
        */}
        <div className="brand">
          <Image className="brand-logo" src="/marca/emblema.svg" alt="" width={32} height={32} priority />
          <span className="brand-n">SNI Conecta</span>
        </div>

        <nav className="side-nav">
          {modulos.map((m) => (
            <div key={m.chave}>
              <div className="nav-l">{m.rotulo}</div>
              {m.itens.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setAberto(false)}
                  className={`nav-i ${ativo(it.href) ? "on" : ""}`}
                  aria-current={ativo(it.href) ? "page" : undefined}
                >
                  {Icone(it.icone)}
                  <span>{it.rotulo}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        {/* Sem bloco de usuário no rodapé: ele vive na barra superior. */}
      </aside>

      <div className="sni-content">
        {/*
          A barra superior carrega APENAS o título da tela e a identidade.
          A ação primária de uma tela vive em `.page-actions`, no conteúdo —
          ver `TituloPagina`.
        */}
        <header className="topbar">
          <button className="sni-mobile-toggle" onClick={() => setAberto((v) => !v)} aria-label="Abrir menu">
            <Icones.IconMenu2 size={20} className="ti" />
          </button>
          <h1 className="t-screen">{titulo}</h1>
          <div className="sni-topbar-right">
            {acoes}
            <MenuDoUsuario pessoa={pessoa} />
          </div>
        </header>
        <main className="sni-page">
          <div className="sni-page-wide">{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * Identidade no canto superior direito: avatar e PRIMEIRO NOME apenas.
 *
 * ⚠️ Não existe botão de Sair permanentemente visível. Ação de saída não ocupa
 * espaço fixo na interface — ela mora aqui dentro, a um clique de distância,
 * onde ninguém a aciona sem querer ao mirar em outra coisa.
 *
 * O menu fecha no clique fora, no Esc e ao sair pelo Tab, e devolve o foco ao
 * botão quando fechado pelo teclado.
 */
function MenuDoUsuario({ pessoa }: { pessoa: { nome: string; papel: string } }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const foraDaCaixa = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener("click", foraDaCaixa);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", foraDaCaixa);
      document.removeEventListener("keydown", escape);
    };
  }, [aberto]);

  return (
    <div
      className="user"
      ref={caixa}
      onBlur={(e) => {
        // Sair pelo Tab fecha. `relatedTarget` nulo é clique no vazio, que o
        // ouvinte de clique já trata — fechar aqui também roubaria o foco.
        if (e.relatedTarget && !caixa.current?.contains(e.relatedTarget as Node)) setAberto(false);
      }}
    >
      <span className="user-name">{primeiroNome(pessoa.nome)}</span>
      <button
        ref={botao}
        className="user-btn"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls="menu-do-usuario"
        aria-label={`Conta de ${pessoa.nome}`}
        onClick={() => setAberto((v) => !v)}
      >
        {iniciais(pessoa.nome)}
      </button>

      <div className="user-menu lg" id="menu-do-usuario" role="menu" hidden={!aberto}>
        <div className="user-menu-h">
          <span className="user-btn" aria-hidden="true" style={{ cursor: "default" }}>
            {iniciais(pessoa.nome)}
          </span>
          <div>
            <div className="nm">{pessoa.nome}</div>
            <div className="rl">{pessoa.papel}</div>
          </div>
        </div>
        <Link className="mi" role="menuitem" href="/minha-conta" onClick={() => setAberto(false)}>
          <Icones.IconUserCog size={19} className="ti" /> Minha conta
        </Link>
        <div className="msep" />
        <form action="/login/sair" method="post">
          <button className="mi" role="menuitem" type="submit" style={{ width: "100%" }}>
            <Icones.IconLogout size={19} className="ti" /> Sair
          </button>
        </form>
      </div>
    </div>
  );
}

/** Só o primeiro nome na barra: o nome inteiro empurra a barra e quebra. */
function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[p.length - 1]?.[0] ?? "")).toUpperCase() || "?";
}
