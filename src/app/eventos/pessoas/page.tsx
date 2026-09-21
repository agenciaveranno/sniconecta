import Link from "next/link";
import { IconSearch, IconUsers } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import {
  Badge, Botao, Campo, Celula, Input, Linha, Metrica, Num, Recado, Tabela,
  Textarea, TituloPagina, TituloSecao, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { podeTrocarTitular } from "@/lib/dominio/titular";
import { podeTransferir } from "@/lib/dominio/transferencia";
import { dataBR } from "@/lib/dominio/data";
import { formatarCentavos } from "@/lib/dominio/dinheiro";
import {
  inscricoesDaPessoa, pessoaDoBalcao, procurarParticipante,
} from "@/modulos/eventos/consultas";
import { trocarTitular } from "@/modulos/eventos/acoes";

export const metadata = { title: "Pessoas" };

/** A etiqueta de situação, com a mesma cor em toda a tela. */
function Situacao({ status }: { status: string }) {
  if (status === "pago") return <Badge tom="success">Paga</Badge>;
  if (status === "pendente") return <Badge tom="warning">Pendente</Badge>;
  if (status === "cancelado") return <Badge tom="gray">Cancelada</Badge>;
  if (status === "transferido") return <Badge tom="info">Transferida</Badge>;
  return <Badge tom="gray">{status}</Badge>;
}

/**
 * A ficha do participante: tudo o que uma pessoa tem, em todos os eventos.
 *
 * ⚠️ Existe separada do check-in e do estorno porque responde outra pergunta.
 * Aquelas duas são de AÇÃO e olham um evento; esta é de CONSULTA e olha a
 * pessoa — é a que atende quem liga perguntando "o que eu comprei mesmo?".
 *
 * ⚠️ E é por isso que ela pede só `eventos.inscricoes.ver`: quem atende o
 * telefone não precisa poder vender nem estornar. Exigir a capacidade de venda
 * para consultar obrigaria a dar a quem atende um poder que ela não usa.
 *
 * ⚠️ Traz cancelada e expirada junto. São elas que explicam por que a pessoa
 * acha que tem inscrição e o sistema diz que não — esconder deixaria quem
 * atende sem resposta justamente no caso em que alguém reclama.
 */
export default async function PessoasPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; pessoa?: string; erro?: string; ok?: string }>;
}) {
  const eu = await exigirCapacidadeNaPagina("eventos.inscricoes.ver");
  // ⚠️ Ver e MEXER são capacidades diferentes. Quem atende o telefone consulta;
  // passar ingresso de uma pessoa para outra é outra conversa, e a tela não
  // oferece o botão a quem não pode — nem o servidor aceita, que é onde a
  // regra vale de verdade.
  const podeGerir = Boolean(eu?.pode("eventos.inscricoes.gerir"));
  const { busca, pessoa: pessoaParam, erro, ok } = await searchParams;

  const [pessoa, achadas] = await Promise.all([
    pessoaParam ? pessoaDoBalcao(pessoaParam) : Promise.resolve(null),
    busca?.trim() && !pessoaParam ? procurarParticipante(busca) : Promise.resolve([]),
  ]);

  const inscricoes = pessoa ? await inscricoesDaPessoa(pessoa.id) : [];

  const base = "/eventos/pessoas";
  const pagas = inscricoes.filter((i) => i.status === "pago");
  const pago = pagas.reduce(
    (s, i) =>
      s + (i.tipo_venda === "cortesia" ? 0 : i.valor_original_centavos - i.desconto_centavos),
    0
  );
  const entrou = inscricoes.filter((i) => i.checkin_legivel).length;

  return (
    <Painel titulo="Pessoas">
      <TituloPagina
        titulo="Pessoas"
        descricao="O que cada pessoa tem, em todos os eventos. Só consulta."
      />

      <Recado erro={erro} ok={ok} />

      {!pessoa ? (
        <>
          <form method="get" action={base} className="sni-form">
            <Campo label="Quem" dica="CPF, passaporte ou nome.">
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
              <Vazio icone={<IconUsers size={34} className="ti" />} titulo="Ninguém encontrado">
                Confira o documento. Quem nunca se inscreveu nem foi importado
                não está no cadastro.
              </Vazio>
            ) : (
              <Tabela cabecalho={["Pessoa", "Documento", "Inscrições", ""]}>
                {achadas.map((p) => (
                  <Linha key={p.id}>
                    <Celula forte>{p.nome}</Celula>
                    <Celula dado>{p.cpf ?? p.passaporte ?? "—"}</Celula>
                    <Celula dado>
                      {/* ⚠️ A contagem distingue a Maria que veio a três
                          eventos da Maria que nunca se inscreveu. Sem ela, o
                          operador abre uma por uma até achar. */}
                      <Num>{p.inscricoes}</Num>
                    </Celula>
                    <Celula alinhar="right">
                      <Link href={`${base}?pessoa=${p.id}`} className="sni-acao">
                        Abrir ficha
                      </Link>
                    </Celula>
                  </Linha>
                ))}
              </Tabela>
            ))}
        </>
      ) : (
        <>
          <TituloSecao acao={<Link href={base} className="sni-acao">Procurar outra</Link>}>
            {pessoa.nome}
          </TituloSecao>

          <p className="hint">
            <span className="num">{pessoa.cpf ?? pessoa.passaporte ?? "sem documento"}</span>
            {pessoa.email && <> · {pessoa.email}</>}
          </p>

          <div className="form-grid">
            <Metrica rotulo="Inscrições pagas" valor={pagas.length} />
            <Metrica rotulo="Já pagou" valor={formatarCentavos(pago)} tom="success" />
            <Metrica rotulo="Entrou em" valor={entrou} detalhe="eventos" />
          </div>

          {inscricoes.length === 0 ? (
            <Vazio icone={<IconUsers size={34} className="ti" />} titulo="Nenhuma inscrição">
              Esta pessoa está no cadastro, mas nunca se inscreveu em evento
              nenhum.
            </Vazio>
          ) : (
            <Tabela cabecalho={["Evento", "Ingresso", "Pagou", "Situação", "Entrada", ""]}>
              {inscricoes.map((i) => (
                <Linha key={i.id}>
                  <Celula forte>
                    {i.evento}
                    <br />
                    <span className="hint">{dataBR(i.data_inicial)}</span>
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
                  <Celula dado>
                    {i.tipo_venda === "cortesia" ? (
                      <span className="hint">—</span>
                    ) : (
                      formatarCentavos(i.valor_original_centavos - i.desconto_centavos)
                    )}
                    {i.desconto_centavos > 0 && (
                      <>
                        <br />
                        {/* Diz de ONDE veio o desconto. Um valor menor sem
                            explicação vira reclamação de cobrança errada. */}
                        <span className="hint">
                          {i.cupom ? `cupom ${i.cupom}` : "desconto"} −
                          {formatarCentavos(i.desconto_centavos)}
                        </span>
                      </>
                    )}
                  </Celula>
                  <Celula>
                    <Situacao status={i.status} />
                    {i.estorno_status === "pendente" && (
                      <>
                        {" "}
                        <Badge tom="warning">Estorno na fila</Badge>
                      </>
                    )}
                    {i.estorno_status === "feito" && (
                      <>
                        {" "}
                        <Badge tom="info">Estornada</Badge>
                      </>
                    )}
                    {i.cancelamento_motivo && (
                      <>
                        <br />
                        <span className="hint">{i.cancelamento_motivo}</span>
                      </>
                    )}
                    {/* ⚠️ Quem era titular antes não some. Sem isto, a pessoa
                        que comprou desaparece do evento em que pagou. */}
                    {i.titular_anterior && (
                      <>
                        <br />
                        <span className="hint">
                          recebido de {i.titular_anterior}
                          {i.titular_troca_motivo && ` — ${i.titular_troca_motivo}`}
                        </span>
                      </>
                    )}
                  </Celula>
                  <Celula dado>
                    {i.checkin_legivel ?? <span className="hint">—</span>}
                  </Celula>
                  <Celula alinhar="right">
                    {/* ⚠️ O comprovante aparece para QUALQUER situação, não
                        só para a paga: quem vem reclamar traz a inscrição
                        cancelada, e o papel é o que a conversa precisa ter na
                        mesa. Quem diz que ela não vale é o próprio
                        comprovante, com faixa no papel. */}
                    <Link
                      href={`/eventos/comprovante/${i.id}`}
                      className="sni-acao"
                    >
                      Comprovante
                    </Link>{" "}
                    {/* ⚠️ Transferir é LINK, não modal: o ingresso de destino
                        depende do evento de destino, e um modal estático não
                        recarrega a lista quando o evento muda. A tela própria
                        faz isso em três passos de URL. */}
                    {podeGerir &&
                      podeTransferir({
                        status: i.status,
                        tipoVenda: i.tipo_venda,
                        valorOriginalCentavos: i.valor_original_centavos,
                        descontoCentavos: i.desconto_centavos,
                        checkinEm: i.checkin_em,
                        eventoId: i.evento_id,
                      }).pode && (
                        <>
                          <Link
                            href={`/eventos/transferir?inscricao=${i.id}`}
                            className="sni-acao"
                          >
                            Outro evento
                          </Link>{" "}
                        </>
                      )}
                    {podeGerir &&
                      podeTrocarTitular(
                        {
                          status: i.status,
                          checkinEm: i.checkin_em,
                          pessoaId: pessoa.id,
                          ingressoTipoId: null,
                          unicoPorCpf: Boolean(i.unico_por_cpf),
                        },
                        { id: "", jaTemDestesTipos: [] }
                      ).pode && (
                        <ModalCadastro
                          gatilho="link"
                          rotulo="Passar adiante"
                          titulo={`Passar ${i.ingresso ?? "o ingresso"} para outra pessoa`}
                          descricao={`${i.evento}. O valor pago não se mexe — ninguém devolve nem cobra de novo.`}
                          acao={trocarTitular}
                          rotuloConfirmar="Passar ingresso"
                        >
                          <input type="hidden" name="id" value={i.id} />
                          <input type="hidden" name="voltar_para" value={pessoa.id} />
                          <Campo
                            label="CPF ou passaporte de quem recebe"
                            obrigatorio
                            dica="A pessoa precisa já estar no cadastro."
                          >
                            <Input name="novo_titular" required maxLength={20} placeholder="000.000.000-00" />
                          </Campo>
                          <Campo
                            label="Motivo"
                            obrigatorio
                            dica="Fica no histórico dos dois — de quem passou e de quem recebeu."
                          >
                            <Textarea name="motivo" rows={2} required maxLength={300} />
                          </Campo>
                        </ModalCadastro>
                      )}
                  </Celula>
                </Linha>
              ))}
            </Tabela>
          )}
        </>
      )}
    </Painel>
  );
}
