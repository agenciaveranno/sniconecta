import { IconReceiptRefund, IconSearch } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import {
  Badge, Botao, Campo, Celula, Input, Linha, Recado, Select, Tabela,
  TituloPagina, TituloSecao, Textarea, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { formatarCentavos } from "@/lib/dominio/dinheiro";
import { podeCancelar, valorAEstornar, valorNaFila } from "@/lib/dominio/estorno";
import { FORMAS_BALCAO, ROTULO_FORMA } from "@/lib/dominio/venda";
import { estornosPendentes, inscricoesParaCancelar } from "@/modulos/eventos/consultas";
import { cancelarInscricao, resolverEstorno } from "@/modulos/eventos/acoes";

export const metadata = { title: "Estornos" };

/**
 * O dinheiro de volta.
 *
 * Duas coisas na mesma tela porque são o mesmo assunto visto de dois lados:
 * em cima, a FILA da tesouraria — o que já foi cancelado e deve dinheiro a
 * alguém. Embaixo, de onde a fila nasce: cancelar uma inscrição.
 *
 * ⚠️ Cancelar NÃO devolve dinheiro. Abre uma pendência para alguém resolver
 * com comprovante. Quem opera o balcão não é quem faz a devolução, e dar baixa
 * nas duas coisas de uma vez faria o sistema afirmar um pagamento que ninguém
 * fez.
 */
export default async function EstornosPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; erro?: string; ok?: string }>;
}) {
  await exigirCapacidadeNaPagina("eventos.estornos.gerir");
  const { busca, erro, ok } = await searchParams;

  const [fila, achadas] = await Promise.all([
    estornosPendentes(),
    busca?.trim() ? inscricoesParaCancelar(busca) : Promise.resolve([]),
  ]);

  return (
    <Painel titulo="Estornos">
      <TituloPagina
        titulo="Estornos"
        descricao="O que foi cancelado e deve dinheiro. Cancelar abre a pendência; a baixa é dada aqui, com comprovante."
      />

      <Recado erro={erro} ok={ok} />

      <TituloSecao>Na fila da tesouraria</TituloSecao>
      {fila.length === 0 ? (
        <Vazio icone={<IconReceiptRefund size={34} className="ti" />} titulo="Nenhum estorno pendente">
          Nada a devolver no momento. Cancelamentos com valor pago entram aqui
          automaticamente.
        </Vazio>
      ) : (
        <Tabela cabecalho={["Pessoa", "Evento", "Ingresso", "A devolver", "Cancelada em", ""]}>
          {fila.map((e) => {
            // ⚠️ O valor REGISTRADO quando o estorno abriu, não um recálculo.
            // Recalcular vale enquanto a devolução for "tudo o que a pessoa
            // pagou"; a transferência para um ingresso mais barato devolve só
            // a sobra, e o recálculo ofereceria à tesouraria o ingresso todo.
            const devolver = valorNaFila({
              tipoVenda: e.tipo_venda,
              valorOriginalCentavos: e.valor_original_centavos,
              descontoCentavos: e.desconto_centavos,
              estorno: e.estorno,
            });
            return (
              <Linha key={e.id}>
                <Celula forte>
                  {e.pessoa_nome}
                  <br />
                  <span className="hint num">{e.documento ?? "—"}</span>
                </Celula>
                <Celula>{e.evento}</Celula>
                <Celula>{e.ingresso ?? "—"}</Celula>
                <Celula dado>{formatarCentavos(devolver)}</Celula>
                <Celula dado>
                  {e.cancelado_legivel ?? "—"}
                  {e.cancelamento_motivo && (
                    <>
                      <br />
                      <span className="hint">{e.cancelamento_motivo}</span>
                    </>
                  )}
                </Celula>
                <Celula alinhar="right">
                  <ModalCadastro
                    gatilho="link"
                    rotulo="Dar baixa"
                    titulo={`Estorno de ${e.pessoa_nome}`}
                    descricao={`${formatarCentavos(devolver)} — ${e.evento}`}
                    acao={resolverEstorno}
                    rotuloConfirmar="Registrar"
                  >
                    <input type="hidden" name="id" value={e.id} />
                    <Campo label="O que aconteceu" obrigatorio>
                      <Select name="situacao" defaultValue="feito" required>
                        <option value="feito">Devolvido</option>
                        <option value="recusado">Recusado</option>
                      </Select>
                    </Campo>
                    <Campo label="Por onde devolveu">
                      <Select name="forma" defaultValue="">
                        <option value="">Não informada</option>
                        {FORMAS_BALCAO.filter((f) => f !== "cortesia").map((f) => (
                          <option key={f} value={f}>
                            {ROTULO_FORMA[f]}
                          </option>
                        ))}
                      </Select>
                    </Campo>
                    {/* ⚠️ Obrigatório quando devolvido: sem comprovante a fila
                        esvazia sem ninguém conseguir provar, meses depois, que
                        a devolução aconteceu. */}
                    <Campo
                      label="Comprovante"
                      dica="Número da transação, do PIX ou do recibo. Obrigatório quando devolvido."
                    >
                      <Input name="comprovante" maxLength={200} />
                    </Campo>
                    <Campo label="Observação" dica="Obrigatória quando recusado: diga por quê.">
                      <Textarea name="observacao" rows={2} maxLength={500} />
                    </Campo>
                  </ModalCadastro>
                </Celula>
              </Linha>
            );
          })}
        </Tabela>
      )}

      <TituloSecao>Cancelar uma inscrição</TituloSecao>

      {/* ⚠️ Procura em TODOS os eventos: quem pede cancelamento diz o nome, não
          o evento. Obrigar a escolher o evento antes faria o operador adivinhar
          em qual deles a pessoa se inscreveu. */}
      <form method="get" action="/eventos/estornos" className="sni-form">
        <Campo label="De quem" dica="CPF, passaporte ou nome.">
          <Input
            name="busca"
            defaultValue={busca ?? ""}
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
            Ninguém com esse documento ou nome tem inscrição em evento nenhum.
          </Vazio>
        ) : (
          <Tabela cabecalho={["Pessoa", "Evento", "Ingresso", "Situação", ""]}>
            {achadas.map((i) => {
              const veredito = podeCancelar({
                status: i.status,
                tipoVenda: i.tipo_venda,
                valorOriginalCentavos: i.valor_original_centavos,
                descontoCentavos: i.desconto_centavos,
                checkinEm: i.checkin_em,
              });
              const devolveria = valorAEstornar({
                status: i.status,
                tipoVenda: i.tipo_venda,
                valorOriginalCentavos: i.valor_original_centavos,
                descontoCentavos: i.desconto_centavos,
                checkinEm: i.checkin_em,
              });
              return (
                <Linha key={i.id}>
                  <Celula forte>
                    {i.pessoa_nome}
                    <br />
                    <span className="hint num">{i.documento ?? "—"}</span>
                  </Celula>
                  <Celula>{i.evento}</Celula>
                  <Celula>{i.ingresso ?? "—"}</Celula>
                  <Celula>
                    {i.status === "cancelado" ? (
                      <Badge tom="gray">Cancelada</Badge>
                    ) : i.status === "pago" ? (
                      <Badge tom="success">Paga</Badge>
                    ) : (
                      <Badge tom="warning">{i.status}</Badge>
                    )}
                    {i.estorno_status === "pendente" && (
                      <>
                        {" "}
                        <Badge tom="warning">Estorno na fila</Badge>
                      </>
                    )}
                  </Celula>
                  <Celula alinhar="right">
                    {veredito.pode ? (
                      <ModalCadastro
                        gatilho="link"
                        rotulo="Cancelar"
                        titulo={`Cancelar inscrição de ${i.pessoa_nome}`}
                        descricao={
                          devolveria > 0
                            ? `Isto abre um estorno de ${formatarCentavos(devolveria)} na fila da tesouraria.`
                            : "Não há valor pago a devolver."
                        }
                        acao={cancelarInscricao}
                        rotuloConfirmar="Cancelar inscrição"
                        variante="danger"
                      >
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="busca" value={busca} />
                        <Campo
                          label="Motivo"
                          obrigatorio
                          dica="Fica no histórico da pessoa. Quem abrir a ficha dela daqui a um ano lê isto."
                        >
                          <Textarea name="motivo" rows={2} required maxLength={500} />
                        </Campo>
                      </ModalCadastro>
                    ) : (
                      // A frase inteira: é ela que diz ao operador o que fazer,
                      // inclusive que existe um "desfazer check-in" em outra tela.
                      <span className="hint">{veredito.motivo}</span>
                    )}
                  </Celula>
                </Linha>
              );
            })}
          </Tabela>
        ))}
    </Painel>
  );
}
