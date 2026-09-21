import Link from "next/link";
import { IconSearch, IconShoppingCart, IconTicket } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import {
  Alerta, Badge, Botao, Campo, Celula, Input, Linha, Num, Recado, Select,
  Tabela, TituloPagina, TituloSecao, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { dataBR } from "@/lib/dominio/data";
import { formatarCentavos } from "@/lib/dominio/dinheiro";
import { porQueNaoVende } from "@/lib/dominio/ingressos";
import { FORMAS_BALCAO, ROTULO_FORMA } from "@/lib/dominio/venda";
import {
  combosParaVenda, eventosParaVenda, pessoaDoBalcao, procurarPessoaNoBalcao,
  tiposParaVenda, tiposQueAPessoaJaTem,
} from "@/modulos/eventos/consultas";
import { venderNoBalcao } from "@/modulos/eventos/acoes";

export const metadata = { title: "Venda balcão" };

/**
 * A venda no balcão, em três passos que são três estados da URL: escolher o
 * evento, achar quem está comprando, montar a compra.
 *
 * ⚠️ URL e não estado de componente, como nas abas (decisão 0019): o balcão
 * atende várias pessoas seguidas, e o operador precisa poder voltar, abrir
 * outra aba para o mesmo evento e mandar o endereço para o colega ao lado.
 *
 * ⚠️ A tela NÃO decide o que pode ser vendido. Ela mostra e recusa cedo; quem
 * decide é o servidor, dentro da transação, com as linhas do estoque travadas.
 * Uma tela que conferisse sozinha venderia dois lugares quando dois operadores
 * atendessem ao mesmo tempo.
 */
export default async function VendaPage({
  searchParams,
}: {
  searchParams: Promise<{
    evento?: string; pessoa?: string; busca?: string; erro?: string; ok?: string;
  }>;
}) {
  await exigirCapacidadeNaPagina("eventos.vender");
  const { evento: eventoParam, pessoa: pessoaParam, busca, erro, ok } = await searchParams;

  const eventoId = Number(eventoParam ?? 0);
  const eventos = await eventosParaVenda();
  const evento = eventos.find((e) => e.id === eventoId) ?? null;

  const [tipos, pessoa] = await Promise.all([
    evento ? tiposParaVenda(evento.id) : Promise.resolve([]),
    pessoaParam ? pessoaDoBalcao(pessoaParam) : Promise.resolve(null),
  ]);

  const impedimentos = evento
    ? porQueNaoVende({ temPromotor: evento.tem_promotor, ativo: true }, tipos)
    : [];

  const [achados, jaTem, combos] = await Promise.all([
    evento && busca?.trim() && !pessoa
      ? procurarPessoaNoBalcao(busca)
      : Promise.resolve([]),
    evento && pessoa ? tiposQueAPessoaJaTem(evento.id, pessoa.id) : Promise.resolve([]),
    // ⚠️ Os combos só são lidos quando já se sabe QUEM compra: metade do que a
    // consulta responde ("quantos esta pessoa já levou") não existe antes
    // disso, e carregá-los no passo do evento seria uma ida ao banco a mais em
    // toda abertura do balcão.
    evento && pessoa ? combosParaVenda(evento.id, pessoa.id) : Promise.resolve([]),
  ]);

  const base = "/eventos/venda";
  const vendaveis = tipos.filter((t) => t.ativo);

  // ⚠️ A tela esconde o combo inativo e o que não entrega nada; a CONFERÊNCIA
  // do servidor continua recusando os dois pelo nome. Esconder aqui é para não
  // oferecer o que não se vende — não é a regra, que mora em `conferirCombos`.
  const combosVendaveis = combos.filter((c) => c.ativo && c.itens.length > 0);

  return (
    <Painel titulo="Venda balcão">
      <TituloPagina
        titulo="Venda balcão"
        descricao="Para quem paga na hora, na frente do operador. Registra como pago — o dinheiro já está na mão."
      />

      <Recado erro={erro} ok={ok} />

      {/* ── Passo 1: o evento ── */}
      {!evento ? (
        eventos.length === 0 ? (
          <Vazio icone={<IconTicket size={34} className="ti" />} titulo="Nenhum evento ativo">
            A venda balcão abre a partir de um evento ativo. Cadastre ou reative
            um em Eventos e convites.
          </Vazio>
        ) : (
          <Tabela cabecalho={["Evento", "Quando", ""]}>
            {eventos.map((e) => (
              <Linha key={e.id}>
                <Celula forte>
                  {e.nome}
                  {!e.tem_promotor && (
                    <>
                      {" "}
                      <Badge tom="warning">Sem promotor</Badge>
                    </>
                  )}
                </Celula>
                <Celula dado>{dataBR(e.data_inicial)}</Celula>
                <Celula alinhar="right">
                  <Link href={`${base}?evento=${e.id}`} className="sni-acao">
                    Abrir balcão
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

          {impedimentos.length > 0 ? (
            <Alerta tipo="warning">
              <strong>Este evento não pode vender agora.</strong>
              <ul>
                {impedimentos.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </Alerta>
          ) : (
            <>
              {/* ── Passo 2: quem está comprando ── */}
              {!pessoa ? (
                <>
                  {/* ⚠️ GET, e não Server Action: procurar não muda nada, e o
                      termo na URL é o que deixa o operador voltar ao resultado
                      depois de abrir uma pessoa e desistir. */}
                  <form method="get" action={base} className="sni-form">
                    <input type="hidden" name="evento" value={evento.id} />
                    <Campo
                      label="Quem está comprando"
                      dica="CPF, passaporte ou nome. O CPF pode vir com ponto e traço."
                    >
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
                    (achados.length === 0 ? (
                      <Vazio icone={<IconSearch size={34} className="ti" />} titulo="Ninguém encontrado">
                        Confira o documento. Quem nunca se inscreveu ainda não
                        está no cadastro — cadastre em Pessoas e acesso e volte
                        aqui.
                      </Vazio>
                    ) : (
                      <Tabela cabecalho={["Pessoa", "Documento", ""]}>
                        {achados.map((p) => (
                          <Linha key={p.id}>
                            <Celula forte>{p.nome}</Celula>
                            <Celula dado>{p.cpf ?? p.passaporte ?? "—"}</Celula>
                            <Celula alinhar="right">
                              <Link
                                href={`${base}?evento=${evento.id}&pessoa=${p.id}`}
                                className="sni-acao"
                              >
                                Vender para esta pessoa
                              </Link>
                            </Celula>
                          </Linha>
                        ))}
                      </Tabela>
                    ))}
                </>
              ) : (
                /* ── Passo 3: a compra ── */
                <form action={venderNoBalcao} className="sni-form">
                  <input type="hidden" name="evento_id" value={evento.id} />
                  <input type="hidden" name="pessoa_id" value={pessoa.id} />

                  <TituloSecao
                    acao={
                      <Link href={`${base}?evento=${evento.id}`} className="sni-acao">
                        Trocar de pessoa
                      </Link>
                    }
                  >
                    {pessoa.nome}
                  </TituloSecao>

                  <Tabela cabecalho={["Ingresso", "Valor", "Disponível", "Quantidade"]}>
                    {vendaveis.map((t) => {
                      const bloqueado = jaTem.includes(t.id) && t.unico_por_cpf;
                      return (
                        <Linha key={t.id}>
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
                            {t.disponivel === null ? (
                              <span className="hint">Sem limite</span>
                            ) : (
                              <Num>{t.disponivel}</Num>
                            )}
                          </Celula>
                          <Celula>
                            {bloqueado ? (
                              // ⚠️ Diz POR QUE está bloqueado, em vez de só
                              // desabilitar o campo. Campo morto sem
                              // explicação faz o operador achar que a tela
                              // quebrou e tentar de novo.
                              <span className="hint">Já tem — um por pessoa</span>
                            ) : (
                              <Input
                                name={`qtd_${t.id}`}
                                type="number"
                                min={0}
                                max={t.unico_por_cpf ? 1 : (t.disponivel ?? undefined)}
                                defaultValue={0}
                                style={{ width: 90 }}
                              />
                            )}
                          </Celula>
                        </Linha>
                      );
                    })}
                  </Tabela>

                  {combosVendaveis.length > 0 && (
                    <>
                      <TituloSecao>Combos</TituloSecao>
                      <Tabela cabecalho={["Combo", "Entrega", "Preço", "Avulso", "Disponível", "Quantidade"]}>
                        {combosVendaveis.map((c) => {
                          const restam =
                            c.quantidade === null
                              ? null
                              : Math.max(c.quantidade - c.vendidos, 0);
                          const podeLevar =
                            c.limitePorPessoa === null
                              ? null
                              : Math.max(c.limitePorPessoa - c.levadosPorEsta, 0);
                          // ⚠️ Combo cadastrado por mais do que os ingressos
                          // custam separados é erro de centavos, e o servidor
                          // recusa. A tela diz isso ANTES, porque o operador
                          // não tem como adivinhar por que o combo some.
                          const caro = c.avulsoCentavos < c.valorCentavos;
                          const teto = Math.min(
                            restam ?? 99,
                            podeLevar ?? 99,
                            caro ? 0 : 99
                          );
                          return (
                            <Linha key={c.id}>
                              <Celula forte>
                                {c.nome}
                                {caro && (
                                  <>
                                    {" "}
                                    <Badge tom="danger">preço acima do avulso</Badge>
                                  </>
                                )}
                              </Celula>
                              <Celula>
                                {c.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(", ")}
                              </Celula>
                              <Celula dado>{formatarCentavos(c.valorCentavos)}</Celula>
                              <Celula dado>
                                <span className="hint">{formatarCentavos(c.avulsoCentavos)}</span>
                              </Celula>
                              <Celula dado>
                                {restam === null ? (
                                  <span className="hint">Sem limite</span>
                                ) : (
                                  <Num>{restam}</Num>
                                )}
                                {podeLevar !== null && (
                                  <span className="hint"> · {podeLevar} para esta pessoa</span>
                                )}
                              </Celula>
                              <Celula>
                                {teto === 0 ? (
                                  // Diz POR QUE está fora, em vez de um campo
                                  // morto sem explicação.
                                  <span className="hint">
                                    {caro
                                      ? "Corrija o preço"
                                      : restam === 0
                                        ? "Esgotado"
                                        : "Limite desta pessoa"}
                                  </span>
                                ) : (
                                  <Input
                                    name={`combo_${c.id}`}
                                    type="number"
                                    min={0}
                                    max={teto}
                                    defaultValue={0}
                                    style={{ width: 90 }}
                                  />
                                )}
                              </Celula>
                            </Linha>
                          );
                        })}
                      </Tabela>
                    </>
                  )}

                  {/* ⚠️ O cupom é conferido no SERVIDOR, dentro da mesma
                      transação do estoque: os limites de uso são disputados do
                      mesmo jeito, e duas vendas simultâneas com o último uso
                      leriam as duas "resta 1" se a conta ficasse na tela. */}
                  <Campo
                    label="Cupom"
                    dica={
                      combosVendaveis.length > 0
                        ? "Opcional. Não distingue maiúscula de minúscula. Não incide sobre combo, que já é preço fechado."
                        : "Opcional. Não distingue maiúscula de minúscula."
                    }
                  >
                    <Input name="cupom" maxLength={40} placeholder="VERAO10" />
                  </Campo>

                  <Campo label="Forma de pagamento" obrigatorio>
                    <Select name="forma" defaultValue="dinheiro" required>
                      {FORMAS_BALCAO.map((f) => (
                        <option key={f} value={f}>
                          {ROTULO_FORMA[f]}
                        </option>
                      ))}
                    </Select>
                  </Campo>

                  <Campo
                    label="Observação"
                    dica="Fica no registro da inscrição. Em cortesia, vira o motivo."
                  >
                    <Input name="observacao" maxLength={300} />
                  </Campo>

                  <div className="sni-form-rodape">
                    <Botao type="submit" icone={<IconShoppingCart size={18} className="ti" />}>
                      Registrar venda
                    </Botao>
                  </div>
                </form>
              )}
            </>
          )}
        </>
      )}
    </Painel>
  );
}
