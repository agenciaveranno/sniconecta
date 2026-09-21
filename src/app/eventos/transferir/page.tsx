import Link from "next/link";
import { IconArrowsExchange, IconSearch, IconTicket } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import {
  Alerta, Badge, Botao, Campo, Celula, Input, Linha, Recado, Select, Tabela,
  TituloPagina, TituloSecao, Textarea, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { dataBR } from "@/lib/dominio/data";
import { formatarCentavos } from "@/lib/dominio/dinheiro";
import { valorAEstornar } from "@/lib/dominio/estorno";
import { podeTransferir } from "@/lib/dominio/transferencia";
import { FORMAS_BALCAO, ROTULO_FORMA } from "@/lib/dominio/venda";
import {
  eventosParaVenda, inscricaoParaTransferir, inscricoesDaPessoa,
  procurarParticipante, tiposParaVenda,
} from "@/modulos/eventos/consultas";
import { transferirEntreEventos } from "@/modulos/eventos/acoes";

export const metadata = { title: "Transferir inscrição" };

const BASE = "/eventos/transferir";

/**
 * Passar uma inscrição de um evento para outro.
 *
 * ⚠️ PÁGINA, e não modal, e por um motivo mecânico: o ingresso de destino
 * depende do evento de destino. Um modal estático não tem como recarregar a
 * lista de ingressos quando o evento muda, e fazer isso no navegador exigiria
 * estado de cliente numa tela que decide dinheiro. Em três passos de URL —
 * achar a inscrição, escolher o evento, escolher o ingresso — cada passo é um
 * endereço que o operador pode recarregar, voltar e mandar para o colega.
 * Mesmo desenho do balcão, pela mesma razão.
 *
 * ⚠️ A TELA NÃO DECIDE O DINHEIRO. Ela mostra a conta e pergunta quanto está
 * sendo cobrado agora; quem confere é o servidor, dentro da transação, com o
 * estoque de destino travado.
 */
export default async function TransferirPage({
  searchParams,
}: {
  searchParams: Promise<{
    inscricao?: string; evento?: string; busca?: string; pessoa?: string;
    erro?: string; ok?: string;
  }>;
}) {
  await exigirCapacidadeNaPagina("eventos.inscricoes.gerir");
  const {
    inscricao: inscricaoParam, evento: eventoParam, busca, pessoa: pessoaParam,
    erro, ok,
  } = await searchParams;

  const inscricaoId = Number(inscricaoParam ?? 0);
  const destinoId = Number(eventoParam ?? 0);

  const inscricao = inscricaoId ? await inscricaoParaTransferir(inscricaoId) : null;

  const [achados, daPessoa, eventos] = await Promise.all([
    !inscricao && busca?.trim() && !pessoaParam
      ? procurarParticipante(busca)
      : Promise.resolve([]),
    !inscricao && pessoaParam ? inscricoesDaPessoa(pessoaParam) : Promise.resolve([]),
    inscricao ? eventosParaVenda() : Promise.resolve([]),
  ]);

  const destino = eventos.find((e) => e.id === destinoId) ?? null;
  const tipos = destino ? await tiposParaVenda(destino.id) : [];

  const veredito = inscricao
    ? podeTransferir({
        status: inscricao.status,
        tipoVenda: inscricao.tipo_venda,
        valorOriginalCentavos: inscricao.valor_original_centavos,
        descontoCentavos: inscricao.desconto_centavos,
        checkinEm: inscricao.checkin_em,
        eventoId: inscricao.evento_id,
      })
    : null;

  const pago = inscricao
    ? valorAEstornar({
        status: inscricao.status,
        tipoVenda: inscricao.tipo_venda,
        valorOriginalCentavos: inscricao.valor_original_centavos,
        descontoCentavos: inscricao.desconto_centavos,
        checkinEm: null,
      })
    : 0;

  return (
    <Painel titulo="Transferir inscrição">
      <TituloPagina
        titulo="Transferir inscrição"
        descricao="Passa o ingresso de uma pessoa para outro evento. A inscrição antiga não some: ela fica marcada como transferida e aponta para a nova."
      />

      <Recado erro={erro} ok={ok} />

      {/* ── Passo 1: achar a inscrição ── */}
      {!inscricao ? (
        <>
          <form method="get" action={BASE} className="sni-form">
            <Campo label="De quem é a inscrição" dica="CPF, passaporte ou nome.">
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

          {pessoaParam &&
            (daPessoa.length === 0 ? (
              <Vazio icone={<IconTicket size={34} className="ti" />} titulo="Nenhuma inscrição">
                Esta pessoa não tem inscrição em evento nenhum.
              </Vazio>
            ) : (
              <Tabela cabecalho={["Evento", "Ingresso", "Situação", "Pago", ""]}>
                {daPessoa.map((i) => {
                  const v = podeTransferir({
                    status: i.status,
                    tipoVenda: i.tipo_venda,
                    valorOriginalCentavos: i.valor_original_centavos,
                    descontoCentavos: i.desconto_centavos,
                    checkinEm: i.checkin_em,
                    eventoId: i.evento_id,
                  });
                  return (
                    <Linha key={i.id}>
                      <Celula forte>{i.evento}</Celula>
                      <Celula>{i.ingresso ?? "—"}</Celula>
                      <Celula>
                        {v.pode ? (
                          <Badge tom="blue">{i.status}</Badge>
                        ) : (
                          // A frase inteira: é ela que diz por que não dá, em
                          // vez de deixar o operador tentar e levar o erro.
                          <span className="hint">{v.motivo}</span>
                        )}
                      </Celula>
                      <Celula dado>
                        {formatarCentavos(
                          valorAEstornar({
                            status: i.status,
                            tipoVenda: i.tipo_venda,
                            valorOriginalCentavos: i.valor_original_centavos,
                            descontoCentavos: i.desconto_centavos,
                            checkinEm: null,
                          })
                        )}
                      </Celula>
                      <Celula alinhar="right">
                        {v.pode && (
                          <Link href={`${BASE}?inscricao=${i.id}`} className="sni-acao">
                            Transferir esta
                          </Link>
                        )}
                      </Celula>
                    </Linha>
                  );
                })}
              </Tabela>
            ))}

          {busca?.trim() &&
            !pessoaParam &&
            (achados.length === 0 ? (
              <Vazio icone={<IconSearch size={34} className="ti" />} titulo="Ninguém encontrado">
                Confira o documento. Quem nunca se inscreveu não tem o que
                transferir.
              </Vazio>
            ) : (
              <Tabela cabecalho={["Pessoa", "Documento", "Inscrições", ""]}>
                {achados.map((p) => (
                  <Linha key={p.id}>
                    <Celula forte>{p.nome}</Celula>
                    <Celula dado>{p.cpf ?? p.passaporte ?? "—"}</Celula>
                    <Celula dado>{p.inscricoes}</Celula>
                    <Celula alinhar="right">
                      <Link
                        href={`${BASE}?pessoa=${p.id}&busca=${encodeURIComponent(busca)}`}
                        className="sni-acao"
                      >
                        Ver inscrições
                      </Link>
                    </Celula>
                  </Linha>
                ))}
              </Tabela>
            ))}
        </>
      ) : (
        <>
          <TituloSecao acao={<Link href={BASE} className="sni-acao">Trocar de inscrição</Link>}>
            {inscricao.pessoa_nome} · {inscricao.evento}
          </TituloSecao>

          <p className="hint">
            {inscricao.ingresso ?? "Ingresso sem tipo"} ·{" "}
            {inscricao.tipo_venda === "cortesia"
              ? "cortesia"
              : `pago ${formatarCentavos(pago)}`}
            {inscricao.qr_code && <> · código {inscricao.qr_code}</>}
          </p>

          {veredito && !veredito.pode ? (
            <Alerta tipo="warning">{veredito.motivo}</Alerta>
          ) : !destino ? (
            /* ── Passo 2: o evento de destino ── */
            <>
              <TituloSecao>Para qual evento</TituloSecao>
              {eventos.filter((e) => e.id !== inscricao.evento_id).length === 0 ? (
                <Vazio icone={<IconTicket size={34} className="ti" />} titulo="Nenhum outro evento ativo">
                  Não há para onde transferir: só existe este evento ativo.
                </Vazio>
              ) : (
                <Tabela cabecalho={["Evento", "Quando", ""]}>
                  {eventos
                    .filter((e) => e.id !== inscricao.evento_id)
                    .map((e) => (
                      <Linha key={e.id}>
                        <Celula forte>{e.nome}</Celula>
                        <Celula dado>{dataBR(e.data_inicial)}</Celula>
                        <Celula alinhar="right">
                          <Link
                            href={`${BASE}?inscricao=${inscricao.id}&evento=${e.id}`}
                            className="sni-acao"
                          >
                            Escolher
                          </Link>
                        </Celula>
                      </Linha>
                    ))}
                </Tabela>
              )}
            </>
          ) : (
            /* ── Passo 3: o ingresso, e a conta ── */
            <form action={transferirEntreEventos} className="sni-form">
              <input type="hidden" name="id" value={inscricao.id} />
              <input type="hidden" name="novo_evento_id" value={destino.id} />

              <TituloSecao
                acao={
                  <Link href={`${BASE}?inscricao=${inscricao.id}`} className="sni-acao">
                    Trocar de evento
                  </Link>
                }
              >
                {destino.nome}
              </TituloSecao>

              <Tabela cabecalho={["", "Ingresso", "Preço", "Diferença", "Disponível"]}>
                {tipos
                  .filter((t) => t.ativo)
                  .map((t) => {
                    const diferenca = t.valor_centavos - pago;
                    return (
                      <Linha key={t.id}>
                        <Celula>
                          <input
                            type="radio"
                            name="novo_tipo_id"
                            value={t.id}
                            required
                            aria-label={t.nome}
                          />
                        </Celula>
                        <Celula forte>
                          {t.nome}
                          {t.papel === "adicional" && (
                            <>
                              {" "}
                              <Badge tom="gray">Adicional</Badge>
                            </>
                          )}
                        </Celula>
                        <Celula dado>{formatarCentavos(t.valor_centavos)}</Celula>
                        <Celula dado>
                          {/* ⚠️ A diferença aparece ANTES de confirmar, com
                              sinal. Sem ela, o operador só descobre que faltam
                              R$ 50 depois de enviar — com a pessoa na frente. */}
                          {inscricao.tipo_venda === "cortesia" || diferenca === 0 ? (
                            <span className="hint">—</span>
                          ) : diferenca > 0 ? (
                            <Badge tom="warning">faltam {formatarCentavos(diferenca)}</Badge>
                          ) : (
                            <Badge tom="blue">devolver {formatarCentavos(-diferenca)}</Badge>
                          )}
                        </Celula>
                        <Celula dado>
                          {t.disponivel === null ? (
                            <span className="hint">Sem limite</span>
                          ) : (
                            t.disponivel
                          )}
                        </Celula>
                      </Linha>
                    );
                  })}
              </Tabela>

              {inscricao.status === "pendente" ? (
                <Alerta tipo="info">
                  Esta inscrição ainda não foi paga, então a transferência não
                  mexe em dinheiro. O pagamento continua pendente no evento
                  novo — receba pelo balcão depois.
                </Alerta>
              ) : inscricao.tipo_venda === "cortesia" ? (
                <Alerta tipo="info">
                  Cortesia continua cortesia no evento novo: nada é cobrado e
                  nada é devolvido, qualquer que seja o preço de tabela.
                </Alerta>
              ) : (
                <div className="form-grid">
                  <Campo
                    label="Cobrado agora"
                    dica="Em reais. Escreva 0 se a diferença não vai ser cobrada — em branco a tela recusa, porque isso é decisão, não esquecimento."
                  >
                    <Input name="cobrado" inputMode="decimal" placeholder="0,00" />
                  </Campo>
                  <Campo label="Forma do acerto" dica="Só vale se houver cobrança agora.">
                    <Select name="forma" defaultValue={inscricao.forma_pagamento ?? "dinheiro"}>
                      {FORMAS_BALCAO.filter((f) => f !== "cortesia").map((f) => (
                        <option key={f} value={f}>
                          {ROTULO_FORMA[f]}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                </div>
              )}

              <Campo label="Motivo" obrigatorio dica="Fica no histórico das duas inscrições.">
                <Textarea name="motivo" rows={2} maxLength={300} required />
              </Campo>

              <Alerta tipo="info">
                Se o ingresso de destino custar menos do que já foi pago, a
                sobra vai para a fila de estornos — ela não some nem fica com a
                casa sem registro.
              </Alerta>

              <div className="sni-form-rodape">
                <Botao type="submit" icone={<IconArrowsExchange size={18} className="ti" />}>
                  Transferir
                </Botao>
              </div>
            </form>
          )}
        </>
      )}
    </Painel>
  );
}
