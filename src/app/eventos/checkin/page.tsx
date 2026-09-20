import Link from "next/link";
import { IconCircleCheck, IconSearch, IconTicket } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import {
  Badge, Botao, Campo, Celula, Input, Linha, Metrica, Recado, Tabela,
  TituloPagina, TituloSecao, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { dataBR } from "@/lib/dominio/data";
import { podeEntrar } from "@/lib/dominio/checkin";
import {
  contagemDaPorta, eventosParaVenda, inscricoesNaPorta,
} from "@/modulos/eventos/consultas";
import { desfazerCheckin, registrarCheckin } from "@/modulos/eventos/acoes";

export const metadata = { title: "Check-in" };

/**
 * A porta do evento.
 *
 * ⚠️ Acha por pessoa, não por QR. A coluna `qr_code` existe e está vazia para
 * tudo que a plataforma vendeu — o formato ainda não foi decidido, e os
 * ingressos que vieram da carga trazem o QR do sistema antigo. Inventar um
 * formato aqui obrigaria a porta a aceitar dois para sempre. Buscar por
 * documento já atende quem chega, e a leitura de QR entra como fatia própria
 * quando o formato estiver definido.
 *
 * ⚠️ A tela mostra TODAS as situações, não só as pagas. Filtrar faria a porta
 * dizer "não encontrei" para quem tem inscrição pendente — e a pessoa iria
 * embora achando que nunca se inscreveu, quando o certo é mandá-la ao balcão.
 */
export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string; busca?: string; erro?: string; ok?: string }>;
}) {
  await exigirCapacidadeNaPagina("eventos.checkin");
  const { evento: eventoParam, busca, erro, ok } = await searchParams;

  const eventoId = Number(eventoParam ?? 0);
  const eventos = await eventosParaVenda();
  const evento = eventos.find((e) => e.id === eventoId) ?? null;

  const [achadas, contagem] = await Promise.all([
    evento && busca?.trim() ? inscricoesNaPorta(evento.id, busca) : Promise.resolve([]),
    evento ? contagemDaPorta(evento.id) : Promise.resolve({ entraram: 0, esperados: 0 }),
  ]);

  const base = "/eventos/checkin";

  return (
    <Painel titulo="Check-in">
      <TituloPagina
        titulo="Check-in"
        descricao="A porta do evento. Procure por CPF, passaporte ou nome."
      />

      <Recado erro={erro} ok={ok} />

      {!evento ? (
        eventos.length === 0 ? (
          <Vazio icone={<IconTicket size={34} className="ti" />} titulo="Nenhum evento ativo">
            O check-in abre a partir de um evento ativo.
          </Vazio>
        ) : (
          <Tabela cabecalho={["Evento", "Quando", ""]}>
            {eventos.map((e) => (
              <Linha key={e.id}>
                <Celula forte>{e.nome}</Celula>
                <Celula dado>{dataBR(e.data_inicial)}</Celula>
                <Celula alinhar="right">
                  <Link href={`${base}?evento=${e.id}`} className="sni-acao">
                    Abrir a porta
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
            <Metrica rotulo="Já entraram" valor={contagem.entraram} />
            <Metrica rotulo="Inscrições pagas" valor={contagem.esperados} />
          </div>

          {/* GET: procurar não muda nada, e o termo na URL deixa o operador
              voltar ao mesmo resultado depois de registrar uma entrada. */}
          <form method="get" action={base} className="sni-form">
            <input type="hidden" name="evento" value={evento.id} />
            <Campo label="Quem está na porta" dica="CPF, passaporte ou nome.">
              <Input
                name="busca"
                defaultValue={busca ?? ""}
                autoFocus
                placeholder="000.000.000-00, AB123456 ou Maria"
              />
            </Campo>
            <div className="sni-form-rodape">
              <Botao type="submit" icone={<IconSearch size={18} className="ti" />}>
                Procurar
              </Botao>
            </div>
          </form>

          {busca?.trim() &&
            (achadas.length === 0 ? (
              <Vazio icone={<IconSearch size={34} className="ti" />} titulo="Nenhuma inscrição">
                Ninguém com esse documento ou nome tem inscrição neste evento.
                Confira o documento — ou encaminhe ao balcão, se a pessoa ainda
                vai comprar.
              </Vazio>
            ) : (
              <Tabela cabecalho={["Pessoa", "Ingresso", "Situação", ""]}>
                {achadas.map((i) => {
                  const veredito = podeEntrar({
                    status: i.status,
                    checkinEm: i.checkin_em,
                  });
                  return (
                    <Linha key={i.id}>
                      <Celula forte>
                        {i.pessoa_nome}
                        <br />
                        <span className="hint num">{i.documento ?? "—"}</span>
                      </Celula>
                      <Celula>
                        {i.ingresso ?? "—"}
                        {i.tipo_venda === "cortesia" && (
                          <>
                            {" "}
                            <Badge tom="gray">Cortesia</Badge>
                          </>
                        )}
                      </Celula>
                      <Celula>
                        {i.checkin_em ? (
                          <Badge tom="success">Entrou {i.checkin_legivel}</Badge>
                        ) : veredito.pode ? (
                          <Badge tom="blue">Pode entrar</Badge>
                        ) : (
                          // A frase inteira, e não um rótulo: é ela que diz ao
                          // operador se manda a pessoa ao balcão ou embora.
                          <span className="hint">{veredito.motivo}</span>
                        )}
                      </Celula>
                      <Celula alinhar="right">
                        {veredito.pode ? (
                          <form action={registrarCheckin}>
                            <input type="hidden" name="evento_id" value={evento.id} />
                            <input type="hidden" name="id" value={i.id} />
                            <input type="hidden" name="busca" value={busca} />
                            <Botao
                              type="submit"
                              tamanho="sm"
                              icone={<IconCircleCheck size={16} className="ti" />}
                            >
                              Registrar entrada
                            </Botao>
                          </form>
                        ) : (
                          i.checkin_em && (
                            /* ⚠️ Desfazer existe porque o engano acontece na
                               porta, com fila: dois nomes parecidos e a entrada
                               vai na inscrição errada. Sem isto, a pessoa certa
                               fica impedida e o conserto viraria SQL à mão em
                               produção. */
                            <form action={desfazerCheckin}>
                              <input type="hidden" name="evento_id" value={evento.id} />
                              <input type="hidden" name="id" value={i.id} />
                              <input type="hidden" name="busca" value={busca} />
                              <button type="submit" className="sni-acao">
                                Desfazer
                              </button>
                            </form>
                          )
                        )}
                      </Celula>
                    </Linha>
                  );
                })}
              </Tabela>
            ))}
        </>
      )}
    </Painel>
  );
}
