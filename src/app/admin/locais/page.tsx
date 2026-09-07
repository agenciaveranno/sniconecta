import { IconBuilding, IconMapPin, IconPlus } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import {
  Alerta, Badge, Celula, Etiqueta, Linha, Recado, Tabela, TituloPagina, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { contasCieloVisiveis } from "@/lib/credenciais";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigir } from "@/lib/supabase/consulta";
import type { LocalRow, TipoLocalRow, UnidadeRow } from "@/lib/supabase/tipos";
import CamposLocal from "./CamposLocal";
import { alternarAtivo, criarLocal, editarLocal } from "./actions";

export const metadata = { title: "Locais" };

export default async function LocaisPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const eu = await exigirCapacidadeNaPagina("estrutura.gerir");

  const podeVerCielo = eu.pode("configuracao.gerir");

  const supabase = await criarClienteServidor();

  // ⚠️ As três JUNTAS: nenhuma depende do resultado das outras, e em série
  // cada uma somava sua ida e volta ao banco no tempo de tela em branco.
  const [rTipos, rLocais, rUnidades, contas] = await Promise.all([
    supabase.from("tipos_local").select("*").eq("ativo", true).order("ordem"),
    supabase.from("locais").select("*").order("nome"),
    supabase.from("unidades").select("id, nome").eq("ativo", true).order("nome"),
    contasCieloVisiveis(podeVerCielo),
  ]);

  const tipos = exigir(rTipos, "os tipos de local") as TipoLocalRow[];
  const locais = exigir(rLocais, "os locais") as LocalRow[];
  const unidades = exigir(rUnidades, "as unidades") as Pick<UnidadeRow, "id" | "nome">[];

  const nomeDoTipo = new Map(tipos.map((t) => [t.codigo, t.nome]));
  const nomeDaUnidade = new Map(unidades.map((u) => [u.id, u.nome]));

  return (
    <Painel titulo="Locais">
      <TituloPagina
        titulo="Locais de evento"
        descricao="Onde o evento acontece: Academia de Treinamento Espiritual, hotel, salão. Não se confunde com a estrutura — a Academia é um lugar, não um degrau da hierarquia, e tem CNPJ e conta própria."
        acao={
          <ModalCadastro
            rotulo="Novo local"
            icone={<IconPlus size={18} className="ti" />}
            titulo="Novo local"
            acao={criarLocal}
            rotuloConfirmar="Cadastrar"
          >
            <CamposLocal tipos={tipos} unidades={unidades} podeVerCielo={podeVerCielo} />
          </ModalCadastro>
        }
      />

      <Recado erro={erro} />

      {locais.length === 0 ? (
        <Vazio icone={<IconMapPin size={34} className="ti" />} titulo="Nenhum local cadastrado">
          As sete Academias de Treinamento Espiritual entram pela carga inicial.
          Hotel e salão alugado se cadastram aqui, quando o evento pedir.
        </Vazio>
      ) : (
        <Tabela cabecalho={["Local", "Tipo", "Cidade", "Responsável", ...(podeVerCielo ? ["Conta Cielo"] : []), "Situação", ""]}>
          {locais.map((l) => (
            <Linha key={l.id}>
              <Celula forte>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <IconBuilding size={17} className="ti" style={{ color: "var(--txt-4)" }} aria-hidden="true" />
                  {l.nome}
                </span>
              </Celula>
              <Celula>
                <Badge tom={l.tipo === "academia" ? "blue" : "gray"}>
                  {nomeDoTipo.get(l.tipo) ?? l.tipo}
                </Badge>
              </Celula>
              <Celula>{l.cidade ? `${l.cidade}${l.uf ? `/${l.uf}` : ""}` : "—"}</Celula>
              <Celula>{nomeDaUnidade.get(l.unidade_id ?? "") ?? "De terceiro"}</Celula>
              {podeVerCielo && <Celula>{contas.get(l.id)?.merchant_id ? "Cadastrada" : "—"}</Celula>}
              <Celula>
                <Etiqueta ativo={l.ativo} />
              </Celula>
              <Celula alinhar="right">
                <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
                  <ModalCadastro
                    gatilho="link"
                    rotulo="Editar"
                    titulo={`Editar ${l.nome}`}
                    acao={editarLocal}
                  >
                    <CamposLocal
                      tipos={tipos}
                      unidades={unidades}
                      local={l}
                      cielo={contas.get(l.id)}
                      podeVerCielo={podeVerCielo}
                    />
                  </ModalCadastro>
                  <form action={alternarAtivo}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="ativo" value={String(l.ativo)} />
                    <button type="submit" className="sni-acao">
                      {l.ativo ? "Desativar" : "Reativar"}
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
