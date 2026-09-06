import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigir } from "@/lib/supabase/consulta";
import {
  capacidadesDe,
  papelPrincipal,
  NOME_PAPEL,
  PAPEIS_NACIONAIS,
  type Capacidade,
  type TipoPapel,
} from "@/lib/permissoes";

export type { Capacidade, TipoPapel };

/** Um papel concedido. `unidadeId` nulo = nacional. */
export interface Papel {
  tipo: TipoPapel;
  unidadeId: string | null;
}

export interface PessoaSessao {
  id: string;
  nome: string;
  email: string | null;
  papeis: Papel[];
  papelPrincipal: TipoPapel | null;
  rotuloPapel: string;
  eSede: boolean;
  /** Tem a capacidade em ALGUM escopo. Serve para montar menu. */
  pode: (cap: Capacidade) => boolean;
  /**
   * Tem a capacidade NESTA unidade. Serve para autorizar.
   *
   * Assíncrona porque o papel concedido numa Regional vale nas Associações
   * Locais dela: descobrir isso é subir a árvore a partir do alvo, no banco.
   */
  podeEm: (cap: Capacidade, unidadeId: string) => Promise<boolean>;
}

/**
 * Sessão da pessoa autenticada, com papéis e capacidades. Cacheada por
 * requisição: layout, página e ações leem a mesma.
 *
 * Lê com o cliente da SESSÃO, sob RLS — não com `service_role`. As policies de
 * `pessoas` e `papeis` liberam a própria linha via `app.pessoa_atual()`, que é
 * `SECURITY DEFINER` e por isso não recursa. Usar a chave de serviço aqui
 * gastaria o privilégio máximo na operação mais frequente do sistema.
 */
export const pessoaAtual = cache(async (): Promise<PessoaSessao | null> => {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  // maybeSingle: "não achou" é resultado legítimo (conta ainda sem pessoa),
  // então aqui o erro é separado do vazio à mão, em vez de passar por exigir().
  const busca = await supabase
    .from("pessoas")
    .select("id, nome, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (busca.error) {
    throw new Error(`Não foi possível ler a pessoa da sessão: ${busca.error.message}`);
  }
  const pessoa = busca.data;
  if (!pessoa) return null;

  // ⚠️ `ativo` é filtrado aqui. Sem isso, papel revogado continua valendo até
  // a linha ser apagada — e revogar passa a não revogar nada.
  const linhas = exigir(
    await supabase
      .from("papeis")
      .select("tipo, unidade_id")
      .eq("pessoa_id", pessoa.id)
      .eq("ativo", true),
    "os papéis da pessoa"
  );

  const papeis: Papel[] = linhas.map((p) => ({
    tipo: p.tipo as TipoPapel,
    unidadeId: p.unidade_id ?? null,
  }));

  const tipos = papeis.map((p) => p.tipo);
  const principal = papelPrincipal(tipos);
  const eSede = tipos.includes("sede");

  const pode = (cap: Capacidade) =>
    papeis.some((p) => capacidadesDe(p.tipo).includes(cap));

  const podeEm = async (cap: Capacidade, unidadeId: string) => {
    const candidatos = papeis.filter((p) => capacidadesDe(p.tipo).includes(cap));
    if (candidatos.length === 0) return false;
    // Papel nacional vale em qualquer lugar; não precisa consultar a árvore.
    if (candidatos.some((p) => p.unidadeId === null || PAPEIS_NACIONAIS.has(p.tipo))) {
      return true;
    }
    // O resto exige que o papel esteja na unidade alvo ou acima dela.
    const { data: ancestrais, error } = await supabase.rpc("ancestrais", {
      alvo: unidadeId,
    });
    if (error) {
      throw new Error(`Não foi possível verificar o alcance da unidade: ${error.message}`);
    }
    const noCaminho = new Set((ancestrais ?? []).map((a: { unidade_id: string }) => a.unidade_id));
    return candidatos.some((p) => p.unidadeId !== null && noCaminho.has(p.unidadeId));
  };

  return {
    id: pessoa.id,
    nome: pessoa.nome,
    email: pessoa.email ?? null,
    papeis,
    papelPrincipal: principal,
    rotuloPapel: principal ? NOME_PAPEL[principal] : "Sem papel atribuído",
    eSede,
    pode,
    podeEm,
  };
});

/** Lançada quando uma Server Action ou rota é chamada sem autorização. */
export class SemPermissao extends Error {
  constructor(cap: Capacidade, escopo?: string) {
    super(`Sem permissão para "${cap}"${escopo ? ` em ${escopo}` : ""}.`);
    this.name = "SemPermissao";
  }
}

/** Lançada quando não há sessão. */
export class SemSessao extends Error {
  constructor() {
    super("É preciso entrar para continuar.");
    this.name = "SemSessao";
  }
}

/**
 * Porteiro de Server Action e de rota. SEMPRE a primeira linha: o guard do
 * layout não protege endpoint, e quem conhece o endpoint chama direto.
 *
 * LANÇA em vez de redirecionar (decisão registrada ao unificar os dois
 * sistemas): Server Action que devolve estado para `useActionState` precisa
 * poder tratar a recusa, e rota de API precisa responder 403 — um `redirect`
 * devolveria a página de login com status 200, que é justamente a armadilha
 * que o proxy documenta. Página que queira mandar para o login usa
 * `exigirCapacidadeNaPagina`.
 */
export async function exigirCapacidade(
  cap: Capacidade,
  unidadeId?: string
): Promise<PessoaSessao> {
  const eu = await pessoaAtual();
  if (!eu) throw new SemSessao();
  const ok = unidadeId ? await eu.podeEm(cap, unidadeId) : eu.pode(cap);
  if (!ok) throw new SemPermissao(cap, unidadeId);
  return eu;
}

/**
 * Mesma checagem, para PÁGINA.
 *
 * Página não devolve estado nem status: quem chega sem sessão precisa ir para
 * o login, e quem chega sem permissão precisa de uma tela que explique. Server
 * Action e rota continuam usando `exigirCapacidade`, que lança.
 */
export async function exigirCapacidadeNaPagina(
  cap: Capacidade,
  unidadeId?: string
): Promise<PessoaSessao> {
  const eu = await pessoaAtual();
  if (!eu) redirect("/login");
  const ok = unidadeId ? await eu.podeEm(cap, unidadeId) : eu.pode(cap);
  if (!ok) {
    redirect("/painel?erro=" + encodeURIComponent("Você não tem permissão para esta ação."));
  }
  return eu;
}
