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

  const modulos = MODULOS.map((m) => ({ ...m, itens: m.itens.filter((i) => eu.pode(i.capacidade)) })).filter(
    (m) => m.itens.length > 0
  );
  const papel = eu.papeis.some((p) => p.tipo === "sede")
    ? "Sede"
    : eu.papeis.length
      ? eu.papeis.map((p) => p.tipo.replace(/_/g, " ")).join(", ")
      : "Sem papel";

  return (
    <AppShell modulos={modulos} pessoa={{ nome: eu.nome, papel }} titulo={titulo} acoes={acoes}>
      {children}
    </AppShell>
  );
}
