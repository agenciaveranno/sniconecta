import { IconPlus, IconSitemap } from "@tabler/icons-react";
import Link from "next/link";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import {
  AcaoLink, Alerta, Badge, Celula, Etiqueta, Linha, Num, Recado, Tabela, TituloPagina, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigir } from "@/lib/supabase/consulta";
import { formatarCnpj } from "@/lib/dominio/cnpj";
import type { OrganizacaoRow, TipoUnidadeRow, UnidadeRow } from "@/lib/supabase/tipos";
import CamposUnidade from "./CamposUnidade";
import { criarUnidade } from "./actions";

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
  const { erro, ok } = await searchParams;

  const supabase = await criarClienteServidor();

  // ⚠️ As cinco JUNTAS, e não uma esperando a outra. Nenhuma depende do
  // resultado das outras, e em série cada uma soma sua ida e volta ao banco no
  // tempo de tela em branco.
  //
  // ⚠️ `todas` traz as unidades de TODOS os tipos com três colunas, e os
  // superiores saem dela por filtro em memória. Buscá-los à parte obrigava a
  // esperar `tipos_unidade` chegar para só então perguntar quais tipos podem
  // ser pai — uma sexta ida, em série, para uma pergunta que o catálogo já
  // tinha respondido.
  const [rUnidades, rTipos, rOrganizacoes, rTodas] = await Promise.all([
    supabase.from("unidades").select("*").eq("tipo", tipo).order("nome"),
    supabase.from("tipos_unidade").select("*").eq("ativo", true).order("ordem"),
    supabase.from("organizacoes").select("*").eq("ativo", true).order("ordem"),
    supabase.from("unidades").select("id, nome, tipo").order("nome"),
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

  // ⚠️ A conta Cielo NÃO passa por esta tela. Ela mora na aba Pagamento da
  // página da unidade, com formulário só dela — o que mantém a Merchant Key
  // longe do campo de e-mail, que era o que fazia o navegador tratar o
  // cadastro como tela de login e preencher os dois sozinho.

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
            />
          </ModalCadastro>
        }
      />

      <Recado erro={erro} ok={ok} />

      <p className="hint" style={{ marginBottom: 20 }}>
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
                  <span className="hint" style={{ marginTop: 2 }}>Atividades em japonês</span>
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
                {/* Editar abre PÁGINA, não modal: são quatro assuntos, um
                    deles com upload (decisão 0019). Criar continua em modal —
                    nascer é um punhado de campos. */}
                <AcaoLink href={`/admin/estrutura/${u.id}`}>Editar</AcaoLink>
              </Celula>
            </Linha>
          ))}
        </Tabela>
      )}
    </Painel>
  );
}
