import { notFound } from "next/navigation";
import { IconId, IconPlus, IconTicket } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import {
  Abas, Alerta, Badge, Botao, BotaoLink, Celula, Etiqueta, Linha, Num, Recado, Tabela,
  TituloPagina, TituloSecao, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { formatarCentavos } from "@/lib/dominio/dinheiro";
import { porQueNaoVende } from "@/lib/dominio/ingressos";
import {
  eventoDaPagina, locaisAtivos, opcoesDePromotor, tiposDeIngresso,
} from "@/modulos/eventos/consultas";
import {
  alternarTipoIngressoAtivo, criarTipoIngresso, editarEvento, editarTipoIngresso,
} from "@/modulos/eventos/acoes";
import CamposEvento from "../CamposEvento";
import CamposIngresso from "../CamposIngresso";

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
  const [evento, tipos, locais, promotores] = await Promise.all([
    eventoDaPagina(eventoId),
    tiposDeIngresso(eventoId),
    locaisAtivos(),
    opcoesDePromotor(),
  ]);

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
    </Painel>
  );
}
