import "server-only";
import { randomUUID } from "node:crypto";
import { criarClienteServico } from "@/lib/supabase/service";
import type { UnidadeFotoRow } from "@/lib/supabase/tipos";

/**
 * As fotos que o site publica de cada unidade.
 *
 * ⚠️ Mesmo desenho dos anexos da ficha (`lib/anexos.ts`), e de propósito: tudo
 * passa pelo SERVIDOR com a chave de serviço, o navegador nunca fala com o
 * balde, e quem precisa ver recebe URL assinada de vida curta. Dois jeitos de
 * guardar arquivo no mesmo sistema divergem na primeira correção — e a que
 * ficar para trás é a que vaza.
 *
 * ⚠️ BALDE PRIVADO, embora foto de fachada seja pública por natureza. O que
 * sobe por engano numa tela de upload é documento, é foto de criança, é o que
 * ninguém quis publicar — e em balde público isso vira URL permanente que não
 * sai do cache de ninguém. Privado é a escolha REVERSÍVEL: no dia em que o
 * site pedir CDN, basta virar a chave; o contrário não existe.
 */

export const BALDE_FOTOS = "fotos-unidades";

/** Doze por unidade: fachada, salão, sala, cozinha, estacionamento e folga. */
export const MAXIMO_POR_UNIDADE = 12;

const MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

function nomeSeguro(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);
}

export type ResultadoFoto = { ok: true; id: string } | { ok: false; erro: string };

export async function guardarFoto(opcoes: {
  unidadeId: string;
  legenda?: string | null;
  arquivo: File;
  atorId: string | null;
}): Promise<ResultadoFoto> {
  const { unidadeId, arquivo, atorId } = opcoes;

  if (!arquivo || arquivo.size === 0) return { ok: false, erro: "Escolha uma imagem." };
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { ok: false, erro: "A imagem passa de 8 MB. Reduza antes de enviar." };
  }
  if (arquivo.type && !MIMES.includes(arquivo.type)) {
    return { ok: false, erro: "Aceitamos JPG, PNG, WEBP e HEIC." };
  }

  const servico = criarClienteServico();

  // ⚠️ O teto é conferido no SERVIDOR, e não só escondendo o botão. A tela
  // pode estar aberta em duas abas, e o formulário chega de qualquer lugar.
  const { count } = await servico
    .from("unidade_fotos")
    .select("id", { count: "exact", head: true })
    .eq("unidade_id", unidadeId);
  if ((count ?? 0) >= MAXIMO_POR_UNIDADE) {
    return {
      ok: false,
      erro: `Esta unidade já tem ${MAXIMO_POR_UNIDADE} fotos. Apague uma antes de subir outra.`,
    };
  }

  // ⚠️ UUID no caminho, e não o nome do arquivo: duas "fachada.jpg" da mesma
  // unidade se sobrescreveriam, e a primeira sumiria sem ninguém notar.
  const caminho = `${unidadeId}/${randomUUID()}-${nomeSeguro(arquivo.name)}`;

  const { error: erroUpload } = await servico.storage
    .from(BALDE_FOTOS)
    .upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false });
  if (erroUpload) {
    return { ok: false, erro: `Não foi possível guardar a imagem: ${erroUpload.message}` };
  }

  const { data, error } = await servico
    .from("unidade_fotos")
    .insert({
      unidade_id: unidadeId,
      caminho,
      nome_arquivo: arquivo.name.slice(0, 200),
      mime: arquivo.type || null,
      tamanho: arquivo.size,
      legenda: opcoes.legenda?.trim() || null,
      // Entra no fim da fila; reordenar é decisão de quem organiza.
      ordem: (count ?? 0) + 1,
      // ⚠️ A PRIMEIRA vira capa sozinha. Sem isto, a unidade fica com fotos e
      // sem capa — e a listagem do site mostra um retângulo cinza ao lado de
      // uma unidade que tem doze fotos.
      capa: (count ?? 0) === 0,
    })
    .select("id")
    .single();

  if (error) {
    // ⚠️ Desfaz o upload. Sem isto, o arquivo fica no balde sem linha que o
    // referencie — invisível na tela, cobrado no armazenamento, e impossível
    // de apagar depois porque ninguém sabe que ele existe.
    await servico.storage.from(BALDE_FOTOS).remove([caminho]);
    return { ok: false, erro: `Não foi possível registrar a foto: ${error.message}` };
  }

  return { ok: true, id: data.id };
}

export type FotoComUrl = UnidadeFotoRow & { url: string | null };

/**
 * As fotos de uma unidade, já com URL assinada.
 *
 * ⚠️ UMA chamada ao Storage para todas, e não uma por foto. Doze assinaturas
 * encadeadas são doze idas de rede para desenhar uma grade — e é a mesma lição
 * que os anexos da ficha já tinham aprendido.
 *
 * ⚠️ Devolve `null` em vez de lançar quando a tabela ainda não existe. A
 * migração que a cria só aplica depois de alguém aprovar a execução no GitHub
 * (ver Configurações → Estado do banco), e entre o deploy e a aprovação esta
 * tela abriria com erro 500 sem dizer por quê.
 */
export async function fotosDaUnidade(
  unidadeId: string,
  segundos = 3600
): Promise<FotoComUrl[] | null> {
  const servico = criarClienteServico();
  const { data, error } = await servico
    .from("unidade_fotos")
    .select("*")
    .eq("unidade_id", unidadeId)
    .order("capa", { ascending: false })
    .order("ordem", { ascending: true })
    .order("criado_em", { ascending: true });

  if (error) return null;
  const fotos = data ?? [];
  if (fotos.length === 0) return [];

  const { data: assinadas } = await servico.storage
    .from(BALDE_FOTOS)
    .createSignedUrls(fotos.map((f) => f.caminho), segundos);
  const porCaminho = new Map((assinadas ?? []).map((a) => [a.path ?? "", a.signedUrl ?? null]));

  return fotos.map((f) => ({ ...f, url: porCaminho.get(f.caminho) ?? null }));
}

/**
 * ⚠️ `unidadeId` é obrigatório e entra nas duas consultas, como no anexo da
 * ficha. Quem chama já conferiu que alcança essa unidade — mas aqui se escreve
 * com a chave de serviço, que ignora policy. Sem amarrar a foto à unidade
 * conferida, bastava trocar o `id` no formulário para apagar a foto de uma
 * unidade fora do alcance.
 */
export async function apagarFoto(
  id: string,
  unidadeId: string
): Promise<{ ok: boolean; erro?: string }> {
  const servico = criarClienteServico();
  const { data: foto } = await servico
    .from("unidade_fotos")
    .select("caminho, capa")
    .eq("id", id)
    .eq("unidade_id", unidadeId)
    .maybeSingle();
  if (!foto) return { ok: false, erro: "Essa foto não existe mais, ou não é desta unidade." };

  const { error } = await servico
    .from("unidade_fotos")
    .delete()
    .eq("id", id)
    .eq("unidade_id", unidadeId);
  if (error) return { ok: false, erro: error.message };

  // ⚠️ Primeiro a linha, depois o arquivo. Na ordem inversa, uma falha ao
  // apagar a linha deixaria a tela mostrando uma foto cujo arquivo já não
  // existe — e a URL assinada daria erro sem explicação.
  await servico.storage.from(BALDE_FOTOS).remove([foto.caminho]);

  // ⚠️ Apagou a capa: outra assume. Sem isto, a unidade fica com onze fotos e
  // nenhuma capa, e a listagem do site mostra retângulo cinza.
  if (foto.capa) {
    const { data: proxima } = await servico
      .from("unidade_fotos")
      .select("id")
      .eq("unidade_id", unidadeId)
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (proxima) {
      await servico.from("unidade_fotos").update({ capa: true }).eq("id", proxima.id);
    }
  }
  return { ok: true };
}

/**
 * Troca a capa da unidade.
 *
 * ⚠️ Tira a de todas ANTES de pôr na escolhida. O banco tem índice único
 * parcial em `(unidade_id) where capa` — pôr primeiro dá conflito, e o erro
 * que chega à tela fala de restrição em vez de falar de capa.
 */
export async function definirCapa(
  id: string,
  unidadeId: string
): Promise<{ ok: boolean; erro?: string }> {
  const servico = criarClienteServico();
  await servico.from("unidade_fotos").update({ capa: false }).eq("unidade_id", unidadeId);
  const { error } = await servico
    .from("unidade_fotos")
    .update({ capa: true })
    .eq("id", id)
    .eq("unidade_id", unidadeId);
  return error ? { ok: false, erro: error.message } : { ok: true };
}
