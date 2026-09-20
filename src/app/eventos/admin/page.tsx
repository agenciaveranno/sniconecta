import { IconCalendarEvent, IconPlus } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import {
  Badge, Campo, Celula, Etiqueta, Input, Linha, Recado, Select, Tabela, TituloPagina, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { dataBR } from "@/lib/dominio/data";
import {
  eventosParaEdicao, locaisAtivos, opcoesDePromotor,
  type EventoParaEdicao, type OpcaoPromotor,
} from "@/modulos/eventos/consultas";
import { alternarEventoAtivo, criarEvento, editarEvento } from "@/modulos/eventos/acoes";

export const metadata = { title: "Eventos e convites" };

/**
 * Cadastro de eventos.
 *
 * ⚠️ Modal, e não página: o evento em si é um punhado de campos — nome, duas
 * datas, onde acontece e quem promove. O que vai virar página é o EVENTO por
 * dentro, quando os tipos de ingresso, os campos da compra e a comissão
 * entrarem (decisão 0019 dá o critério: dois entre muitos campos, upload, mais
 * de um assunto, e URL própria).
 */

/** Os campos do evento, no modal de criar e no de editar — nunca dois jeitos. */
function CamposEvento({
  evento,
  locais,
  promotores,
}: {
  evento?: EventoParaEdicao;
  locais: { id: string; nome: string }[];
  promotores: OpcaoPromotor[];
}) {
  // Agrupa por Departamentos / Unidades / Locais, na ordem que a consulta deu.
  const grupos = [...new Set(promotores.map((p) => p.grupo))];

  return (
    <>
      {evento && <input type="hidden" name="id" value={evento.id} />}

      <Campo label="Nome" obrigatorio>
        <Input name="nome" defaultValue={evento?.nome ?? ""} required maxLength={200} />
      </Campo>

      <div className="form-grid">
        <Campo label="Começa em" obrigatorio>
          <Input name="data_inicial" type="date" defaultValue={evento?.data_inicial ?? ""} required />
        </Campo>
        <Campo label="Termina em" obrigatorio>
          <Input name="data_final" type="date" defaultValue={evento?.data_final ?? ""} required />
        </Campo>
      </div>

      <Campo label="Onde acontece">
        <Select name="local" defaultValue={evento?.local_id ?? ""}>
          <option value="">A definir</option>
          {locais.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </Select>
      </Campo>

      {/* ⚠️ UM campo para o promotor, embora sejam três colunas no banco. Um
          seletor por coluna deixaria preencher duas, e o banco recusaria
          depois de tudo preenchido. A lista traz só quem recebe em conta
          própria: promotor é quem diz em que conta o dinheiro cai. */}
      <Campo
        label="Quem promove"
        dica="Define em qual conta Cielo o dinheiro do evento cai. Sem promotor, o evento não vende."
      >
        <Select name="promotor" defaultValue={evento?.promotor ?? ""}>
          <option value="">A definir</option>
          {grupos.map((g) => (
            <optgroup key={g} label={g}>
              {promotores
                .filter((p) => p.grupo === g)
                .map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.nome}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Campo>
    </>
  );
}

export default async function EventosAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  await exigirCapacidadeNaPagina("eventos.gerir");
  const { erro, ok } = await searchParams;

  // As três juntas: nenhuma depende do resultado das outras.
  const [eventos, locais, promotores] = await Promise.all([
    eventosParaEdicao(),
    locaisAtivos(),
    opcoesDePromotor(),
  ]);

  return (
    <Painel titulo="Eventos e convites">
      <TituloPagina
        titulo="Eventos e convites"
        descricao="O que a instituição promove. Os tipos de ingresso e os convites entram por dentro de cada evento."
        acao={
          <ModalCadastro
            rotulo="Novo evento"
            icone={<IconPlus size={18} className="ti" />}
            titulo="Novo evento"
            acao={criarEvento}
            rotuloConfirmar="Cadastrar"
          >
            <CamposEvento locais={locais} promotores={promotores} />
          </ModalCadastro>
        }
      />

      <Recado erro={erro} ok={ok} />

      {eventos.length === 0 ? (
        <Vazio icone={<IconCalendarEvent size={34} className="ti" />} titulo="Nenhum evento cadastrado">
          Cadastre o primeiro, ou espere a carga trazer os do sistema antigo —
          ela lê o MySQL do Credenciamento e grava aqui.
        </Vazio>
      ) : (
        <Tabela cabecalho={["Evento", "Quando", "Quem promove", "Situação", ""]}>
          {eventos.map((e) => (
            <Linha key={e.id}>
              <Celula forte>{e.nome}</Celula>
              <Celula dado>
                {dataBR(e.data_inicial)}
                {e.data_final !== e.data_inicial && ` — ${dataBR(e.data_final)}`}
              </Celula>
              <Celula>
                {e.promotor ? (
                  (promotores.find((p) => p.valor === e.promotor)?.nome ?? "—")
                ) : (
                  <Badge tom="warning">Sem promotor</Badge>
                )}
              </Celula>
              <Celula>
                <Etiqueta ativo={e.ativo} />
              </Celula>
              <Celula alinhar="right">
                <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
                  <ModalCadastro
                    gatilho="link"
                    rotulo="Editar"
                    titulo={`Editar ${e.nome}`}
                    acao={editarEvento}
                  >
                    <CamposEvento evento={e} locais={locais} promotores={promotores} />
                  </ModalCadastro>
                  <form action={alternarEventoAtivo}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="ativo" value={String(e.ativo)} />
                    <button type="submit" className="sni-acao">
                      {e.ativo ? "Desativar" : "Reativar"}
                    </button>
                  </form>
                </span>
              </Celula>
            </Linha>
          ))}
        </Tabela>
      )}
    </Painel>
  );
}
