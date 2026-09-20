import Link from "next/link";
import { IconChartBar, IconTicket } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import {
  Badge, Celula, Linha, Metrica, Num, Tabela, TituloPagina, TituloSecao, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { dataBR } from "@/lib/dominio/data";
import { formatarCentavos } from "@/lib/dominio/dinheiro";
import { ROTULO_FORMA, type FormaBalcao } from "@/lib/dominio/venda";
import {
  eventosParaVenda, porFormaDePagamento, porTipoDeIngresso, resumoDoEvento,
} from "@/modulos/eventos/consultas";

export const metadata = { title: "Relatórios" };

/**
 * O que a Sede pergunta depois do evento: quantos entraram, quanto entrou, e
 * qual ingresso não está saindo.
 *
 * ⚠️ "Quantos entraram" e "quanto entrou" são perguntas DIFERENTES, e é por
 * isso que cortesia aparece na contagem e fica fora da arrecadação. Somá-la
 * faria a Sede ver dinheiro que nunca entrou no caixa.
 */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>;
}) {
  await exigirCapacidadeNaPagina("eventos.inscricoes.ver");
  const { evento: eventoParam } = await searchParams;

  const eventoId = Number(eventoParam ?? 0);
  const eventos = await eventosParaVenda();
  const evento = eventos.find((e) => e.id === eventoId) ?? null;

  const [resumo, porTipo, porForma] = evento
    ? await Promise.all([
        resumoDoEvento(evento.id),
        porTipoDeIngresso(evento.id),
        porFormaDePagamento(evento.id),
      ])
    : [null, [], []];

  const base = "/eventos/relatorios";

  return (
    <Painel titulo="Relatórios">
      <TituloPagina titulo="Relatórios" descricao="Por evento: inscrições, arrecadação e entrada." />

      {!evento || !resumo ? (
        eventos.length === 0 ? (
          <Vazio icone={<IconChartBar size={34} className="ti" />} titulo="Nenhum evento ativo">
            Os relatórios saem de um evento. Cadastre ou reative um em Eventos e
            convites.
          </Vazio>
        ) : (
          <Tabela cabecalho={["Evento", "Quando", ""]}>
            {eventos.map((e) => (
              <Linha key={e.id}>
                <Celula forte>{e.nome}</Celula>
                <Celula dado>{dataBR(e.data_inicial)}</Celula>
                <Celula alinhar="right">
                  <Link href={`${base}?evento=${e.id}`} className="sni-acao">
                    Ver relatório
                  </Link>
                </Celula>
              </Linha>
            ))}
          </Tabela>
        )
      ) : (
        <>
          <TituloSecao acao={<Link href={base} className="sni-acao">Trocar de evento</Link>}>
            {evento.nome}
          </TituloSecao>

          <div className="form-grid">
            <Metrica rotulo="Arrecadado" valor={formatarCentavos(resumo.arrecadado_centavos)} tom="success" />
            <Metrica rotulo="Inscrições pagas" valor={resumo.pagos} />
            <Metrica rotulo="Pendentes" valor={resumo.pendentes} tom={resumo.pendentes > 0 ? "warning" : "blue"} />
            <Metrica rotulo="Entraram" valor={resumo.entraram} detalhe={`de ${resumo.pagos} pagas`} />
            <Metrica rotulo="Cortesias" valor={resumo.cortesias} detalhe="fora da arrecadação" />
            <Metrica rotulo="Canceladas" valor={resumo.cancelados} />
          </div>

          <TituloSecao>Por tipo de ingresso</TituloSecao>
          {porTipo.length === 0 ? (
            <Vazio icone={<IconTicket size={28} className="ti" />} titulo="Nenhum tipo de ingresso">
              Este evento ainda não tem o que vender.
            </Vazio>
          ) : (
            <Tabela cabecalho={["Ingresso", "Pagas", "Pendentes", "Entraram", "Arrecadado"]}>
              {porTipo.map((t) => (
                <Linha key={t.nome}>
                  {/* ⚠️ Tipo que não vendeu nada aparece com zero, e não some da
                      lista. Sumindo, ele vira "não existe" para quem lê — e a
                      pergunta que este relatório responde é justamente qual
                      ingresso não está saindo. */}
                  <Celula forte>{t.nome}</Celula>
                  <Celula dado><Num>{t.pagos}</Num></Celula>
                  <Celula dado><Num>{t.pendentes}</Num></Celula>
                  <Celula dado><Num>{t.entraram}</Num></Celula>
                  <Celula dado>{formatarCentavos(t.arrecadado_centavos)}</Celula>
                </Linha>
              ))}
            </Tabela>
          )}

          <TituloSecao>Como o dinheiro entrou</TituloSecao>
          {porForma.length === 0 ? (
            <Vazio icone={<IconChartBar size={28} className="ti" />} titulo="Nenhuma inscrição paga">
              Nada entrou em caixa ainda neste evento.
            </Vazio>
          ) : (
            <Tabela cabecalho={["Forma", "Inscrições", "Arrecadado"]}>
              {porForma.map((f) => (
                <Linha key={`${f.forma ?? "sem"}-${f.tipo_venda}`}>
                  <Celula forte>
                    {/* A forma veio da carga em alguns casos, com nomes que não
                        são os nossos: mostra o que está gravado quando não
                        reconhece, em vez de esconder a linha. */}
                    {f.forma
                      ? (ROTULO_FORMA[f.forma as FormaBalcao] ?? f.forma)
                      : "Não informada"}
                    {f.tipo_venda !== "balcao" && (
                      <>
                        {" "}
                        <Badge tom="gray">{f.tipo_venda}</Badge>
                      </>
                    )}
                  </Celula>
                  <Celula dado><Num>{f.quantas}</Num></Celula>
                  <Celula dado>{formatarCentavos(f.arrecadado_centavos)}</Celula>
                </Linha>
              ))}
            </Tabela>
          )}
        </>
      )}
    </Painel>
  );
}
