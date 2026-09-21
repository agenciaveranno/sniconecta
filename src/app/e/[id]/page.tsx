import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Entidade } from "@/componentes/ui";
import { dataBR } from "@/lib/dominio/data";
import { formatarCentavos } from "@/lib/dominio/dinheiro";
import {
  combosPublicos, eventoPublico, ingressosPublicos,
} from "@/modulos/eventos/consultas";

/**
 * A página que o mundo vê de um evento.
 *
 * ⚠️ SEM SESSÃO, SEM PAINEL, SEM NADA DO SISTEMA. `/e/` já está declarada
 * pública no proxy desde a fundação — este é o endereço que vai no cartaz e no
 * Instagram, e quem abre não tem conta nem vai criar uma para ver um preço.
 *
 * ⚠️ E A PÁGINA NÃO EXPLICA POR QUE NÃO VENDE. `porQueNaoVende` devolve
 * motivos internos — "falta dizer quem promove, é o promotor que define em
 * qual conta Cielo o dinheiro cai" — que são a conversa da equipe com ela
 * mesma. Publicados, contam ao mundo o estado interno do cadastro. Aqui a
 * frase é uma só: as vendas ainda não estão abertas.
 *
 * ⚠️ A COMPRA AINDA NÃO ACONTECE AQUI, e a página diz isso em vez de oferecer
 * um botão que não leva a lugar nenhum. Promessa quebrada em silêncio é o que
 * este módulo passou a sessão inteira desfazendo.
 *
 * O desenho do checkout, e o que falta decidir antes de construí-lo, estão em
 * `docs/decisoes/0022-o-checkout-publico.md`.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const evento = await eventoPublico(Number(id));
  if (!evento) return { title: "Evento não encontrado" };

  const onde = evento.local ? ` · ${evento.local}` : "";
  return {
    title: evento.nome,
    description: `${dataBR(evento.data_inicial)}${onde}`,
    // ⚠️ Open Graph existe porque este endereço vai ser COLADO em grupo de
    // WhatsApp. Sem ele, o link aparece como uma URL crua, e metade das
    // pessoas não clica no que não sabe o que é.
    openGraph: {
      title: evento.nome,
      description: `${dataBR(evento.data_inicial)}${onde}`,
      type: "website",
    },
  };
}

export default async function EventoPublicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const evento = await eventoPublico(Number(id));
  // Evento desativado responde como inexistente: distinguir os dois conta a
  // quem tem o endereço que ele existiu.
  if (!evento) notFound();

  const [ingressos, combos] = await Promise.all([
    ingressosPublicos(evento.id),
    combosPublicos(evento.id),
  ]);

  const agora = new Date();
  const emCartaz = ingressos.filter((i) => !i.esgotado);
  const vendeAlgo = evento.tem_promotor && emCartaz.length > 0;

  return (
    <main className="sni-publico">
      <header className="sni-publico-topo">
        <p className="sni-publico-entidade">
          <Entidade />
        </p>
        <h1 className="sni-publico-nome">{evento.nome}</h1>
        <p className="sni-publico-quando">
          {dataBR(evento.data_inicial)}
          {evento.data_final !== evento.data_inicial && <> a {dataBR(evento.data_final)}</>}
          {evento.local && (
            <>
              {" · "}
              {evento.local}
              {evento.local_cidade && `, ${evento.local_cidade}`}
              {evento.local_uf && `/${evento.local_uf}`}
            </>
          )}
        </p>
      </header>

      {ingressos.length === 0 ? (
        <p className="sni-publico-aviso">
          Os ingressos deste evento ainda não estão publicados.
        </p>
      ) : (
        <section className="sni-publico-lista" aria-label="Ingressos">
          {ingressos.map((i) => (
            <article key={i.id} className="sni-publico-item">
              <div>
                <h2 className="sni-publico-item-nome">{i.nome}</h2>
                {i.descricao && <p className="sni-publico-item-sobre">{i.descricao}</p>}
                {i.papel === "adicional" && (
                  <p className="sni-publico-item-nota">
                    Acompanha um ingresso principal.
                  </p>
                )}
                {i.abre_em && (
                  <p className="sni-publico-item-nota">Vendas a partir de {i.abre_em}</p>
                )}
                {i.fecha_em && (
                  <p className="sni-publico-item-nota">Vendas até {i.fecha_em}</p>
                )}
              </div>
              <div className="sni-publico-item-preco">
                {i.esgotado ? (
                  <span className="sni-publico-esgotado">Esgotado</span>
                ) : (
                  <>
                    <strong className="num">{formatarCentavos(i.valor_centavos)}</strong>
                    {i.max_parcelas > 1 && (
                      <span className="sni-publico-item-nota">
                        em até {i.max_parcelas}×
                      </span>
                    )}
                  </>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {combos.length > 0 && (
        <section className="sni-publico-lista" aria-label="Combos">
          <h2 className="sni-publico-secao">Pacotes</h2>
          {combos.map((c) => (
            <article key={c.id} className="sni-publico-item">
              <div>
                <h3 className="sni-publico-item-nome">{c.nome}</h3>
                <p className="sni-publico-item-sobre">{c.itens.join(" + ")}</p>
                {c.descricao && <p className="sni-publico-item-sobre">{c.descricao}</p>}
              </div>
              <div className="sni-publico-item-preco">
                <strong className="num">{formatarCentavos(c.valor_centavos)}</strong>
                {/* Só quando há desconto de verdade: anunciar "de X por X" é
                    o tipo de coisa que derruba a confiança na página inteira. */}
                {c.avulso_centavos > c.valor_centavos && (
                  <span className="sni-publico-item-nota">
                    separado sairia {formatarCentavos(c.avulso_centavos)}
                  </span>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      <footer className="sni-publico-rodape">
        {/* ⚠️ UMA frase, sem motivo interno. Ver a nota no alto do arquivo. */}
        <p>
          {vendeAlgo
            ? "A compra pelo site entra em breve. Por enquanto, os ingressos são vendidos presencialmente."
            : "As vendas deste evento ainda não estão abertas."}
        </p>
        <p className="sni-publico-rodape-marca">
          <Entidade />
        </p>
        <p className="sni-publico-rodape-hora">
          Valores conferidos em {dataBR(agora.toISOString())}.
        </p>
      </footer>
    </main>
  );
}
