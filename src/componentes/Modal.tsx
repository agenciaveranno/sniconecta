"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { ComponentProps, ReactNode } from "react";
import { IconX } from "@tabler/icons-react";
import { Botao, BotaoIcone } from "./ui";

/**
 * Modal do sistema.
 *
 * Regra do projeto: TODO cadastro — criar e editar — acontece em modal.
 *
 * A proteção contra fechamento acidental é deliberada: **clique fora não
 * fecha e Esc não fecha**. Só o X do cabeçalho e os botões do rodapé. Quem
 * está preenchendo um cadastro longo não pode perder o que digitou por um
 * clique distraído — e perder um formulário é o tipo de erro que faz a pessoa
 * desistir da tarefa em vez de repeti-la.
 *
 * Implementado sobre o `<dialog>` nativo, que dá a camada superior sem disputa
 * de z-index, o aprisionamento de foco e o `::backdrop`. O clique fora já não
 * fecha por padrão; o Esc dispara `cancel`, barrado abaixo.
 */
export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  largura = "md",
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: string;
  largura?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // ⚠️ Id gerado, não literal: dois modais montados na mesma página com o
  // mesmo `aria-labelledby` fazem o leitor de tela anunciar o título errado.
  const idTitulo = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (aberto && !dialog.open) dialog.showModal();
    if (!aberto && dialog.open) dialog.close();
  }, [aberto]);

  // Trava a rolagem do fundo enquanto está aberto: rolar a página atrás do
  // modal faz a pessoa perder o lugar onde estava.
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      onCancel={(e) => e.preventDefault()}
      className={`sni-modal sni-modal-${largura}`}
    >
      <div className="sni-modal-head">
        <div style={{ minWidth: 0 }}>
          <h2 id={idTitulo} className="sni-modal-title">
            {titulo}
          </h2>
          {descricao && <p className="sni-modal-sub">{descricao}</p>}
        </div>
        <BotaoIcone type="button" onClick={aoFechar} rotulo="Fechar" variante="ghost" tamanho="sm">
          <IconX size={19} className="ti" />
        </BotaoIcone>
      </div>
      {children}
    </dialog>
  );
}

/** Corpo rolável. */
export function ModalCorpo({ children }: { children: ReactNode }) {
  return <div className="sni-modal-body">{children}</div>;
}

/** Rodapé com os botões de comando — a outra forma legítima de fechar. */
export function ModalAcoes({ children }: { children: ReactNode }) {
  return <div className="sni-modal-foot">{children}</div>;
}

/**
 * Gatilho que abre um modal de cadastro já com o formulário montado.
 *
 * A página (Server Component) passa só os campos como `children`; aqui ficam o
 * estado de abertura, o envio e o fechamento. É o que permite que uma tela de
 * listagem inteira continue sendo servidor, com o cliente só no que precisa.
 */
export function ModalCadastro({
  rotulo,
  titulo,
  descricao,
  acao,
  children,
  icone,
  rotuloConfirmar = "Salvar",
  variante = "primary",
  tamanho = "md",
  largura = "md",
  gatilho = "botao",
}: {
  rotulo: ReactNode;
  titulo: string;
  descricao?: string;
  /** Server Action que grava o cadastro. */
  acao: (formData: FormData) => Promise<void> | void;
  children: ReactNode;
  icone?: ReactNode;
  rotuloConfirmar?: string;
  variante?: ComponentProps<typeof Botao>["variante"];
  tamanho?: ComponentProps<typeof Botao>["tamanho"];
  largura?: "sm" | "md" | "lg";
  /** "link" para acionar a partir de uma linha de tabela. */
  gatilho?: "botao" | "link";
}) {
  const [aberto, setAberto] = useState(false);
  const [enviando, iniciarEnvio] = useTransition();

  return (
    <>
      {gatilho === "link" ? (
        <button type="button" className="sni-acao" onClick={() => setAberto(true)}>
          {icone}
          {rotulo}
        </button>
      ) : (
        <Botao type="button" variante={variante} tamanho={tamanho} icone={icone} onClick={() => setAberto(true)}>
          {rotulo}
        </Botao>
      )}

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={titulo}
        descricao={descricao}
        largura={largura}
      >
        <form
          action={(formData) => {
            // Fecha só DEPOIS que a ação termina. Fechar antes daria por
            // gravado o que a validação ainda pode recusar — e a recusa
            // chegaria numa tela que já esqueceu o formulário.
            iniciarEnvio(async () => {
              await acao(formData);
              setAberto(false);
            });
          }}
        >
          <ModalCorpo>{children}</ModalCorpo>
          <ModalAcoes>
            <Botao type="button" variante="ghost" onClick={() => setAberto(false)} disabled={enviando}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={enviando}>
              {enviando ? "Salvando…" : rotuloConfirmar}
            </Botao>
          </ModalAcoes>
        </form>
      </Modal>
    </>
  );
}
