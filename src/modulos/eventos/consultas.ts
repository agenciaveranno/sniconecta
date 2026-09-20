import "server-only";
import { conexao } from "@/lib/db";

/**
 * Leituras do módulo `eventos`.
 *
 * ⚠️ Fala Postgres DIRETO, pelo pooler (decisão 0003). As tabelas de
 * `eventos.*` têm RLS ligada e NENHUM GRANT para `anon` ou `authenticated`: o
 * navegador não alcança nenhuma delas, e esta conexão é a única porta. A
 * autorização acontece por CAPACIDADE, no servidor, antes de qualquer consulta
 * — quem chama daqui já passou por `exigirCapacidade`.
 *
 * ⚠️ E é por isso que cada função deste arquivo recebe o recorte já decidido
 * por quem chamou. Uma função que "descobre sozinha" o que a pessoa pode ver
 * duplicaria a regra de autorização longe de onde ela é conferida.
 */

export type EventoDoPainel = {
  id: number;
  nome: string;
  data_inicial: string;
  data_final: string;
  ativo: boolean;
  local: string | null;
  /** Nulo enquanto a carga não conciliar o promotor: sem ele o evento não vende. */
  promotor: string | null;
  pagos: number;
  pendentes: number;
  cortesias: number;
};

/**
 * Os eventos, do mais recente para o mais antigo, com a contagem de inscrições
 * por situação.
 *
 * ⚠️ UMA consulta com `count(...) filter`, e não uma por evento. Contar por
 * evento numa lista de trinta faria trinta idas ao banco — e o painel é a
 * primeira tela que alguém abre no dia da venda.
 *
 * ⚠️ O promotor é resolvido por `coalesce` das três colunas porque são três
 * tabelas diferentes: Organização, unidade e local. Uma coluna genérica com o
 * nome da tabela ao lado não teria chave estrangeira — e sem ela, apagar uma
 * Regional deixaria eventos apontando para o nada.
 */
export async function eventosDoPainel(limite = 50): Promise<EventoDoPainel[]> {
  const sql = conexao();
  const linhas = await sql<EventoDoPainel[]>`
    select
      e.id,
      e.nome,
      e.data_inicial,
      e.data_final,
      e.ativo,
      l.nome as local,
      coalesce(o.nome, u.nome, pl.nome) as promotor,
      count(i.id) filter (where i.status = 'pago')      ::int as pagos,
      count(i.id) filter (where i.status = 'pendente')  ::int as pendentes,
      count(i.id) filter (where i.tipo_venda = 'cortesia'
                            and i.status <> 'cancelado')::int as cortesias
    from eventos.eventos e
    left join public.locais       l  on l.id  = e.local_id
    left join public.organizacoes o  on o.id  = e.promotor_organizacao_id
    left join public.unidades     u  on u.id  = e.promotor_unidade_id
    left join public.locais       pl on pl.id = e.promotor_local_id
    left join eventos.inscricoes  i  on i.evento_id = e.id
    group by e.id, e.nome, e.data_inicial, e.data_final, e.ativo,
             l.nome, o.nome, u.nome, pl.nome
    order by e.data_inicial desc
    limit ${limite}
  `;
  return linhas;
}

/** Quantos eventos existem ao todo — para a tela dizer se o limite cortou algo. */
export async function totalDeEventos(): Promise<number> {
  const sql = conexao();
  const [linha] = await sql<{ total: number }[]>`
    select count(*)::int as total from eventos.eventos
  `;
  return linha?.total ?? 0;
}
