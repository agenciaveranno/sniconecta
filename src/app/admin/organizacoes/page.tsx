import { IconBuildingArch, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import CamposCielo from "@/componentes/CamposCielo";
import {
  Alerta, Badge, Campo, Celula, Etiqueta, Input, Linha, Num, Recado, Tabela, TituloPagina, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { contasCieloVisiveis, type ContaCieloNaTela } from "@/lib/credenciais";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigir } from "@/lib/supabase/consulta";
import type { OrganizacaoRow } from "@/lib/supabase/tipos";
import ToggleOrganizacao from "./ToggleOrganizacao";
import { alternarAtivo, criarOrganizacao, editarOrganizacao } from "./actions";

export const metadata = { title: "Departamentos" };

// O formato vem de `credenciais.ts`, junto com quem o produz: redeclarado à
// mão, ele é estrutural e anônimo — esquecer de acompanhá-lo não daria erro de
// compilação, daria campo em branco numa tela só.
type Conta = ContaCieloNaTela | undefined;

function Campos({
  organizacao,
  cielo,
  podeVerCielo,
}: {
  organizacao?: OrganizacaoRow;
  cielo?: Conta;
  podeVerCielo: boolean;
}) {
  return (
    <>
      {organizacao && <input type="hidden" name="id" value={organizacao.id} />}

      <Campo label="Nome" obrigatorio>
        <Input name="nome" defaultValue={organizacao?.nome ?? ""} required maxLength={120} />
      </Campo>

      <ToggleOrganizacao inicial={organizacao?.e_organizacao} />

      <div className="form-grid">
        <Campo label="Nome curto" dica="Como aparece em tabela e crachá, onde o nome inteiro não cabe.">
          <Input name="nome_curto" defaultValue={organizacao?.nome_curto ?? ""} maxLength={40} />
        </Campo>
        <Campo label="Código" dica="A sigla ou numeração própria da instituição, se houver.">
          <Input name="codigo" defaultValue={organizacao?.codigo ?? ""} maxLength={30} />
        </Campo>
      </div>

      <Campo label="Ordem" dica="Decide a posição nas listas de escolha. Menor aparece antes.">
        <Input
          name="ordem"
          type="number"
          min={0}
          max={999}
          defaultValue={organizacao?.ordem ?? 0}
          className="num"
        />
      </Campo>

      {podeVerCielo && (
        <CamposCielo
          merchantId={cielo?.merchant_id}
          nomeLoja={cielo?.nome_loja}
          temChave={cielo?.temSegredo}
        />
      )}
    </>
  );
}

export default async function OrganizacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const eu = await exigirCapacidadeNaPagina("estrutura.gerir");

  const podeVerCielo = eu.pode("configuracao.gerir");
  const supabase = await criarClienteServidor();

  // ⚠️ As duas JUNTAS: a lista de contas não depende da de Departamentos, e em
  // série somava sua ida e volta ao banco no tempo de tela em branco.
  const [rOrganizacoes, contas] = await Promise.all([
    supabase.from("organizacoes").select("*").order("ordem").order("nome"),
    contasCieloVisiveis(podeVerCielo),
  ]);

  const organizacoes = exigir(rOrganizacoes, "as organizações") as OrganizacaoRow[];

  return (
    <Painel titulo="Departamentos">
      <TituloPagina
        titulo="Departamentos da Sede Central"
        descricao="As unidades administrativas que dão suporte aos trabalhos. Algumas delas são as Organizações doutrinárias — Fraternidade, Pomba Branca, Jovens, Prosperidade —; outras, não. É a chave de cada linha que responde, e é por ela que a Associação Local monta a lista de escolha. Fora da Sede Central, todas se chamam Organização."
        acao={
          <ModalCadastro
            rotulo="Novo departamento"
            icone={<IconPlus size={18} className="ti" />}
            titulo="Novo departamento"
            acao={criarOrganizacao}
            rotuloConfirmar="Cadastrar"
          >
            <Campos podeVerCielo={podeVerCielo} />
          </ModalCadastro>
        }
      />

      <Recado erro={erro} />

      {organizacoes.length === 0 ? (
        <Vazio icone={<IconBuildingArch size={34} className="ti" />} titulo="Nenhum departamento cadastrado">
          Sem Organização marcada, nenhuma Associação Local pode ser criada:
          toda AL pertence a uma.
        </Vazio>
      ) : (
        <Tabela cabecalho={["Departamento", "É Organização", "Código", "Ordem", ...(podeVerCielo ? ["Conta Cielo"] : []), "Situação", ""]}>
          {organizacoes.map((o) => (
            <Linha key={o.id}>
              <Celula forte>
                {o.nome}
                {o.descricao && (
                  <span className="hint" style={{ marginTop: 2 }}>{o.descricao}</span>
                )}
              </Celula>
              <Celula>
                {/* ⚠️ Nunca só por cor: quem não distingue verde de cinza
                    precisa do texto para saber o que a linha diz. */}
                {o.e_organizacao ? (
                  <Badge tom="success" ponto>Organização</Badge>
                ) : (
                  <span className="hint">Administrativo</span>
                )}
              </Celula>
              <Celula>{o.codigo ?? "—"}</Celula>
              <Celula>
                <Num>{o.ordem}</Num>
              </Celula>
              {podeVerCielo && (
                <Celula>{contas.get(o.id)?.merchant_id ? "Cadastrada" : "—"}</Celula>
              )}
              <Celula>
                <Etiqueta ativo={o.ativo} />
              </Celula>
              <Celula alinhar="right">
                <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
                  <ModalCadastro
                    gatilho="link"
                    rotulo="Editar"
                    titulo={`Editar ${o.nome}`}
                    acao={editarOrganizacao}
                  >
                    <Campos organizacao={o} cielo={contas.get(o.id)} podeVerCielo={podeVerCielo} />
                  </ModalCadastro>
                  <form action={alternarAtivo}>
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="ativo" value={String(o.ativo)} />
                    <button type="submit" className="sni-acao">
                      {o.ativo ? "Desativar" : "Reativar"}
                    </button>
                  </form>
                </span>
              </Celula>
            </Linha>
          ))}
        </Tabela>
      )}
    </Painel>
  );
}
