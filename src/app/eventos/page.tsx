import { IconAlertTriangle, IconCalendarEvent } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import { Badge, Celula, Etiqueta, Linha, Num, Tabela, TituloPagina, Vazio } from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { dataBR } from "@/lib/dominio/data";
import { eventosDoPainel, totalDeEventos } from "@/modulos/eventos/consultas";

export const metadata = { title: "Eventos" };

/**
 * O painel do módulo `eventos`: a lista do que há, com quanta gente entrou.
 *
 * ⚠️ Esta é a primeira tela do módulo, e o que ela prova é o CAMINHO: a
 * capacidade confere aqui, a consulta fala Postgres direto pelo pooler, e as
 * tabelas de `eventos.*` continuam sem GRANT para o navegador. Nenhuma tela
 * deste módulo vai falar com o banco por outro caminho.
 *
 * ⚠️ Número aqui é CONTAGEM, não previsão. A tela mostra pagos, pendentes e
 * cortesias porque são três perguntas diferentes que a operação faz no dia do
 * evento; somá-los numa "inscrições" só esconderia quem ainda não pagou.
 */

const LIMITE = 50;

export default async function EventosPage() {
  await exigirCapacidadeNaPagina("eventos.inscricoes.ver");

  const [eventos, total] = await Promise.all([eventosDoPainel(LIMITE), totalDeEventos()]);

  return (
    <Painel titulo="Eventos">
      <TituloPagina
        titulo="Eventos"
        descricao="O que está no ar, o que já passou, e quanta gente entrou em cada um."
      />

      {eventos.length === 0 ? (
        <Vazio icone={<IconCalendarEvent size={34} className="ti" />} titulo="Nenhum evento ainda">
          Os eventos do sistema antigo entram pela carga de dados — ela lê o
          MySQL do Credenciamento e grava aqui, em fases e de forma repetível.
          Enquanto ela não roda, esta tela fica assim mesmo: vazia e honesta.
        </Vazio>
      ) : (
        <>
          <Tabela cabecalho={["Evento", "Quando", "Onde", "Promotor", "Pagos", "Pendentes", "Cortesias", "Situação"]}>
            {eventos.map((e) => (
              <Linha key={e.id}>
                <Celula forte>{e.nome}</Celula>
                <Celula dado>
                  {dataBR(e.data_inicial)}
                  {e.data_final !== e.data_inicial && ` — ${dataBR(e.data_final)}`}
                </Celula>
                <Celula>{e.local ?? "—"}</Celula>
                <Celula>
                  {/* ⚠️ Evento sem promotor NÃO VENDE: é o promotor que diz em
                      qual conta o dinheiro cai. A carga deixa isso em aberto
                      enquanto não concilia os "Promotor" antigos, que eram nome
                      e telefone em texto. A tela avisa em vez de deixar
                      alguém descobrir na hora da venda. */}
                  {e.promotor ?? (
                    <Badge tom="warning">
                      <IconAlertTriangle size={14} className="ti" aria-hidden="true" /> Sem promotor
                    </Badge>
                  )}
                </Celula>
                <Celula dado>{e.pagos}</Celula>
                <Celula dado>{e.pendentes}</Celula>
                <Celula dado>{e.cortesias}</Celula>
                <Celula>
                  <Etiqueta ativo={e.ativo} />
                </Celula>
              </Linha>
            ))}
          </Tabela>

          {total > eventos.length && (
            <p className="hint" style={{ marginTop: 12 }}>
              Mostrando os <Num>{eventos.length}</Num> mais recentes de <Num>{total}</Num>. A
              paginação entra junto com a busca, quando houver mais de uma tela de eventos para
              procurar dentro.
            </p>
          )}
        </>
      )}
    </Painel>
  );
}
