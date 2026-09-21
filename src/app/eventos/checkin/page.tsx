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
 * ⚠️ UM CAMPO SÓ, e não um para documento e outro para o código. O leitor de
 * QR é um teclado: ele digita o que leu no campo que estiver com o foco e
 * aperta enter. Dois campos obrigariam o operador a clicar no certo antes de
 * cada leitura — com a fila andando, é o clique que não acontece, e o código
 * acaba digitado no campo de nome.
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
            <Campo
              label="Quem está na porta"
              dica="Leia o código do ingresso, ou digite CPF, passaporte, nome ou número do convite."
            >
              <Input
                name="busca"
                defaultValue={busca ?? ""}
                autoFocus
                placeholder="SNI-A1B2-C3D4-E5F6-7890, 000.000.000-00 ou Maria"
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
                Nada casou com esse código, documento ou nome neste evento.
                Confira se o ingresso é deste evento — ou encaminhe ao balcão,
                se a pessoa ainda vai comprar.
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
                        {/* ⚠️ O código aparece para o operador CONFERIR com o
                            papel na mão quando a câmera falha e ele digitou o
                            documento. Sem ele na tela, não há como saber se o
                            ingresso que a pessoa traz é o que está aberto
                            aqui — e duas inscrições da mesma pessoa no mesmo
                            evento são o caso comum, não o raro. */}
                        {i.qr_code && (
                          <>
                            <br />
                            <span className="hint num">{i.qr_code}</span>
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
