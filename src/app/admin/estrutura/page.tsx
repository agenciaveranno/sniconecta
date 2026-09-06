import {
  IconAlertCircle,
  IconBuildingCommunity,
  IconPlus,
  IconSitemap,
} from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import {
  Alerta,
  Badge,
  Celula,
  Etiqueta,
  Linha,
  Tabela,
  TituloPagina,
  Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigir } from "@/lib/supabase/consulta";
import type { TipoUnidadeRow, UnidadeRow } from "@/lib/supabase/tipos";
import CamposUnidade from "./CamposUnidade";
import { alternarAtivo, criarUnidade, editarUnidade } from "./actions";

export const metadata = { title: "Estrutura" };

/**
 * Ordena a árvore para a tabela: cada unidade logo abaixo da sua superior, e
 * `profundidade` para o recuo. Feito aqui e não no banco porque a árvore tem
 * centenas de nós e cabe inteira em memória — um `WITH RECURSIVE` por
 * carregamento de tela seria pagar por ordenação que o servidor já tem.
 */
function achatarArvore(
  unidades: UnidadeRow[]
): { unidade: UnidadeRow; profundidade: number }[] {
  const porPai = new Map<string | null, UnidadeRow[]>();
  for (const u of unidades) {
    const chave = u.pai_id ?? null;
    porPai.set(chave, [...(porPai.get(chave) ?? []), u]);
  }
  const saida: { unidade: UnidadeRow; profundidade: number }[] = [];
  const descer = (pai: string | null, profundidade: number) => {
    for (const u of (porPai.get(pai) ?? []).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
      saida.push({ unidade: u, profundidade });
      descer(u.id, profundidade + 1);
    }
  };
  descer(null, 0);

  // Órfã só acontece se alguém apagar a superior por fora, mas some da tela se
  // não for tratada — e sumir é pior que aparecer no lugar errado.
  const vistas = new Set(saida.map((l) => l.unidade.id));
  for (const u of unidades) if (!vistas.has(u.id)) saida.push({ unidade: u, profundidade: 0 });
  return saida;
}

export default async function EstruturaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  await exigirCapacidadeNaPagina("estrutura.gerir");

  const supabase = await criarClienteServidor();

  // exigir(): a ausência de linhas decide o que a tela mostra. Ler só o `data`
  // faria banco fora do ar virar "a instituição não tem nenhuma unidade" — e
  // alguém cadastraria a Sede Central pela segunda vez.
  const tipos = exigir(
    await supabase.from("tipos_unidade").select("*").eq("ativo", true).order("nivel").order("ordem"),
    "os tipos de unidade"
  ) as TipoUnidadeRow[];

  const unidades = exigir(
    await supabase.from("unidades").select("*").order("nome"),
    "as unidades"
  ) as UnidadeRow[];

  const nomeDoTipo = new Map(tipos.map((t) => [t.codigo, t.nome]));
  const linhas = achatarArvore(unidades);
  const paraEscolha = unidades.map((u) => ({ id: u.id, nome: u.nome, tipo: u.tipo }));

  return (
    <Painel titulo="Estrutura">
      <TituloPagina
        titulo="Estrutura institucional"
        descricao="Sede Central, Regionais, Núcleos e Associações Locais. É esta árvore que decide o alcance de cada papel: quem coordena uma Regional alcança as unidades abaixo dela."
        acao={
          <ModalCadastro
            rotulo="Nova unidade"
            icone={<IconPlus size={18} className="ti" />}
            titulo="Nova unidade"
            descricao="Escolha o tipo e dentro de qual unidade ela fica."
            acao={criarUnidade}
            rotuloConfirmar="Cadastrar"
          >
            <CamposUnidade tipos={tipos} unidades={paraEscolha} />
          </ModalCadastro>
        }
      />

      {erro && (
        <div style={{ marginBottom: 16 }}>
          <Alerta tipo="danger" icone={<IconAlertCircle size={20} className="ti" />}>
            {erro}
          </Alerta>
        </div>
      )}

      {linhas.length === 0 ? (
        <Vazio
          icone={<IconSitemap size={34} className="ti" />}
          titulo="A instituição ainda não foi desenhada"
        >
          Comece pela Sede Central, no topo. Depois as Regionais dentro dela, e
          as Associações Locais dentro de cada Regional.
        </Vazio>
      ) : (
        <Tabela cabecalho={["Unidade", "Tipo", "Cidade", "Código", "Situação", ""]}>
          {linhas.map(({ unidade, profundidade }) => (
            <Linha key={unidade.id}>
              <Celula forte>
                <span style={{ paddingLeft: profundidade * 22, display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <IconBuildingCommunity
                    size={17}
                    className="ti"
                    style={{ color: "var(--txt-4)" }}
                    aria-hidden="true"
                  />
                  {unidade.nome}
                </span>
              </Celula>
              <Celula>
                <Badge tom={profundidade === 0 ? "blue" : "gray"}>
                  {nomeDoTipo.get(unidade.tipo) ?? unidade.tipo}
                </Badge>
              </Celula>
              <Celula>
                {unidade.cidade ? `${unidade.cidade}${unidade.uf ? `/${unidade.uf}` : ""}` : "—"}
              </Celula>
              <Celula dado>{unidade.codigo ?? "—"}</Celula>
              <Celula>
                <Etiqueta ativo={unidade.ativo} />
              </Celula>
              <Celula alinhar="right">
                <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
                  <ModalCadastro
                    gatilho="link"
                    rotulo="Editar"
                    titulo={`Editar ${unidade.nome}`}
                    acao={editarUnidade}
                  >
                    <CamposUnidade tipos={tipos} unidades={paraEscolha} unidade={unidade} />
                  </ModalCadastro>
                  <form action={alternarAtivo}>
                    <input type="hidden" name="id" value={unidade.id} />
                    <input type="hidden" name="ativo" value={String(unidade.ativo)} />
                    <button type="submit" className="sni-acao">
                      {unidade.ativo ? "Desativar" : "Reativar"}
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
