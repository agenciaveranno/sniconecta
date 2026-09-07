import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { pessoaAtual } from "@/lib/auth";
import { MODULOS } from "@/modulos/registro";
import AppShell from "@/componentes/AppShell";

/**
 * Lado servidor do painel: resolve a sessão, filtra os módulos pela
 * capacidade e entrega ao AppShell só o que a pessoa pode ver.
 */
export default async function Painel({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) {
  const eu = await pessoaAtual();
  if (!eu) redirect("/login");

  // `pronto` antes da capacidade: a barra lateral mostra o que EXISTE, não o
  // que está no plano. Um item que leva a 404 no meio do menu não distingue
  // "ainda não foi feito" de "quebrou" — e quem vê um passa a desconfiar dos
  // outros.
  const modulos = MODULOS.map((m) => ({
    ...m,
    itens: m.itens.filter((i) => i.pronto && eu.pode(i.capacidade)),
  })).filter((m) => m.itens.length > 0);
  // O rótulo vem da matriz (NOME_PAPEL), não de `replace` no código do papel:
  // "presidente_uap" viraria "presidente uap" na tela de quem responde pela
  // instituição.
  const papel = eu.rotuloPapel;

  return (
    <AppShell modulos={modulos} pessoa={{ nome: eu.nome, papel }} titulo={titulo} acoes={acoes}>
      {children}
    </AppShell>
  );
}
