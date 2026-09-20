import { notFound } from "next/navigation";
import {
  IconCamera, IconCreditCard, IconId, IconPhoto, IconPlus, IconUsersGroup,
} from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import CamposCielo from "@/componentes/CamposCielo";
import CamposConta from "@/componentes/CamposConta";
import { ModalCadastro } from "@/componentes/Modal";
import {
  Abas, Botao, BotaoLink, Campo, Celula, Etiqueta, Input, Linha, Recado, Select,
  Tabela, TituloPagina, TituloSecao, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina, pessoaAtual } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { exigir } from "@/lib/supabase/consulta";
import { contasCieloVisiveis } from "@/lib/credenciais";
import { contasDaUnidade, descreverConta, TIPOS_CONTA, TIPOS_PIX } from "@/lib/contas";
import type { OrganizacaoRow, TipoUnidadeRow, UnidadeRow } from "@/lib/supabase/tipos";
import CamposUnidade from "../CamposUnidade";
import {
  adicionarPix, alternarContaBancaria, criarContaBancaria, editarContaBancaria,
  editarUnidade, removerPix, salvarPagamentoUnidade,
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
          {
            chave: "cdor",
            rotulo: "CDOR",
            href: `${base}?aba=cdor`,
            icone: <IconUsersGroup size={17} className="ti" />,
          },
        ]}
      />

      {aba === "fotos" && (
        <Vazio icone={<IconCamera size={28} className="ti" />} titulo="As fotos vêm na próxima etapa">
          Aqui vão entrar as fotos desta unidade que o site publica — fachada,
          salão, atividades. Falta combinar quantas, em que proporção e quais
          delas o site usa em cada lugar, para a tela não virar um depósito de
          imagem que ninguém sabe onde aparece.
        </Vazio>
      )}

      {aba === "cdor" && (
        <Vazio icone={<IconUsersGroup size={28} className="ti" />} titulo="O CDOR vem na próxima etapa">
          Os membros do Conselho serão pessoas do próprio sistema, com mandato
          — e mandato já tem tabela e regra (decisão 0016). Esta aba vai
          mostrá-los e permitir compor o Conselho desta unidade.
        </Vazio>
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
