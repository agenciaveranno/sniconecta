import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteServico } from "@/lib/supabase/service";
import { exigir } from "@/lib/supabase/consulta";
import { capacidadesDe, PAPEIS_NACIONAIS, type Capacidade, type TipoPapel } from "@/lib/permissoes";

export interface Papel {
  tipo: TipoPapel;
  localidadeId: string | null;
  edicaoId: string | null;
}

export interface PessoaSessao {
  id: string;
  nome: string;
  email: string | null;
  papeis: Papel[];
  /** Tem a capacidade em ALGUM escopo. Serve para montar menu. */
  pode: (cap: Capacidade) => boolean;
  /** Tem a capacidade NESTA localidade. Serve para autorizar. */
  podeEm: (cap: Capacidade, localidadeId: string) => boolean;
}

/**
 * Sessão da pessoa autenticada, com papéis e capacidades. Cacheada por
 * requisição: layout, página e ações leem a mesma.
 *
 * A leitura de `pessoas` e `papeis` usa `service_role` de propósito: as
 * policies dessas tabelas dependem de `app.current_pessoa_id()`, e é aqui que
 * a identidade nasce. Nada é escrito.
 */
export const pessoaAtual = cache(async (): Promise<PessoaSessao | null> => {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const servico = criarClienteServico();
  // maybeSingle: "não achou" é resultado legítimo (conta sem pessoa ainda),
  // então aqui o erro é separado do vazio à mão, em vez de passar por exigir().
  const busca = await servico
    .from("pessoas")
    .select("id, nome, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (busca.error) throw new Error(`Não foi possível ler a pessoa da sessão: ${busca.error.message}`);
  const pessoa = busca.data;
  if (!pessoa) return null;

  const linhas = exigir(
    await servico
      .from("papeis")
      .select("tipo, localidade_id, edicao_id")
      .eq("pessoa_id", pessoa.id),
    "os papéis da pessoa"
  );
  const papeis: Papel[] = linhas.map((p) => ({
    tipo: p.tipo as TipoPapel,
    localidadeId: p.localidade_id ?? null,
    edicaoId: p.edicao_id ?? null,
  }));

  const pode = (cap: Capacidade) => papeis.some((p) => capacidadesDe(p.tipo).includes(cap));
  const podeEm = (cap: Capacidade, localidadeId: string) =>
    papeis.some(
      (p) =>
        capacidadesDe(p.tipo).includes(cap) &&
        (PAPEIS_NACIONAIS.has(p.tipo) || p.localidadeId === localidadeId)
    );

  return { id: pessoa.id, nome: pessoa.nome, email: pessoa.email ?? null, papeis, pode, podeEm };
});

/**
 * Porteiro de Server Action e de rota. SEMPRE a primeira linha: o guard do
 * layout não protege endpoint, e quem conhece o endpoint chama direto.
 */
export async function exigirCapacidade(cap: Capacidade, localidadeId?: string): Promise<PessoaSessao> {
  const eu = await pessoaAtual();
  if (!eu) redirect("/login");
  const ok = localidadeId ? eu.podeEm(cap, localidadeId) : eu.pode(cap);
  if (!ok) redirect("/painel?erro=" + encodeURIComponent("Você não tem permissão para esta ação."));
  return eu;
}
