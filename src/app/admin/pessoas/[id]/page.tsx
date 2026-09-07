import { notFound } from "next/navigation";
import Link from "next/link";
import {
  IconAlertCircle, IconCheck, IconFile, IconPaperclip, IconTrash, IconUpload,
} from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import {
  Abas, Alerta, Botao, BotaoLink, Campo, Card, CardCabecalho, Celula, GrupoCampos, Input, Linha, Num, Recado, Select, Tabela, TituloPagina, Vazio,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteServico } from "@/lib/supabase/service";
import { formatarCpf } from "@/lib/dominio/cpf";
import { formatarPassaporte } from "@/lib/dominio/passaporte";
import { formatarCep } from "@/lib/dominio/endereco-formato";
import { TIPOS_ANEXO, urlsAssinadas } from "@/lib/anexos";
import type { PessoaAnexoRow, PessoaRow } from "@/lib/supabase/tipos";
import CamposPessoa from "../CamposPessoa";
import { anexarDocumento, editarPessoa, removerAnexo } from "../actions";

const NOME_TIPO = Object.fromEntries(TIPOS_ANEXO.map((t) => [t.codigo, t.nome]));

function tamanhoLegivel(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function FichaPessoaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string; erro?: string; ok?: string }>;
}) {
  const eu = await exigirCapacidadeNaPagina("pessoa.gerir");

  const { id } = await params;
  const { aba = "dados", erro, ok } = await searchParams;

  // ⚠️ Lida pelo cliente do USUÁRIO, com RLS: é ela que decide se este
  // operador alcança esta pessoa. Ler com a chave de serviço mostraria a ficha
  // de qualquer um a quem administra uma Regional só.
  const supabase = await criarClienteServidor();

  // ⚠️ As duas JUNTAS: a de anexos usa o `id` da URL, não o resultado da
  // primeira. Em série, a ficha esperava duas idas ao banco antes de qualquer
  // pixel. A linha de baixo continua sendo o portão de RLS.
  //
  // Anexos vêm pelo serviço: a tabela não tem GRANT para o navegador, e quem
  // provar alcançar a pessoa pode ver os documentos dela.
  const servico = criarClienteServico();
  const [rPessoa, rAnexos] = await Promise.all([
    supabase.from("pessoas").select("*").eq("id", id).maybeSingle(),
    servico.from("pessoa_anexos").select("*").eq("pessoa_id", id).order("criado_em", { ascending: false }),
  ]);

  if (!rPessoa.data) notFound();
  const pessoa = rPessoa.data as PessoaRow;
  const anexos = (rAnexos.data ?? []) as PessoaAnexoRow[];

  // ⚠️ URLs assinadas emitidas AQUI, no servidor, e todas de UMA vez. O caminho
  // do arquivo nunca chega ao navegador — só um endereço que expira em uma
  // hora. Uma chamada por anexo fazia a ficha esperar uma ida por documento.
  const porCaminho = await urlsAssinadas(anexos.map((a) => a.caminho));
  const links = new Map(anexos.map((a) => [a.id, porCaminho.get(a.caminho) ?? null]));

  const documento = pessoa.cpf
    ? { rotulo: "CPF", valor: formatarCpf(pessoa.cpf) }
    : { rotulo: "Passaporte", valor: formatarPassaporte(pessoa.passaporte) };

  const base = `/admin/pessoas/${id}`;

  return (
    <Painel titulo={pessoa.nome_social || pessoa.nome}>
      <TituloPagina
        titulo={pessoa.nome_social || pessoa.nome}
        descricao={
          <>
            {documento.rotulo} <Num>{documento.valor}</Num>
            {pessoa.cod_sni && (
              <>
                {" · "}CodSNI <Num>{pessoa.cod_sni}</Num>
              </>
            )}
            {pessoa.falecimento && " · Falecida"}
          </>
        }
        voltar={{ href: "/admin/pessoas", texto: "Pessoas" }}
      />

      <Recado erro={erro} ok={ok} />

      <Abas
        atual={aba}
        abas={[
          { chave: "dados", rotulo: "Dados cadastrais", href: base },
          { chave: "anexos", rotulo: "Anexos", href: `${base}?aba=anexos`, contagem: anexos.length },
        ]}
      />

      {aba === "anexos" ? (
        <>
          <Card>
            <CardCabecalho
              icone={<IconUpload size={20} className="ti" />}
              titulo="Anexar documento"
              descricao="Imagem (JPG, PNG, WEBP, HEIC) ou PDF, até 10 MB."
            />
            <form action={anexarDocumento}>
              <input type="hidden" name="pessoa_id" value={id} />
              <div className="form-grid">
                <Campo label="Tipo" obrigatorio>
                  <Select name="tipo" defaultValue="rg" required>
                    {TIPOS_ANEXO.map((t) => (
                      <option key={t.codigo} value={t.codigo}>
                        {t.nome}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo label="Descrição" dica="Opcional. Ajuda quando há vários do mesmo tipo.">
                  <Input name="descricao" maxLength={200} />
                </Campo>
              </div>
              <Campo label="Arquivo" obrigatorio>
                <Input
                  type="file"
                  name="arquivo"
                  required
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                />
              </Campo>
              <div className="sni-form-rodape">
                <Botao type="submit" icone={<IconPaperclip size={18} className="ti" />}>
                  Anexar
                </Botao>
              </div>
            </form>
          </Card>

          <div style={{ marginTop: 24 }}>
            {anexos.length === 0 ? (
              <Vazio titulo="Nenhum documento ainda">
                RG, CNH, certidões, comprovante de residência, termos de nomeação e diplomas
                ficam aqui.
              </Vazio>
            ) : (
              <Tabela cabecalho={["Documento", "Arquivo", "Tamanho", "Quando", ""]}>
                {anexos.map((a) => {
                  const link = links.get(a.id);
                  return (
                    <Linha key={a.id}>
                      <Celula forte>
                        {NOME_TIPO[a.tipo] ?? a.tipo}
                        {a.descricao && (
                          <span className="hint" style={{ marginTop: 2 }}>
                            {a.descricao}
                          </span>
                        )}
                      </Celula>
                      <Celula>
                        {link ? (
                          // ⚠️ `rel="noopener"`: sem isso a aba aberta pode
                          // mexer nesta pela referência `window.opener`.
                          <Link href={link} target="_blank" rel="noopener noreferrer">
                            <IconFile size={15} className="ti" aria-hidden="true" /> {a.nome_arquivo}
                          </Link>
                        ) : (
                          <span className="hint">{a.nome_arquivo} (indisponível)</span>
                        )}
                      </Celula>
                      <Celula>
                        <Num>{tamanhoLegivel(a.tamanho)}</Num>
                      </Celula>
                      <Celula>
                        <Num>{new Date(a.criado_em).toLocaleDateString("pt-BR")}</Num>
                      </Celula>
                      <Celula alinhar="right">
                        <form action={removerAnexo}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="pessoa_id" value={id} />
                          <Botao
                            type="submit"
                            variante="ghost"
                            tamanho="sm"
                            icone={<IconTrash size={16} className="ti" />}
                          >
                            Remover
                          </Botao>
                        </form>
                      </Celula>
                    </Linha>
                  );
                })}
              </Tabela>
            )}
          </div>
        </>
      ) : (
        <form action={editarPessoa}>
          <CamposPessoa pessoa={pessoa} />
          <GrupoCampos titulo="Endereço gravado">
            <p className="hint">
              CEP <Num>{formatarCep(pessoa.cep)}</Num>
              {pessoa.cidade && ` · ${pessoa.cidade}`}
              {pessoa.uf && `/${pessoa.uf}`}
            </p>
          </GrupoCampos>
          <div className="sni-form-rodape">
            <BotaoLink href="/admin/pessoas" variante="secondary">
              Voltar
            </BotaoLink>
            <Botao type="submit">Salvar</Botao>
          </div>
        </form>
      )}
    </Painel>
  );
}
