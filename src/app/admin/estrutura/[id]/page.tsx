import { notFound } from "next/navigation";
import {
  IconCamera, IconCreditCard, IconId, IconPhoto, IconPlus, IconStar,
  IconTrash, IconUpload, IconUsersGroup,
} from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import CamposCielo from "@/componentes/CamposCielo";
import CamposConta from "@/componentes/CamposConta";
import { ModalCadastro } from "@/componentes/Modal";
import {
  Abas, Alerta, Badge, Botao, BotaoLink, Campo, Celula, Etiqueta, Input, Linha,
  Recado, Select, Tabela, TituloPagina, TituloSecao, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina, pessoaAtual } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigir } from "@/lib/supabase/consulta";
import { contasCieloVisiveis } from "@/lib/credenciais";
import { contasDaUnidade, descreverConta, TIPOS_CONTA, TIPOS_PIX } from "@/lib/contas";
import { fotosDaUnidade, MAXIMO_POR_UNIDADE } from "@/lib/fotos";
import { composicaoDoColegiado, dataBR } from "@/lib/colegiados";
import type { OrganizacaoRow, TipoUnidadeRow, UnidadeRow } from "@/lib/supabase/tipos";
import CamposUnidade from "../CamposUnidade";
import {
  adicionarPix, alternarContaBancaria, criarContaBancaria, darPosse,
  definirCapaDaUnidade, editarContaBancaria, editarUnidade, encerrarMandato,
  removerFotoDaUnidade, removerPix, salvarPagamentoUnidade,
  subirFotoDaUnidade,
} from "../actions";

/**
 * A unidade deixou de caber num modal (decisão 0019).
 *
 * São quatro assuntos que não se parecem: o cadastro, as fotos que vão para o
 * site, por onde a entidade recebe dinheiro e quem compõe o CDOR. Empilhados
 * numa caixa que rola, quem vinha trocar o telefone passava por tudo.
 *
 * ⚠️ Uma página para os TRÊS degraus — Regional, Núcleo e Associação Local. A
 * lista já é um componente só (`ListaDeUnidades`) justamente para as três
 * telas não divergirem; uma página de edição por degrau desfaria isso na
 * primeira aba que alguém acrescentasse em uma só.
 *
 * ⚠️ Cada aba é um FORMULÁRIO próprio, e isso não é organização: é o que
 * impede o navegador de ler o cadastro como tela de login. Com a Merchant Key
 * (um `type="password"`) no mesmo formulário do e-mail, o gerenciador de
 * senhas oferecia o par e trocava os dois campos sem ninguém pedir.
 */

/**
 * De qual lista esta unidade veio — é para lá que o "voltar" aponta.
 *
 * O texto diz "Todas as", e não só o nome da lista, porque a seta é a única
 * coisa no cabeçalho: sem o "todas", ela parece levar de volta a uma Regional.
 */
const LISTA: Record<string, { href: string; texto: string }> = {
  regional: { href: "/admin/regionais", texto: "Todas as Regionais" },
  nucleo: { href: "/admin/nucleos", texto: "Todos os Núcleos" },
  associacao_local: { href: "/admin/associacoes", texto: "Todas as Associações Locais" },
};

export default async function UnidadePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; erro?: string; ok?: string }>;
}) {
  const eu = await exigirCapacidadeNaPagina("estrutura.gerir");

  const { id } = await params;
  const { aba = "dados", erro, ok } = await searchParams;

  const podeVerCielo = Boolean(eu?.pode("configuracao.gerir"));
  const supabase = await criarClienteServidor();

  // ⚠️ As cinco JUNTAS. Nenhuma depende do resultado das outras — em série,
  // cada uma somaria sua ida ao banco no tempo de tela em branco. A linha que
  // lê a unidade é o portão de RLS: quem não alcança esta unidade não passa.
  // ⚠️ As contas bancárias só são LIDAS por quem administra configuração. A
  // tabela não tem GRANT para o navegador e a leitura usa a chave de serviço:
  // o portão é esta linha, não a policy — não existe policy para segurar.
  const [rUnidade, rTipos, rOrganizacoes, rTodas, cielo, contas] = await Promise.all([
    supabase.from("unidades").select("*").eq("id", id).maybeSingle(),
    supabase.from("tipos_unidade").select("*").eq("ativo", true).order("ordem"),
    supabase.from("organizacoes").select("*").eq("ativo", true).order("ordem"),
    supabase.from("unidades").select("id, nome, tipo").order("nome"),
    contasCieloVisiveis(podeVerCielo),
    podeVerCielo ? contasDaUnidade(id) : Promise.resolve([]),
  ]);

  if (!rUnidade.data) notFound();
  const unidade = rUnidade.data as UnidadeRow;
  const tipos = (exigir(rTipos, "os tipos de unidade") ?? []) as TipoUnidadeRow[];
  const organizacoes = (exigir(rOrganizacoes, "as organizações") ?? []) as OrganizacaoRow[];
  const todas = (exigir(rTodas, "as unidades") ?? []) as Pick<UnidadeRow, "id" | "nome" | "tipo">[];

  const tipo = tipos.find((t) => t.codigo === unidade.tipo);
  const permitidos = tipo?.pais_permitidos ?? [];
  const superiores = todas.filter((u) => permitidos.includes(u.tipo));

  const mostraPagamento = podeVerCielo && Boolean(tipo?.aceita_conta_cielo);

  // ⚠️ CDOR é colegiado de ÂMBITO REGIONAL (catálogo `colegiados`): Núcleo e
  // Associação Local não têm um. Mostrar a aba neles seria prometer um
  // conselho que a instituição não prevê — e o gatilho do banco recusaria a
  // posse com uma mensagem sobre âmbito, depois de a pessoa preencher tudo.
  const mostraCdor = unidade.tipo === "regional";
  const podeDarPosse = Boolean(eu?.pode("mandato.conceder"));

  // Lido só nesta aba: o CDOR não interessa a quem veio trocar o telefone, e
  // são duas idas ao banco.
  const cdor =
    aba === "cdor" && mostraCdor ? await composicaoDoColegiado(supabase, "cdor", id) : null;

  // Mesma razão: as fotos são uma consulta e uma assinatura de URLs que só
  // esta aba usa. `null` quando a tabela ainda não existe — ver o aviso na aba.
  const fotos = aba === "fotos" ? await fotosDaUnidade(id) : [];
  const base = `/admin/estrutura/${id}`;
  const voltar = LISTA[unidade.tipo] ?? { href: "/admin/estrutura", texto: "Árvore da instituição" };

  return (
    // ⚠️ O nome da unidade aparece UMA vez, na barra de cima — que é onde o
    // sistema diz em que tela se está. Repeti-lo no cabeçalho de baixo, a dois
    // centímetros de distância, só empurrava as abas para fora da primeira
    // dobra. Embaixo fica a seta, que é o que ali tem serventia.
    <Painel titulo={`Editar ${tipo?.nome ?? "unidade"} ${unidade.nome}`}>
      <TituloPagina voltar={voltar} />

      <Recado erro={erro} ok={ok} />

      <Abas
        atual={aba}
        abas={[
          {
            chave: "dados",
            rotulo: "Dados cadastrais",
            href: base,
            icone: <IconId size={17} className="ti" />,
          },
          {
            chave: "fotos",
            rotulo: "Fotos",
            href: `${base}?aba=fotos`,
            icone: <IconPhoto size={17} className="ti" />,
          },
          ...(mostraPagamento
            ? [
                {
                  chave: "pagamento",
                  rotulo: "Pagamento",
                  href: `${base}?aba=pagamento`,
                  icone: <IconCreditCard size={17} className="ti" />,
                },
              ]
            : []),
          ...(mostraCdor
            ? [
                {
                  chave: "cdor",
                  rotulo: "CDOR",
                  href: `${base}?aba=cdor`,
                  icone: <IconUsersGroup size={17} className="ti" />,
                },
              ]
            : []),
        ]}
      />

      {aba === "fotos" &&
        (fotos === null ? (
          /* ⚠️ A tabela pode ainda não existir. A migração que a cria só
             aplica depois de alguém aprovar a execução no GitHub, e entre o
             deploy e a aprovação esta tela abriria com erro 500 sem dizer por
             quê. Dizer o motivo e onde conferir é o mínimo. */
          <Alerta tipo="warning">
            <strong>As fotos ainda não estão disponíveis neste banco.</strong>
            <p style={{ marginTop: 8 }}>
              A migração que cria a tabela das fotos foi publicada mas ainda não
              foi aplicada. Confira em <strong>Configurações → Estado do
              banco</strong>: se ela aparecer na lista de pendentes, basta
              aprovar a execução “Migrações do banco” no GitHub.
            </p>
          </Alerta>
        ) : (
          <>
            <TituloSecao>Fotos que o site publica</TituloSecao>
            <p className="hint" style={{ maxWidth: "68ch" }}>
              Fachada, salão, atividades. Até {MAXIMO_POR_UNIDADE} por unidade.
              A <strong>capa</strong> é a que aparece na listagem; as outras
              entram na página da unidade, na ordem em que foram enviadas.
            </p>

            {fotos.length >= MAXIMO_POR_UNIDADE ? (
              <Alerta tipo="info">
                Esta unidade chegou a {MAXIMO_POR_UNIDADE} fotos. Apague uma
                antes de subir outra — álbum sem limite vira depósito, e
                depósito ninguém organiza.
              </Alerta>
            ) : (
              <form action={subirFotoDaUnidade} className="sni-form">
                <input type="hidden" name="unidade_id" value={id} />
                <div className="form-grid">
                  <Campo label="Imagem" obrigatorio dica="JPG, PNG, WEBP ou HEIC, até 8 MB.">
                    <Input
                      name="arquivo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic"
                      required
                    />
                  </Campo>
                  <Campo
                    label="Legenda"
                    dica="O que a foto mostra. Vai como texto alternativo no site — sem ela, quem usa leitor de tela ouve “imagem” doze vezes."
                  >
                    <Input name="legenda" maxLength={200} placeholder="Fachada da sede" />
                  </Campo>
                </div>
                <div className="sni-form-rodape">
                  <Botao type="submit" icone={<IconUpload size={18} className="ti" />}>
                    Enviar
                  </Botao>
                </div>
              </form>
            )}

            {fotos.length === 0 ? (
              <Vazio icone={<IconCamera size={28} className="ti" />} titulo="Nenhuma foto ainda">
                A primeira que entrar vira a capa sozinha — unidade com fotos e
                sem capa faria a listagem do site mostrar um retângulo cinza.
              </Vazio>
            ) : (
              <Tabela cabecalho={["", "Legenda", "Arquivo", ""]}>
                {fotos.map((f) => (
                  <Linha key={f.id}>
                    <Celula>
                      {/* URL assinada de vida curta, emitida pelo servidor
                          depois de conferir a capacidade: o navegador nunca
                          fala com o balde. */}
                      {f.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={f.url}
                          alt={f.legenda ?? ""}
                          width={96}
                          height={64}
                          style={{ objectFit: "cover", borderRadius: "var(--r-sm)" }}
                        />
                      ) : (
                        <span className="hint">sem prévia</span>
                      )}
                    </Celula>
                    <Celula forte>
                      {f.legenda ?? <span className="hint">sem legenda</span>}
                      {f.capa && (
                        <>
                          {" "}
                          <Badge tom="success">capa</Badge>
                        </>
                      )}
                    </Celula>
                    <Celula>
                      <span className="hint">{f.nome_arquivo}</span>
                    </Celula>
                    <Celula alinhar="right">
                      <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end" }}>
                        {!f.capa && (
                          <form action={definirCapaDaUnidade}>
                            <input type="hidden" name="unidade_id" value={id} />
                            <input type="hidden" name="id" value={f.id} />
                            <button type="submit" className="sni-acao">
                              <IconStar size={16} className="ti" /> Usar como capa
                            </button>
                          </form>
                        )}
                        <form action={removerFotoDaUnidade}>
                          <input type="hidden" name="unidade_id" value={id} />
                          <input type="hidden" name="id" value={f.id} />
                          <button type="submit" className="sni-acao">
                            <IconTrash size={16} className="ti" /> Apagar
                          </button>
                        </form>
                      </span>
                    </Celula>
                  </Linha>
                ))}
              </Tabela>
            )}
          </>
        ))}

      {aba === "cdor" && mostraCdor && cdor && (
        <>
          <p className="hint" style={{ marginBottom: 16 }}>
            Conselho Doutrinário Organizacional Regional. Gestão de três anos,
            começando em setembro. O Supervisor preside e só vota para
            desempatar. Cargo sem ninguém em exercício é vaga aberta, não erro.
          </p>

          <Tabela cabecalho={["Cargo", "Em exercício", "Desde", "Condição", ""]}>
            {cdor.cargos.map((c) => {
              const abertos = cdor.abertos.filter((m) => m.cargo === c.codigo);
              return (
                <Linha key={c.codigo}>
                  <Celula forte>
                    {c.nome}
                    {c.vota !== "sempre" && (
                      <span className="hint" style={{ marginTop: 2 }}>
                        {c.vota === "nunca" ? "Não vota" : "Vota só para desempatar"}
                      </span>
                    )}
                  </Celula>
                  <Celula>
                    {abertos.length === 0
                      ? "Vago"
                      : abertos.map((m) => cdor.nomes.get(m.pessoa_id) ?? "—").join(", ")}
                  </Celula>
                  <Celula dado>
                    {abertos.length === 0 ? "—" : abertos.map((m) => dataBR(m.data_inicio)).join(", ")}
                  </Celula>
                  <Celula>
                    {abertos.length === 0
                      ? "—"
                      : abertos.map((m) => (m.condicao === "ouvinte" ? "Ouvinte" : "Efetivo")).join(", ")}
                  </Celula>
                  <Celula alinhar="right">
                    {podeDarPosse && (
                      <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {abertos.length === 0 ? (
                          <ModalCadastro
                            gatilho="link"
                            rotulo="Dar posse"
                            titulo={`Dar posse · ${c.nome}`}
                            descricao="Quem toma posse precisa estar cadastrada — é o cadastro que guarda a função doutrinária que o cargo exige."
                            acao={darPosse}
                            rotuloConfirmar="Dar posse"
                          >
                            <input type="hidden" name="unidade" value={id} />
                            <input type="hidden" name="cargo" value={c.codigo} />
                            <Campo
                              label="CPF, passaporte ou login"
                              obrigatorio
                              dica="A mesma identificação da tela de entrada."
                            >
                              <Input name="pessoa" required maxLength={60} />
                            </Campo>
                            <div className="form-grid">
                              <Campo label="Data da posse" obrigatorio>
                                <Input name="data_inicio" type="date" required />
                              </Campo>
                              <Campo label="Condição">
                                <Select name="condicao" defaultValue="efetivo">
                                  <option value="efetivo">Efetivo (vota)</option>
                                  <option value="ouvinte">Ouvinte</option>
                                </Select>
                              </Campo>
                            </div>
                          </ModalCadastro>
                        ) : (
                          abertos.map((m) => (
                            <ModalCadastro
                              key={m.id}
                              gatilho="link"
                              rotulo="Encerrar"
                              titulo={`Encerrar mandato · ${cdor.nomes.get(m.pessoa_id) ?? c.nome}`}
                              descricao="Encerrar é pôr data, nunca apagar: o mandato encerrado é o que explica quem assinou a ata daquele ano."
                              acao={encerrarMandato}
                              rotuloConfirmar="Encerrar"
                            >
                              <input type="hidden" name="unidade" value={id} />
                              <input type="hidden" name="id" value={m.id} />
                              <Campo label="Data do encerramento" obrigatorio>
                                <Input name="data_fim" type="date" required />
                              </Campo>
                              <Campo label="Motivo">
                                <Input name="motivo_fim" maxLength={200} />
                              </Campo>
                            </ModalCadastro>
                          ))
                        )}
                      </span>
                    )}
                  </Celula>
                </Linha>
              );
            })}
          </Tabela>

          {cdor.encerrados.length > 0 && (
            <>
              <TituloSecao>Mandatos encerrados</TituloSecao>
              <Tabela cabecalho={["Cargo", "Quem ocupou", "Período", "Motivo"]}>
                {cdor.encerrados.map((m) => (
                  <Linha key={m.id}>
                    <Celula>{cdor.nomeCargo.get(m.cargo) ?? m.cargo}</Celula>
                    <Celula forte>{cdor.nomes.get(m.pessoa_id) ?? "—"}</Celula>
                    <Celula dado>
                      {dataBR(m.data_inicio)} — {dataBR(m.data_fim)}
                    </Celula>
                    <Celula>{m.motivo_fim ?? "—"}</Celula>
                  </Linha>
                ))}
              </Tabela>
            </>
          )}
        </>
      )}

      {aba === "pagamento" && mostraPagamento && (
        <>
          {/* ⚠️ Formulário PRÓPRIO, e não um pedaço do cadastro. É o que mantém
              a Merchant Key longe do campo de e-mail — e o que faz salvar o
              telefone não passar perto de por onde a entidade recebe. */}
          <form action={salvarPagamentoUnidade} className="sni-form">
            <input type="hidden" name="id" value={id} />
            <CamposCielo
              merchantId={cielo.get(id)?.merchant_id}
              nomeLoja={cielo.get(id)?.nome_loja}
              temChave={cielo.get(id)?.temSegredo}
            />
            <div className="sni-form-rodape">
              <Botao type="submit">Salvar conta Cielo</Botao>
            </div>
          </form>

          <TituloSecao
            acao={
              <ModalCadastro
                rotulo="Nova conta"
                tamanho="sm"
                icone={<IconPlus size={16} className="ti" />}
                titulo="Nova conta bancária"
                acao={criarContaBancaria}
                rotuloConfirmar="Cadastrar"
                largura="lg"
              >
                <CamposConta unidadeId={id} />
              </ModalCadastro>
            }
          >
            Contas bancárias
          </TituloSecao>

          {contas.length === 0 ? (
            <Vazio titulo="Nenhuma conta cadastrada">
              É para estas contas que a Missão Sagrada reparte e é por elas que o
              evento recebe. Sem nenhuma, a unidade só aparece no rateio como
              destino sem endereço.
            </Vazio>
          ) : (
            <Tabela cabecalho={["Apelido", "Banco", "Tipo", "Titular", "Pix", "Situação", ""]}>
              {contas.map((c) => (
                <Linha key={c.id}>
                  <Celula forte>{c.apelido}</Celula>
                  <Celula dado>{descreverConta(c)}</Celula>
                  <Celula>{TIPOS_CONTA.find((t) => t.codigo === c.tipo)?.nome ?? c.tipo}</Celula>
                  <Celula>{c.titular ?? "—"}</Celula>
                  <Celula>
                    {c.chaves.length === 0 ? "—" : `${c.chaves.length}`}
                  </Celula>
                  <Celula>
                    <Etiqueta ativo={c.ativo} />
                  </Celula>
                  <Celula alinhar="right">
                    <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <ModalCadastro
                        gatilho="link"
                        rotulo="Editar"
                        titulo={`Editar ${c.apelido}`}
                        acao={editarContaBancaria}
                        largura="lg"
                      >
                        <CamposConta unidadeId={id} conta={c} />
                      </ModalCadastro>

                      <ModalCadastro
                        gatilho="link"
                        rotulo="Chaves Pix"
                        titulo={`Chaves Pix · ${c.apelido}`}
                        descricao="A mesma chave pertence a uma conta só no Banco Central. Remover aqui não a apaga no banco — só deixa o sistema de oferecê-la."
                        acao={adicionarPix}
                        rotuloConfirmar="Cadastrar chave"
                        largura="sm"
                      >
                        <input type="hidden" name="unidade" value={id} />
                        <input type="hidden" name="conta" value={c.id} />
                        {c.chaves.length > 0 && (
                          <div className="sni-lista-papeis">
                            {c.chaves.map((k) => (
                              <div key={k.id} className="sni-lista-papeis-item">
                                <span>
                                  {TIPOS_PIX.find((t) => t.codigo === k.tipo)?.nome ?? k.tipo}
                                  {" · "}
                                  <span className="num">{k.chave}</span>
                                </span>
                                <button
                                  type="submit"
                                  formAction={removerPix}
                                  name="pix"
                                  value={k.id}
                                  className="sni-acao sni-acao-perigo"
                                  // ⚠️ Sem isto o navegador BARRA o envio: este
                                  // botão divide o formulário com o campo
                                  // obrigatório da chave nova, que é do outro.
                                  formNoValidate
                                >
                                  Remover
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="form-grid">
                          <Campo label="Tipo" obrigatorio>
                            <Select name="pix_tipo" defaultValue="" required>
                              <option value="" disabled>
                                Escolha…
                              </option>
                              {TIPOS_PIX.map((t) => (
                                <option key={t.codigo} value={t.codigo}>
                                  {t.nome}
                                </option>
                              ))}
                            </Select>
                          </Campo>
                          <Campo label="Chave" obrigatorio>
                            <Input name="pix_chave" required maxLength={80} />
                          </Campo>
                        </div>
                      </ModalCadastro>

                      <form action={alternarContaBancaria}>
                        <input type="hidden" name="unidade" value={id} />
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

      {aba === "dados" && (
        <form action={editarUnidade} className="sni-form">
          {/* ⚠️ `tipoFixo` tira o seletor de Tipo da tela. Editar uma Regional
              não é escolher entre Sede, Regional, Núcleo e AL: o degrau já foi
              decidido quando ela nasceu, e oferecê-lo aqui é oferecer a chance
              de transformar uma Regional em Núcleo por engano — levando junto
              o vínculo de todas as unidades penduradas nela. O valor continua
              viajando em campo escondido, porque o servidor o exige. */}
          <CamposUnidade
            tipoFixo={unidade.tipo}
            tipos={tipos}
            unidades={superiores}
            organizacoes={organizacoes}
            unidade={unidade}
          />
          <div className="sni-form-rodape">
            <BotaoLink href={voltar.href} variante="secondary">
              Cancelar
            </BotaoLink>
            <Botao type="submit">Salvar</Botao>
          </div>
        </form>
      )}
    </Painel>
  );
}
