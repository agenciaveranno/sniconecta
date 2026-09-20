import { IconCalendarEvent, IconPlus } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import {
  AcaoLink, Badge, Celula, Etiqueta, Linha, Recado, Tabela, TituloPagina, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { dataBR } from "@/lib/dominio/data";
import { eventosParaEdicao, locaisAtivos, opcoesDePromotor } from "@/modulos/eventos/consultas";
import { alternarEventoAtivo, criarEvento } from "@/modulos/eventos/acoes";
import CamposEvento from "./CamposEvento";

export const metadata = { title: "Eventos e convites" };

/**
 * A lista de eventos. Cada um abre na página dele.
 *
 * ⚠️ CRIAR continua em modal: nascer é um punhado de campos — nome, duas
 * datas, onde acontece e quem promove —, e quem cadastra três eventos seguidos
 * não pode ter de navegar para outra tela e voltar três vezes.
 *
 * EDITAR virou página com abas (decisão 0020). Era o que o comentário daqui
 * previa quando os tipos de ingresso entrassem: eles entraram, e com eles o
 * evento passou a ter mais de um assunto dentro e endereço próprio.
 */

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
                  {/* ⚠️ LINK, não modal. Editar virou página com abas
                      (decisão 0020): é lá que moram os tipos de ingresso, sem
                      os quais o evento não vende. Criar continua em modal, logo
                      acima — nascer é um punhado de campos. */}
                  <AcaoLink href={`/eventos/admin/${e.id}`}>Abrir</AcaoLink>
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
