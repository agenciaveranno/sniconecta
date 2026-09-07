import {
  IconAlertCircle,
  IconCircleCheck,
  IconKey,
  IconPlus,
  IconUserOff,
  IconUsers,
} from "@tabler/icons-react";
import { cookies } from "next/headers";
import Link from "next/link";
import Painel from "@/componentes/Painel";
import { ModalCadastro } from "@/componentes/Modal";
import {
  AcaoLink, Alerta, Badge, BotaoLink, Campo, Celula, Input, Linha, Num, Recado, Select, Tabela, TituloPagina, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { NOME_PAPEL, PAPEIS_NACIONAIS, type TipoPapel } from "@/lib/permissoes";
import { formatarCpf } from "@/lib/dominio/cpf";
import { formatarPassaporte } from "@/lib/dominio/passaporte";
import { criarClienteServidor } from "@/lib/supabase/server";
import { entreAspas, exigir } from "@/lib/supabase/consulta";
import type {
  PapelRow,
  PessoaRow,
  TipoPapelRow,
  UnidadeRow,
  VinculoAtualRow,
} from "@/lib/supabase/tipos";
import {
  concederPapel,
  definirAcesso,
  moverPessoa,
  revogarPapel,
  tirarAcesso,
} from "./actions";
import { COOKIE_SENHA } from "./cookies";

export const metadata = { title: "Pessoas e acesso" };

/** A base tem dezesseis mil pessoas: a tela nasce paginada ou não abre. */
type PessoaDaLista = Pick<
  PessoaRow,
  "id" | "nome" | "nome_social" | "email" | "cpf" | "passaporte" | "auth_user_id"
>;

const POR_PAGINA = 25;

export default async function PessoasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string; q?: string; p?: string }>;
}) {
  const { erro, ok, q, p } = await searchParams;

  // ⚠️ A senha recém-gerada vem por COOKIE, nunca pela URL — endereço fica na
  // barra, no histórico, no Referer e no log de acesso. Ela expira sozinha em
  // um minuto: uma Server Component não pode apagar cookie, e um segredo que
  // depende de alguém lembrar de apagá-lo não é um segredo.
  const senhaNova = (await cookies()).get(COOKIE_SENHA)?.value;
  const [emailDaSenha, senhaGerada] = senhaNova ? senhaNova.split("|") : [];
  const eu = await exigirCapacidadeNaPagina("pessoa.gerir");

  const busca = (q ?? "").trim();
  const pagina = Math.max(1, Number(p ?? "1") || 1);
  const de = (pagina - 1) * POR_PAGINA;

  const supabase = await criarClienteServidor();

  // ⚠️ Sem `exigir()` aqui, de propósito: busca sem resultado é resposta
  // legítima, e a contagem separa o erro do vazio logo abaixo.
  // ⚠️ As sete colunas que a lista desenha, e não `*`. `pessoas` tem 44 —
  // endereço inteiro, nomes de pai, mãe e cônjuge, profissão, formação e o
  // `migracao_extras` em jsonb —, e nenhuma delas aparece na tabela. Eram 37
  // colunas × 25 linhas trafegadas à toa em cada abertura da tela mais usada
  // do sistema.
  //
  // A contagem continua `exact`: "página 3 de 640" tem de ser verdade, e
  // estimar erraria o número na cara de quem está paginando.
  let consulta = supabase
    .from("pessoas")
    .select("id, nome, nome_social, email, cpf, passaporte, auth_user_id", { count: "exact" })
    .order("nome")
    .range(de, de + POR_PAGINA - 1);

  if (busca) {
    // Dígitos batem em CPF e CodSNI; letras, no nome. Quem digita "845" está
    // procurando um número, e quem digita "Maria" um nome — a mesma caixa
    // serve aos dois sem a pessoa escolher em qual campo está buscando.
    const digitos = busca.replace(/\D/g, "");
    // ⚠️ Passaporte tem letra E número, então cai nos dois ramos: procurado
    // por "FH123456" ele não é dígito puro, e procurado por "123456" precisa
    // aparecer junto do CPF. Fora daqui, quem é estrangeiro não seria
    // encontrado por documento nenhum.
    const alfanumerico = busca.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    // ⚠️ O valor vai ENTRE ASPAS. O `.or()` do PostgREST separa as condições
    // por vírgula, então "Silva, Maria" quebrava o filtro ao meio: a consulta
    // voltava 400 e a tela ESTOURAVA — procurar por um nome com vírgula
    // derrubava a lista de pessoas. Entre aspas, a vírgula é conteúdo.
    consulta = digitos
      ? consulta.or(
          `cpf.ilike.${entreAspas(`%${digitos}%`)},` +
          `cod_sni.ilike.${entreAspas(`%${digitos}%`)},` +
          `passaporte.ilike.${entreAspas(`%${digitos}%`)}`
        )
      : consulta.or(
          `nome.ilike.${entreAspas(`%${busca}%`)},` +
          `nome_social.ilike.${entreAspas(`%${busca}%`)},` +
          `email.ilike.${entreAspas(`%${busca}%`)},` +
          `passaporte.ilike.${entreAspas(`%${alfanumerico}%`)}`
        );
  }

  const resposta = await consulta;
  if (resposta.error) throw new Error(`Não foi possível ler as pessoas: ${resposta.error.message}`);
  const pessoas = (resposta.data ?? []) as PessoaDaLista[];
  const total = resposta.count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const ids = pessoas.map((x) => x.id);

  // ⚠️ As cinco JUNTAS, e não uma esperando a outra. Só papéis e vínculos
  // dependem de algo — dos `ids` da página —, e nenhuma delas depende das
  // outras: em série, cada uma somava sua ida e volta ao banco no tempo de
  // tela em branco. Esta é a tela mais pesada do sistema, e era a mais lenta
  // por isto, não pelo volume.
  //
  // ⚠️ E `unidades` traz o `tipo`, do qual as Associações Locais são um
  // FILTRO em memória. Buscar as duas listas separadas pedia ao banco a mesma
  // tabela duas vezes, e a segunda vinha inteira dentro da primeira.
  const [rPapeis, rVinculos, rTiposPapel, rUnidades] = await Promise.all([
    ids.length
      ? supabase.from("papeis").select("*").in("pessoa_id", ids).eq("ativo", true)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? supabase.from("pessoa_vinculo_atual").select("*").in("pessoa_id", ids)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("tipos_papel").select("*").eq("ativo", true).order("ordem"),
    supabase.from("unidades").select("id, nome, tipo").eq("ativo", true).order("nome"),
  ]);

  const papeis = rPapeis.data ?? [];
  const vinculos = rVinculos.data ?? [];
  const tiposPapel = exigir(rTiposPapel, "os tipos de papel") as TipoPapelRow[];
  const unidades = exigir(rUnidades, "as unidades") as Pick<UnidadeRow, "id" | "nome" | "tipo">[];

  // Só Associação Local recebe pessoa: é ela que carrega a Organização, e é
  // dela que a Regional é deduzida subindo a árvore.
  const associacoes = unidades.filter((u) => u.tipo === "associacao_local");

  const nomeUnidade = new Map(unidades.map((u) => [u.id, u.nome]));
  const papeisDe = (id: string) => (papeis as PapelRow[]).filter((r) => r.pessoa_id === id);
  const vinculoDe = (id: string) =>
    (vinculos as VinculoAtualRow[]).find((v) => v.pessoa_id === id);

  const podeAcesso = eu.pode("acesso.gerir");
  const podePapel = eu.pode("papel.conceder");

  const linkPagina = (n: number) =>
    `/admin/pessoas?${new URLSearchParams({ ...(busca ? { q: busca } : {}), p: String(n) })}`;

  return (
    <Painel titulo="Pessoas">
      <TituloPagina
        titulo="Pessoas e acesso"
        descricao="Toda pessoa da instituição vive aqui: quem participa, quem estuda, quem compra ingresso e quem opera o sistema. Ter cadastro não é ter acesso — acesso se concede à parte, e a maioria nunca vai precisar."
        acao={
          <BotaoLink href="/admin/pessoas/nova" icone={<IconPlus size={18} className="ti" />}>
            Nova pessoa
          </BotaoLink>
        }
      />

      <Recado erro={erro} ok={ok} />
      {senhaGerada && (
        <div className="sni-recado">
          <Alerta tipo="warning">
            Senha de <strong>{emailDaSenha}</strong>:{" "}
            <span className="num" style={{ fontSize: 16, fontWeight: 600 }}>{senhaGerada}</span>
            {" — "}anote agora. Ela some desta tela em um minuto e não aparece de novo.
          </Alerta>
        </div>
      )}

      <form method="get" className="sni-busca">
        <Campo label="Procurar" htmlFor="q" dica="Nome, e-mail, CPF, passaporte ou CodSNI.">
          <Input id="q" name="q" defaultValue={busca} placeholder="Maria, 845.032… ou 1792123" />
        </Campo>
      </form>

      {pessoas.length === 0 ? (
        <Vazio icone={<IconUsers size={34} className="ti" />} titulo={busca ? "Ninguém com esse dado" : "Ninguém cadastrado ainda"}>
          {busca
            ? "Confira a grafia, ou procure pelo documento — CPF e passaporte são os únicos dados que nunca mudam."
            : "A carga do sistema antigo traz dezesseis mil pessoas. Até lá, cadastre quem precisa operar."}
        </Vazio>
      ) : (
        <>
          <Tabela cabecalho={["Pessoa", "Documento", "Onde está", "Papéis", "Acesso", ""]}>
            {pessoas.map((pessoa) => {
              const vinculo = vinculoDe(pessoa.id);
              const meus = papeisDe(pessoa.id);
              return (
                <Linha key={pessoa.id}>
                  <Celula forte>
                    <Link href={`/admin/pessoas/${pessoa.id}`}>{pessoa.nome_social || pessoa.nome}</Link>
                    {pessoa.email && (
                      <span className="hint" style={{ marginTop: 2 }}>
                        {pessoa.email}
                      </span>
                    )}
                  </Celula>
                  <Celula>
                    {/* Um documento ou o outro, nunca os dois (decisão 0013).
                        A etiqueta aparece só no passaporte: CPF é o caso de
                        99,98% da base e não precisa se anunciar. */}
                    {pessoa.cpf ? (
                      <Num>{formatarCpf(pessoa.cpf)}</Num>
                    ) : (
                      <>
                        <Num>{formatarPassaporte(pessoa.passaporte)}</Num>
                        <span className="hint" style={{ marginTop: 2 }}>
                          Passaporte
                        </span>
                      </>
                    )}
                  </Celula>
                  <Celula>
                    {vinculo ? (
                      <>
                        {vinculo.unidade_nome}
                        {vinculo.organizacao_nome && (
                          <span className="hint" style={{ marginTop: 2 }}>
                            {vinculo.organizacao_nome}
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </Celula>
                  <Celula>
                    {meus.length === 0 ? (
                      "—"
                    ) : (
                      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
                        {meus.map((r) => (
                          <Badge key={r.id} tom={r.unidade_id ? "gray" : "blue"}>
                            {NOME_PAPEL[r.tipo as TipoPapel] ?? r.tipo}
                            {r.unidade_id ? ` · ${nomeUnidade.get(r.unidade_id) ?? "?"}` : ""}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </Celula>
                  <Celula>
                    {pessoa.auth_user_id ? (
                      <Badge tom="success">Entra no sistema</Badge>
                    ) : (
                      <span className="hint">Só cadastro</span>
                    )}
                  </Celula>
                  <Celula alinhar="right">
                    <span style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      {/* Ficha, não modal: mais de trinta campos e anexos
                          não cabem numa caixa que rola (decisão 0015). */}
                      <AcaoLink href={`/admin/pessoas/${pessoa.id}`}>Abrir ficha</AcaoLink>

                      <ModalCadastro
                        gatilho="link"
                        rotulo="Mover"
                        titulo={`Mover ${pessoa.nome}`}
                        descricao="O vínculo atual é encerrado, não apagado: ele é o que explica em que Associação Local a pessoa estava quando fez o curso do ano passado."
                        acao={moverPessoa}
                        rotuloConfirmar="Mover"
                      >
                        <input type="hidden" name="id" value={pessoa.id} />
                        <Campo label="Para qual Associação Local" obrigatorio>
                          <Select name="unidade" defaultValue="" required>
                            <option value="" disabled>
                              Escolha…
                            </option>
                            {associacoes.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.nome}
                              </option>
                            ))}
                          </Select>
                        </Campo>
                      </ModalCadastro>

                      {podePapel && (
                        <ModalCadastro
                          gatilho="link"
                          rotulo="Papéis"
                          titulo={`Papéis de ${pessoa.nome}`}
                          descricao="Papel concedido numa unidade vale também nas unidades abaixo dela."
                          acao={concederPapel}
                          rotuloConfirmar="Conceder"
                        >
                          <input type="hidden" name="pessoa" value={pessoa.id} />
                          {meus.length > 0 && (
                            <div className="sni-lista-papeis">
                              {meus.map((r) => (
                                <div key={r.id} className="sni-lista-papeis-item">
                                  <span>
                                    {NOME_PAPEL[r.tipo as TipoPapel] ?? r.tipo}
                                    {r.unidade_id ? ` · ${nomeUnidade.get(r.unidade_id) ?? "?"}` : " · nacional"}
                                  </span>
                                  <button
                                    type="submit"
                                    formAction={revogarPapel}
                                    name="papel"
                                    value={r.id}
                                    className="sni-acao"
                                    // ⚠️ Sem isto o navegador BARRA o envio: o
                                    // botão divide o formulário com um <select>
                                    // obrigatório e vazio, que é do outro botão.
                                    // Revogar papel era impossível pela tela.
                                    formNoValidate
                                  >
                                    Revogar
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <Campo label="Novo papel" obrigatorio>
                            <Select name="tipo" defaultValue="" required>
                              <option value="" disabled>
                                Escolha…
                              </option>
                              {tiposPapel.map((t) => (
                                <option key={t.codigo} value={t.codigo}>
                                  {t.nome}
                                  {t.escopo === "nacional" ? " (nacional)" : ""}
                                </option>
                              ))}
                            </Select>
                          </Campo>
                          <Campo
                            label="Em qual unidade"
                            dica={`Deixe em branco para os papéis nacionais: ${[...PAPEIS_NACIONAIS].map((t) => NOME_PAPEL[t]).join(", ")}.`}
                          >
                            <Select name="unidade" defaultValue="">
                              <option value="">Nacional</option>
                              {unidades.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.nome}
                                </option>
                              ))}
                            </Select>
                          </Campo>
                        </ModalCadastro>
                      )}

                      {podeAcesso && (
                        <ModalCadastro
                          gatilho="link"
                          rotulo="Acesso"
                          icone={<IconKey size={15} className="ti" />}
                          titulo={`Acesso de ${pessoa.nome}`}
                          descricao="Definir a senha de outra pessoa é poder entrar como ela. Toda passagem por aqui fica registrada na auditoria, com quem fez e quando."
                          acao={definirAcesso}
                          rotuloConfirmar={pessoa.auth_user_id ? "Redefinir senha" : "Criar acesso"}
                        >
                          <input type="hidden" name="pessoa" value={pessoa.id} />
                          {!pessoa.email && (
                            <Alerta tipo="warning">
                              Esta pessoa não tem e-mail no cadastro. É por ele que se entra —
                              informe um antes.
                            </Alerta>
                          )}
                          <Campo
                            label="Senha"
                            dica="Deixe em branco para o sistema gerar uma. A gerada aparece uma vez só, depois de salvar."
                          >
                            <Input name="senha" type="password" autoComplete="new-password" minLength={8} />
                          </Campo>
                          <Campo label="Repita a senha">
                            <Input name="confirmacao" type="password" autoComplete="new-password" />
                          </Campo>
                          <label className="sni-check">
                            <input type="checkbox" name="gerar" value="1" />
                            <span>Deixe as senhas em branco para o sistema gerar uma</span>
                          </label>
                          {pessoa.auth_user_id && pessoa.id !== eu.id && (
                            <button
                              type="submit"
                              formAction={tirarAcesso}
                              name="pessoa"
                              value={pessoa.id}
                              className="sni-acao sni-acao-perigo"
                            >
                              <IconUserOff size={15} className="ti" />
                              Tirar o acesso desta pessoa
                            </button>
                          )}
                        </ModalCadastro>
                      )}
                    </span>
                  </Celula>
                </Linha>
              );
            })}
          </Tabela>

          <nav className="sni-paginacao" aria-label="Páginas">
            <span className="hint">
              <Num>{total}</Num> pessoa{total === 1 ? "" : "s"} · página <Num>{pagina}</Num> de{" "}
              <Num>{paginas}</Num>
            </span>
            <span style={{ display: "inline-flex", gap: 8 }}>
              {pagina > 1 && (
                <a className="sni-acao" href={linkPagina(pagina - 1)}>
                  Anterior
                </a>
              )}
              {pagina < paginas && (
                <a className="sni-acao" href={linkPagina(pagina + 1)}>
                  Próxima
                </a>
              )}
            </span>
          </nav>
        </>
      )}
    </Painel>
  );
}
