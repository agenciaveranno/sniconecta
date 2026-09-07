import { IconPlus, IconSitemap } from "@tabler/icons-react";
import Link from "next/link";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import {
  Alerta, Badge, Celula, Etiqueta, Linha, Num, Recado, Tabela, TituloPagina, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina, pessoaAtual } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigir } from "@/lib/supabase/consulta";
import { formatarCnpj } from "@/lib/dominio/cnpj";
import { contasCieloVisiveis } from "@/lib/credenciais";
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

  const podeVerCielo = Boolean(eu?.pode("configuracao.gerir"));

  // ⚠️ As cinco JUNTAS, e não uma esperando a outra. Nenhuma depende do
  // resultado das outras, e em série cada uma soma sua ida e volta ao banco no
  // tempo de tela em branco.
  //
  // ⚠️ `todas` traz as unidades de TODOS os tipos com três colunas, e os
  // superiores saem dela por filtro em memória. Buscá-los à parte obrigava a
  // esperar `tipos_unidade` chegar para só então perguntar quais tipos podem
  // ser pai — uma sexta ida, em série, para uma pergunta que o catálogo já
  // tinha respondido.
  const [rUnidades, rTipos, rOrganizacoes, rTodas, contas] = await Promise.all([
    supabase.from("unidades").select("*").eq("tipo", tipo).order("nome"),
    supabase.from("tipos_unidade").select("*").eq("ativo", true).order("ordem"),
    // ⚠️ `e_organizacao`: a lista de escolha é de ORGANIZAÇÕES doutrinárias —
    // Fraternidade, Pomba Branca, Jovens, Prosperidade —, não dos Departamentos
    // administrativos da Sede. Sem o filtro, quem cadastra uma Associação Local
    // podia pendurá-la na Controladoria, ou na "Indefinida" que a carga criou
    // como dívida a revisar — e escolher a dívida de boa-fé a tornaria destino.
    supabase.from("organizacoes").select("*").eq("ativo", true).eq("e_organizacao", true).order("ordem"),
    supabase.from("unidades").select("id, nome, tipo").order("nome"),
    contasCieloVisiveis(podeVerCielo),
  ]);

  const unidades = (exigir(rUnidades, `as unidades do tipo ${tipo}`) ?? []) as UnidadeRow[];
  const tipos = (exigir(rTipos, "os tipos de unidade") ?? []) as TipoUnidadeRow[];
  const organizacoes = (exigir(rOrganizacoes, "as organizações") ?? []) as OrganizacaoRow[];
  const todas = (exigir(rTodas, "as unidades") ?? []) as Pick<UnidadeRow, "id" | "nome" | "tipo">[];

  // Só os degraus que PODEM receber este tipo entram na lista de superiores —
  // e para a Regional nem isso, porque ela não pergunta onde fica.
  const permitidos = tipos.find((t) => t.codigo === tipo)?.pais_permitidos ?? [];
  const superiores = todas.filter((u) => permitidos.includes(u.tipo));

  const nomeSuperior = new Map(todas.map((u) => [u.id, u.nome]));
  const nomeOrg = new Map(organizacoes.map((o) => [o.id, o.nome]));

  // ⚠️ A conta Cielo TEM de chegar ao formulário de edição. Sem ela o bloco
  // aparece vazio e, ao salvar, o Merchant ID em branco APAGAVA a conta da
  // entidade — editar o telefone de uma Regional a tirava do ar para venda.
  // Hoje `guardarCieloDoFormulario` também exige a marca de que o bloco foi
  // desenhado, então o esquecimento não volta a custar a conta de ninguém.

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

      <Recado erro={erro} ok={ok} />

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
                    cielo={contas.get(u.id)}
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
