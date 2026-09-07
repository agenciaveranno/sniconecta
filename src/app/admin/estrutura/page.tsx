import {
  IconAlertCircle,
  IconBuildingCommunity,
  IconPlus,
  IconSitemap,
} from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import {
  Alerta, Badge, Celula, Etiqueta, Linha, Recado, Tabela, TituloPagina, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { contasCieloVisiveis } from "@/lib/credenciais";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigir } from "@/lib/supabase/consulta";
import type { OrganizacaoRow, TipoUnidadeRow, UnidadeRow } from "@/lib/supabase/tipos";
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
    // ⚠️ `push` e não recriar o array: `[...anteriores, u]` copiava os irmãos
    // já vistos a cada filho. Numa Regional com duzentas Associações Locais
    // são duzentas cópias, e o custo cresce com o QUADRADO do número de ALs.
    const irmaos = porPai.get(chave);
    if (irmaos) irmaos.push(u);
    else porPai.set(chave, [u]);
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
  const eu = await exigirCapacidadeNaPagina("estrutura.gerir");

  // Conta Cielo é segredo: quem desenha a estrutura não vê por onde entra o
  // dinheiro se não administrar configuração também. A leitura só acontece
  // para quem pode — e traz apenas a parte pública.
  const podeVerCielo = eu.pode("configuracao.gerir");

  const supabase = await criarClienteServidor();

  // exigir(): a ausência de linhas decide o que a tela mostra. Ler só o `data`
  // faria banco fora do ar virar "a instituição não tem nenhuma unidade" — e
  // alguém cadastraria a Sede Central pela segunda vez.
  // ⚠️ As três JUNTAS: nenhuma depende do resultado das outras, e em série
  // cada uma somava sua ida e volta ao banco no tempo de tela em branco.
  const [rTipos, rUnidades, rOrganizacoes, contas] = await Promise.all([
    supabase.from("tipos_unidade").select("*").eq("ativo", true).order("ordem"),
    supabase.from("unidades").select("*").order("nome"),
    supabase.from("organizacoes").select("*").eq("ativo", true).order("ordem"),
    contasCieloVisiveis(podeVerCielo),
  ]);

  const tipos = exigir(rTipos, "os tipos de unidade") as TipoUnidadeRow[];
  const unidades = exigir(rUnidades, "as unidades") as UnidadeRow[];
  const organizacoes = exigir(rOrganizacoes, "as organizações") as OrganizacaoRow[];

  const nomeDoTipo = new Map(tipos.map((t) => [t.codigo, t.nome]));
  const nomeDaOrganizacao = new Map(organizacoes.map((o) => [o.id, o.nome_curto ?? o.nome]));
  const linhas = achatarArvore(unidades);
  const paraEscolha = unidades.map((u) => ({ id: u.id, nome: u.nome, tipo: u.tipo }));

  return (
    <Painel titulo="Estrutura">
      <TituloPagina
        titulo="Estrutura institucional"
        descricao="Sede Central, Regionais, Núcleos e Associações Locais. O Núcleo é opcional: existe onde duas ou mais Associações Locais do mesmo endereço unificam caixa e estoque. É esta árvore que decide o alcance de cada papel."
        acao={
          <ModalCadastro
            rotulo="Nova unidade"
            icone={<IconPlus size={18} className="ti" />}
            titulo="Nova unidade"
            descricao="Escolha o tipo e dentro de qual unidade ela fica."
            acao={criarUnidade}
            rotuloConfirmar="Cadastrar"
          >
            <CamposUnidade
              tipos={tipos}
              unidades={paraEscolha}
              organizacoes={organizacoes}
              podeVerCielo={podeVerCielo}
            />
          </ModalCadastro>
        }
      />

      <Recado erro={erro} />

      {linhas.length === 0 ? (
        <Vazio
          icone={<IconSitemap size={34} className="ti" />}
          titulo="A instituição ainda não foi desenhada"
        >
          Comece pela Sede Central, no topo. Depois as Regionais dentro dela, e
          as Associações Locais dentro de cada Regional — ou dentro de um
          Núcleo, onde ele existir.
        </Vazio>
      ) : (
        <Tabela cabecalho={["Unidade", "Tipo", "Organização", "Cidade", "Situação", ""]}>
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
              <Celula>{nomeDaOrganizacao.get(unidade.organizacao_id ?? "") ?? "—"}</Celula>
              <Celula>
                {unidade.cidade ? `${unidade.cidade}${unidade.uf ? `/${unidade.uf}` : ""}` : "—"}
              </Celula>
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
                    <CamposUnidade
                      tipos={tipos}
                      unidades={paraEscolha}
                      organizacoes={organizacoes}
                      unidade={unidade}
                      cielo={contas.get(unidade.id)}
                      podeVerCielo={podeVerCielo}
                    />
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
