import "server-only";
import { randomUUID } from "node:crypto";
import { criarClienteServico } from "@/lib/supabase/service";

/**
 * Documentos da ficha da pessoa.
 *
 * ⚠️ Tudo passa pelo SERVIDOR com a chave de serviço. O navegador nunca fala
 * com o balde: ele recebe URL assinada de vida curta, emitida depois de a
 * capacidade ser conferida. Documento de identidade não se protege por policy
 * de leitura — se o caminho vaza, o arquivo vazou.
 */

export const BALDE = "documentos";

export const TIPOS_ANEXO = [
  { codigo: "rg", nome: "RG" },
  { codigo: "cnh", nome: "CNH" },
  { codigo: "certidao_nascimento", nome: "Certidão de Nascimento" },
  { codigo: "certidao_casamento", nome: "Certidão de Casamento" },
  { codigo: "certidao_obito", nome: "Certidão de Óbito" },
  { codigo: "comprovante_residencia", nome: "Comprovante de residência" },
  { codigo: "termo_nomeacao", nome: "Termo de Nomeação" },
  { codigo: "diploma", nome: "Diploma" },
  { codigo: "foto", nome: "Foto" },
  { codigo: "outros", nome: "Outros" },
] as const;

const MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
const TAMANHO_MAXIMO = 10 * 1024 * 1024;

/** Tira do nome tudo que atrapalha num caminho, preservando a extensão. */
function nomeSeguro(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);
}

export type ResultadoAnexo = { ok: true; id: string } | { ok: false; erro: string };

export async function guardarAnexo(opcoes: {
  pessoaId: string;
  tipo: string;
  descricao?: string | null;
  arquivo: File;
  atorId: string | null;
}): Promise<ResultadoAnexo> {
  const { pessoaId, tipo, arquivo, atorId } = opcoes;

  if (!arquivo || arquivo.size === 0) return { ok: false, erro: "Escolha um arquivo." };
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { ok: false, erro: "O arquivo passa de 10 MB. Reduza ou envie em partes." };
  }
  if (arquivo.type && !MIMES.includes(arquivo.type)) {
    return { ok: false, erro: "Aceitamos imagem (JPG, PNG, WEBP, HEIC) e PDF." };
  }

  const servico = criarClienteServico();
  // ⚠️ UUID no caminho, e não o nome do arquivo: dois "rg.jpg" da mesma pessoa
  // se sobrescreveriam, e o primeiro sumiria sem ninguém notar.
  const caminho = `${pessoaId}/${randomUUID()}-${nomeSeguro(arquivo.name)}`;

  const { error: erroUpload } = await servico.storage
    .from(BALDE)
    .upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false });
  if (erroUpload) return { ok: false, erro: `Não foi possível guardar o arquivo: ${erroUpload.message}` };

  const { data, error } = await servico
    .from("pessoa_anexos")
    .insert({
      pessoa_id: pessoaId,
      tipo,
      descricao: opcoes.descricao?.trim() || null,
      caminho,
      nome_arquivo: arquivo.name.slice(0, 200),
      mime: arquivo.type || null,
      tamanho: arquivo.size,
      criado_por: atorId,
    })
    .select("id")
    .single();

  if (error) {
    // ⚠️ Desfaz o upload. Sem isto, o arquivo ficaria no balde sem linha que o
    // referencie — invisível na tela, cobrado no armazenamento, e impossível
    // de apagar depois porque ninguém sabe que ele existe.
    await servico.storage.from(BALDE).remove([caminho]);
    return { ok: false, erro: `Não foi possível registrar o anexo: ${error.message}` };
  }

  // A foto também vira a foto do cadastro: é para isso que ela serve.
  if (tipo === "foto") {
    await servico.from("pessoas").update({ foto_url: caminho }).eq("id", pessoaId);
  }

  return { ok: true, id: data.id };
}

/**
 * As URLs de vida curta dos anexos, indexadas pelo caminho. Uma hora chega
 * para abrir e baixar; um dia, não.
 *
 * ⚠️ UMA chamada ao Storage, e não uma por documento. A ficha emitia as
 * assinaturas num laço `await`: uma pessoa com RG, CNH, comprovante de
 * residência, certidão e diploma esperava seis idas encadeadas — e cada uma
 * ainda montava um cliente novo — só para desenhar a lista de anexos.
 */
export async function urlsAssinadas(
  caminhos: string[],
  segundos = 3600
): Promise<Map<string, string | null>> {
  if (caminhos.length === 0) return new Map();
  const servico = criarClienteServico();
  const { data } = await servico.storage.from(BALDE).createSignedUrls(caminhos, segundos);
  return new Map((data ?? []).map((d) => [d.path ?? "", d.signedUrl ?? null]));
}

/**
 * Apaga um anexo de UMA pessoa.
 *
 * ⚠️ `pessoaId` é obrigatório e entra nas duas consultas. Quem chama já
 * conferiu, com o cliente do usuário, que alcança essa pessoa — mas aqui se
 * escreve com a chave de serviço, que ignora policy. Sem amarrar o anexo à
 * pessoa conferida, bastava trocar o `id` no formulário para apagar o
 * documento de alguém fora do alcance: a conferência olhava uma pessoa e o
 * apagamento tocava outra.
 */
export async function apagarAnexo(id: string, pessoaId: string): Promise<{ ok: boolean; erro?: string }> {
  const servico = criarClienteServico();
  const { data: anexo } = await servico
    .from("pessoa_anexos")
    .select("caminho, tipo, pessoa_id")
    .eq("id", id)
    .eq("pessoa_id", pessoaId)
    .maybeSingle();
  if (!anexo) return { ok: false, erro: "Esse anexo não existe mais, ou não é dessa pessoa." };

  const { error } = await servico.from("pessoa_anexos").delete().eq("id", id).eq("pessoa_id", pessoaId);
  if (error) return { ok: false, erro: error.message };

  // ⚠️ Primeiro a linha, depois o arquivo. Na ordem inversa, uma falha ao
  // apagar a linha deixaria a tela mostrando um anexo cujo arquivo já não
  // existe — e clicar nele daria erro sem explicação.
  await servico.storage.from(BALDE).remove([anexo.caminho]);

  if (anexo.tipo === "foto") {
    await servico.from("pessoas").update({ foto_url: null }).eq("id", anexo.pessoa_id).eq("foto_url", anexo.caminho);
  }
  return { ok: true };
}
