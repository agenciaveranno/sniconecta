import "server-only";
import { conexao, type Executor } from "@/lib/db";
import { prepararBusca } from "@/lib/dominio/busca-pessoa";
import { combosVendidos, type ComboParaVenda } from "@/lib/dominio/combo";

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

// ─── Tipos de ingresso ───────────────────────────────────────────────────────

/**
 * ⚠️ FUSO NOMEADO, e não deslocamento escrito à mão.
 *
 * `venda_inicio` e `venda_fim` são `timestamptz`, e a conexão não fixa fuso —
 * o padrão do Supabase é UTC. Um `datetime-local` chega como "2026-09-20T10:00",
 * sem fuso: gravado cru, o Postgres o leria como 10h UTC, e a venda que a Sede
 * marcou para as 10h abriria às 7h da manhã em Brasília, sem erro nenhum
 * aparecer.
 *
 * `at time zone 'America/Sao_Paulo'` nomeia a zona em vez de fixar `-03:00`:
 * o Brasil não tem horário de verão desde 2019, mas se voltar a ter, quem
 * acerta é o banco, e não uma constante nossa que ninguém lembraria de mudar.
 */
const FUSO = "America/Sao_Paulo";

export type TipoDeIngresso = {
  id: number;
  nome: string;
  descricao: string | null;
  valor_centavos: number;
  max_parcelas: number;
  /** Nulo = sem limite. Zero é limite de verdade: esgotado. */
  quantidade: number | null;
  /** "AAAA-MM-DDTHH:MM" no fuso de Brasília, pronto para `datetime-local`. */
  venda_inicio: string | null;
  venda_fim: string | null;
  idade_min: number | null;
  idade_max: number | null;
  unico_por_cpf: boolean;
  papel: "principal" | "adicional";
  exige_principal: boolean;
  exibir_venda_publica: boolean;
  ativo: boolean;
  /** Quantas inscrições já apontam para este tipo — o que impede apagar. */
  vendidos: number;
};

export async function tiposDeIngresso(eventoId: number): Promise<TipoDeIngresso[]> {
  const sql = conexao();
  return sql<TipoDeIngresso[]>`
    select
      t.id, t.nome, t.descricao, t.valor_centavos, t.max_parcelas, t.quantidade,
      to_char(t.venda_inicio at time zone ${FUSO}, 'YYYY-MM-DD"T"HH24:MI') as venda_inicio,
      to_char(t.venda_fim    at time zone ${FUSO}, 'YYYY-MM-DD"T"HH24:MI') as venda_fim,
      t.idade_min, t.idade_max, t.unico_por_cpf, t.papel, t.exige_principal,
      t.exibir_venda_publica, t.ativo,
      count(i.id) filter (where i.status <> 'cancelado')::int as vendidos
    from eventos.ingresso_tipos t
    left join eventos.inscricoes i on i.ingresso_tipo_id = t.id
    where t.evento_id = ${eventoId}
    group by t.id
    order by t.papel desc, t.nome
  `;
}

export type EventoDaPagina = {
  id: number;
  nome: string;
  data_inicial: string;
  data_final: string;
  local_id: string | null;
  ativo: boolean;
  promotor: string;
  /** Sem promotor o evento não vende — a página precisa dizer isso. */
  promotor_nome: string | null;
};

/** Um evento só, para a página dele. `null` quando o id não existe. */
export async function eventoDaPagina(id: number): Promise<EventoDaPagina | null> {
  const sql = conexao();
  const [linha] = await sql<EventoDaPagina[]>`
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
      ) as promotor,
      coalesce(o.nome, u.nome, pl.nome) as promotor_nome
    from eventos.eventos e
    left join public.organizacoes o  on o.id  = e.promotor_organizacao_id
    left join public.unidades     u  on u.id  = e.promotor_unidade_id
    left join public.locais       pl on pl.id = e.promotor_local_id
    where e.id = ${id}
  `;
  return linha ?? null;
}

// ─── Venda balcão ────────────────────────────────────────────────────────────

/**
 * Os tipos de ingresso de um evento, com o que AINDA CABE em cada um.
 *
 * ⚠️ `disponivel` é `quantidade - vendidos`, e continua `null` quando não há
 * limite. Devolver zero para "sem limite" faria todo ingresso ilimitado
 * aparecer esgotado no balcão.
 *
 * ⚠️ Cancelada devolve a vaga. Contar toda linha faria um evento com muitos
 * cancelamentos recusar venda com o salão vazio.
 */
export async function tiposParaVenda(eventoId: number): Promise<TipoParaVendaDoBanco[]> {
  return lerTiposParaVenda(conexao(), eventoId);
}

/**
 * Os mesmos tipos, lidos por quem já está dentro da transação da venda — com
 * as linhas do estoque travadas por um `for update` feito antes.
 *
 * ⚠️ Uma consulta só, e não uma cópia aqui e outra lá. A cópia que existia
 * dentro de `venderNoBalcao` era literalmente este SQL colado: qualquer
 * correção de disponibilidade feita num lado passaria a valer na tela e não na
 * gravação, e o balcão ofereceria o que ele mesmo recusa ao confirmar.
 */
export async function lerTiposParaVenda(
  sql: Executor,
  eventoId: number
): Promise<TipoParaVendaDoBanco[]> {
  return sql<TipoParaVendaDoBanco[]>`
    select
      t.id, t.nome, t.papel, t.ativo, t.valor_centavos,
      t.unico_por_cpf, t.exige_principal,
      case when t.quantidade is null then null
           else greatest(t.quantidade - count(i.id) filter (where i.status <> 'cancelado'), 0)::int
      end as disponivel
    from eventos.ingresso_tipos t
    left join eventos.inscricoes i on i.ingresso_tipo_id = t.id
    where t.evento_id = ${eventoId}
    group by t.id
    order by t.papel desc, t.nome
  `;
}

export type TipoParaVendaDoBanco = {
  id: number;
  nome: string;
  papel: "principal" | "adicional";
  ativo: boolean;
  valor_centavos: number;
  unico_por_cpf: boolean;
  exige_principal: boolean;
  disponivel: number | null;
};

/**
 * Os tipos que ESTA pessoa já tem neste evento, em inscrição viva.
 *
 * ⚠️ É o que faz `unico_por_cpf` valer ENTRE compras. Sem isto, a pessoa leva
 * o jantar hoje e outro amanhã: cada compra passa sozinha, e o salão recebe
 * duas reservas para a mesma cadeira.
 */
export async function tiposQueAPessoaJaTem(
  eventoId: number,
  pessoaId: string
): Promise<number[]> {
  const sql = conexao();
  const linhas = await sql<{ ingresso_tipo_id: number }[]>`
    select distinct ingresso_tipo_id
      from eventos.inscricoes
     where evento_id = ${eventoId}
       and pessoa_id = ${pessoaId}
       and ingresso_tipo_id is not null
       and status in ('pendente', 'pago')
  `;
  return linhas.map((l) => l.ingresso_tipo_id);
}

export type PessoaDoBalcao = {
  id: string;
  nome: string;
  cpf: string | null;
  passaporte: string | null;
  email: string | null;
};

/**
 * Quem está no balcão, procurado por documento ou nome.
 *
 * ⚠️ Documento vai por igualdade e nome por `ilike`: quem chega com o CPF na
 * mão quer UMA pessoa, e uma busca solta por documento traria homônimos de
 * número — que não existem. O CPF é normalizado para só dígitos porque a
 * coluna guarda assim, e quem digita põe ponto e traço.
 */
export async function procurarPessoaNoBalcao(termo: string): Promise<PessoaDoBalcao[]> {
  const sql = conexao();
  const busca = prepararBusca(termo);
  if (!busca) return [];
  return sql<PessoaDoBalcao[]>`
    select id, nome, cpf, passaporte, email
      from public.pessoas
     where (${busca.digitos} <> '' and cpf = ${busca.digitos})
        or passaporte = ${busca.documento}
        or nome ilike ${busca.comoNome} escape '\\' 
     order by nome
     limit 20
  `;
}

/** Uma pessoa só, já escolhida no balcão. */
export async function pessoaDoBalcao(id: string): Promise<PessoaDoBalcao | null> {
  const sql = conexao();
  const [linha] = await sql<PessoaDoBalcao[]>`
    select id, nome, cpf, passaporte, email from public.pessoas where id = ${id}
  `;
  return linha ?? null;
}

/** Os eventos que o balcão pode abrir hoje: ativos, do mais próximo em diante. */
export async function eventosParaVenda(): Promise<
  { id: number; nome: string; data_inicial: string; tem_promotor: boolean }[]
> {
  const sql = conexao();
  return sql<{ id: number; nome: string; data_inicial: string; tem_promotor: boolean }[]>`
    select
      e.id, e.nome, e.data_inicial,
      (e.promotor_organizacao_id is not null
        or e.promotor_unidade_id is not null
        or e.promotor_local_id is not null) as tem_promotor
    from eventos.eventos e
    where e.ativo
    order by e.data_inicial desc
  `;
}

// ─── Check-in ────────────────────────────────────────────────────────────────

export type InscricaoNaPorta = {
  id: number;
  pessoa_id: string;
  pessoa_nome: string;
  documento: string | null;
  ingresso: string | null;
  status: "pendente" | "pago" | "cancelado" | "expirado" | "transferido";
  tipo_venda: string;
  /** ISO cru, para a regra de domínio decidir. */
  checkin_em: string | null;
  /** Já formatado no fuso de Brasília, para a tela não refazer a conta. */
  checkin_legivel: string | null;
  /** O código do ingresso, para a porta conferir com o papel na mão. */
  qr_code: string | null;
};

/**
 * As inscrições de um evento para quem está na porta, achadas por documento,
 * nome, CÓDIGO DO INGRESSO ou número do convite.
 *
 * ⚠️ Traz TODAS as situações, inclusive cancelada e pendente. Filtrar só as
 * pagas faria a porta dizer "não encontrei" para quem tem inscrição pendente —
 * e a pessoa iria embora achando que nunca se inscreveu, quando o certo é
 * mandá-la ao balcão pagar.
 *
 * ⚠️ O código entra na MESMA busca, e não num campo separado. O leitor de QR
 * do balcão é um teclado: ele digita o código no campo que estiver com o foco
 * e aperta enter. Um campo próprio para QR obrigaria o operador a clicar nele
 * antes de cada leitura — com a fila andando, é o clique que não acontece.
 *
 * ⚠️ E em CAIXA ALTA dos dois lados. O código que a carga trouxe do sistema
 * antigo vem em caixa qualquer, e quem digita à mão não distingue.
 */
export async function inscricoesNaPorta(
  eventoId: number,
  termo: string
): Promise<InscricaoNaPorta[]> {
  const sql = conexao();
  const busca = prepararBusca(termo);
  if (!busca) return [];
  return sql<InscricaoNaPorta[]>`
    select
      i.id,
      i.pessoa_id,
      p.nome as pessoa_nome,
      coalesce(p.cpf, p.passaporte) as documento,
      t.nome as ingresso,
      i.status,
      i.tipo_venda,
      i.checkin_em,
      to_char(i.checkin_em at time zone ${FUSO}, 'DD/MM/YYYY HH24:MI') as checkin_legivel,
      i.qr_code
    from eventos.inscricoes i
    join public.pessoas p on p.id = i.pessoa_id
    left join eventos.ingresso_tipos t on t.id = i.ingresso_tipo_id
    where i.evento_id = ${eventoId}
      and (
        (${busca.digitos} <> '' and p.cpf = ${busca.digitos})
        or p.passaporte = ${busca.documento}
        or p.nome ilike ${busca.comoNome} escape '\\' 
        or upper(i.qr_code) = ${busca.documento}
        or upper(i.numero_convite) = ${busca.documento}
      )
    order by p.nome, t.nome
    limit 50
  `;
}

/** Quantos já entraram, para a porta saber o tamanho do salão sem abrir relatório. */
export async function contagemDaPorta(
  eventoId: number
): Promise<{ entraram: number; esperados: number }> {
  const sql = conexao();
  const [linha] = await sql<{ entraram: number; esperados: number }[]>`
    select
      count(*) filter (where checkin_em is not null)::int as entraram,
      count(*) filter (where status = 'pago')::int        as esperados
    from eventos.inscricoes
    where evento_id = ${eventoId}
  `;
  return linha ?? { entraram: 0, esperados: 0 };
}

// ─── Relatórios ──────────────────────────────────────────────────────────────

/**
 * ⚠️ ARRECADAÇÃO É `valor_original - desconto`, e não `valor_original`.
 *
 * Hoje todo desconto é zero: a venda balcão não aplica cupom, e a carga trouxe
 * zero. Somar só o valor original daria o mesmo número AGORA e passaria a
 * mentir no dia em que o primeiro cupom for usado — sem ninguém perceber,
 * porque o número continua saindo. O esquema separa as duas colunas
 * justamente porque elas vão divergir.
 *
 * ⚠️ E cortesia NÃO arrecada, qualquer que seja o valor de tabela do ingresso.
 * A carga trouxe cortesias do sistema antigo com valor preenchido; contá-las
 * faria a Sede ver dinheiro que nunca entrou no caixa.
 */
// Escrita por extenso em cada consulta, e não montada como fragmento cru de
// SQL: um pedaço de comando solto numa consulta de DINHEIRO é o lugar onde
// alguém interpola entrada de usuário um dia. Quem impede a divergência entre
// as três cópias é o teste `arrecadacao-desconta`, que reprova soma sem o
// desconto e soma que conte cortesia.

export type ResumoDoEvento = {
  pagos: number;
  pendentes: number;
  cancelados: number;
  cortesias: number;
  entraram: number;
  arrecadado_centavos: number;
};

export async function resumoDoEvento(eventoId: number): Promise<ResumoDoEvento> {
  const sql = conexao();
  const [linha] = await sql<ResumoDoEvento[]>`
    select
      count(*) filter (where i.status = 'pago')                    ::int as pagos,
      count(*) filter (where i.status = 'pendente')                ::int as pendentes,
      count(*) filter (where i.status = 'cancelado')               ::int as cancelados,
      count(*) filter (where i.tipo_venda = 'cortesia'
                         and i.status <> 'cancelado')              ::int as cortesias,
      count(*) filter (where i.checkin_em is not null)             ::int as entraram,
      sum(
        case when i.status = 'pago' and i.tipo_venda <> 'cortesia'
             then i.valor_original_centavos - i.desconto_centavos else 0 end
      )::int as arrecadado_centavos
    from eventos.inscricoes i
    where i.evento_id = ${eventoId}
  `;
  return (
    linha ?? {
      pagos: 0, pendentes: 0, cancelados: 0, cortesias: 0,
      entraram: 0, arrecadado_centavos: 0,
    }
  );
}

export type LinhaPorTipo = {
  nome: string;
  pagos: number;
  pendentes: number;
  entraram: number;
  arrecadado_centavos: number;
};

/**
 * ⚠️ `right join` no tipo: um ingresso que não vendeu NENHUM precisa aparecer
 * com zero. Some da lista, ele vira "não existe" para quem lê — e a pergunta
 * que o relatório tem de responder é justamente qual ingresso não está saindo.
 */
export async function porTipoDeIngresso(eventoId: number): Promise<LinhaPorTipo[]> {
  const sql = conexao();
  return sql<LinhaPorTipo[]>`
    select
      t.nome,
      count(i.id) filter (where i.status = 'pago')        ::int as pagos,
      count(i.id) filter (where i.status = 'pendente')    ::int as pendentes,
      count(i.id) filter (where i.checkin_em is not null) ::int as entraram,
      sum(
        case when i.status = 'pago' and i.tipo_venda <> 'cortesia'
             then i.valor_original_centavos - i.desconto_centavos else 0 end
      )::int as arrecadado_centavos
    from eventos.ingresso_tipos t
    left join eventos.inscricoes i on i.ingresso_tipo_id = t.id
    where t.evento_id = ${eventoId}
    group by t.id, t.nome
    order by t.papel desc, t.nome
  `;
}

export type LinhaPorPagamento = {
  forma: string | null;
  tipo_venda: string;
  quantas: number;
  arrecadado_centavos: number;
};

/**
 * Como o dinheiro entrou. Só o que está PAGO — pendente não entrou em caixa
 * nenhum, e listá-lo aqui faria a soma das formas não bater com o arrecadado.
 */
export async function porFormaDePagamento(eventoId: number): Promise<LinhaPorPagamento[]> {
  const sql = conexao();
  return sql<LinhaPorPagamento[]>`
    select
      i.forma_pagamento as forma,
      i.tipo_venda,
      count(*)::int as quantas,
      sum(
        case when i.status = 'pago' and i.tipo_venda <> 'cortesia'
             then i.valor_original_centavos - i.desconto_centavos else 0 end
      )::int as arrecadado_centavos
    from eventos.inscricoes i
    where i.evento_id = ${eventoId} and i.status = 'pago'
    group by i.forma_pagamento, i.tipo_venda
    order by count(*) desc
  `;
}

// ─── Estornos ────────────────────────────────────────────────────────────────

export type EstornoNaFila = {
  id: number;
  evento_id: number;
  evento: string;
  pessoa_nome: string;
  documento: string | null;
  ingresso: string | null;
  tipo_venda: string;
  valor_original_centavos: number;
  desconto_centavos: number;
  status: "pendente" | "pago" | "cancelado" | "expirado" | "transferido";
  estorno_status: "pendente" | "feito" | "recusado" | null;
  cancelamento_motivo: string | null;
  cancelado_legivel: string | null;
  /** O que já foi registrado sobre a devolução, no formato que a carga trouxe. */
  estorno: {
    valor_centavos?: number | null;
    forma?: string | null;
    efetuado_em?: string | null;
    efetuado_por?: string | null;
    comprovante?: string | null;
    observacao?: string | null;
  } | null;
};

/**
 * A fila da tesouraria: cancelamentos que devem dinheiro a alguém.
 *
 * ⚠️ Só `estorno_status = 'pendente'`. Feito e recusado saem da fila — uma
 * fila que guarda o que já foi resolvido deixa de ser fila e vira histórico,
 * e quem abre para trabalhar não sabe onde parou.
 */
export async function estornosPendentes(): Promise<EstornoNaFila[]> {
  const sql = conexao();
  return sql<EstornoNaFila[]>`
    select
      i.id, i.evento_id, e.nome as evento,
      p.nome as pessoa_nome, coalesce(p.cpf, p.passaporte) as documento,
      t.nome as ingresso, i.tipo_venda,
      i.valor_original_centavos, i.desconto_centavos,
      i.status, i.estorno_status, i.cancelamento_motivo,
      to_char(i.cancelado_em at time zone ${FUSO}, 'DD/MM/YYYY HH24:MI') as cancelado_legivel,
      i.estorno
    from eventos.inscricoes i
    join eventos.eventos e on e.id = i.evento_id
    join public.pessoas p on p.id = i.pessoa_id
    left join eventos.ingresso_tipos t on t.id = i.ingresso_tipo_id
    where i.estorno_status = 'pendente'
    order by i.cancelado_em nulls last, i.id
  `;
}

export type InscricaoParaCancelarNoBanco = {
  id: number;
  evento_id: number;
  evento: string;
  pessoa_nome: string;
  documento: string | null;
  ingresso: string | null;
  status: "pendente" | "pago" | "cancelado" | "expirado" | "transferido";
  tipo_venda: string;
  valor_original_centavos: number;
  desconto_centavos: number;
  checkin_em: string | null;
  estorno_status: "pendente" | "feito" | "recusado" | null;
};

/**
 * As inscrições de uma pessoa, em todos os eventos, para quem vai cancelar.
 *
 * ⚠️ Todos os eventos, e não um só: quem pede cancelamento no balcão diz o
 * nome, não o evento. Obrigar a escolher o evento antes faria o operador
 * adivinhar em qual deles a pessoa se inscreveu.
 */
export async function inscricoesParaCancelar(termo: string): Promise<InscricaoParaCancelarNoBanco[]> {
  const sql = conexao();
  const busca = prepararBusca(termo);
  if (!busca) return [];
  return sql<InscricaoParaCancelarNoBanco[]>`
    select
      i.id, i.evento_id, e.nome as evento,
      p.nome as pessoa_nome, coalesce(p.cpf, p.passaporte) as documento,
      t.nome as ingresso, i.status, i.tipo_venda,
      i.valor_original_centavos, i.desconto_centavos, i.checkin_em, i.estorno_status
    from eventos.inscricoes i
    join eventos.eventos e on e.id = i.evento_id
    join public.pessoas p on p.id = i.pessoa_id
    left join eventos.ingresso_tipos t on t.id = i.ingresso_tipo_id
    where (${busca.digitos} <> '' and p.cpf = ${busca.digitos})
       or p.passaporte = ${busca.documento}
       or p.nome ilike ${busca.comoNome} escape '\\' 
    order by e.data_inicial desc, p.nome, t.nome
    limit 50
  `;
}

// ─── Cupons ──────────────────────────────────────────────────────────────────

export type CupomDoEvento = {
  id: number;
  codigo: string;
  descricao: string | null;
  tipo: "percentual" | "valor";
  valor: number;
  ingresso_tipo_id: number | null;
  ingresso_tipo_nome: string | null;
  max_usos_total: number | null;
  max_usos_por_cpf: number | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  ativo: boolean;
  /** Quantas inscrições vivas já usaram. É o que "esgotou" mede. */
  usos: number;
};

/**
 * ⚠️ `vigencia_inicio` e `vigencia_fim` voltam no fuso de Brasília, prontas
 * para `datetime-local` — mesma razão da janela de venda do ingresso: gravadas
 * cruas, seriam lidas como UTC e o cupom passaria a valer três horas antes do
 * que a Sede combinou.
 *
 * ⚠️ `usos` conta inscrição NÃO cancelada. Contar tudo faria um cupom de cem
 * usos esgotar com noventa cancelamentos, e ninguém entenderia por quê.
 */
export async function cuponsDoEvento(eventoId: number): Promise<CupomDoEvento[]> {
  const sql = conexao();
  return sql<CupomDoEvento[]>`
    select
      c.id, c.codigo, c.descricao, c.tipo, c.valor,
      c.ingresso_tipo_id, t.nome as ingresso_tipo_nome,
      c.max_usos_total, c.max_usos_por_cpf,
      to_char(c.vigencia_inicio at time zone ${FUSO}, 'YYYY-MM-DD"T"HH24:MI') as vigencia_inicio,
      to_char(c.vigencia_fim    at time zone ${FUSO}, 'YYYY-MM-DD"T"HH24:MI') as vigencia_fim,
      c.ativo,
      count(i.id) filter (where i.status <> 'cancelado')::int as usos
    from eventos.cupons c
    left join eventos.ingresso_tipos t on t.id = c.ingresso_tipo_id
    left join eventos.inscricoes i on i.cupom_id = c.id
    where c.evento_id = ${eventoId}
    group by c.id, t.nome
    order by c.ativo desc, c.codigo
  `;
}

/** Os tipos de ingresso a que um cupom pode ser preso, para o seletor. */
export async function tiposParaCupom(
  eventoId: number
): Promise<{ id: number; nome: string }[]> {
  const sql = conexao();
  return sql<{ id: number; nome: string }[]>`
    select id, nome from eventos.ingresso_tipos
     where evento_id = ${eventoId} order by papel desc, nome
  `;
}

// ─── Ficha do participante ───────────────────────────────────────────────────

export type InscricaoNaFicha = {
  id: number;
  evento_id: number;
  evento: string;
  data_inicial: string;
  ingresso: string | null;
  status: "pendente" | "pago" | "cancelado" | "expirado" | "transferido";
  tipo_venda: string;
  forma_pagamento: string | null;
  valor_original_centavos: number;
  desconto_centavos: number;
  cupom: string | null;
  comprou_legivel: string | null;
  checkin_legivel: string | null;
  estorno_status: "pendente" | "feito" | "recusado" | null;
  cancelamento_motivo: string | null;
  /** Quem era titular antes, quando houve troca — o histórico não some. */
  titular_anterior: string | null;
  titular_troca_motivo: string | null;
  /** Para a regra de troca: o tipo é um por pessoa? */
  unico_por_cpf: boolean | null;
  checkin_em: string | null;
};

/**
 * Tudo o que uma pessoa tem, em TODOS os eventos.
 *
 * ⚠️ Todos, e não um por vez: a pergunta que chega no balcão é "o que essa
 * pessoa comprou?", sem dizer o evento. É esta a tela que responde — e por
 * isso ela traz também cancelada e expirada, que é justamente o que explica
 * por que a pessoa acha que tem inscrição e o sistema diz que não.
 */
export async function inscricoesDaPessoa(pessoaId: string): Promise<InscricaoNaFicha[]> {
  const sql = conexao();
  return sql<InscricaoNaFicha[]>`
    select
      i.id, i.evento_id, e.nome as evento, e.data_inicial,
      t.nome as ingresso, i.status, i.tipo_venda, i.forma_pagamento,
      i.valor_original_centavos, i.desconto_centavos,
      c.codigo as cupom,
      to_char(i.data_compra at time zone ${FUSO}, 'DD/MM/YYYY HH24:MI') as comprou_legivel,
      to_char(i.checkin_em  at time zone ${FUSO}, 'DD/MM/YYYY HH24:MI') as checkin_legivel,
      i.estorno_status, i.cancelamento_motivo,
      ant.nome as titular_anterior, i.titular_troca_motivo,
      t.unico_por_cpf, i.checkin_em
    from eventos.inscricoes i
    join eventos.eventos e on e.id = i.evento_id
    left join eventos.ingresso_tipos t on t.id = i.ingresso_tipo_id
    left join eventos.cupons c on c.id = i.cupom_id
    left join public.pessoas ant on ant.id = i.titular_anterior_id
    where i.pessoa_id = ${pessoaId}
    order by e.data_inicial desc, i.id
  `;
}

export type InscricaoParaTransferirNoBanco = {
  id: number;
  pessoa_id: string;
  pessoa_nome: string;
  documento: string | null;
  evento_id: number;
  evento: string;
  ingresso: string | null;
  ingresso_tipo_id: number | null;
  status: "pendente" | "pago" | "cancelado" | "expirado" | "transferido";
  tipo_venda: string;
  forma_pagamento: string | null;
  valor_original_centavos: number;
  desconto_centavos: number;
  checkin_em: string | null;
  qr_code: string | null;
};

/**
 * Uma inscrição só, com tudo que a transferência precisa decidir.
 *
 * ⚠️ Lê o ingresso por `left join`: inscrição da carga pode estar sem tipo, e
 * um `join` fechado a faria sumir da tela — com a pessoa na frente do balcão
 * segurando um ingresso que o sistema diz não existir.
 */
export async function inscricaoParaTransferir(
  id: number
): Promise<InscricaoParaTransferirNoBanco | null> {
  const sql = conexao();
  const [linha] = await sql<InscricaoParaTransferirNoBanco[]>`
    select
      i.id, i.pessoa_id, p.nome as pessoa_nome,
      coalesce(p.cpf, p.passaporte) as documento,
      i.evento_id, e.nome as evento,
      t.nome as ingresso, i.ingresso_tipo_id,
      i.status, i.tipo_venda, i.forma_pagamento,
      i.valor_original_centavos, i.desconto_centavos,
      i.checkin_em, i.qr_code
    from eventos.inscricoes i
    join eventos.eventos e on e.id = i.evento_id
    join public.pessoas p on p.id = i.pessoa_id
    left join eventos.ingresso_tipos t on t.id = i.ingresso_tipo_id
    where i.id = ${id}
  `;
  return linha ?? null;
}

export type PessoaComInscricoes = PessoaDoBalcao & { inscricoes: number };

/**
 * Procura quem tem inscrição, com quantas cada um tem.
 *
 * ⚠️ A contagem vem junto de propósito: numa lista de homônimos, é ela que
 * distingue a Maria que veio a três eventos da Maria que nunca se inscreveu.
 * Sem ela, o operador abre uma por uma até achar.
 */
export async function procurarParticipante(termo: string): Promise<PessoaComInscricoes[]> {
  const sql = conexao();
  const busca = prepararBusca(termo);
  if (!busca) return [];
  return sql<PessoaComInscricoes[]>`
    select
      p.id, p.nome, p.cpf, p.passaporte, p.email,
      count(i.id)::int as inscricoes
    from public.pessoas p
    left join eventos.inscricoes i on i.pessoa_id = p.id
    where (${busca.digitos} <> '' and p.cpf = ${busca.digitos})
       or p.passaporte = ${busca.documento}
       or p.nome ilike ${busca.comoNome} escape '\\' 
    group by p.id
    order by count(i.id) desc, p.nome
    limit 30
  `;
}

// ─── Comissão ────────────────────────────────────────────────────────────────

export type MembroDaComissao = {
  id: number;
  nome: string;
  setor: string | null;
  funcao: string | null;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  documento: string | null;
  /** O setor gravado casa com algum do catálogo? */
  setor_conhecido: boolean;
  funcao_conhecida: boolean;
};

/**
 * Quem trabalha num evento.
 *
 * ⚠️ `setor` e `funcao` são TEXTO, não referência ao catálogo — o esquema os
 * deixou assim porque a origem gravava texto solto, e conciliar é trabalho de
 * tela. Esta consulta diz quais textos JÁ casam com o catálogo, para a tela
 * mostrar o que falta conciliar em vez de fingir que está tudo certo.
 */
export async function comissaoDoEvento(eventoId: number): Promise<MembroDaComissao[]> {
  const sql = conexao();
  return sql<MembroDaComissao[]>`
    select
      m.id, m.nome, m.setor, m.funcao, m.pessoa_id,
      p.nome as pessoa_nome,
      coalesce(p.cpf, p.passaporte) as documento,
      (m.setor is not null and exists (
        select 1 from eventos.comissao_setores_padrao s
         where lower(s.nome) = lower(m.setor) and s.ativo
      )) as setor_conhecido,
      (m.funcao is not null and exists (
        select 1 from eventos.comissao_funcoes_padrao f
         where lower(f.nome) = lower(m.funcao) and f.ativo
      )) as funcao_conhecida
    from eventos.comissao_membros m
    left join public.pessoas p on p.id = m.pessoa_id
    where m.evento_id = ${eventoId}
    order by m.setor nulls last, m.funcao nulls last, m.nome
  `;
}

export type CatalogoDaComissao = {
  setores: { id: number; nome: string }[];
  funcoes: { id: number; nome: string; setor: string | null }[];
};

/**
 * O catálogo institucional de setores e funções.
 *
 * ⚠️ É comum a TODOS os eventos — não se edita por dentro de um. Uma tela de
 * evento que deixasse renomear um setor mudaria o setor de todos os outros
 * sem avisar quem estava editando.
 */
export async function catalogoDaComissao(): Promise<CatalogoDaComissao> {
  const sql = conexao();
  const [setores, funcoes] = await Promise.all([
    sql<{ id: number; nome: string }[]>`
      select id, nome from eventos.comissao_setores_padrao
       where ativo order by ordem, nome
    `,
    sql<{ id: number; nome: string; setor: string | null }[]>`
      select f.id, f.nome, s.nome as setor
        from eventos.comissao_funcoes_padrao f
        left join eventos.comissao_setores_padrao s on s.id = f.setor_id
       where f.ativo order by f.ordem, f.nome
    `,
  ]);
  return { setores, funcoes };
}

// ─── Combos ──────────────────────────────────────────────────────────────────

export type ComboDoEvento = {
  id: number;
  nome: string;
  descricao: string | null;
  valor_centavos: number;
  quantidade: number | null;
  limite_por_cpf: number | null;
  max_parcelas: number;
  venda_inicio: string | null;
  venda_fim: string | null;
  ativo: boolean;
  /** Os ingressos que o combo entrega, com quantos de cada. */
  itens: { ingresso_tipo_id: number; nome: string; quantidade: number; valor_centavos: number }[];
  /** Soma dos itens pelo preço de tabela — para a tela mostrar o desconto real. */
  avulso_centavos: number;
  /** PACOTES vendidos, não linhas de inscrição. Ver `combosVendidos`. */
  vendidos: number;
};

/**
 * Os combos de um evento, com o que cada um entrega.
 *
 * ⚠️ Traz também quanto custaria AVULSO. Um combo sem essa comparação é um
 * preço solto: quem cadastra não vê se está dando desconto ou cobrando mais
 * caro que os ingressos separados — e já vi combo sair mais caro que a soma
 * por erro de digitação em centavos.
 */
export async function combosDoEvento(eventoId: number): Promise<ComboDoEvento[]> {
  const sql = conexao();
  const combos = await sql<
    (Omit<ComboDoEvento, "itens" | "avulso_centavos" | "vendidos"> & { linhas: number })[]
  >`
    select
      c.id, c.nome, c.descricao, c.valor_centavos, c.quantidade,
      c.limite_por_cpf, c.max_parcelas,
      to_char(c.venda_inicio at time zone ${FUSO}, 'YYYY-MM-DD"T"HH24:MI') as venda_inicio,
      to_char(c.venda_fim    at time zone ${FUSO}, 'YYYY-MM-DD"T"HH24:MI') as venda_fim,
      c.ativo,
      count(i.id) filter (where i.status <> 'cancelado')::int as linhas
    from eventos.combos c
    left join eventos.inscricoes i on i.combo_id = c.id
    where c.evento_id = ${eventoId}
    group by c.id
    order by c.ativo desc, c.nome
  `;
  if (combos.length === 0) return [];

  // ⚠️ UMA consulta para os itens de todos os combos, e não uma por combo:
  // são duas idas ao banco no total, não uma por linha da tabela.
  const itens = await sql<{
    combo_id: number; ingresso_tipo_id: number; nome: string;
    quantidade: number; valor_centavos: number;
  }[]>`
    select ci.combo_id, ci.ingresso_tipo_id, t.nome, ci.quantidade, t.valor_centavos
      from eventos.combo_itens ci
      join eventos.ingresso_tipos t on t.id = ci.ingresso_tipo_id
     where ci.combo_id = any(${combos.map((c) => c.id)})
     order by t.papel desc, t.nome
  `;

  return combos.map(({ linhas, ...c }) => {
    const meus = itens.filter((i) => i.combo_id === c.id);
    return {
      ...c,
      itens: meus.map(({ combo_id: _, ...resto }) => resto),
      avulso_centavos: meus.reduce((s, i) => s + i.valor_centavos * i.quantidade, 0),
      // ⚠️ O banco conta LINHAS de inscrição; a coluna da tela e o limite
      // `quantidade` falam de PACOTES. Um combo de três ingressos vendido duas
      // vezes deixa seis linhas: sem dividir pelo tamanho do pacote, a tela
      // diria "6 de 2" e o operador desativaria um combo que ainda tem lugar.
      vendidos: combosVendidos(
        linhas,
        meus.reduce((s, i) => s + i.quantidade, 0)
      ),
    };
  });
}

/**
 * Os combos que o balcão pode oferecer, já com quanto sobrou e quanto esta
 * pessoa já levou.
 *
 * ⚠️ NÃO filtra por `ativo`. O combo desativado entre a abertura da tela e o
 * "Registrar venda" precisa chegar à conferência para ser recusado POR ESTAR
 * DESATIVADO. Filtrado aqui, ele sumiria da lista e a recusa sairia como "não
 * pertence a este evento" — uma frase que manda o operador procurar o combo no
 * evento errado. Quem esconde o inativo é a tela.
 *
 * ⚠️ `venda_inicio` e `venda_fim` saem CRUS, e não formatados no fuso como na
 * tela de gestão: quem compara com o relógio é o servidor, e um texto local
 * sem fuso vira `Date` na hora de Greenwich — três horas de diferença, que é
 * exatamente o tamanho de uma janela de venda que abre de manhã.
 */
export async function combosParaVenda(
  eventoId: number,
  pessoaId: string
): Promise<ComboNoBalcao[]> {
  return lerCombosParaVenda(conexao(), eventoId, pessoaId);
}

/**
 * A mesma leitura, feita por quem já está dentro de uma transação.
 *
 * ⚠️ A venda precisa reler os combos com as linhas TRAVADAS, e a tela precisa
 * lê-los sem travar nada. É a MESMA consulta: escrita duas vezes, a correção
 * de uma deixaria a outra oferecendo o que não se pode vender. Foi assim que
 * `tiposParaVenda` acabou com uma cópia dentro de `venderNoBalcao`.
 */
export async function lerCombosParaVenda(
  sql: Executor,
  eventoId: number,
  pessoaId: string
): Promise<ComboNoBalcao[]> {
  const combos = await sql<LinhaDeComboNoBalcao[]>`
    select
      c.id, c.nome, c.descricao, c.ativo, c.valor_centavos, c.quantidade,
      c.limite_por_cpf, c.venda_inicio, c.venda_fim,
      count(i.id) filter (where i.status <> 'cancelado')::int as linhas,
      count(i.id) filter (
        where i.status <> 'cancelado' and i.pessoa_id = ${pessoaId}
      )::int as linhas_desta
    from eventos.combos c
    left join eventos.inscricoes i on i.combo_id = c.id
    where c.evento_id = ${eventoId}
    group by c.id
    order by c.ativo desc, c.nome
  `;
  if (combos.length === 0) return [];

  const itens = await sql<{
    combo_id: number; ingresso_tipo_id: number; nome: string;
    quantidade: number; valor_centavos: number;
  }[]>`
    select ci.combo_id, ci.ingresso_tipo_id, t.nome, ci.quantidade, t.valor_centavos
      from eventos.combo_itens ci
      join eventos.ingresso_tipos t on t.id = ci.ingresso_tipo_id
     where ci.combo_id = any(${combos.map((c) => c.id)})
     order by t.papel desc, t.nome
  `;

  return combos.map((c) => {
    const meus = itens.filter((i) => i.combo_id === c.id);
    const porUnidade = meus.reduce((s, i) => s + i.quantidade, 0);
    return {
      id: c.id,
      nome: c.nome,
      descricao: c.descricao,
      ativo: c.ativo,
      valorCentavos: c.valor_centavos,
      quantidade: c.quantidade,
      limitePorPessoa: c.limite_por_cpf,
      vendaInicio: c.venda_inicio,
      vendaFim: c.venda_fim,
      vendidos: combosVendidos(c.linhas, porUnidade),
      levadosPorEsta: combosVendidos(c.linhas_desta, porUnidade),
      itens: meus.map((i) => ({
        tipoId: i.ingresso_tipo_id,
        nome: i.nome,
        quantidade: i.quantidade,
        valorCentavos: i.valor_centavos,
      })),
      avulsoCentavos: meus.reduce((s, i) => s + i.valor_centavos * i.quantidade, 0),
    };
  });
}

type LinhaDeComboNoBalcao = {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  valor_centavos: number;
  quantidade: number | null;
  limite_por_cpf: number | null;
  venda_inicio: Date | null;
  venda_fim: Date | null;
  linhas: number;
  linhas_desta: number;
};

/**
 * O combo como o balcão o mostra: a regra pura mais o que a tela precisa ler.
 *
 * ⚠️ `Omit` e não interseção nos itens. Interseccionar deixaria `itens` como
 * `ItemDoCombo[] & (ItemDoCombo & { nome })[]`, e o compilador resolve a
 * leitura pelo primeiro ramo — `i.nome` deixaria de existir para quem lê,
 * embora o valor esteja lá.
 */
export type ComboNoBalcao = Omit<ComboParaVenda, "itens"> & {
  descricao: string | null;
  /** Quanto os mesmos ingressos custariam separados, uma unidade. */
  avulsoCentavos: number;
  itens: (ComboParaVenda["itens"][number] & { nome: string })[];
};

