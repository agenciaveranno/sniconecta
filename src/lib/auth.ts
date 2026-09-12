import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";
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
  // ⚠️ Os papéis vêm EMBUTIDOS, e não numa segunda consulta. O servidor roda
  // a um oceano do banco em qualquer região que não seja a dele, e cada ida e
  // volta custa tempo de tela em BRANCO: duas consultas em série custam o
  // dobro de uma, e esta roda em TODA página do painel.
  //
  // ⚠️ `papeis.ativo` filtra as linhas EMBUTIDAS, sem `!inner`: quem não tem
  // papel nenhum continua sendo uma pessoa com sessão — com `!inner` ela
  // sumiria, e o sistema a trataria como quem nunca entrou.
  //
  // ⚠️ `!papeis_pessoa_id_fkey` NÃO é enfeite: `papeis` aponta DUAS VEZES para
  // `pessoas` — `pessoa_id` (de quem é o papel) e `concedido_por` (quem o deu).
  // Sem dizer qual, o PostgREST recusa a consulta inteira com "more than one
  // relationship was found", e como esta função roda em TODA página do painel,
  // o painel inteiro sai do ar. Foi o que aconteceu por cinco dias: nenhum
  // teste fala PostgREST, então nem o typecheck, nem o vitest, nem o harness de
  // RLS — que usa SQL puro — encostaram nisso.
  const busca = await supabase
    .from("pessoas")
    .select("id, nome, email, papeis!papeis_pessoa_id_fkey(tipo, unidade_id)")
    .eq("auth_user_id", user.id)
    .eq("papeis.ativo", true)
    .maybeSingle();
  if (busca.error) {
    throw new Error(`Não foi possível ler a pessoa da sessão: ${busca.error.message}`);
  }
  const pessoa = busca.data as
    | { id: string; nome: string; email: string | null; papeis: { tipo: string; unidade_id: string | null }[] }
    | null;
  if (!pessoa) return null;

  const papeis: Papel[] = (pessoa.papeis ?? []).map((p) => ({
    tipo: p.tipo as TipoPapel,
    unidadeId: p.unidade_id ?? null,
  }));

  const tipos = papeis.map((p) => p.tipo);
  const principal = papelPrincipal(tipos);

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
