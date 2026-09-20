import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CargoRow, MandatoRow } from "@/lib/supabase/tipos";

/**
 * A composição de um colegiado numa unidade — quem ocupa cada cargo hoje e
 * quem já ocupou.
 *
 * ⚠️ Lido pelo cliente do USUÁRIO, com RLS. `colegiados`, `cargos` e
 * `mandatos` têm GRANT para `authenticated` de propósito: quem ocupa cargo não
 * é segredo — consta em ata, em crachá e no site. Quem é limitado é a leitura
 * da PESSOA, pelo RLS de `pessoas`, e é por isso que o nome pode vir vazio
 * para quem não alcança aquela pessoa. A ESCRITA continua restrita à Sede pela
 * policy do banco.
 */

export type Composicao = {
  cargos: CargoRow[];
  /** Mandatos sem data de fim: quem está em exercício. */
  abertos: MandatoRow[];
  encerrados: MandatoRow[];
  /** Nome de tela de cada pessoa com mandato, por `pessoas.id`. */
  nomes: Map<string, string>;
  nomeCargo: Map<string, string>;
};

/** Data do banco (AAAA-MM-DD) na forma que se lê no Brasil. */
export function dataBR(iso: string | null): string {
  if (!iso) return "—";
  // ⚠️ Partido à mão, e não `new Date(iso)`: a data do banco não tem hora, e o
  // construtor a interpreta como UTC meia-noite. Num fuso a oeste de Greenwich
  // — o nosso — isso volta um dia atrás, e toda posse do dia 1º aparecia como
  // dia 31 do mês anterior.
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

export async function composicaoDoColegiado(
  // O cliente vem de fora porque é o da PESSOA que está na tela: é ele que
  // carrega o RLS. Criá-lo aqui dentro perderia esse vínculo.
  supabase: SupabaseClient<never>,
  colegiado: string,
  unidadeId: string
): Promise<Composicao> {
  const [rCargos, rMandatos] = await Promise.all([
    supabase.from("cargos").select("*").eq("colegiado", colegiado).eq("ativo", true).order("ordem"),
    supabase.from("mandatos").select("*").eq("unidade_id", unidadeId).order("data_inicio", { ascending: false }),
  ]);

  const cargos = (rCargos.data ?? []) as CargoRow[];
  const codigos = new Set(cargos.map((c) => c.codigo));
  // Os mandatos da unidade são de VÁRIOS colegiados — Supervisão, CER,
  // Representação. Aqui só interessam os cargos deste.
  const mandatos = ((rMandatos.data ?? []) as MandatoRow[]).filter((m) => codigos.has(m.cargo));

  // ⚠️ Os nomes vêm numa consulta À PARTE, e não por embed do PostgREST.
  // `mandatos` aponta DUAS VEZES para `pessoas` — `pessoa_id` e `criado_por` —
  // e diante de duas relações o PostgREST recusa o embed em vez de escolher.
  // Foi exatamente esse embed que derrubou o painel inteiro por cinco dias.
  const ids = [...new Set(mandatos.map((m) => m.pessoa_id))];
  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase.from("pessoas").select("id, nome, nome_social").in("id", ids);
    for (const p of (data ?? []) as { id: string; nome: string; nome_social: string | null }[]) {
      nomes.set(p.id, p.nome_social || p.nome);
    }
  }

  return {
    cargos,
    abertos: mandatos.filter((m) => m.data_fim === null),
    encerrados: mandatos.filter((m) => m.data_fim !== null),
    nomes,
    nomeCargo: new Map(cargos.map((c) => [c.codigo, c.nome])),
  };
}
