import { notFound } from "next/navigation";
import {
  IconDiscount2, IconFileInvoice, IconId, IconHelpCircle, IconPackage,
  IconPlus, IconTicket, IconUsersGroup,
} from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import {
  Abas, Alerta, Badge, Botao, BotaoLink, Campo, Celula, Etiqueta, Input, Linha,
  Num, Recado, Tabela, Textarea, TituloPagina, TituloSecao, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { formatarCentavos } from "@/lib/dominio/dinheiro";
import { porQueNaoVende } from "@/lib/dominio/ingressos";
import { descreverCupom } from "@/lib/dominio/cupom";
import { BLOCOS_DO_COMPROVANTE } from "@/lib/dominio/comprovante";
import { ROTULO_TIPO } from "@/lib/dominio/campos";
import {
  catalogoDaComissao, combosDoEvento, comissaoDoEvento, cuponsDoEvento,
  marcaDoComprovante, perguntasDoEvento,
  eventoDaPagina, locaisAtivos, opcoesDePromotor, tiposDeIngresso, tiposParaCupom,
} from "@/modulos/eventos/consultas";
import {
  adicionarMembroComissao, alternarComboAtivo, alternarCupomAtivo,
  alternarTipoIngressoAtivo, criarCombo, criarCupom, criarTipoIngresso,
  editarCombo, editarCupom, editarEvento, editarMembroComissao,
  editarTipoIngresso, removerMembroComissao, salvarMarcaDoComprovante,
  alternarPerguntaAtiva, criarPergunta, editarPergunta,
} from "@/modulos/eventos/acoes";
import CamposEvento from "../CamposEvento";
import CamposIngresso from "../CamposIngresso";
import CamposCupom from "../CamposCupom";
import CamposMembro from "../CamposMembro";
import CamposCombo from "../CamposCombo";
import CamposPergunta from "../CamposPergunta";

/**
 * O evento por dentro (decisão 0020).
 *
 * A lista continua sendo onde o evento NASCE, em modal — cadastrar três
 * seguidos não pode obrigar a navegar e voltar três vezes. Editar é que virou
 * dossiê: o evento tem hoje quatro assuntos que não se parecem (o cadastro, os
 * tipos de ingresso, os campos que a compra pergunta e a comissão), e o
 * voucher sozinho traz nove campos com upload de imagem.
 *
 * ⚠️ Sem tipo de ingresso o evento NÃO VENDE, e até esta tela existir não havia
 * como criar um pela plataforma — só pela carga, vindos do sistema antigo. É a
 * peça que faltava para um evento nascer inteiro aqui.
 */

export const metadata = { title: "Evento" };

export default async function EventoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; erro?: string; ok?: string }>;
}) {
  await exigirCapacidadeNaPagina("eventos.gerir");

  const { id } = await params;
  const { aba = "dados", erro, ok } = await searchParams;

  // ⚠️ Id inteiro: `eventos.eventos.id` é `integer`, e um "abc" na URL viraria
  // NaN no parâmetro da consulta. 404 é a resposta honesta para um endereço
  // que não nomeia evento nenhum.
  const eventoId = Number(id);
  if (!Number.isInteger(eventoId) || eventoId <= 0) notFound();

  // As quatro juntas: nenhuma depende do resultado das outras.
  const [evento, tipos, locais, promotores, cupons, tiposDoCupom] = await Promise.all([
    eventoDaPagina(eventoId),
    tiposDeIngresso(eventoId),
    locaisAtivos(),
    opcoesDePromotor(),
    cuponsDoEvento(eventoId),
    tiposParaCupom(eventoId),
  ]);

  // ⚠️ Lidas só nesta aba: a comissão não interessa a quem veio mexer no preço
  // do ingresso, e são duas idas a mais ao banco em toda abertura da página.
  const [comissao, catalogo] =
    aba === "comissao"
      ? await Promise.all([comissaoDoEvento(eventoId), catalogoDaComissao()])
      : [[], { setores: [], funcoes: [] }];

  // Mesma razão: os combos são duas consultas que só esta aba usa.
  const combos = aba === "combos" ? await combosDoEvento(eventoId) : [];
  const marca = aba === "comprovante" ? await marcaDoComprovante(eventoId) : null;
  const perguntas = aba === "perguntas" ? await perguntasDoEvento(eventoId) : [];

  if (!evento) notFound();

  const base = `/eventos/admin/${eventoId}`;

  // ⚠️ A regra é de DOMÍNIO, não desta tela: a venda balcão e a página pública
  // vão fazer a mesma pergunta, e escrita em cada uma elas divergem na primeira
  // correção — o jeito que isso aparece é o balcão vendendo o que o site
  // recusa. A tela avisa aqui, e não no balcão, onde quem está com a fila na
  // frente não tem como resolver.
  const impedimentos = porQueNaoVende(
    { temPromotor: Boolean(evento.promotor_nome), ativo: evento.ativo },
    tipos
  );

  return (
    <Painel titulo={evento.nome}>
      <TituloPagina voltar={{ href: "/eventos/admin", texto: "Todos os eventos" }} />

      <Recado erro={erro} ok={ok} />

      <Abas
        atual={aba}
        abas={[
          {
            chave: "dados",
            rotulo: "Dados do evento",
            href: base,
            icone: <IconId size={17} className="ti" />,
          },
          {
            chave: "ingressos",
            rotulo: "Ingressos",
            href: `${base}?aba=ingressos`,
            contagem: tipos.length,
            icone: <IconTicket size={17} className="ti" />,
          },
          {
            chave: "cupons",
            rotulo: "Cupons",
            href: `${base}?aba=cupons`,
            contagem: cupons.length,
            icone: <IconDiscount2 size={17} className="ti" />,
          },
          {
            chave: "combos",
            rotulo: "Combos",
            href: `${base}?aba=combos`,
            icone: <IconPackage size={17} className="ti" />,
          },
          {
            chave: "perguntas",
            rotulo: "Perguntas",
            href: `${base}?aba=perguntas`,
            icone: <IconHelpCircle size={17} className="ti" />,
          },
          {
            chave: "comprovante",
            rotulo: "Comprovante",
            href: `${base}?aba=comprovante`,
            icone: <IconFileInvoice size={17} className="ti" />,
          },
          {
            chave: "comissao",
            rotulo: "Comissão",
            href: `${base}?aba=comissao`,
            icone: <IconUsersGroup size={17} className="ti" />,
          },
        ]}
      />

      {aba === "dados" && (
        <form action={editarEvento} className="sni-form">
          <CamposEvento evento={evento} locais={locais} promotores={promotores} />
          <div className="sni-form-rodape">
            <BotaoLink href="/eventos/admin" variante="secondary">
              Cancelar
            </BotaoLink>
            <Botao type="submit">Salvar</Botao>
          </div>
        </form>
      )}

      {aba === "ingressos" && (
        <>
          {impedimentos.length > 0 && (
            <Alerta tipo="warning">
              <strong>Este evento ainda não vende.</strong>
              <ul>
                {impedimentos.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </Alerta>
          )}

          {/* A ação da seção vive ao lado do título dela — `TituloSecao`, e não
              um segundo `TituloPagina`: a página já tem o seu, e dois <h1>
              deixam quem navega por títulos sem saber onde está. */}
          <TituloSecao
            acao={
              <ModalCadastro
                rotulo="Novo tipo de ingresso"
                icone={<IconPlus size={18} className="ti" />}
                titulo="Novo tipo de ingresso"
                acao={criarTipoIngresso}
                rotuloConfirmar="Cadastrar"
                largura="lg"
              >
                <CamposIngresso eventoId={eventoId} />
              </ModalCadastro>
            }
          >
            Tipos de ingresso
          </TituloSecao>

          {tipos.length === 0 ? (
            <Vazio icone={<IconTicket size={34} className="ti" />} titulo="Nenhum tipo de ingresso">
              É o tipo de ingresso que diz o que se compra, por quanto e em
              quantas vezes. Sem pelo menos um principal, este evento não vende.
            </Vazio>
          ) : (
            <Tabela cabecalho={["Ingresso", "Valor", "Disponível", "Vendidos", "Situação", ""]}>
              {tipos.map((t) => (
                <Linha key={t.id}>
                  <Celula forte>
                    {t.nome}
                    {t.papel === "adicional" && (
                      <>
                        {" "}
                        <Badge tom="gray">Adicional</Badge>
                      </>
                    )}
                    {!t.exibir_venda_publica && (
                      <>
                        {" "}
                        <Badge tom="outline">Só balcão</Badge>
                      </>
                    )}
                  </Celula>
                  <Celula dado>{formatarCentavos(t.valor_centavos)}</Celula>
                  <Celula dado>
                    {/* ⚠️ Nulo e zero dizem coisas diferentes: sem limite não é
                        esgotado. Mostrar "0" para os dois faria a Sede procurar
                        um estoque que nunca existiu. */}
                    {t.quantidade === null ? (
                      <span className="hint">Sem limite</span>
                    ) : (
                      <Num>{t.quantidade}</Num>
                    )}
                  </Celula>
                  <Celula dado>
                    <Num>{t.vendidos}</Num>
                  </Celula>
                  <Celula>
                    <Etiqueta ativo={t.ativo} />
                  </Celula>
                  <Celula alinhar="right">
                    <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
                      <ModalCadastro
                        gatilho="link"
                        rotulo="Editar"
                        titulo={`Editar ${t.nome}`}
                        acao={editarTipoIngresso}
                        largura="lg"
                      >
                        <CamposIngresso eventoId={eventoId} tipo={t} />
                      </ModalCadastro>
                      <form action={alternarTipoIngressoAtivo}>
                        <input type="hidden" name="evento_id" value={eventoId} />
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="ativo" value={String(t.ativo)} />
                        <button type="submit" className="sni-acao">
                          {t.ativo ? "Desativar" : "Reativar"}
                        </button>
                      </form>
                    </span>
                  </Celula>
                </Linha>
              ))}
            </Tabela>
          )}
        </>
      )}

      {aba === "cupons" && (
        <>
          <TituloSecao
            acao={
              <ModalCadastro
                rotulo="Novo cupom"
                icone={<IconPlus size={18} className="ti" />}
                titulo="Novo cupom"
                acao={criarCupom}
                rotuloConfirmar="Cadastrar"
                largura="lg"
              >
                <CamposCupom eventoId={eventoId} tipos={tiposDoCupom} />
              </ModalCadastro>
            }
          >
            Cupons de desconto
          </TituloSecao>

          {cupons.length === 0 ? (
            <Vazio icone={<IconDiscount2 size={34} className="ti" />} titulo="Nenhum cupom">
              Cupom desconta na venda balcão e, quando o checkout público
              entrar, também nele. Preso a um ingresso, desconta só ele.
            </Vazio>
          ) : (
            <Tabela cabecalho={["Código", "Desconto", "Vale para", "Usos", "Situação", ""]}>
              {cupons.map((c) => (
                <Linha key={c.id}>
                  <Celula forte>
                    <span className="num">{c.codigo}</span>
                    {c.descricao && (
                      <>
                        <br />
                        <span className="hint">{c.descricao}</span>
                      </>
                    )}
                  </Celula>
                  <Celula dado>{descreverCupom(c)}</Celula>
                  <Celula>
                    {c.ingresso_tipo_nome ?? <span className="hint">Qualquer ingresso</span>}
                  </Celula>
                  <Celula dado>
                    {/* ⚠️ Conta inscrição NÃO cancelada. Contar tudo faria um
                        cupom de cem usos esgotar com noventa cancelamentos, e
                        ninguém entenderia por quê. */}
                    <Num>{c.usos}</Num>
                    {c.max_usos_total !== null && (
                      <span className="hint"> de {c.max_usos_total}</span>
                    )}
                  </Celula>
                  <Celula>
                    <Etiqueta ativo={c.ativo} />
                  </Celula>
                  <Celula alinhar="right">
                    <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
                      <ModalCadastro
                        gatilho="link"
                        rotulo="Editar"
                        titulo={`Editar ${c.codigo}`}
                        acao={editarCupom}
                        largura="lg"
                      >
                        <CamposCupom eventoId={eventoId} cupom={c} tipos={tiposDoCupom} />
                      </ModalCadastro>
                      <form action={alternarCupomAtivo}>
                        <input type="hidden" name="evento_id" value={eventoId} />
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="ativo" value={String(c.ativo)} />
                        <button type="submit" className="sni-acao">
                          {c.ativo ? "Desativar" : "Reativar"}
                        </button>
                      </form>
                    </span>
                  </Celula>
                </Linha>
              ))}
            </Tabela>
          )}
        </>
      )}

      {aba === "comissao" && (
        <>
          <TituloSecao
            acao={
              <ModalCadastro
                rotulo="Incluir na comissão"
                icone={<IconPlus size={18} className="ti" />}
                titulo="Incluir na comissão"
                acao={adicionarMembroComissao}
                rotuloConfirmar="Incluir"
              >
                <CamposMembro eventoId={eventoId} catalogo={catalogo} />
              </ModalCadastro>
            }
          >
            Quem trabalha neste evento
          </TituloSecao>

          {comissao.length === 0 ? (
            <Vazio icone={<IconUsersGroup size={34} className="ti" />} titulo="Comissão vazia">
              Ninguém registrado para trabalhar neste evento. O nome basta — o
              vínculo com o cadastro pode vir depois.
            </Vazio>
          ) : (
            <Tabela cabecalho={["Pessoa", "Setor", "Função", "Cadastro", ""]}>
              {comissao.map((m) => (
                <Linha key={m.id}>
                  <Celula forte>{m.nome}</Celula>
                  <Celula>
                    {m.setor ?? <span className="hint">—</span>}
                    {/* ⚠️ Diz o que ainda NÃO casa com o catálogo. A origem
                        gravava texto solto, e o esquema deixou setor e função
                        como texto justamente porque conciliar é trabalho de
                        tela. Sem esta marca, a tela fingiria que está tudo
                        conciliado e o trabalho nunca apareceria. */}
                    {m.setor && !m.setor_conhecido && (
                      <>
                        {" "}
                        <Badge tom="warning">fora do catálogo</Badge>
                      </>
                    )}
                  </Celula>
                  <Celula>
                    {m.funcao ?? <span className="hint">—</span>}
                    {m.funcao && !m.funcao_conhecida && (
                      <>
                        {" "}
                        <Badge tom="warning">fora do catálogo</Badge>
                      </>
                    )}
                  </Celula>
                  <Celula dado>
                    {m.pessoa_nome ? (
                      <span className="num">{m.documento ?? "vinculado"}</span>
                    ) : (
                      <Badge tom="gray">só o nome</Badge>
                    )}
                  </Celula>
                  <Celula alinhar="right">
                    <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
                      <ModalCadastro
                        gatilho="link"
                        rotulo="Editar"
                        titulo={`Editar ${m.nome}`}
                        acao={editarMembroComissao}
                      >
                        <CamposMembro eventoId={eventoId} membro={m} catalogo={catalogo} />
                      </ModalCadastro>
                      <form action={removerMembroComissao}>
                        <input type="hidden" name="evento_id" value={eventoId} />
                        <input type="hidden" name="id" value={m.id} />
                        <button type="submit" className="sni-acao">
                          Tirar
                        </button>
                      </form>
                    </span>
                  </Celula>
                </Linha>
              ))}
            </Tabela>
          )}
        </>
      )}

      {aba === "perguntas" && (
        <>
          <TituloSecao
            acao={
              tipos.length === 0 ? undefined : (
                <ModalCadastro
                  rotulo="Nova pergunta"
                  icone={<IconPlus size={18} className="ti" />}
                  titulo="Nova pergunta"
                  acao={criarPergunta}
                  rotuloConfirmar="Cadastrar"
                  largura="lg"
                >
                  <CamposPergunta eventoId={eventoId} tipos={tipos} />
                </ModalCadastro>
              )
            }
          >
            Perguntas da compra
          </TituloSecao>

          <p className="hint" style={{ maxWidth: "68ch" }}>
            O que o evento precisa saber e a inscrição não tem: tamanho de
            camiseta, restrição alimentar, ponto de embarque. Cada pergunta
            pertence a um tipo de ingresso.
          </p>

          {tipos.length === 0 ? (
            <Vazio icone={<IconHelpCircle size={34} className="ti" />} titulo="Cadastre ingressos primeiro">
              A pergunta pertence a um tipo de ingresso — comece pela aba
              Ingressos.
            </Vazio>
          ) : perguntas.length === 0 ? (
            <Vazio icone={<IconHelpCircle size={34} className="ti" />} titulo="Nenhuma pergunta">
              Sem perguntas, a inscrição guarda só quem é a pessoa e qual o
              ingresso.
            </Vazio>
          ) : (
            <Tabela
              cabecalho={["Pergunta", "Ingresso", "Tipo", "Respostas", "Situação", ""]}
            >
              {perguntas.map((p) => (
                <Linha key={p.id}>
                  <Celula forte>
                    {p.rotulo}
                    {p.obrigatorio && (
                      <>
                        {" "}
                        <Badge tom="warning">obrigatória</Badge>
                      </>
                    )}
                    {p.opcoes && p.opcoes.length > 0 && (
                      <>
                        <br />
                        <span className="hint">{p.opcoes.join(" · ")}</span>
                      </>
                    )}
                  </Celula>
                  <Celula>{p.ingresso}</Celula>
                  <Celula>{ROTULO_TIPO[p.tipo]}</Celula>
                  <Celula dado>
                    {/* ⚠️ Desativar uma pergunta já respondida é decisão
                        diferente de desativar uma que ninguém respondeu. O
                        número aparece ANTES, não depois. */}
                    <Num>{p.respostas}</Num>
                  </Celula>
                  <Celula>
                    <Etiqueta ativo={p.ativo} />
                  </Celula>
                  <Celula alinhar="right">
                    <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
                      <ModalCadastro
                        gatilho="link"
                        rotulo="Editar"
                        titulo={`Editar “${p.rotulo}”`}
                        acao={editarPergunta}
                        largura="lg"
                      >
                        <CamposPergunta eventoId={eventoId} pergunta={p} tipos={tipos} />
                      </ModalCadastro>
                      <form action={alternarPerguntaAtiva}>
                        <input type="hidden" name="evento_id" value={eventoId} />
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="ativo" value={String(p.ativo)} />
                        <button type="submit" className="sni-acao">
                          {p.ativo ? "Desativar" : "Reativar"}
                        </button>
                      </form>
                    </span>
                  </Celula>
                </Linha>
              ))}
            </Tabela>
          )}

          {/* ⚠️ A tela diz onde as respostas entram. Perguntas cadastradas sem
              ninguém saber onde responder é promessa quebrada em silêncio —
              foi o que o #55 fez com os combos, e o aviso evitou. */}
          <Alerta tipo="info">
            As respostas são preenchidas na ficha da pessoa, em Pessoas, e não
            no balcão: perguntar cinco coisas por ingresso é o que faz a fila
            parar. Quando o checkout público entrar, quem compra pelo site
            responde na hora da compra.
          </Alerta>
        </>
      )}

      {aba === "comprovante" && marca && (
        <form action={salvarMarcaDoComprovante} className="sni-form">
          <input type="hidden" name="evento_id" value={eventoId} />

          <TituloSecao
            acao={
              marca.exemplo_id ? (
                /* ⚠️ A prévia é uma inscrição DE VERDADE, não um exemplo
                   inventado. Dados fictícios mostram a marca e escondem o que
                   importa: se o nome longo quebra a linha, se o evento sem
                   local deixa buraco, se a cortesia esconde o bloco de
                   pagamento. Quem vai conferir o papel precisa ver o papel. */
                <BotaoLink
                  href={`/eventos/comprovante/${marca.exemplo_id}`}
                  variante="secondary"
                  tamanho="sm"
                >
                  Ver um comprovante
                </BotaoLink>
              ) : undefined
            }
          >
            Marca do comprovante
          </TituloSecao>

          <p className="hint" style={{ maxWidth: "68ch" }}>
            Vale só para este evento. Dois eventos da mesma casa podem ter
            identidade diferente — e é por isso que isto não é configuração
            geral do sistema.
          </p>

          <div className="form-grid">
            <Campo label="Cor principal" dica="Hexadecimal, como #132460. É a faixa do alto do papel.">
              <Input
                name="cor_primaria"
                defaultValue={marca.voucher_cor_primaria}
                maxLength={7}
                placeholder="#132460"
              />
            </Campo>
            <Campo label="Cor de apoio" dica="Usada nos títulos internos.">
              <Input
                name="cor_secundaria"
                defaultValue={marca.voucher_cor_secundaria}
                maxLength={7}
                placeholder="#B45309"
              />
            </Campo>
          </div>

          <Campo label="Boas-vindas" dica="Uma linha no alto, antes dos dados.">
            <Input
              name="boas_vindas"
              defaultValue={marca.voucher_boas_vindas ?? ""}
              maxLength={300}
            />
          </Campo>

          <Campo
            label="Instruções"
            dica="O que a pessoa precisa saber antes de chegar: horário de abertura, o que levar, onde estacionar."
          >
            <Textarea
              name="instrucoes"
              defaultValue={marca.voucher_instrucoes ?? ""}
              rows={4}
              maxLength={1200}
            />
          </Campo>

          <Campo label="Rodapé" dica="Em branco, o papel usa a frase padrão.">
            <Input
              name="rodape"
              defaultValue={marca.voucher_rodape ?? ""}
              maxLength={300}
            />
          </Campo>

          <fieldset className="sni-grupo-campos">
            <legend className="sni-grupo-campos-legenda">O que sai no papel</legend>
            <p className="hint sni-grupo-campos-apoio">
              Desmarcar esconde o bloco inteiro. O código do ingresso é o que a
              porta lê — esconder só faz sentido em evento sem controle de
              entrada.
            </p>
            {BLOCOS_DO_COMPROVANTE.map(([chave, rotulo]) => (
              <label key={chave} className="sni-check">
                <input
                  type="checkbox"
                  name={`mostrar_${chave}`}
                  defaultChecked={marca.voucher_mostrar?.[chave] !== false}
                />
                <span>{rotulo}</span>
              </label>
            ))}
          </fieldset>

          <div className="sni-form-rodape">
            <Botao type="submit">Guardar</Botao>
          </div>
        </form>
      )}

      {aba === "combos" && (
        <>
          <TituloSecao
            acao={
              tipos.length === 0 ? undefined : (
                <ModalCadastro
                  rotulo="Novo combo"
                  icone={<IconPlus size={18} className="ti" />}
                  titulo="Novo combo"
                  acao={criarCombo}
                  rotuloConfirmar="Cadastrar"
                  largura="lg"
                >
                  <CamposCombo eventoId={eventoId} tipos={tipos} />
                </ModalCadastro>
              )
            }
          >
            Combos
          </TituloSecao>

          {/* ⚠️ Sem tipo de ingresso não há combo possível: ele é feito DE
              ingressos. Oferecer o botão levaria a um formulário que não tem o
              que oferecer, e o erro só apareceria ao salvar. */}
          {tipos.length === 0 ? (
            <Vazio icone={<IconPackage size={34} className="ti" />} titulo="Cadastre ingressos primeiro">
              Combo é feito de ingressos — junta dois ou três num preço só.
              Comece pela aba Ingressos.
            </Vazio>
          ) : combos.length === 0 ? (
            <Vazio icone={<IconPackage size={34} className="ti" />} titulo="Nenhum combo">
              Combo junta ingressos num preço único: entrada mais jantar,
              inscrição mais transporte.
            </Vazio>
          ) : (
            <Tabela cabecalho={["Combo", "Entrega", "Preço", "Avulso", "Vendidos", "Situação", ""]}>
              {combos.map((c) => (
                <Linha key={c.id}>
                  <Celula forte>{c.nome}</Celula>
                  <Celula>
                    {c.itens.length === 0 ? (
                      // Combo sem item não deveria existir — a tela recusa
                      // criar um. Se aparecer, veio da carga e precisa de olho.
                      <Badge tom="danger">não entrega nada</Badge>
                    ) : (
                      c.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(", ")
                    )}
                  </Celula>
                  <Celula dado>{formatarCentavos(c.valor_centavos)}</Celula>
                  <Celula dado>
                    {/* ⚠️ Quanto custaria separado. Sem a comparação, o preço
                        do combo é um número solto — e um erro de centavos que
                        o deixe MAIS CARO que a soma passa despercebido. */}
                    {formatarCentavos(c.avulso_centavos)}
                    {c.avulso_centavos > 0 && c.valor_centavos >= c.avulso_centavos && (
                      <>
                        {" "}
                        <Badge tom="warning">sem desconto</Badge>
                      </>
                    )}
                  </Celula>
                  <Celula dado>
                    {/* ⚠️ PACOTES, não linhas de inscrição. Um combo de três
                        ingressos vendido duas vezes deixa seis linhas no banco:
                        contá-las diria "6 de 2" e faria desativar um combo que
                        ainda tem lugar. Quem divide é `combosVendidos`. */}
                    <Num>{c.vendidos}</Num>
                    {c.quantidade !== null && <span className="hint"> de {c.quantidade}</span>}
                  </Celula>
                  <Celula>
                    <Etiqueta ativo={c.ativo} />
                  </Celula>
                  <Celula alinhar="right">
                    <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
                      <ModalCadastro
                        gatilho="link"
                        rotulo="Editar"
                        titulo={`Editar ${c.nome}`}
                        acao={editarCombo}
                        largura="lg"
                      >
                        <CamposCombo eventoId={eventoId} combo={c} tipos={tipos} />
                      </ModalCadastro>
                      <form action={alternarComboAtivo}>
                        <input type="hidden" name="evento_id" value={eventoId} />
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="ativo" value={String(c.ativo)} />
                        <button type="submit" className="sni-acao">
                          {c.ativo ? "Desativar" : "Reativar"}
                        </button>
                      </form>
                    </span>
                  </Celula>
                </Linha>
              ))}
            </Tabela>
          )}

          {/* ⚠️ O cupom NÃO incide sobre combo, e quem cadastra os dois na
              mesma tela precisa saber disso aqui — não no balcão, com a fila na
              frente. O pacote já tem preço próprio; descontar de novo em cima
              dele desconta duas vezes. */}
          <Alerta tipo="info">
            O combo já sai com preço fechado, e por isso cupom não incide sobre
            ele: no balcão, o desconto do cupom vale só para os ingressos
            avulsos da mesma compra.
          </Alerta>
        </>
      )}
    </Painel>
  );
}
