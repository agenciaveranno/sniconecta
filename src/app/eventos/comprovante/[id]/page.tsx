import Link from "next/link";
import { notFound } from "next/navigation";
import BotaoImprimir from "@/componentes/BotaoImprimir";
import CodigoQR from "@/componentes/CodigoQR";
import { Alerta, Entidade, Num } from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { dataBR } from "@/lib/dominio/data";
import { formatarCentavos } from "@/lib/dominio/dinheiro";
import { valorAEstornar } from "@/lib/dominio/estorno";
import { ROTULO_FORMA, type FormaBalcao } from "@/lib/dominio/venda";
import { comprovanteDaInscricao } from "@/modulos/eventos/consultas";

export const metadata = { title: "Comprovante" };

/**
 * O comprovante do ingresso, para entregar impresso no balcão.
 *
 * ⚠️ FORA DO PAINEL, de propósito. A barra lateral e a barra superior existem
 * para navegar, e ninguém navega num papel. Numa tela com a casca, imprimir
 * gastaria meia folha com menu — e o operador acabaria recortando.
 *
 * ⚠️ E a página é SERVIDOR inteiro, inclusive o desenho do QR. Gerado no
 * navegador, ele apareceria depois da página, e o Ctrl+P disparado antes do
 * script sairia com um quadrado branco no lugar do código.
 *
 * ⚠️ O comprovante DIZ A SITUAÇÃO da inscrição, em vez de imprimir bonito
 * qualquer linha. Cancelada, pendente ou transferida impressa como se valesse
 * é um papel que a pessoa leva à porta e não entra — e a discussão acontece
 * lá, com fila atrás, em vez de aqui, com o operador na frente.
 */
export default async function ComprovantePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirCapacidadeNaPagina("eventos.inscricoes.ver");
  const { id } = await params;

  const c = await comprovanteDaInscricao(Number(id));
  if (!c) notFound();

  const mostrar = c.voucher_mostrar ?? {};
  const ver = (chave: keyof typeof mostrar) => mostrar[chave] !== false;

  const pago = valorAEstornar({
    status: c.status,
    tipoVenda: c.tipo_venda,
    valorOriginalCentavos: c.valor_original_centavos,
    descontoCentavos: c.desconto_centavos,
    checkinEm: null,
  });

  const vale = c.status === "pago";
  const aviso =
    c.status === "pago"
      ? null
      : c.status === "pendente"
        ? "Pagamento não confirmado. Este comprovante NÃO dá entrada — passe no balcão."
        : c.status === "transferido"
          ? "Esta inscrição foi transferida para outro evento. Vale a inscrição nova."
          : c.status === "cancelado"
            ? "Inscrição cancelada. Este comprovante não dá entrada."
            : "Inscrição expirada sem pagamento. Este comprovante não dá entrada.";

  return (
    <main className="sni-comprovante">
      <div className="sni-comprovante-barra sni-sem-impressao">
        <Link href="/eventos/pessoas" className="sni-acao">
          ← Voltar
        </Link>
        <BotaoImprimir />
      </div>

      <article
        className="sni-comprovante-folha"
        style={{
          // A marca é do EVENTO: as colunas `voucher_*` existem na fundação
          // com default institucional, para que um evento nunca personalizado
          // imprima com a cor da casa em vez de sem cor nenhuma.
          ["--comprovante-primaria" as string]: c.voucher_cor_primaria,
          ["--comprovante-secundaria" as string]: c.voucher_cor_secundaria,
        }}
      >
        <header className="sni-comprovante-topo">
          <div>
            <p className="sni-comprovante-entidade">
              <Entidade />
            </p>
            <h1 className="sni-comprovante-evento">{c.evento}</h1>
          </div>
        </header>

        {aviso && (
          <div className="sni-sem-impressao">
            <Alerta tipo="danger">{aviso}</Alerta>
          </div>
        )}

        {/* ⚠️ Impresso, o aviso vira FAIXA sobre o papel. Um alerta de tela,
            no papel, some entre os outros blocos — e o comprovante inválido
            fica com a mesma cara do válido na mão de quem chega na porta. */}
        {!vale && <p className="sni-comprovante-invalido">{aviso}</p>}

        {c.voucher_boas_vindas && (
          <p className="sni-comprovante-boas-vindas">{c.voucher_boas_vindas}</p>
        )}

        <div className="sni-comprovante-corpo">
          <dl className="sni-comprovante-dados">
            {ver("participante") && (
              <>
                <dt>Participante</dt>
                <dd>
                  {c.pessoa_nome}
                  {c.documento && (
                    <>
                      <br />
                      <span className="num">{c.documento}</span>
                    </>
                  )}
                </dd>
              </>
            )}

            {ver("evento") && (
              <>
                <dt>Quando</dt>
                <dd>
                  {dataBR(c.data_inicial)}
                  {c.data_final !== c.data_inicial && <> a {dataBR(c.data_final)}</>}
                </dd>
                {c.local && (
                  <>
                    <dt>Onde</dt>
                    <dd>{c.local}</dd>
                  </>
                )}
              </>
            )}

            {ver("ingresso") && (
              <>
                <dt>Ingresso</dt>
                <dd>
                  {c.ingresso ?? "—"}
                  {c.tipo_venda === "cortesia" && " · cortesia"}
                </dd>
              </>
            )}

            {ver("pagamento") && c.tipo_venda !== "cortesia" && (
              <>
                <dt>Pago</dt>
                <dd>
                  <span className="num">{formatarCentavos(pago)}</span>
                  {c.forma_pagamento && (
                    <>
                      {" · "}
                      {ROTULO_FORMA[c.forma_pagamento as FormaBalcao] ?? c.forma_pagamento}
                    </>
                  )}
                  {c.comprou_legivel && (
                    <>
                      <br />
                      <span className="hint">em {c.comprou_legivel}</span>
                    </>
                  )}
                </dd>
              </>
            )}

            {c.numero_convite && (
              <>
                <dt>Convite</dt>
                <dd className="num">{c.numero_convite}</dd>
              </>
            )}
          </dl>

          {ver("qrcode") && (
            <div className="sni-comprovante-codigo">
              {c.qr_code ? (
                <>
                  <CodigoQR codigo={c.qr_code} tamanho={168} />
                  {/* ⚠️ O código também em TEXTO, embaixo do desenho. Câmera
                      falha, papel amassa, tinta acaba — e o operador da porta
                      digita. Sem o texto, um QR borrado é um ingresso perdido. */}
                  <p className="sni-comprovante-codigo-texto num">{c.qr_code}</p>
                </>
              ) : (
                /* ⚠️ Diz que NÃO tem código, em vez de imprimir um quadrado
                   vazio. A inscrição pode ser anterior ao código, ou a
                   migração que o gera pode não ter sido aplicada ainda — e a
                   porta precisa saber que vai procurar por documento. */
                <p className="sni-comprovante-sem-codigo">
                  Este ingresso não tem código. Na porta, procure pelo nome ou
                  documento.
                </p>
              )}
            </div>
          )}
        </div>

        {c.voucher_instrucoes && (
          <section className="sni-comprovante-instrucoes">
            <h2>Instruções</h2>
            <p>{c.voucher_instrucoes}</p>
          </section>
        )}

        <footer className="sni-comprovante-rodape">
          {c.voucher_rodape ? (
            <p>{c.voucher_rodape}</p>
          ) : (
            <p>
              Apresente este comprovante na entrada. Inscrição{" "}
              <Num>{c.id}</Num>.
            </p>
          )}
        </footer>
      </article>
    </main>
  );
}
