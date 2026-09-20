import Painel from "@/componentes/Painel";
import { Botao, BotaoLink, Recado, TituloPagina } from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigir } from "@/lib/supabase/consulta";
import CamposPessoa from "../CamposPessoa";
import { criarPessoa } from "../actions";

/**
 * Nova pessoa — página, não modal (decisão 0015).
 *
 * O mesmo componente de campos da ficha: campo novo nasce nos dois lugares ou
 * em nenhum.
 */
export default async function NovaPessoaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const eu = await exigirCapacidadeNaPagina("pessoa.gerir");

  const { erro } = await searchParams;
  const supabase = await criarClienteServidor();
  const associacoes = exigir(
    await supabase
      .from("unidades")
      .select("id, nome")
      .eq("tipo", "associacao_local")
      .eq("ativo", true)
      .order("nome"),
    "as Associações Locais"
  );

  return (
    <Painel titulo="Nova pessoa">
      <TituloPagina
        titulo="Nova pessoa"
        descricao="O documento identifica; o resto se completa depois. Nada aqui é obrigatório além do nome e do documento."
        voltar={{ href: "/admin/pessoas", texto: "Pessoas" }}
      />

      <Recado erro={erro} />

      <form action={criarPessoa} className="sni-form">
        <CamposPessoa unidades={associacoes ?? []} />
        <div className="sni-form-rodape">
          <BotaoLink href="/admin/pessoas" variante="secondary">
            Cancelar
          </BotaoLink>
          <Botao type="submit">Cadastrar</Botao>
        </div>
      </form>
    </Painel>
  );
}
