"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirCapacidade } from "@/lib/auth";
import { conexao } from "@/lib/db";
import { registrar } from "@/lib/auditoria";
import { centavosDe } from "@/lib/dominio/dinheiro";
import {
  conferirVenda, FORMAS_BALCAO, tipoDeVenda, totalCobrado, type FormaBalcao,
} from "@/lib/dominio/venda";
import type { TipoParaVendaDoBanco } from "./consultas";

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
  // ⚠️ Volta para a PÁGINA do evento, não para a lista: editar acontece lá
  // desde a decisão 0020, e devolver para a lista faria quem salvou perder de
  // vista o que acabou de mexer — e a aba em que estava.
  redirect(`/eventos/admin/${id}?aba=dados&ok=${encodeURIComponent("Evento salvo.")}`);
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

// ─── Tipos de ingresso ───────────────────────────────────────────────────────

/**
 * Sem tipo de ingresso, o evento não vende: é o tipo que diz o que se compra,
 * por quanto e em quantas vezes. Esta é a peça que faltava.
 *
 * ⚠️ Mesma zona nomeada da leitura (`consultas.ts`). A janela de venda é
 * `timestamptz` e o formulário manda `datetime-local`, sem fuso: gravado cru,
 * o Postgres leria como UTC e a venda marcada para as 10h abriria às 7h.
 */
const FUSO = "America/Sao_Paulo";

function rotaDoEvento(id: number, aba = "ingressos") {
  return `/eventos/admin/${id}?aba=${aba}`;
}

function falharNoEvento(eventoId: number, mensagem: string): never {
  redirect(`${rotaDoEvento(eventoId)}&erro=${encodeURIComponent(mensagem)}`);
}

/** Campo numérico opcional: vazio vira null, e ZERO continua sendo zero. */
function inteiroOuNulo(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Texto de data-hora do formulário: vazio vira null. */
function quandoOuNulo(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

const schemaIngresso = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao tipo de ingresso."),
  descricao: z.string().trim().optional().transform((v) => v || null),
  papel: z.enum(["principal", "adicional"]),
});

/**
 * ⚠️ A recusa do banco vira frase sobre a consequência, como no evento.
 * "violates check constraint faixa_etaria" não diz a quem cadastra que a idade
 * máxima ficou abaixo da mínima.
 */
function traduzirIngresso(mensagem: string): string {
  if (mensagem.includes("faixa_etaria")) {
    return "A idade máxima não pode ser menor que a mínima. Confira as duas.";
  }
  if (mensagem.includes("valor_centavos")) {
    return "O valor não pode ser negativo. Para ingresso gratuito, deixe zero.";
  }
  if (mensagem.includes("max_parcelas")) {
    return "O parcelamento é de pelo menos 1 vez.";
  }
  if (mensagem.includes("quantidade")) {
    return "A quantidade não pode ser negativa. Deixe em branco para não ter limite.";
  }
  return mensagem;
}

/**
 * Os campos que criar e editar têm em comum — nunca dois jeitos de ler o mesmo
 * formulário.
 */
function camposDoIngresso(formData: FormData) {
  const dados = schemaIngresso.safeParse(Object.fromEntries(formData));
  const eventoId = Number(formData.get("evento_id") ?? 0);
  if (!eventoId) falhar("Evento não informado.");
  if (!dados.success) falharNoEvento(eventoId, dados.error.issues[0].message);

  // ⚠️ `centavosDe` e não `Number(...) * 100`: o campo aceita "1.234,56" e
  // "1234.56", e multiplicar float por 100 produz 123455.99999999999.
  const valor = centavosDe(String(formData.get("valor") ?? "")) ?? 0;

  return {
    eventoId,
    ...dados.data,
    valor_centavos: valor,
    max_parcelas: inteiroOuNulo(formData.get("max_parcelas")) ?? 1,
    quantidade: inteiroOuNulo(formData.get("quantidade")),
    venda_inicio: quandoOuNulo(formData.get("venda_inicio")),
    venda_fim: quandoOuNulo(formData.get("venda_fim")),
    idade_min: inteiroOuNulo(formData.get("idade_min")),
    idade_max: inteiroOuNulo(formData.get("idade_max")),
    unico_por_cpf: formData.get("unico_por_cpf") === "on",
    // ⚠️ Só faz sentido em ingresso ADICIONAL. Um principal que exige
    // principal não é comprável por ninguém — e o banco aceitaria a linha.
    exige_principal:
      dados.data.papel === "adicional" && formData.get("exige_principal") === "on",
    exibir_venda_publica: formData.get("exibir_venda_publica") === "on",
  };
}

export async function criarTipoIngresso(formData: FormData) {
  const eu = await exigirCapacidade("eventos.gerir");
  const c = camposDoIngresso(formData);

  const sql = conexao();
  try {
    const [criado] = await sql<{ id: number }[]>`
      insert into eventos.ingresso_tipos
        (evento_id, nome, descricao, valor_centavos, max_parcelas, quantidade,
         venda_inicio, venda_fim, idade_min, idade_max, unico_por_cpf, papel,
         exige_principal, exibir_venda_publica)
      values
        (${c.eventoId}, ${c.nome}, ${c.descricao}, ${c.valor_centavos},
         ${c.max_parcelas}, ${c.quantidade},
         ${c.venda_inicio}::timestamp at time zone ${FUSO},
         ${c.venda_fim}::timestamp at time zone ${FUSO},
         ${c.idade_min}, ${c.idade_max}, ${c.unico_por_cpf}, ${c.papel},
         ${c.exige_principal}, ${c.exibir_venda_publica})
      returning id
    `;
    await registrar({
      atorId: eu?.id,
      acao: "eventos.ingresso_tipo.criado",
      entidade: "eventos.ingresso_tipos",
      entidadeId: String(criado?.id ?? ""),
      detalhe: { evento_id: c.eventoId, nome: c.nome, valor_centavos: c.valor_centavos },
    });
  } catch (e) {
    falharNoEvento(c.eventoId, traduzirIngresso(e instanceof Error ? e.message : String(e)));
  }

  revalidatePath(rotaDoEvento(c.eventoId));
  revalidatePath("/eventos");
  redirect(`${rotaDoEvento(c.eventoId)}&ok=${encodeURIComponent("Tipo de ingresso cadastrado.")}`);
}

export async function editarTipoIngresso(formData: FormData) {
  const eu = await exigirCapacidade("eventos.gerir");
  const c = camposDoIngresso(formData);

  const id = Number(formData.get("id") ?? 0);
  if (!id) falharNoEvento(c.eventoId, "Tipo de ingresso não informado.");

  const sql = conexao();
  try {
    await sql`
      update eventos.ingresso_tipos set
        nome           = ${c.nome},
        descricao      = ${c.descricao},
        valor_centavos = ${c.valor_centavos},
        max_parcelas   = ${c.max_parcelas},
        quantidade     = ${c.quantidade},
        venda_inicio   = ${c.venda_inicio}::timestamp at time zone ${FUSO},
        venda_fim      = ${c.venda_fim}::timestamp at time zone ${FUSO},
        idade_min      = ${c.idade_min},
        idade_max      = ${c.idade_max},
        unico_por_cpf  = ${c.unico_por_cpf},
        papel          = ${c.papel},
        exige_principal = ${c.exige_principal},
        exibir_venda_publica = ${c.exibir_venda_publica}
      where id = ${id} and evento_id = ${c.eventoId}
    `;
    await registrar({
      atorId: eu?.id,
      acao: "eventos.ingresso_tipo.editado",
      entidade: "eventos.ingresso_tipos",
      entidadeId: String(id),
      detalhe: { evento_id: c.eventoId, nome: c.nome, valor_centavos: c.valor_centavos },
    });
  } catch (e) {
    falharNoEvento(c.eventoId, traduzirIngresso(e instanceof Error ? e.message : String(e)));
  }

  revalidatePath(rotaDoEvento(c.eventoId));
  revalidatePath("/eventos");
  redirect(`${rotaDoEvento(c.eventoId)}&ok=${encodeURIComponent("Tipo de ingresso salvo.")}`);
}

/**
 * Desativa em vez de apagar, pela mesma razão do evento.
 *
 * ⚠️ E aqui o banco já obrigava: `inscricoes.ingresso_tipo_id` é
 * `on delete restrict`. Tipo com inscrição não sai da tabela — apagar levaria
 * junto a explicação do que a pessoa comprou. Desativado some da venda e
 * continua explicando o histórico.
 */
export async function alternarTipoIngressoAtivo(formData: FormData) {
  const eu = await exigirCapacidade("eventos.gerir");

  const eventoId = Number(formData.get("evento_id") ?? 0);
  const id = Number(formData.get("id") ?? 0);
  const ativo = formData.get("ativo") === "true";
  if (!eventoId) falhar("Evento não informado.");
  if (!id) falharNoEvento(eventoId, "Tipo de ingresso não informado.");

  const sql = conexao();
  try {
    await sql`
      update eventos.ingresso_tipos set ativo = ${!ativo}
       where id = ${id} and evento_id = ${eventoId}
    `;
    await registrar({
      atorId: eu?.id,
      acao: ativo ? "eventos.ingresso_tipo.desativado" : "eventos.ingresso_tipo.reativado",
      entidade: "eventos.ingresso_tipos",
      entidadeId: String(id),
      detalhe: { evento_id: eventoId },
    });
  } catch (e) {
    falharNoEvento(eventoId, traduzirIngresso(e instanceof Error ? e.message : String(e)));
  }

  revalidatePath(rotaDoEvento(eventoId));
  redirect(
    `${rotaDoEvento(eventoId)}&ok=${encodeURIComponent(
      ativo ? "Tipo de ingresso desativado." : "Tipo de ingresso reativado."
    )}`
  );
}

// ─── Venda balcão ────────────────────────────────────────────────────────────

const ROTA_VENDA = "/eventos/venda";

/**
 * Venda recusada por regra, não por falha.
 *
 * ⚠️ Existe para DESFAZER a transação sem chamar `redirect` lá dentro. O
 * `redirect` do Next funciona lançando um erro próprio; lançado dentro de
 * `sql.begin`, ele passa a depender de a biblioteca do banco repassá-lo
 * intacto para continuar sendo um redirecionamento. Uma classe nossa não
 * depende de nada disso.
 */
class RecusaDeVenda extends Error {}

function falharNaVenda(params: URLSearchParams, mensagem: string): never {
  params.set("erro", mensagem);
  redirect(`${ROTA_VENDA}?${params}`);
}

/**
 * Vende no balcão: uma pessoa, um evento, N ingressos, uma forma de pagamento.
 *
 * ⚠️ A CONFERÊNCIA DE ESTOQUE ACONTECE DENTRO DA TRANSAÇÃO, depois de travar
 * as linhas dos tipos escolhidos. Conferir antes e gravar depois é a falha
 * clássica: duas pessoas no balcão, ao mesmo tempo, leem "resta 1", as duas
 * passam, e o evento vende dois lugares que não existem. O `for update`
 * serializa as duas vendas do mesmo tipo — a segunda espera a primeira
 * terminar e recalcula em cima do resultado dela.
 *
 * ⚠️ Uma inscrição POR INGRESSO, e não uma linha com quantidade. Cada ingresso
 * tem o seu QR, entra sozinho no check-in e pode ser estornado ou transferido
 * sem mexer nos outros. `compra_grupo_id` é o que reúne as linhas da mesma
 * compra quando alguém quiser estornar tudo.
 */
export async function venderNoBalcao(formData: FormData) {
  const eu = await exigirCapacidade("eventos.vender");

  const eventoId = Number(formData.get("evento_id") ?? 0);
  const pessoaId = String(formData.get("pessoa_id") ?? "").trim();
  const formaBruta = String(formData.get("forma") ?? "").trim();
  const observacao = String(formData.get("observacao") ?? "").trim() || null;

  // Preserva o contexto na volta: quem errou o troco não quer refazer a busca.
  const volta = new URLSearchParams();
  if (eventoId) volta.set("evento", String(eventoId));
  if (pessoaId) volta.set("pessoa", pessoaId);

  if (!eventoId) falharNaVenda(volta, "Escolha o evento.");
  if (!pessoaId) falharNaVenda(volta, "Escolha quem está comprando.");
  // ⚠️ Estreita o tipo com uma conferência de verdade, em vez de afirmar
  // `as FormaBalcao` antes de olhar: o `as` calaria o compilador sobre um
  // valor que chega de um formulário e pode ser qualquer coisa.
  if (!(FORMAS_BALCAO as readonly string[]).includes(formaBruta)) {
    falharNaVenda(volta, "Escolha a forma de pagamento.");
  }
  const forma = formaBruta as FormaBalcao;

  // Os itens chegam como `qtd_<id>`: um campo por tipo de ingresso da tela.
  const itens: { tipoId: number; quantidade: number }[] = [];
  for (const [chave, valor] of formData.entries()) {
    if (!chave.startsWith("qtd_")) continue;
    const tipoId = Number(chave.slice(4));
    const quantidade = Number(String(valor).trim() || 0);
    if (Number.isInteger(tipoId) && tipoId > 0 && Number.isFinite(quantidade)) {
      itens.push({ tipoId, quantidade: Math.trunc(quantidade) });
    }
  }

  const sql = conexao();
  let quantasLinhas = 0;
  let total = 0;

  try {
    await sql.begin(async (tx) => {
      const pedidos = itens.filter((i) => i.quantidade > 0).map((i) => i.tipoId);
      if (pedidos.length === 0) throw new RecusaDeVenda("Escolha pelo menos um ingresso.");

      // ⚠️ TRAVA primeiro, conta depois. `for update` sem `order by` entre duas
      // vendas com os mesmos dois tipos em ordem trocada daria impasse; o
      // `order by id` faz as duas pedirem as travas na mesma ordem.
      await tx`
        select id from eventos.ingresso_tipos
         where evento_id = ${eventoId} and id = any(${pedidos})
         order by id
           for update
      `;

      const tipos = await tx<TipoParaVendaDoBanco[]>`
        select
          t.id, t.nome, t.papel, t.ativo, t.valor_centavos,
          t.unico_por_cpf, t.exige_principal,
          case when t.quantidade is null then null
               else greatest(t.quantidade - count(i.id) filter (where i.status <> 'cancelado'), 0)::int
          end as disponivel
        from eventos.ingresso_tipos t
        left join eventos.inscricoes i on i.ingresso_tipo_id = t.id
        where t.evento_id = ${eventoId}
        group by t.id
      `;

      const jaTem = await tx<{ ingresso_tipo_id: number }[]>`
        select distinct ingresso_tipo_id
          from eventos.inscricoes
         where evento_id = ${eventoId} and pessoa_id = ${pessoaId}
           and ingresso_tipo_id is not null and status in ('pendente', 'pago')
      `;

      const conferido = conferirVenda(
        tipos,
        itens,
        jaTem.map((l) => l.ingresso_tipo_id)
      );
      // Só o primeiro motivo vai para a URL: a frase inteira cabe, e uma lista
      // concatenada vira um parágrafo ilegível no alto da tela.
      if (conferido.erros.length > 0) throw new RecusaDeVenda(conferido.erros[0]);

      total = totalCobrado(forma, conferido.totalCentavos);
      const venda = tipoDeVenda(forma);
      // ⚠️ Balcão grava PAGO: o dinheiro já está na mão de quem vendeu. Deixar
      // pendente faria o check-in recusar quem acabou de pagar na frente do
      // operador.
      const status = "pago";

      // ⚠️ `compra_grupo_id` NÃO tem default no banco: sem gerar aqui, as
      // linhas nasceriam com nulo e a compra deixaria de ser estornável como
      // um todo — o estorno teria de achar "as inscrições feitas no mesmo
      // segundo", que é adivinhação.
      const grupo = randomUUID();

      const linhas = conferido.itens.flatMap(({ tipo, quantidade }) =>
        Array.from({ length: quantidade }, () => ({
          compra_grupo_id: grupo,
          pessoa_id: pessoaId,
          evento_id: eventoId,
          ingresso_tipo_id: tipo.id,
          comprador_id: pessoaId,
          tipo_venda: venda,
          status,
          forma_pagamento: forma,
          valor_original_centavos: venda === "cortesia" ? 0 : tipo.valor_centavos,
          cortesia_motivo: venda === "cortesia" ? observacao : null,
          observacao: venda === "cortesia" ? null : observacao,
          data_compra: new Date().toISOString(),
        }))
      );
      quantasLinhas = linhas.length;

      await tx`
        insert into eventos.inscricoes ${tx(
          linhas,
          "compra_grupo_id", "pessoa_id", "evento_id", "ingresso_tipo_id", "comprador_id", "tipo_venda",
          "status", "forma_pagamento", "valor_original_centavos", "cortesia_motivo",
          "observacao", "data_compra"
        )}
      `;
    });
  } catch (e) {
    // ⚠️ A recusa vira EXCEÇÃO dentro da transação, e o `redirect` acontece só
    // aqui fora. `redirect` do Next funciona lançando: chamado lá dentro, ele
    // seria indistinguível de uma falha do banco — e a transação e o
    // redirecionamento ficariam dependendo de qual biblioteca reembrulha o
    // erro primeiro. Lançar a recusa é o que desfaz a transação; traduzi-la é
    // trabalho de fora.
    const mensagem =
      e instanceof RecusaDeVenda
        ? e.message
        : traduzirIngresso(e instanceof Error ? e.message : String(e));
    falharNaVenda(volta, mensagem);
  }

  await registrar({
    atorId: eu?.id,
    acao: "eventos.venda.balcao",
    entidade: "eventos.inscricoes",
    entidadeId: String(eventoId),
    detalhe: { pessoa_id: pessoaId, ingressos: quantasLinhas, total_centavos: total, forma },
  });

  revalidatePath(ROTA_VENDA);
  revalidatePath("/eventos");
  volta.set(
    "ok",
    `${quantasLinhas} ingresso(s) vendido(s)${total > 0 ? ` — ${(total / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : " como cortesia"}.`
  );
  volta.delete("pessoa");
  redirect(`${ROTA_VENDA}?${volta}`);
}
