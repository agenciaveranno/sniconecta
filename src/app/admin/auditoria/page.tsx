import { IconHistory } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import {
  Botao, Campo, Celula, Linha, Num, Select, Tabela, TituloPagina, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { AuditoriaRow, PessoaRow } from "@/lib/supabase/tipos";

export const metadata = { title: "Auditoria" };

/**
 * A trilha de quem fez o quê.
 *
 * ⚠️ Só a Sede lê, e quem decide isso é o BANCO: a policy de `auditoria` exige
 * `app.e_sede()`. A capacidade `auditoria.ver` existe para a tela não oferecer
 * o que a policy negaria — as duas camadas, como sempre.
 *
 * ⚠️ A trilha é IMUTÁVEL nesta tela: não há editar, não há apagar, e não é
 * esquecimento. Trilha que se corrige deixa de servir para o que existe — se
 * quem fez algo pode reescrever o registro do que fez, o registro não responde
 * mais nada.
 */

const POR_PAGINA = 50;

/**
 * As famílias de ação que a trilha hoje registra, para o filtro.
 *
 * ⚠️ Escrita à mão a partir do prefixo, e não lida do banco com `distinct`:
 * um `select distinct acao` varreria a tabela inteira a cada abertura, e ela
 * só cresce. O prefixo é combinado (`pessoa.`, `acesso.`, `papel.`) e é o que
 * a pessoa quer filtrar — o sufixo exato ela lê na coluna.
 */
const FAMILIAS = [
  { prefixo: "pessoa.", nome: "Pessoas" },
  { prefixo: "acesso.", nome: "Acesso e senha" },
  { prefixo: "papel.", nome: "Papéis" },
];

/** `pessoa.anexo_removido` → "Pessoa · anexo removido". */
function nomeDaAcao(acao: string): string {
  const [familia, resto] = acao.split(".", 2);
  if (!resto) return acao;
  const legivel = resto.replace(/_/g, " ");
  return `${familia.charAt(0).toUpperCase()}${familia.slice(1)} · ${legivel}`;
}

/** Data e hora na forma que se lê aqui, no fuso de quem opera. */
function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ familia?: string; p?: string }>;
}) {
  await exigirCapacidadeNaPagina("auditoria.ver");

  const { familia = "", p } = await searchParams;
  const pagina = Math.max(1, Number(p ?? "1") || 1);
  const de = (pagina - 1) * POR_PAGINA;

  const supabase = await criarClienteServidor();

  // A contagem é `exact` porque "página 3 de 40" tem de ser verdade para quem
  // está paginando uma trilha atrás de um evento específico.
  let consulta = supabase
    .from("auditoria")
    .select("*", { count: "exact" })
    .order("criado_em", { ascending: false })
    .range(de, de + POR_PAGINA - 1);

  const escolhida = FAMILIAS.find((f) => f.prefixo === familia);
  if (escolhida) consulta = consulta.like("acao", `${escolhida.prefixo}%`);

  const { data, count } = await consulta;
  const eventos = (data ?? []) as AuditoriaRow[];
  const total = count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // ⚠️ Os nomes vêm numa consulta À PARTE, e só os desta página. Embed traria
  // a pessoa inteira em cada uma das cinquenta linhas, e a trilha guarda o
  // `pessoa_id` justamente para não repetir o nome cinquenta vezes.
  const ids = [...new Set(eventos.map((e) => e.pessoa_id).filter(Boolean))] as string[];
  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    const { data: pessoas } = await supabase
      .from("pessoas")
      .select("id, nome, nome_social")
      .in("id", ids);
    for (const p of (pessoas ?? []) as Pick<PessoaRow, "id" | "nome" | "nome_social">[]) {
      nomes.set(p.id, p.nome_social || p.nome);
    }
  }

  const linkPagina = (n: number) =>
    `/admin/auditoria?${new URLSearchParams({ ...(familia ? { familia } : {}), p: String(n) })}`;

  return (
    <Painel titulo="Auditoria">
      <TituloPagina
        titulo="Auditoria"
        descricao="Quem fez o quê, e quando. O registro não se edita nem se apaga: trilha que se corrige deixa de responder."
      />

      {/* Filtro que envia sozinho ao mudar não existe sem JavaScript, e esta
          tela é de servidor: o botão é o próprio envio do formulário. */}
      <form method="get" className="sni-busca sni-filtro">
        <Campo label="Assunto" htmlFor="familia">
          <Select id="familia" name="familia" defaultValue={familia}>
            <option value="">Tudo</option>
            {FAMILIAS.map((f) => (
              <option key={f.prefixo} value={f.prefixo}>
                {f.nome}
              </option>
            ))}
          </Select>
        </Campo>
        {/* Volta para a página 1 ao trocar o filtro: continuar na página 7 de
            um recorte que agora tem duas seria cair numa tela vazia. */}
        <input type="hidden" name="p" value="1" />
        <Botao type="submit" variante="secondary">
          Filtrar
        </Botao>
      </form>

      {eventos.length === 0 ? (
        <Vazio icone={<IconHistory size={34} className="ti" />} titulo="Nada registrado aqui">
          {escolhida
            ? "Nenhum evento deste assunto ainda. Experimente ver tudo."
            : "A trilha começa a encher quando alguém cadastra, move ou dá acesso a uma pessoa."}
        </Vazio>
      ) : (
        <>
          <Tabela cabecalho={["Quando", "Quem fez", "O que fez", "Sobre", "Detalhe"]}>
            {eventos.map((e) => (
              <Linha key={e.id}>
                <Celula dado>{quando(e.criado_em)}</Celula>
                <Celula forte>
                  {e.pessoa_id ? (nomes.get(e.pessoa_id) ?? "—") : "O sistema"}
                </Celula>
                <Celula>{nomeDaAcao(e.acao)}</Celula>
                <Celula>
                  {e.entidade ?? "—"}
                  {e.entidade_id && (
                    <span className="hint" style={{ marginTop: 2 }}>
                      <span className="num">{e.entidade_id.slice(0, 8)}</span>
                    </span>
                  )}
                </Celula>
                <Celula>
                  {/* ⚠️ O detalhe é mostrado como veio, e o que vem nunca é
                      segredo: `registrar()` proíbe senha, chave e documento de
                      terceiro na trilha. Se um dia aparecer algo assim aqui, o
                      erro está em quem gravou, não nesta tela. */}
                  {e.detalhe ? (
                    <span className="hint">
                      {Object.entries(e.detalhe)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ")}
                    </span>
                  ) : (
                    "—"
                  )}
                </Celula>
              </Linha>
            ))}
          </Tabela>

          <nav className="sni-paginacao" aria-label="Páginas">
            <span className="hint">
              <Num>{total}</Num> registro{total === 1 ? "" : "s"} · página <Num>{pagina}</Num> de{" "}
              <Num>{paginas}</Num>
            </span>
            <span style={{ display: "inline-flex", gap: 8 }}>
              {pagina > 1 && (
                <a className="sni-acao" href={linkPagina(pagina - 1)}>
                  Anterior
                </a>
              )}
              {pagina < paginas && (
                <a className="sni-acao" href={linkPagina(pagina + 1)}>
                  Próxima
                </a>
              )}
            </span>
          </nav>
        </>
      )}
    </Painel>
  );
}
