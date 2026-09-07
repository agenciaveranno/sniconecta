import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
} from "@tabler/icons-react";

/**
 * TODOS os primitivos visuais. Cada um é uma casca fina sobre as classes de
 * src/design/componentes.css — o estilo mora no CSS, o primitivo garante que
 * ninguém monte botão ou campo na mão numa página.
 *
 * Quem usa o sistema são coordenadores e voluntários de várias idades, muitos
 * em telas pequenas e com luz difícil. **Legibilidade vence estilo em qualquer
 * empate**: corpo em 15px, mínimo absoluto de 13px, alvo de toque de 44px,
 * cinza secundário no 600 e nunca no 400.
 *
 * A fronteira que governa o resto: conteúdo (tabela, campo, card de dado) é
 * sempre opaco; só a moldura que flutua por cima recebe vidro.
 *
 * ⚠️ Este arquivo é SUPERCONJUNTO das duas origens: o que as telas do módulo
 * `ciclo` já passavam continua aceito com o mesmo nome, e os nomes desta
 * plataforma convivem como sinônimo. Porte de tela não deve virar caça a
 * renomeação de prop.
 *
 * Precisou de algo que não existe? Crie aqui, não estilize na página.
 */

const cx = (...partes: (string | false | null | undefined)[]) => partes.filter(Boolean).join(" ");

// ─── Botões ──────────────────────────────────────────────────────────────────

/** `glass` e `secondary` são o mesmo material: a ação secundária em vidro. */
type Variante = "primary" | "secondary" | "glass" | "ghost" | "success" | "danger" | "dark" | "link";
type Tamanho = "xl" | "lg" | "md" | "sm" | "xs";

const VARIANTE: Record<Variante, string> = {
  primary: "sni-btn-primary",
  secondary: "sni-btn-secondary",
  glass: "sni-btn-secondary",
  ghost: "sni-btn-ghost",
  success: "sni-btn-success",
  danger: "sni-btn-danger",
  dark: "sni-btn-dark",
  link: "sni-btn-link",
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

/** Mesma aparência de botão, semântica de link. */
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

/** Botão só de ícone. `rotulo` é obrigatório: ícone sozinho não se lê. */
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

/**
 * Ação discreta dentro de uma linha de tabela ou de um card.
 *
 * Não é botão: sem preenchimento e sem cápsula cheia, para não competir com a
 * ação primária da tela. Mantém o alvo de toque e nunca desce dos 13px.
 */
export function Acao({ icone, className, children, ...rest }: ComponentProps<"button"> & { icone?: ReactNode }) {
  return (
    <button type="button" className={cx("sni-acao", className)} {...rest}>
      {icone}
      {children}
    </button>
  );
}

export function AcaoLink({ icone, className, children, ...rest }: ComponentProps<typeof Link> & { icone?: ReactNode }) {
  return (
    <Link className={cx("sni-acao", className)} {...rest}>
      {icone}
      {children}
    </Link>
  );
}

/** Chave liga/desliga. O estado vive em `aria-pressed`, não só na cor. */
export function Chave({
  ligado,
  rotulo,
  className,
  ...rest
}: ComponentProps<"button"> & { ligado: boolean; rotulo: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-pressed={ligado}
      aria-label={rotulo}
      title={rotulo}
      className={cx("sw", className)}
      {...rest}
    />
  );
}

// ─── Campos ──────────────────────────────────────────────────────────────────

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx("sni-input", className)} {...rest} />;
}
export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select className={cx("sni-select", className)} {...rest} />;
}
export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx("sni-textarea", className)} {...rest} />;
}

/**
 * Rótulo + controle + dica ou erro.
 *
 * Sem `htmlFor`, o rótulo ENVOLVE o controle — é o que faz o clique no texto
 * focar o campo mesmo quando o `<input>` não tem `id`. Com `htmlFor`, vira
 * rótulo solto, para o caso em que o controle não é filho direto (um grupo de
 * rádios, um componente de terceiro).
 *
 * O erro substitui a dica em vez de somar: duas linhas de apoio embaixo do
 * mesmo campo competem, e a que importa é a do erro.
 */
export function Campo({
  label,
  htmlFor,
  dica,
  hint,
  erro,
  obrigatorio,
  children,
}: {
  label: string;
  htmlFor?: string;
  /** Sinônimos: `dica` é o nome desta plataforma, `hint` veio do módulo ciclo. */
  dica?: string;
  hint?: string;
  erro?: string;
  obrigatorio?: boolean;
  children: ReactNode;
}) {
  const apoio = dica ?? hint;
  const texto = (
    <>
      {label}
      {obrigatorio && (
        <>
          {" "}
          <span aria-hidden="true">*</span>
          <span className="sni-so-leitor"> (obrigatório)</span>
        </>
      )}
    </>
  );
  const rodape = erro ? (
    <span className="sni-error">
      <IconAlertCircle size={15} className="ti" aria-hidden="true" />
      {erro}
    </span>
  ) : apoio ? (
    <span className="sni-hint">{apoio}</span>
  ) : null;

  // Com `htmlFor`, o rótulo aponta para o controle pelo id e fica SOLTO —
  // envolver o controle além disso o associaria duas vezes.
  if (htmlFor) {
    return (
      <div className="sni-field">
        <label className="sni-label" htmlFor={htmlFor}>
          {texto}
        </label>
        {children}
        {rodape}
      </div>
    );
  }
  return (
    <label className="sni-field">
      <span className="sni-label">{texto}</span>
      {children}
      {rodape}
    </label>
  );
}

/**
 * Uma pergunta de sim ou não, com a chave ao lado do texto.
 *
 * `Campo` põe o rótulo ACIMA do controle, e acima de uma chave o rótulo fica
 * órfão: a chave sozinha não diz do que ela é. Aqui os dois andam na mesma
 * linha, que é como se lê uma pergunta.
 */
export function CampoChave({
  rotulo,
  dica,
  ligado,
  ...rest
}: ComponentProps<"button"> & { rotulo: string; dica?: string; ligado: boolean }) {
  return (
    <div className="sni-field sni-field-chave">
      <span className="sni-chave-linha">
        <Chave ligado={ligado} rotulo={rotulo} {...rest} />
        <span className="sni-label">{rotulo}</span>
      </span>
      {dica && <span className="sni-hint">{dica}</span>}
    </div>
  );
}

/**
 * Abas por URL, não por estado.
 *
 * ⚠️ Cada aba é um LINK. Aba como estado de componente quebraria o botão
 * Voltar e tornaria impossível mandar a alguém o endereço da aba certa — quem
 * pede "me manda os documentos dele" precisa receber um link que abre onde
 * deve, não a primeira aba com a instrução de clicar na segunda.
 */
export function Abas({
  atual,
  abas,
}: {
  atual: string;
  abas: { chave: string; rotulo: string; href: string; contagem?: number }[];
}) {
  return (
    <nav className="sni-abas" aria-label="Seções desta ficha">
      {abas.map((a) => (
        <Link
          key={a.chave}
          href={a.href}
          className="sni-aba"
          aria-current={a.chave === atual ? "page" : undefined}
        >
          {a.rotulo}
          {a.contagem !== undefined && a.contagem > 0 && (
            <span className="sni-aba-contagem num">{a.contagem}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

// ─── Marcadores e alertas ────────────────────────────────────────────────────

/** `navy` e `outline` vêm do módulo ciclo; os demais são do design system. */
type Tom = "blue" | "success" | "warning" | "danger" | "info" | "gray" | "dark" | "navy" | "outline";

const TOM: Record<Tom, string> = {
  blue: "sni-badge-blue",
  success: "sni-badge-success",
  warning: "sni-badge-warning",
  danger: "sni-badge-danger",
  info: "sni-badge-info",
  gray: "sni-badge-gray",
  dark: "sni-badge-dark",
  navy: "sni-badge-dark",
  outline: "sni-badge-outline-blue",
};

/** Situação nunca só por cor: `ponto` junta cor, texto e ponto. */
export function Badge({
  tom = "gray",
  ponto,
  tamanho,
  children,
}: {
  tom?: Tom;
  ponto?: boolean;
  tamanho?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  return (
    <span className={cx("sni-badge", TOM[tom], tamanho && tamanho !== "md" && `sni-badge-${tamanho}`)}>
      {ponto && <span className="sni-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Atalho para a situação ativo/inativo, que aparece em quase toda listagem. */
export function Etiqueta({ ativo }: { ativo: boolean }) {
  return (
    <Badge tom={ativo ? "success" : "gray"} ponto>
      {ativo ? "Ativo" : "Inativo"}
    </Badge>
  );
}

type TipoAlerta = "info" | "success" | "warning" | "danger";

const ICONE_ALERTA: Record<TipoAlerta, typeof IconInfoCircle> = {
  info: IconInfoCircle,
  success: IconCircleCheck,
  warning: IconAlertTriangle,
  danger: IconAlertCircle,
};

/**
 * O ícone vem do tipo. Quem passar `icone` sobrescreve, mas o padrão é o
 * certo: alerta sem ícone comunica só por cor, e cor sozinha não é sinal.
 */
export function Alerta({
  tipo = "info",
  icone,
  children,
}: {
  tipo?: TipoAlerta;
  icone?: ReactNode;
  children: ReactNode;
}) {
  const Icone = ICONE_ALERTA[tipo];
  return (
    <div className={cx("sni-alert", `sni-alert-${tipo}`)} role={tipo === "danger" ? "alert" : "status"}>
      {icone ?? <Icone size={18} className="ti" aria-hidden="true" />}
      <div className="pretty">{children}</div>
    </div>
  );
}

/**
 * O recado que a rota trouxe: `?erro=` ou `?ok=`.
 *
 * Toda tela que grava redireciona de volta com um dos dois, e o bloco estava
 * copiado em onze páginas — com o `marginBottom: 16` inline que o design
 * system proíbe, e com o ícone passado à mão. As cópias já divergiam: `size={20}`
 * onde o padrão do `Alerta` é 18, e `IconCircleCheck` numa tela contra
 * `IconCheck` na tela ao lado, para dizer a mesma coisa.
 *
 * ⚠️ Sem `icone`: o `Alerta` escolhe pelo tipo, e é essa escolha que mantém
 * "deu certo" e "deu errado" com a mesma cara em todo o sistema.
 */
export function Recado({ erro, ok }: { erro?: string; ok?: string }) {
  if (!erro && !ok) return null;
  return (
    <div className="sni-recado">
      <Alerta tipo={erro ? "danger" : "success"}>{erro ?? ok}</Alerta>
    </div>
  );
}

// ─── Cards e dados ───────────────────────────────────────────────────────────

/**
 * `como="section"` para o card que é de fato uma seção da página. O padrão é
 * `div`: card em lista não é marco de navegação, e um leitor de tela que
 * anuncia trinta seções não ajuda ninguém.
 */
export function Card({
  className,
  como: Como = "div",
  children,
  ...rest
}: ComponentProps<"div"> & { como?: "div" | "section" | "article" }) {
  return (
    <Como className={cx("sni-card", className)} {...rest}>
      {children}
    </Como>
  );
}

export function CardCabecalho({
  icone,
  titulo,
  subtitulo,
  descricao,
  tom = "blue",
  acao,
}: {
  icone?: ReactNode;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** Sinônimo de `subtitulo`, para ler igual ao resto dos primitivos. */
  descricao?: ReactNode;
  tom?: "blue" | "success" | "warning" | "danger" | "info" | "dark";
  /** Gatilho à direita — normalmente um ModalCadastro com gatilho="link". */
  acao?: ReactNode;
}) {
  const legenda = subtitulo ?? descricao;
  return (
    <div className="sni-card-header">
      {icone && <div className={cx("sni-card-icon", tom)}>{icone}</div>}
      <div style={{ minWidth: 0 }}>
        <div className="sni-card-title">{titulo}</div>
        {legenda && <div className="sni-card-subtitle">{legenda}</div>}
      </div>
      {acao && <div style={{ marginLeft: "auto", flexShrink: 0 }}>{acao}</div>}
    </div>
  );
}

/** Todo número que a pessoa lê para conferir. Plex Mono, tabular. */
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("num", className)}>{children}</span>;
}

/**
 * Card de métrica: valor em Plex Mono, rótulo em Figtree.
 *
 * `alerta` muda a borda, não o fundo — fundo colorido atrás de um número
 * rouba a leitura do próprio número, que é o que a pessoa veio ver.
 */
export function Metrica({
  valor,
  rotulo,
  detalhe,
  icone,
  tom = "blue",
  alerta,
  semCard,
}: {
  valor: ReactNode;
  rotulo: ReactNode;
  detalhe?: ReactNode;
  icone?: ReactNode;
  tom?: "blue" | "success" | "warning" | "danger" | "info" | "dark";
  alerta?: boolean;
  /** Sem moldura, para compor dentro de um card que já existe. */
  semCard?: boolean;
}) {
  const corpo = (
    <>
      {icone ? (
        <CardCabecalho titulo={rotulo} icone={icone} tom={tom} />
      ) : (
        <div className="sni-metric-rotulo">{rotulo}</div>
      )}
      <div className="sni-metric-value">{valor}</div>
      {detalhe && <div className="sni-metric-detalhe">{detalhe}</div>}
    </>
  );
  if (semCard) return <div>{corpo}</div>;
  return <div className={cx("sni-metric", alerta && "alerta")}>{corpo}</div>;
}

/**
 * A pessoa jurídica.
 *
 * A caixa alta vem escrita no conteúdo, não por `text-transform`: assim a
 * grafia sobrevive a copiar e colar, à exportação em PDF e à troca de estilo.
 * A classe só impede a quebra em duas linhas.
 */
export function Entidade({ className }: { className?: string }) {
  return <span className={cx("entidade", className)}>SEICHO-NO-IE DO BRASIL</span>;
}

// ─── Títulos e estado vazio ──────────────────────────────────────────────────

/**
 * Cabeçalho de página. Aceita o título por `titulo` ou por `children` —
 * as duas origens escreviam de um jeito, e nenhuma precisa mudar.
 */
export function TituloPagina({
  titulo,
  children,
  descricao,
  acao,
  voltar,
}: {
  titulo?: ReactNode;
  children?: ReactNode;
  descricao?: ReactNode;
  acao?: ReactNode;
  voltar?: { href: string; texto: string };
}) {
  return (
    <header className="sni-page-head">
      {voltar && (
        <Link href={voltar.href} className="sni-voltar">
          <span aria-hidden="true">←</span> {voltar.texto}
        </Link>
      )}
      <div className="sni-page-head-linha">
        <div className="sni-page-head-texto">
          <h1 className="t-page">{titulo ?? children}</h1>
          {descricao && <p className="sni-page-subtitle">{descricao}</p>}
        </div>
        {acao && <div className="sni-page-head-acao">{acao}</div>}
      </div>
    </header>
  );
}

/** Título de seção: Platypi 700 em caixa alta, com régua ocupando o vão. */
export function TituloSecao({ children }: { children: ReactNode }) {
  return (
    <div className="sni-section-head">
      <h2 className="t-section">{children}</h2>
      <span className="sni-section-rule" aria-hidden="true" />
    </div>
  );
}

/**
 * Grupo de campos dentro de um formulário longo.
 *
 * `<fieldset>` e não uma `<div>` com título: o leitor de tela anuncia a legenda
 * antes de cada campo de dentro, e é o que faz "Merchant ID" ser entendido como
 * "Merchant ID, conta Cielo" sem repetir isso no rótulo de todos.
 */
export function GrupoCampos({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="sni-grupo-campos">
      <legend className="sni-grupo-campos-legenda">{titulo}</legend>
      {descricao && <p className="sni-hint sni-grupo-campos-apoio">{descricao}</p>}
      {children}
    </fieldset>
  );
}

/** Estado vazio: Platypi no título, itálico no corpo. É a voz que fala com a pessoa. */
export function Vazio({
  icone,
  titulo,
  children,
  acao,
}: {
  icone?: ReactNode;
  titulo?: ReactNode;
  children?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="empty">
      {icone}
      {titulo && <h4>{titulo}</h4>}
      {children && <p>{children}</p>}
      {acao && <div className="empty-acao">{acao}</div>}
    </div>
  );
}

// ─── Tabela ──────────────────────────────────────────────────────────────────

/**
 * Camada de conteúdo: sempre opaca, nunca vidro. O invólucro rola sozinho —
 * tabela larga não pode alargar a página.
 *
 * `cabecalho` monta o `<thead>`; sem ele, a tabela recebe o que a página
 * montar.
 */
export function Tabela({ cabecalho, children }: { cabecalho?: string[]; children: ReactNode }) {
  return (
    <div className="sni-card-flat sni-table-wrap">
      <table className="sni-table">
        {cabecalho && (
          <thead>
            <tr>
              {cabecalho.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        )}
        {cabecalho ? <tbody>{children}</tbody> : children}
      </table>
    </div>
  );
}

export function Linha({ className, children, ...rest }: ComponentProps<"tr">) {
  return (
    <tr className={className} {...rest}>
      {children}
    </tr>
  );
}

/** `dado` liga a fonte de dado (mono); `forte` destaca a coluna que identifica a linha. */
export function Celula({
  dado,
  forte,
  alinhar,
  className,
  children,
  ...rest
}: ComponentProps<"td"> & { dado?: boolean; forte?: boolean; alinhar?: "left" | "right" | "center" }) {
  return (
    <td
      className={cx(dado && "num", forte && "forte", className)}
      style={alinhar ? { textAlign: alinhar } : undefined}
      {...rest}
    >
      {children}
    </td>
  );
}
