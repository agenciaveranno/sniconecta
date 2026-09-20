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

/**
 * Quem pode PROMOVER um evento.
 *
 * ⚠️ Só entidade que recebe em conta própria. O banco aceitaria qualquer
 * Organização, unidade ou local, mas promotor é quem diz em que conta o
 * dinheiro cai: oferecer uma Associação Local que não tem conta seria oferecer
 * um evento que não vende. O catálogo já responde isso em `aceita_conta_cielo`,
 * e é dele que a lista sai — não de uma lista escrita aqui, que envelheceria
 * na primeira vez que a Sede mudasse o catálogo.
 */
export type OpcaoPromotor = { valor: string; nome: string; grupo: string };

export async function opcoesDePromotor(): Promise<OpcaoPromotor[]> {
  const sql = conexao();
  const linhas = await sql<OpcaoPromotor[]>`
    select 'organizacao:' || o.id as valor, o.nome, 'Departamentos' as grupo
      from public.organizacoes o
     where o.ativo
    union all
    select 'unidade:' || u.id, u.nome, 'Unidades'
      from public.unidades u
      join public.tipos_unidade tu on tu.codigo = u.tipo
     where u.ativo and tu.aceita_conta_cielo
    union all
    select 'local:' || l.id, l.nome, 'Locais'
      from public.locais l
      join public.tipos_local tl on tl.codigo = l.tipo
     where l.ativo and tl.aceita_conta_cielo
    order by grupo, nome
  `;
  return linhas;
}

export type EventoParaEdicao = {
  id: number;
  nome: string;
  data_inicial: string;
  data_final: string;
  local_id: string | null;
  ativo: boolean;
  /** No formato do seletor: "unidade:<uuid>". Vazio quando não há promotor. */
  promotor: string;
};

export async function eventosParaEdicao(): Promise<EventoParaEdicao[]> {
  const sql = conexao();
  return sql<EventoParaEdicao[]>`
    select
      e.id, e.nome, e.data_inicial, e.data_final, e.local_id, e.ativo,
      coalesce(
        case when e.promotor_organizacao_id is not null
             then 'organizacao:' || e.promotor_organizacao_id end,
        case when e.promotor_unidade_id is not null
             then 'unidade:' || e.promotor_unidade_id end,
        case when e.promotor_local_id is not null
             then 'local:' || e.promotor_local_id end,
        ''
      ) as promotor
    from eventos.eventos e
    order by e.data_inicial desc
  `;
}

/** Os locais onde um evento pode acontecer — todos, próprios ou de terceiro. */
export async function locaisAtivos(): Promise<{ id: string; nome: string }[]> {
  const sql = conexao();
  return sql<{ id: string; nome: string }[]>`
    select id, nome from public.locais where ativo order by nome
  `;
}
