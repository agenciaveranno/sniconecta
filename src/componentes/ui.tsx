import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * TODOS os primitivos visuais. Cada um é uma casca fina sobre as classes de
 * src/design/componentes.css — o estilo mora no CSS, o primitivo garante que
 * ninguém monte botão ou campo na mão numa página.
 *
 * Precisou de algo que não existe? Crie aqui, não estilize na página.
 */

const cx = (...partes: (string | false | null | undefined)[]) => partes.filter(Boolean).join(" ");

// ─── Botões ──────────────────────────────────────────────────────────────────

type Variante = "primary" | "glass" | "ghost" | "success" | "danger";
type Tamanho = "lg" | "md" | "sm";
const VARIANTE: Record<Variante, string> = {
  primary: "sni-btn-primary",
  glass: "sni-btn-secondary",
  ghost: "sni-btn-ghost",
  success: "sni-btn-success",
  danger: "sni-btn-danger",
};

export function Botao({
  variante = "primary",
  tamanho = "md",
  icone,
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { variante?: Variante; tamanho?: Tamanho; icone?: ReactNode }) {
  return (
    <button className={cx("sni-btn", VARIANTE[variante], `sni-btn-${tamanho}`, className)} {...rest}>
      {icone}
      {children}
    </button>
  );
}

export function BotaoLink({
  variante = "primary",
  tamanho = "md",
  icone,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & { variante?: Variante; tamanho?: Tamanho; icone?: ReactNode }) {
  return (
    <Link className={cx("sni-btn", VARIANTE[variante], `sni-btn-${tamanho}`, className)} {...rest}>
      {icone}
      {children}
    </Link>
  );
}

export function BotaoIcone({
  rotulo,
  tamanho = "md",
  variante = "ghost",
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { rotulo: string; tamanho?: Tamanho; variante?: Variante }) {
  return (
    <button
      aria-label={rotulo}
      title={rotulo}
      className={cx("sni-btn sni-btn-icon", VARIANTE[variante], `sni-btn-${tamanho}`, className)}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─── Campos ──────────────────────────────────────────────────────────────────

export function Campo({
  label,
  htmlFor,
  dica,
  erro,
  obrigatorio,
  children,
}: {
  label: string;
  htmlFor?: string;
  dica?: string;
  erro?: string;
  obrigatorio?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="sni-field">
      <label className="sni-label" htmlFor={htmlFor}>
        {label}
        {obrigatorio && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {erro ? <p className="sni-error">{erro}</p> : dica ? <p className="sni-hint">{dica}</p> : null}
    </div>
  );
}

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx("sni-input", className)} {...rest} />;
}
export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cx("sni-select", className)} {...rest} />;
}
export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx("sni-textarea", className)} {...rest} />;
}

// ─── Marcadores e alertas ────────────────────────────────────────────────────

type Tom = "blue" | "success" | "warning" | "danger" | "info" | "gray";

/** Situação nunca só por cor: `ponto` junta cor, texto e ponto. */
export function Badge({ tom = "gray", ponto, children }: { tom?: Tom; ponto?: boolean; children: ReactNode }) {
  return (
    <span className={cx("sni-badge", `sni-badge-${tom}`)}>
      {ponto && <span className="sni-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Alerta({ tipo = "info", icone, children }: { tipo?: "info" | "success" | "warning" | "danger"; icone?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx("sni-alert", `sni-alert-${tipo}`)} role={tipo === "danger" ? "alert" : "status"}>
      {icone}
      <div>{children}</div>
    </div>
  );
}

// ─── Cards e dados ───────────────────────────────────────────────────────────

export function Card({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cx("sni-card", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardCabecalho({ icone, titulo, subtitulo }: { icone?: ReactNode; titulo: ReactNode; subtitulo?: ReactNode }) {
  return (
    <div className="sni-card-header">
      {icone && <div className="sni-card-icon blue">{icone}</div>}
      <div>
        <div className="sni-card-title">{titulo}</div>
        {subtitulo && <div className="sni-card-subtitle">{subtitulo}</div>}
      </div>
    </div>
  );
}

/** Todo número que a pessoa lê para conferir. Plex Mono, tabular. */
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("num", className)}>{children}</span>;
}

export function Metrica({ valor, rotulo }: { valor: ReactNode; rotulo: ReactNode }) {
  return (
    <div>
      <div className="sni-metric-value">{valor}</div>
      <div className="t-support">{rotulo}</div>
    </div>
  );
}

/** A entidade brasileira: caixa alta escrita no conteúdo, nunca quebra. */
export function Entidade() {
  return <span className="entidade">SEICHO-NO-IE DO BRASIL</span>;
}

// ─── Títulos e estado vazio ──────────────────────────────────────────────────

export function TituloPagina({ children, descricao }: { children: ReactNode; descricao?: ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 className="t-page">{children}</h1>
      {descricao && <p className="sni-page-subtitle">{descricao}</p>}
    </div>
  );
}

export function TituloSecao({ children }: { children: ReactNode }) {
  return <h2 className="t-section">{children}</h2>;
}

export function Vazio({ icone, titulo, children, acao }: { icone?: ReactNode; titulo: ReactNode; children?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="empty">
      {icone}
      <h4>{titulo}</h4>
      {children && <p>{children}</p>}
      {acao}
    </div>
  );
}

// ─── Tabela ──────────────────────────────────────────────────────────────────

export function Tabela({ children }: { children: ReactNode }) {
  return (
    <div className="sni-card-flat" style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table className="sni-table">{children}</table>
      </div>
    </div>
  );
}

/** `dado` liga a fonte de dado (mono) na célula. */
export function Celula({ dado, alinhar, children, ...rest }: ComponentProps<"td"> & { dado?: boolean; alinhar?: "left" | "right" | "center" }) {
  return (
    <td className={cx(dado && "num")} style={{ textAlign: alinhar }} {...rest}>
      {children}
    </td>
  );
}
