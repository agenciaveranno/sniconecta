import { IconAlertCircle, IconCheck, IconPlus, IconSitemap } from "@tabler/icons-react";
import Link from "next/link";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import {
  Alerta, Badge, Celula, Etiqueta, Linha, Num, Tabela, TituloPagina, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina, pessoaAtual } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigir } from "@/lib/supabase/consulta";
import { formatarCnpj } from "@/lib/dominio/cnpj";
import type { OrganizacaoRow, TipoUnidadeRow, UnidadeRow } from "@/lib/supabase/tipos";
import CamposUnidade from "./CamposUnidade";
import { criarUnidade, editarUnidade } from "./actions";

/**
 * Uma lista por degrau da instituição — Regionais, Núcleos, Associações Locais.
 *
 * ⚠️ Três ROTAS, um componente. A Sede pediu três itens de menu separados, e
 * três páginas escritas à parte divergiriam na primeira coluna que alguém
 * acrescentasse em uma só. A árvore inteira continua em `/admin/estrutura`,
 * ligada daqui: ela responde "onde isto fica", que a lista não responde.
 */
export default async function ListaDeUnidades({
  tipo,
  titulo,
  descricao,
  searchParams,
}: {
  tipo: "regional" | "nucleo" | "associacao_local";
  titulo: string;
  descricao: string;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  await exigirCapacidadeNaPagina("estrutura.gerir");
  const eu = await pessoaAtual();
  const { erro, ok } = await searchParams;

  const supabase = await criarClienteServidor();

  // ⚠️ As três JUNTAS, e não uma esperando a outra. Nenhuma depende do
  // resultado das outras, e em série cada uma soma sua ida e volta ao banco no
  // tempo de tela em branco.
  const [rUnidades, rTipos, rOrganizacoes] = await Promise.all([
    supabase.from("unidades").select("*").eq("tipo", tipo).order("nome"),
    supabase.from("tipos_unidade").select("*").eq("ativo", true).order("ordem"),
    supabase.from("organizacoes").select("*").eq("ativo", true).order("ordem"),
  ]);

  const unidades = (exigir(rUnidades, `as unidades do tipo ${tipo}`) ?? []) as UnidadeRow[];
  const tipos = (exigir(rTipos, "os tipos de unidade") ?? []) as TipoUnidadeRow[];
  const organizacoes = (exigir(rOrganizacoes, "as organizações") ?? []) as OrganizacaoRow[];

  // Só os degraus que PODEM receber este tipo entram na lista de superiores —
  // e para a Regional nem isso, porque ela não pergunta onde fica.
  const permitidos = tipos.find((t) => t.codigo === tipo)?.pais_permitidos ?? [];
  const superiores = (exigir(
    await supabase.from("unidades").select("id, nome, tipo").in("tipo", permitidos.length ? permitidos : ["__nenhum__"]).order("nome"),
    "as unidades superiores"
  ) ?? []) as Pick<UnidadeRow, "id" | "nome" | "tipo">[];

  const nomeSuperior = new Map(superiores.map((u) => [u.id, u.nome]));
  const nomeOrg = new Map(organizacoes.map((o) => [o.id, o.nome]));
  const podeVerCielo = Boolean(eu?.pode("configuracao.gerir"));

  return (
    <Painel titulo={titulo}>
      <TituloPagina
        titulo={titulo}
        descricao={descricao}
        acao={
          <ModalCadastro
            rotulo={`Nova ${titulo.replace(/s$/, "").toLowerCase()}`}
            icone={<IconPlus size={18} className="ti" />}
            titulo={`Nova ${titulo.replace(/s$/, "").toLowerCase()}`}
            acao={criarUnidade}
            rotuloConfirmar="Cadastrar"
            largura="lg"
          >
            <CamposUnidade
              tipoFixo={tipo}
              tipos={tipos}
              unidades={superiores}
              organizacoes={organizacoes}
              podeVerCielo={podeVerCielo}
            />
          </ModalCadastro>
        }
      />

      {erro && (
        <div style={{ marginBottom: 16 }}>
          <Alerta tipo="danger" icone={<IconAlertCircle size={20} className="ti" />}>{erro}</Alerta>
        </div>
      )}
      {ok && (
        <div style={{ marginBottom: 16 }}>
          <Alerta tipo="success" icone={<IconCheck size={20} className="ti" />}>{ok}</Alerta>
        </div>
      )}

      <p className="sni-hint" style={{ marginBottom: 20 }}>
        <Link href="/admin/estrutura">
          <IconSitemap size={15} className="ti" aria-hidden="true" /> Ver a árvore inteira
        </Link>
      </p>

      {unidades.length === 0 ? (
        <Vazio titulo={`Nenhuma ${titulo.replace(/s$/, "").toLowerCase()} cadastrada`}>
          Comece pela primeira. As de baixo se penduram nela depois.
        </Vazio>
      ) : (
        <Tabela
          cabecalho={[
            "Nome",
            ...(tipo === "regional" ? [] : ["Dentro de"]),
            ...(tipo === "associacao_local" ? ["Organização"] : []),
            "Onde fica",
            "CNPJ",
            "Situação",
            "",
          ]}
        >
          {unidades.map((u) => (
            <Linha key={u.id}>
              <Celula forte>
                {u.nome}
                {u.idioma === "ja" && (
                  <span className="sni-hint" style={{ marginTop: 2 }}>Atividades em japonês</span>
                )}
              </Celula>
              {tipo !== "regional" && (
                <Celula>{u.pai_id ? (nomeSuperior.get(u.pai_id) ?? "—") : "—"}</Celula>
              )}
              {tipo === "associacao_local" && (
                <Celula>{u.organizacao_id ? (nomeOrg.get(u.organizacao_id) ?? "—") : "—"}</Celula>
              )}
              <Celula>{u.cidade ? `${u.cidade}${u.uf ? `/${u.uf}` : ""}` : "—"}</Celula>
              <Celula>{u.cnpj ? <Num>{formatarCnpj(u.cnpj)}</Num> : "—"}</Celula>
              <Celula>
                <Etiqueta ativo={u.ativo} />
                {u.migracao_extras?.conferir === true && (
                  <Badge tom="warning">Conferir</Badge>
                )}
              </Celula>
              <Celula alinhar="right">
                <ModalCadastro
                  gatilho="link"
                  rotulo="Editar"
                  titulo={`Editar ${u.nome}`}
                  acao={editarUnidade}
                  largura="lg"
                >
                  <CamposUnidade
                    tipoFixo={tipo}
                    tipos={tipos}
                    unidades={superiores}
                    organizacoes={organizacoes}
                    unidade={u}
                    podeVerCielo={podeVerCielo}
                  />
                </ModalCadastro>
              </Celula>
            </Linha>
          ))}
        </Tabela>
      )}
    </Painel>
  );
}
