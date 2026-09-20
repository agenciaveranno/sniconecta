"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirCapacidade } from "@/lib/auth";
import { conexao } from "@/lib/db";
import { registrar } from "@/lib/auditoria";

/**
 * Escritas do módulo `eventos`.
 *
 * ⚠️ Postgres direto, pelo pooler, e capacidade na primeira linha de cada
 * ação. As tabelas de `eventos.*` não têm GRANT para o navegador: esta é a
 * única porta, e quem a guarda é `exigirCapacidade` — não há policy de escrita
 * para segurar quem passar daqui.
 */

const ROTA = "/eventos/admin";

function falhar(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * O promotor chega num campo só — "unidade:<uuid>" — e aqui vira a coluna
 * certa.
 *
 * ⚠️ São TRÊS colunas no banco porque são três tabelas diferentes, cada uma
 * com a sua chave estrangeira. Um seletor por coluna deixaria a tela permitir
 * preencher duas, e o `check promotor_unico` recusaria depois de tudo
 * preenchido. Um campo só é o que faz a tela não oferecer o impossível.
 */
function colunasDoPromotor(valor: string): {
  organizacao: string | null;
  unidade: string | null;
  local: string | null;
} {
  const vazio = { organizacao: null, unidade: null, local: null };
  if (!valor) return vazio;
  const [tipo, id] = valor.split(":", 2);
  if (!id) return vazio;
  if (tipo === "organizacao") return { ...vazio, organizacao: id };
  if (tipo === "unidade") return { ...vazio, unidade: id };
  if (tipo === "local") return { ...vazio, local: id };
  return vazio;
}

const schema = z.object({
  nome: z.string().trim().min(3, "Dê um nome ao evento."),
  data_inicial: z.string().trim().min(1, "Informe a data de início."),
  data_final: z.string().trim().min(1, "Informe a data de término."),
  local: z.string().trim().optional().transform((v) => v || null),
  promotor: z.string().trim().optional().transform((v) => v || ""),
});

/**
 * ⚠️ A recusa do banco vira frase sobre a consequência. "violates check
 * constraint datas_coerentes" não diz a quem cadastra que o término ficou
 * antes do início.
 */
function traduzir(mensagem: string): string {
  if (mensagem.includes("datas_coerentes")) {
    return "O término não pode ser antes do início. Confira as duas datas.";
  }
  if (mensagem.includes("promotor_unico")) {
    return "O evento tem um promotor só — é ele que diz em qual conta o dinheiro cai.";
  }
  if (mensagem.includes("eventos_slug_key")) {
    return "Já existe um evento com esse endereço na web.";
  }
  return mensagem;
}

export async function criarEvento(formData: FormData) {
  const eu = await exigirCapacidade("eventos.gerir");

  const dados = schema.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message);

  const p = colunasDoPromotor(dados.data.promotor);
  const sql = conexao();
  try {
    const [criado] = await sql<{ id: number }[]>`
      insert into eventos.eventos
        (nome, data_inicial, data_final, local_id,
         promotor_organizacao_id, promotor_unidade_id, promotor_local_id)
      values
        (${dados.data.nome}, ${dados.data.data_inicial}, ${dados.data.data_final},
         ${dados.data.local}, ${p.organizacao}, ${p.unidade}, ${p.local})
      returning id
    `;
    // A trilha nunca lança: uma falha ao registrar não pode desfazer o que
    // acabou de ser criado.
    await registrar({
      atorId: eu?.id,
      acao: "eventos.criado",
      entidade: "eventos.eventos",
      entidadeId: String(criado?.id ?? ""),
      detalhe: { nome: dados.data.nome },
    });
  } catch (e) {
    falhar(traduzir(e instanceof Error ? e.message : String(e)));
  }

  revalidatePath(ROTA);
  revalidatePath("/eventos");
  redirect(`${ROTA}?ok=${encodeURIComponent("Evento cadastrado.")}`);
}

export async function editarEvento(formData: FormData) {
  const eu = await exigirCapacidade("eventos.gerir");

  const id = Number(formData.get("id") ?? 0);
  if (!id) falhar("Evento não informado.");

  const dados = schema.safeParse(Object.fromEntries(formData));
  if (!dados.success) falhar(dados.error.issues[0].message);

  const p = colunasDoPromotor(dados.data.promotor);
  const sql = conexao();
  try {
    await sql`
      update eventos.eventos set
        nome          = ${dados.data.nome},
        data_inicial  = ${dados.data.data_inicial},
        data_final    = ${dados.data.data_final},
        local_id      = ${dados.data.local},
        promotor_organizacao_id = ${p.organizacao},
        promotor_unidade_id     = ${p.unidade},
        promotor_local_id       = ${p.local},
        atualizado_em = now()
      where id = ${id}
    `;
    await registrar({
      atorId: eu?.id,
      acao: "eventos.editado",
      entidade: "eventos.eventos",
      entidadeId: String(id),
      detalhe: { nome: dados.data.nome },
    });
  } catch (e) {
    falhar(traduzir(e instanceof Error ? e.message : String(e)));
  }

  revalidatePath(ROTA);
  revalidatePath("/eventos");
  redirect(`${ROTA}?ok=${encodeURIComponent("Evento salvo.")}`);
}

/**
 * Desativa em vez de apagar.
 *
 * ⚠️ Apagar evento levaria junto a inscrição de quem foi — e o comprovante
 * que essa pessoa guardou continuaria existindo no e-mail dela, apontando
 * para o nada. Evento desativado some da venda e continua explicando o
 * histórico.
 */
export async function alternarEventoAtivo(formData: FormData) {
  const eu = await exigirCapacidade("eventos.gerir");

  const id = Number(formData.get("id") ?? 0);
  const ativo = formData.get("ativo") === "true";
  if (!id) falhar("Evento não informado.");

  const sql = conexao();
  try {
    await sql`update eventos.eventos set ativo = ${!ativo}, atualizado_em = now() where id = ${id}`;
    await registrar({
      atorId: eu?.id,
      acao: ativo ? "eventos.desativado" : "eventos.reativado",
      entidade: "eventos.eventos",
      entidadeId: String(id),
    });
  } catch (e) {
    falhar(traduzir(e instanceof Error ? e.message : String(e)));
  }

  revalidatePath(ROTA);
  revalidatePath("/eventos");
  redirect(`${ROTA}?ok=${encodeURIComponent(ativo ? "Evento desativado." : "Evento reativado.")}`);
}
