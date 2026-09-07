import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  IconAlertCircle, IconCheck, IconFile, IconPaperclip, IconTrash, IconUpload,
} from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import {
  Abas, Alerta, Botao, BotaoLink, Campo, Card, CardCabecalho, Celula,
  GrupoCampos, Input, Linha, Num, Select, Tabela, TituloPagina, Vazio,
} from "@/componentes/ui";
import { pessoaAtual } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteServico } from "@/lib/supabase/service";
import { formatarCpf } from "@/lib/dominio/cpf";
import { formatarPassaporte } from "@/lib/dominio/passaporte";
import { formatarCep } from "@/lib/dominio/endereco-formato";
import { TIPOS_ANEXO, urlAssinada } from "@/lib/anexos";
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
  const eu = await pessoaAtual();
  if (!eu?.pode("pessoa.gerir")) redirect("/painel");

  const { id } = await params;
  const { aba = "dados", erro, ok } = await searchParams;

  // ⚠️ Lida pelo cliente do USUÁRIO, com RLS: é ela que decide se este
  // operador alcança esta pessoa. Ler com a chave de serviço mostraria a ficha
  // de qualquer um a quem administra uma Regional só.
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("pessoas").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const pessoa = data as PessoaRow;

  // Anexos vêm pelo serviço: a tabela não tem GRANT para o navegador, e quem
  // já provou alcançar a pessoa acima pode ver os documentos dela.
  const servico = criarClienteServico();
  const { data: anexosData } = await servico
    .from("pessoa_anexos")
    .select("*")
    .eq("pessoa_id", id)
    .order("criado_em", { ascending: false });
  const anexos = (anexosData ?? []) as PessoaAnexoRow[];

  // ⚠️ URL assinada emitida AQUI, no servidor, uma por anexo. O caminho do
  // arquivo nunca chega ao navegador — só um endereço que expira em uma hora.
  const links = new Map<string, string | null>();
  for (const a of anexos) links.set(a.id, await urlAssinada(a.caminho));

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

      {erro && (
        <div style={{ marginBottom: 16 }}>
          <Alerta tipo="danger" icone={<IconAlertCircle size={20} className="ti" />}>
            {erro}
          </Alerta>
        </div>
      )}
      {ok && (
        <div style={{ marginBottom: 16 }}>
          <Alerta tipo="success" icone={<IconCheck size={20} className="ti" />}>
            {ok}
          </Alerta>
        </div>
      )}

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
              <div className="sni-form-grid">
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
                          <span className="sni-hint" style={{ marginTop: 2 }}>
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
                          <span className="sni-hint">{a.nome_arquivo} (indisponível)</span>
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
            <p className="sni-hint">
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
