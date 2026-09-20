import { notFound } from "next/navigation";
import { IconCamera, IconUsersGroup } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import CamposCielo from "@/componentes/CamposCielo";
import {
  Abas, Botao, BotaoLink, Num, Recado, TituloPagina, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina, pessoaAtual } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigir } from "@/lib/supabase/consulta";
import { contasCieloVisiveis } from "@/lib/credenciais";
import { formatarCnpj } from "@/lib/dominio/cnpj";
import type { OrganizacaoRow, TipoUnidadeRow, UnidadeRow } from "@/lib/supabase/tipos";
import CamposUnidade from "../CamposUnidade";
import { editarUnidade, salvarPagamentoUnidade } from "../actions";

/**
 * A unidade deixou de caber num modal (decisão 0019).
 *
 * São quatro assuntos que não se parecem: o cadastro, as fotos que vão para o
 * site, por onde a entidade recebe dinheiro e quem compõe o CDOR. Empilhados
 * numa caixa que rola, quem vinha trocar o telefone passava por tudo.
 *
 * ⚠️ Uma página para os TRÊS degraus — Regional, Núcleo e Associação Local. A
 * lista já é um componente só (`ListaDeUnidades`) justamente para as três
 * telas não divergirem; uma página de edição por degrau desfaria isso na
 * primeira aba que alguém acrescentasse em uma só.
 *
 * ⚠️ Cada aba é um FORMULÁRIO próprio, e isso não é organização: é o que
 * impede o navegador de ler o cadastro como tela de login. Com a Merchant Key
 * (um `type="password"`) no mesmo formulário do e-mail, o gerenciador de
 * senhas oferecia o par e trocava os dois campos sem ninguém pedir.
 */

/** De qual lista esta unidade veio — é para lá que o "voltar" aponta. */
const LISTA: Record<string, { href: string; texto: string }> = {
  regional: { href: "/admin/regionais", texto: "Regionais" },
  nucleo: { href: "/admin/nucleos", texto: "Núcleos" },
  associacao_local: { href: "/admin/associacoes", texto: "Associações Locais" },
};

export default async function UnidadePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; erro?: string; ok?: string }>;
}) {
  const eu = await exigirCapacidadeNaPagina("estrutura.gerir");

  const { id } = await params;
  const { aba = "dados", erro, ok } = await searchParams;

  const podeVerCielo = Boolean(eu?.pode("configuracao.gerir"));
  const supabase = await criarClienteServidor();

  // ⚠️ As cinco JUNTAS. Nenhuma depende do resultado das outras — em série,
  // cada uma somaria sua ida ao banco no tempo de tela em branco. A linha que
  // lê a unidade é o portão de RLS: quem não alcança esta unidade não passa.
  const [rUnidade, rTipos, rOrganizacoes, rTodas, contas] = await Promise.all([
    supabase.from("unidades").select("*").eq("id", id).maybeSingle(),
    supabase.from("tipos_unidade").select("*").eq("ativo", true).order("ordem"),
    supabase.from("organizacoes").select("*").eq("ativo", true).order("ordem"),
    supabase.from("unidades").select("id, nome, tipo").order("nome"),
    contasCieloVisiveis(podeVerCielo),
  ]);

  if (!rUnidade.data) notFound();
  const unidade = rUnidade.data as UnidadeRow;
  const tipos = (exigir(rTipos, "os tipos de unidade") ?? []) as TipoUnidadeRow[];
  const organizacoes = (exigir(rOrganizacoes, "as organizações") ?? []) as OrganizacaoRow[];
  const todas = (exigir(rTodas, "as unidades") ?? []) as Pick<UnidadeRow, "id" | "nome" | "tipo">[];

  const tipo = tipos.find((t) => t.codigo === unidade.tipo);
  const permitidos = tipo?.pais_permitidos ?? [];
  const superiores = todas.filter((u) => permitidos.includes(u.tipo));

  const mostraPagamento = podeVerCielo && Boolean(tipo?.aceita_conta_cielo);
  const base = `/admin/estrutura/${id}`;
  const voltar = LISTA[unidade.tipo] ?? { href: "/admin/estrutura", texto: "Árvore da instituição" };

  return (
    <Painel titulo={unidade.nome}>
      <TituloPagina
        titulo={unidade.nome}
        descricao={
          <>
            {tipo?.nome ?? unidade.tipo}
            {unidade.codigo && (
              <>
                {" · "}Código <Num>{unidade.codigo}</Num>
              </>
            )}
            {unidade.cnpj && (
              <>
                {" · "}CNPJ <Num>{formatarCnpj(unidade.cnpj)}</Num>
              </>
            )}
            {!unidade.ativo && " · Desativada"}
          </>
        }
        voltar={voltar}
      />

      <Recado erro={erro} ok={ok} />

      <Abas
        atual={aba}
        abas={[
          { chave: "dados", rotulo: "Dados cadastrais", href: base },
          { chave: "fotos", rotulo: "Fotos", href: `${base}?aba=fotos` },
          ...(mostraPagamento
            ? [{ chave: "pagamento", rotulo: "Pagamento", href: `${base}?aba=pagamento` }]
            : []),
          { chave: "cdor", rotulo: "CDOR", href: `${base}?aba=cdor` },
        ]}
      />

      {aba === "fotos" && (
        <Vazio icone={<IconCamera size={28} className="ti" />} titulo="As fotos vêm na próxima etapa">
          Aqui vão entrar as fotos desta unidade que o site publica — fachada,
          salão, atividades. Falta combinar quantas, em que proporção e quais
          delas o site usa em cada lugar, para a tela não virar um depósito de
          imagem que ninguém sabe onde aparece.
        </Vazio>
      )}

      {aba === "cdor" && (
        <Vazio icone={<IconUsersGroup size={28} className="ti" />} titulo="O CDOR vem na próxima etapa">
          Os membros do Conselho serão pessoas do próprio sistema, com mandato
          — e mandato já tem tabela e regra (decisão 0016). Esta aba vai
          mostrá-los e permitir compor o Conselho desta unidade.
        </Vazio>
      )}

      {aba === "pagamento" && mostraPagamento && (
        // ⚠️ Formulário PRÓPRIO, e não um pedaço do cadastro. É o que mantém a
        // Merchant Key longe do campo de e-mail — e o que faz salvar o
        // telefone não passar perto de por onde a entidade recebe.
        <form action={salvarPagamentoUnidade} className="sni-form">
          <input type="hidden" name="id" value={id} />
          <CamposCielo
            merchantId={contas.get(id)?.merchant_id}
            nomeLoja={contas.get(id)?.nome_loja}
            temChave={contas.get(id)?.temSegredo}
          />
          <p className="hint">
            As contas bancárias da unidade entram aqui na próxima etapa, ao lado
            da conta Cielo: é o mesmo assunto — por onde o dinheiro entra.
          </p>
          <div className="sni-form-rodape">
            <BotaoLink href={voltar.href} variante="secondary">
              Cancelar
            </BotaoLink>
            <Botao type="submit">Salvar</Botao>
          </div>
        </form>
      )}

      {aba === "dados" && (
        <form action={editarUnidade} className="sni-form">
          <CamposUnidade
            tipos={tipos}
            unidades={superiores}
            organizacoes={organizacoes}
            unidade={unidade}
          />
          <div className="sni-form-rodape">
            <BotaoLink href={voltar.href} variante="secondary">
              Cancelar
            </BotaoLink>
            <Botao type="submit">Salvar</Botao>
          </div>
        </form>
      )}
    </Painel>
  );
}
