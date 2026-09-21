"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirCapacidade } from "@/lib/auth";
import { conexao } from "@/lib/db";
import { registrar } from "@/lib/auditoria";
import { centavosDe, ratear } from "@/lib/dominio/dinheiro";
import {
  conferirVenda, FORMAS_BALCAO, tipoDeVenda, totalCobrado, type FormaBalcao,
} from "@/lib/dominio/venda";
import { conferirCupom, normalizarCodigo, type Cupom } from "@/lib/dominio/cupom";
import { conferirCombos } from "@/lib/dominio/combo";
import { prepararBusca } from "@/lib/dominio/busca-pessoa";
import { podeEntrar } from "@/lib/dominio/checkin";
import {
  podeTrocarTitular, type InscricaoParaTrocar,
} from "@/lib/dominio/titular";
import {
  podeCancelar, valorAEstornar, type InscricaoParaCancelar,
} from "@/lib/dominio/estorno";
import { lerCombosParaVenda, lerTiposParaVenda } from "./consultas";
import type { InscricaoNaPorta } from "./consultas";

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

function falharNoEvento(eventoId: number, mensagem: string, aba = "ingressos"): never {
  redirect(`${rotaDoEvento(eventoId, aba)}&erro=${encodeURIComponent(mensagem)}`);
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
  const codigoCupom = normalizarCodigo(String(formData.get("cupom") ?? ""));

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

  // Os ingressos avulsos chegam como `qtd_<id>` e os combos como
  // `combo_<id>`: um campo por linha da tela, em ambos os casos.
  const itens: { tipoId: number; quantidade: number }[] = [];
  const pedidosDeCombo: { comboId: number; quantidade: number }[] = [];
  for (const [chave, valor] of formData.entries()) {
    const quantidade = Number(String(valor).trim() || 0);
    if (!Number.isFinite(quantidade)) continue;
    if (chave.startsWith("qtd_")) {
      const tipoId = Number(chave.slice(4));
      if (Number.isInteger(tipoId) && tipoId > 0) {
        itens.push({ tipoId, quantidade: Math.trunc(quantidade) });
      }
    } else if (chave.startsWith("combo_")) {
      const comboId = Number(chave.slice(6));
      if (Number.isInteger(comboId) && comboId > 0) {
        pedidosDeCombo.push({ comboId, quantidade: Math.trunc(quantidade) });
      }
    }
  }

  const sql = conexao();
  let quantasLinhas = 0;
  let quantosCombos = 0;
  let total = 0;

  try {
    await sql.begin(async (tx) => {
      const avulsos = itens.filter((i) => i.quantidade > 0);
      const combosPedidos = pedidosDeCombo.filter((p) => p.quantidade > 0);
      if (avulsos.length === 0 && combosPedidos.length === 0) {
        throw new RecusaDeVenda("Escolha pelo menos um ingresso.");
      }

      // ⚠️ TRAVA primeiro, conta depois — e SEMPRE combo antes de ingresso.
      // São duas tabelas: uma venda que travasse ingresso e depois combo,
      // cruzando com outra na ordem inversa, pararia as duas até o banco
      // matar uma por impasse. A ordem entre tabelas é tão obrigatória quanto
      // o `order by id` dentro de cada uma.
      if (combosPedidos.length > 0) {
        await tx`
          select id from eventos.combos
           where evento_id = ${eventoId} and id = any(${combosPedidos.map((p) => p.comboId)})
           order by id
             for update
        `;
      }

      const combos =
        combosPedidos.length > 0
          ? await lerCombosParaVenda(tx, eventoId, pessoaId)
          : [];

      const conferidoCombo = conferirCombos(combos, combosPedidos, { agora: new Date() });
      if (conferidoCombo.erros.length > 0) throw new RecusaDeVenda(conferidoCombo.erros[0]);

      // ⚠️ Os tipos a travar incluem os que os combos ENTREGAM, não só os
      // pedidos avulsos. Travar só os avulsos deixaria o estoque do jantar
      // dentro do combo sem trava nenhuma — e duas vendas simultâneas do mesmo
      // combo passariam as duas pelo último lugar.
      const pedidos = [
        ...new Set([
          ...avulsos.map((i) => i.tipoId),
          ...conferidoCombo.itensExpandidos.map((i) => i.tipoId),
        ]),
      ];
      await tx`
        select id from eventos.ingresso_tipos
         where evento_id = ${eventoId} and id = any(${pedidos})
         order by id
           for update
      `;

      const tipos = await lerTiposParaVenda(tx, eventoId);

      const jaTem = await tx<{ ingresso_tipo_id: number }[]>`
        select distinct ingresso_tipo_id
          from eventos.inscricoes
         where evento_id = ${eventoId} and pessoa_id = ${pessoaId}
           and ingresso_tipo_id is not null and status in ('pendente', 'pago')
      `;

      // ⚠️ O carrinho inteiro vai junto: avulsos MAIS o que os combos
      // entregam. `conferirVenda` soma o mesmo tipo vindo dos dois lados antes
      // de olhar estoque e "um por pessoa" — conferidos separados, o jantar
      // avulso e o jantar de dentro do combo caberiam os dois no último lugar.
      const conferido = conferirVenda(
        tipos,
        [...avulsos, ...conferidoCombo.itensExpandidos],
        jaTem.map((l) => l.ingresso_tipo_id)
      );
      // Só o primeiro motivo vai para a URL: a frase inteira cabe, e uma lista
      // concatenada vira um parágrafo ilegível no alto da tela.
      if (conferido.erros.length > 0) throw new RecusaDeVenda(conferido.erros[0]);

      const porTipo = new Map(tipos.map((t) => [t.id, t]));
      const descontoDeCombo = conferidoCombo.escolhidos.reduce(
        (soma, e) => soma + e.descontoCentavos,
        0
      );

      // ⚠️ O cupom é conferido DENTRO da transação, como o estoque: os limites
      // de uso são disputados do mesmo jeito. Duas vendas simultâneas com o
      // último uso de um cupom leriam as duas "resta 1" se a conta ficasse
      // fora daqui.
      let cupomId: number | null = null;
      let descontoTotal = 0;
      // Nulo = o cupom vale para qualquer ingresso do evento.
      let cupomAlcanca: number | null = null;

      if (codigoCupom) {
        // ⚠️ `combo_id` VAI NO SELECT. A coluna existe desde a carga e não era
        // lida: sem ela, `conferirCupom` recebia o campo indefinido e tratava
        // cupom de combo como cupom geral — descontando o carrinho inteiro.
        const [cupom] = await tx<Cupom[]>`
          select id, codigo, tipo, valor, ingresso_tipo_id, combo_id, max_usos_total,
                 max_usos_por_cpf, vigencia_inicio, vigencia_fim, ativo
            from eventos.cupons
           where evento_id = ${eventoId} and lower(codigo) = lower(${codigoCupom})
             for update
        `;
        if (!cupom) throw new RecusaDeVenda(`Não existe o cupom ${codigoCupom} neste evento.`);

        // ⚠️ O cupom não incide sobre combo — o pacote já tem preço próprio, e
        // descontar de novo em cima dele desconta duas vezes. Quem levou SÓ
        // combo precisa ouvir isso com todas as letras: a mensagem genérica
        // ("não vale para nenhum dos ingressos escolhidos") mandaria o operador
        // conferir o cupom, que não tem nada de errado.
        if (avulsos.length === 0) {
          throw new RecusaDeVenda(
            "O cupom não vale sobre combo, que já é preço fechado. Tire o cupom ou acrescente um ingresso avulso."
          );
        }

        const [usos] = await tx<{ total: number; desta: number }[]>`
          select
            count(*) filter (where status <> 'cancelado')::int as total,
            count(*) filter (where status <> 'cancelado' and pessoa_id = ${pessoaId})::int as desta
          from eventos.inscricoes where cupom_id = ${cupom.id}
        `;

        // Só os AVULSOS vão para a conta do cupom, pela mesma razão.
        const veredito = conferirCupom(
          cupom,
          avulsos.map((i) => ({
            tipoId: i.tipoId,
            quantidade: i.quantidade,
            valorCentavos: porTipo.get(i.tipoId)?.valor_centavos ?? 0,
          })),
          { agora: new Date(), usosTotais: usos?.total ?? 0, usosDestaPessoa: usos?.desta ?? 0 }
        );
        if (!veredito.vale) throw new RecusaDeVenda(veredito.motivo);

        cupomId = cupom.id;
        cupomAlcanca = cupom.ingresso_tipo_id;
        descontoTotal = veredito.descontoCentavos;
      }

      // ⚠️ O desconto do COMBO entra na conta junto com o do cupom. Ele é a
      // diferença entre a soma de tabela e o preço do pacote: sem subtraí-lo,
      // o balcão cobraria o avulso e o combo não teria serventia nenhuma.
      total = totalCobrado(
        forma,
        conferido.totalCentavos - descontoDeCombo - descontoTotal
      );
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

      // UMA linha por ingresso: cada uma tem o seu QR, entra sozinha no
      // check-in e se estorna sem mexer nas outras. As de combo carregam
      // `combo_id` — é por ele que o relatório sabe que saíram de um pacote, e
      // que a conta de pacotes vendidos fecha.
      const valorDe = (tipoId: number) =>
        venda === "cortesia" ? 0 : porTipo.get(tipoId)?.valor_centavos ?? 0;

      const cruas: { tipoId: number; valor: number; comboId: number | null }[] = [
        ...avulsos.flatMap((i) =>
          Array.from({ length: i.quantidade }, () => ({
            tipoId: i.tipoId,
            valor: valorDe(i.tipoId),
            comboId: null,
          }))
        ),
        ...conferidoCombo.escolhidos.flatMap((e) =>
          e.itens.flatMap((i) =>
            Array.from({ length: i.quantidade }, () => ({
              tipoId: i.tipoId,
              valor: valorDe(i.tipoId),
              comboId: e.combo.id,
            }))
          )
        ),
      ];

      // ⚠️ Cada desconto é REPARTIDO entre as linhas que ELE alcança, e a soma
      // das partes fecha com o total exato. Gravá-lo inteiro na primeira linha
      // faria o estorno de UM ingresso devolver o desconto do pedido todo — e
      // cancelar as outras devolveria mais do que entrou.
      //
      // ⚠️ E são repartições SEPARADAS, uma por origem: o desconto do cupom só
      // nas linhas avulsas que ele alcança, o de cada combo só nas linhas
      // daquele combo. Um rateio único misturaria os dois e faria o estorno de
      // um ingresso avulso devolver parte do desconto do pacote de outra
      // pessoa da mesma compra.
      const descontos = cruas.map(() => 0);
      const somar = (partes: number[]) => {
        partes.forEach((parte, idx) => {
          descontos[idx] += parte;
        });
      };

      const alcancaCupom = (l: (typeof cruas)[number]) =>
        l.comboId === null && (!cupomAlcanca || cupomAlcanca === l.tipoId);
      somar(ratear(descontoTotal, cruas.map((l) => (alcancaCupom(l) ? l.valor : 0))));

      for (const escolhido of conferidoCombo.escolhidos) {
        somar(
          ratear(
            // Cortesia não desconta de nada: o valor de tabela já entrou zerado.
            venda === "cortesia" ? 0 : escolhido.descontoCentavos,
            cruas.map((l) => (l.comboId === escolhido.combo.id ? l.valor : 0))
          )
        );
      }

      const linhas = cruas.map((l, idx) => ({
        compra_grupo_id: grupo,
        pessoa_id: pessoaId,
        evento_id: eventoId,
        ingresso_tipo_id: l.tipoId,
        combo_id: l.comboId,
        comprador_id: pessoaId,
        cupom_id: cupomId,
        tipo_venda: venda,
        status,
        forma_pagamento: forma,
        valor_original_centavos: l.valor,
        desconto_centavos: descontos[idx] ?? 0,
        cortesia_motivo: venda === "cortesia" ? observacao : null,
        observacao: venda === "cortesia" ? null : observacao,
        data_compra: new Date().toISOString(),
      }));
      quantasLinhas = linhas.length;
      quantosCombos = conferidoCombo.escolhidos.reduce((s, e) => s + e.quantidade, 0);

      await tx`
        insert into eventos.inscricoes ${tx(
          linhas,
          "compra_grupo_id", "pessoa_id", "evento_id", "ingresso_tipo_id", "combo_id",
          "comprador_id",
          "cupom_id", "tipo_venda", "status", "forma_pagamento",
          "valor_original_centavos", "desconto_centavos", "cortesia_motivo",
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
    detalhe: {
      pessoa_id: pessoaId,
      ingressos: quantasLinhas,
      combos: quantosCombos,
      total_centavos: total,
      forma,
    },
  });

  revalidatePath(ROTA_VENDA);
  revalidatePath("/eventos");
  // ⚠️ A confirmação conta INGRESSOS, e diz separado quantos combos saíram.
  // Só "5 ingressos" depois de vender um combo de três faria o operador achar
  // que cobrou errado, e conferir a venda que estava certa.
  const comCombo = quantosCombos > 0 ? ` (${quantosCombos} combo(s))` : "";
  volta.set(
    "ok",
    `${quantasLinhas} ingresso(s) vendido(s)${comCombo}${total > 0 ? ` — ${(total / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : " como cortesia"}.`
  );
  volta.delete("pessoa");
  redirect(`${ROTA_VENDA}?${volta}`);
}

// ─── Check-in ────────────────────────────────────────────────────────────────

const ROTA_CHECKIN = "/eventos/checkin";

/**
 * Registra a entrada de UMA inscrição.
 *
 * ⚠️ A regra de quem pode entrar é conferida AQUI, no servidor, mesmo que a
 * tela já tenha escondido o botão. A porta é operada com pressa, e um recarregar
 * de página com o botão antigo na tela não pode virar entrada de ingresso
 * cancelado.
 *
 * ⚠️ `where checkin_em is null` na própria gravação: dois toques no mesmo botão,
 * ou dois operadores na mesma inscrição, não podem sobrescrever a hora da
 * primeira entrada. O segundo comando não acha linha e não muda nada — e é o
 * banco que garante isso, não a conferência que aconteceu um instante antes.
 */
export async function registrarCheckin(formData: FormData) {
  const eu = await exigirCapacidade("eventos.checkin");

  const eventoId = Number(formData.get("evento_id") ?? 0);
  const id = Number(formData.get("id") ?? 0);
  const busca = String(formData.get("busca") ?? "");

  const volta = new URLSearchParams();
  if (eventoId) volta.set("evento", String(eventoId));
  if (busca.trim()) volta.set("busca", busca);

  const recusar = (mensagem: string): never => {
    volta.set("erro", mensagem);
    redirect(`${ROTA_CHECKIN}?${volta}`);
  };

  if (!eventoId || !id) recusar("Inscrição não informada.");

  const sql = conexao();
  const [inscricao] = await sql<{ status: InscricaoNaPorta["status"]; checkin_em: string | null; nome: string }[]>`
    select i.status, i.checkin_em, p.nome
      from eventos.inscricoes i
      join public.pessoas p on p.id = i.pessoa_id
     where i.id = ${id} and i.evento_id = ${eventoId}
  `;
  if (!inscricao) recusar("Inscrição não encontrada neste evento.");

  const veredito = podeEntrar({
    status: inscricao.status,
    checkinEm: inscricao.checkin_em,
  });
  if (!veredito.pode) recusar(veredito.motivo);

  const [gravada] = await sql<{ id: number }[]>`
    update eventos.inscricoes
       set checkin_em = now(), atualizado_em = now()
     where id = ${id} and evento_id = ${eventoId} and checkin_em is null
    returning id
  `;
  // Sem linha: outra pessoa registrou a entrada entre a conferência e a
  // gravação. Não é erro do operador, e a tela precisa dizer isso sem alarme.
  if (!gravada) recusar("Esta inscrição já teve entrada registrada.");

  await registrar({
    atorId: eu?.id,
    acao: "eventos.checkin",
    entidade: "eventos.inscricoes",
    entidadeId: String(id),
    detalhe: { evento_id: eventoId },
  });

  revalidatePath(ROTA_CHECKIN);
  volta.set("ok", `Entrada registrada: ${inscricao.nome}.`);
  redirect(`${ROTA_CHECKIN}?${volta}`);
}

/**
 * Desfaz uma entrada registrada por engano.
 *
 * ⚠️ Existe porque o engano acontece na porta, com fila: dois nomes parecidos,
 * e a entrada vai na inscrição errada. Sem desfazer, a pessoa certa fica
 * impedida de entrar e a errada consta presente — e o conserto viraria SQL à
 * mão em produção, que este repositório não admite.
 *
 * A auditoria registra quem desfez: é uma correção legítima, não algo a
 * esconder.
 */
export async function desfazerCheckin(formData: FormData) {
  const eu = await exigirCapacidade("eventos.checkin");

  const eventoId = Number(formData.get("evento_id") ?? 0);
  const id = Number(formData.get("id") ?? 0);
  const busca = String(formData.get("busca") ?? "");

  const volta = new URLSearchParams();
  if (eventoId) volta.set("evento", String(eventoId));
  if (busca.trim()) volta.set("busca", busca);

  if (!eventoId || !id) {
    volta.set("erro", "Inscrição não informada.");
    redirect(`${ROTA_CHECKIN}?${volta}`);
  }

  const sql = conexao();
  await sql`
    update eventos.inscricoes
       set checkin_em = null, atualizado_em = now()
     where id = ${id} and evento_id = ${eventoId}
  `;
  await registrar({
    atorId: eu?.id,
    acao: "eventos.checkin.desfeito",
    entidade: "eventos.inscricoes",
    entidadeId: String(id),
    detalhe: { evento_id: eventoId },
  });

  revalidatePath(ROTA_CHECKIN);
  volta.set("ok", "Entrada desfeita.");
  redirect(`${ROTA_CHECKIN}?${volta}`);
}

// ─── Cancelamento e estorno ──────────────────────────────────────────────────

const ROTA_ESTORNOS = "/eventos/estornos";

function voltaDeEstorno(busca: string, extra?: [string, string]) {
  const p = new URLSearchParams();
  if (busca.trim()) p.set("busca", busca);
  if (extra) p.set(extra[0], extra[1]);
  return `${ROTA_ESTORNOS}?${p}`;
}

/**
 * Cancela uma inscrição e, quando há dinheiro pago, abre o estorno.
 *
 * ⚠️ Cancelar NÃO devolve dinheiro sozinho. Abre uma pendência para a
 * tesouraria resolver com comprovante: quem opera o balcão não é quem faz a
 * devolução, e dar baixa nas duas coisas de uma vez faria o sistema afirmar um
 * pagamento que ninguém fez.
 *
 * ⚠️ A vaga volta para o estoque no mesmo instante, sem nenhuma linha extra:
 * a contagem de disponíveis já ignora inscrição cancelada. É por isso que ela
 * conta `status <> 'cancelado'` em vez de contar tudo.
 */
export async function cancelarInscricao(formData: FormData) {
  const eu = await exigirCapacidade("eventos.estornos.gerir");

  const id = Number(formData.get("id") ?? 0);
  const motivo = String(formData.get("motivo") ?? "").trim();
  const busca = String(formData.get("busca") ?? "");

  const recusar = (mensagem: string): never =>
    redirect(voltaDeEstorno(busca, ["erro", mensagem]));

  if (!id) recusar("Inscrição não informada.");
  if (!motivo) recusar("Diga o motivo do cancelamento — ele fica no histórico da pessoa.");

  const sql = conexao();
  const [linha] = await sql<{
    status: InscricaoParaCancelar["status"];
    tipo_venda: string;
    valor_original_centavos: number;
    desconto_centavos: number;
    checkin_em: string | null;
    nome: string;
  }[]>`
    select i.status, i.tipo_venda, i.valor_original_centavos, i.desconto_centavos,
           i.checkin_em, p.nome
      from eventos.inscricoes i
      join public.pessoas p on p.id = i.pessoa_id
     where i.id = ${id}
  `;
  if (!linha) recusar("Inscrição não encontrada.");

  const inscricao: InscricaoParaCancelar = {
    status: linha.status,
    tipoVenda: linha.tipo_venda,
    valorOriginalCentavos: linha.valor_original_centavos,
    descontoCentavos: linha.desconto_centavos,
    checkinEm: linha.checkin_em,
  };

  const veredito = podeCancelar(inscricao);
  if (!veredito.pode) recusar(veredito.motivo);

  const devolver = valorAEstornar(inscricao);

  // ⚠️ `where status <> 'cancelado'` na própria gravação: dois cliques, ou
  // duas pessoas na mesma inscrição, não podem reabrir um estorno já aberto e
  // pôr a mesma devolução duas vezes na fila da tesouraria.
  const [gravada] = await sql<{ id: number }[]>`
    update eventos.inscricoes
       set status = 'cancelado',
           cancelado_em = now(),
           cancelado_por = ${eu?.id ?? null},
           cancelamento_motivo = ${motivo},
           estorno_status = ${devolver > 0 ? "pendente" : null},
           atualizado_em = now()
     where id = ${id} and status <> 'cancelado'
    returning id
  `;
  if (!gravada) recusar("Esta inscrição já estava cancelada.");

  await registrar({
    atorId: eu?.id,
    acao: "eventos.inscricao.cancelada",
    entidade: "eventos.inscricoes",
    entidadeId: String(id),
    detalhe: { motivo, estorno_aberto: devolver > 0, valor_centavos: devolver },
  });

  revalidatePath(ROTA_ESTORNOS);
  revalidatePath("/eventos");
  redirect(
    voltaDeEstorno(busca, [
      "ok",
      devolver > 0
        ? `Inscrição de ${linha.nome} cancelada. Estorno de ${(devolver / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} aberto.`
        : `Inscrição de ${linha.nome} cancelada. Nada a devolver.`,
    ])
  );
}

/**
 * Dá baixa no estorno: feito, com comprovante, ou recusado, com motivo.
 *
 * ⚠️ O comprovante é OBRIGATÓRIO no "feito". Sem ele, a fila esvazia sem
 * ninguém conseguir provar depois que a devolução aconteceu — e a pergunta
 * volta meses depois, quando ninguém lembra.
 *
 * ⚠️ O que já estava gravado em `estorno` é MESCLADO, não trocado: a carga
 * trouxe devoluções do sistema antigo com valor e forma preenchidos, e
 * sobrescrever apagaria o registro de quem devolveu lá atrás.
 */
export async function resolverEstorno(formData: FormData) {
  const eu = await exigirCapacidade("eventos.estornos.gerir");

  const id = Number(formData.get("id") ?? 0);
  const situacao = String(formData.get("situacao") ?? "").trim();
  const comprovante = String(formData.get("comprovante") ?? "").trim();
  const observacao = String(formData.get("observacao") ?? "").trim();
  const forma = String(formData.get("forma") ?? "").trim();

  const recusar = (mensagem: string): never =>
    redirect(voltaDeEstorno("", ["erro", mensagem]));

  if (!id) recusar("Estorno não informado.");
  if (situacao !== "feito" && situacao !== "recusado") {
    recusar("Diga se o estorno foi feito ou recusado.");
  }
  if (situacao === "feito" && !comprovante) {
    recusar("Informe o comprovante da devolução — sem ele ninguém prova depois que ela aconteceu.");
  }
  if (situacao === "recusado" && !observacao) {
    recusar("Diga por que o estorno foi recusado.");
  }

  const sql = conexao();
  const [gravada] = await sql<{ id: number }[]>`
    update eventos.inscricoes
       set estorno_status = ${situacao},
           estorno = coalesce(estorno, '{}'::jsonb) || ${sql.json({
             forma: forma || null,
             comprovante: comprovante || null,
             observacao: observacao || null,
             efetuado_em: new Date().toISOString(),
             efetuado_por: eu?.id ?? null,
           })},
           atualizado_em = now()
     where id = ${id} and estorno_status = 'pendente'
    returning id
  `;
  // Sem linha: outra pessoa da tesouraria resolveu entre a tela e o clique.
  if (!gravada) recusar("Este estorno já tinha sido resolvido por outra pessoa.");

  await registrar({
    atorId: eu?.id,
    acao: situacao === "feito" ? "eventos.estorno.feito" : "eventos.estorno.recusado",
    entidade: "eventos.inscricoes",
    entidadeId: String(id),
    detalhe: { forma: forma || null, comprovante: comprovante || null },
  });

  revalidatePath(ROTA_ESTORNOS);
  redirect(
    voltaDeEstorno("", [
      "ok",
      situacao === "feito" ? "Estorno registrado como feito." : "Estorno registrado como recusado.",
    ])
  );
}

// ─── Cupons ──────────────────────────────────────────────────────────────────

/**
 * ⚠️ A recusa do índice único vira frase sobre a consequência. O índice usa
 * `lower(codigo)`, então "VERAO10" e "verao10" colidem — e é isso que a
 * mensagem precisa explicar, porque quem cadastrou vê dois códigos diferentes
 * na tela.
 */
function traduzirCupom(mensagem: string): string {
  if (mensagem.includes("uq_cupom_codigo")) {
    return "Já existe um cupom com esse código neste evento. O código não distingue maiúscula de minúscula.";
  }
  if (mensagem.includes("percentual_ate_cem")) {
    return "Desconto percentual vai até 100%. Para desconto em reais, troque o tipo.";
  }
  if (mensagem.includes("cupom_codigo_nao_vazio")) {
    return "Dê um código ao cupom — é o que a pessoa digita.";
  }
  if (mensagem.includes("cupons_valor_check") || mensagem.includes("valor >= 0")) {
    return "O desconto não pode ser negativo.";
  }
  return mensagem;
}

const schemaCupom = z.object({
  codigo: z.string().trim().min(2, "Dê um código ao cupom — é o que a pessoa digita."),
  descricao: z.string().trim().optional().transform((v) => v || null),
  tipo: z.enum(["percentual", "valor"]),
});

function camposDoCupom(formData: FormData) {
  const eventoId = Number(formData.get("evento_id") ?? 0);
  if (!eventoId) falhar("Evento não informado.");

  const dados = schemaCupom.safeParse(Object.fromEntries(formData));
  if (!dados.success) falharNoEvento(eventoId, dados.error.issues[0].message);

  // ⚠️ Percentual é inteiro de 0 a 100; valor é DINHEIRO e passa por
  // `centavosDe`. Ler os dois do mesmo jeito gravaria "10" como dez centavos
  // num cupom de dez reais.
  const bruto = String(formData.get("valor") ?? "").trim();
  const valor =
    dados.data.tipo === "percentual"
      ? Math.trunc(Number(bruto.replace(",", ".")) || 0)
      : (centavosDe(bruto) ?? 0);

  return {
    eventoId,
    ...dados.data,
    codigo: normalizarCodigo(dados.data.codigo),
    valor,
    ingresso_tipo_id: inteiroOuNulo(formData.get("ingresso_tipo_id")),
    max_usos_total: inteiroOuNulo(formData.get("max_usos_total")),
    max_usos_por_cpf: inteiroOuNulo(formData.get("max_usos_por_cpf")),
    vigencia_inicio: quandoOuNulo(formData.get("vigencia_inicio")),
    vigencia_fim: quandoOuNulo(formData.get("vigencia_fim")),
  };
}

export async function criarCupom(formData: FormData) {
  const eu = await exigirCapacidade("eventos.gerir");
  const c = camposDoCupom(formData);

  const sql = conexao();
  try {
    const [criado] = await sql<{ id: number }[]>`
      insert into eventos.cupons
        (evento_id, codigo, descricao, tipo, valor, ingresso_tipo_id,
         max_usos_total, max_usos_por_cpf, vigencia_inicio, vigencia_fim)
      values
        (${c.eventoId}, ${c.codigo}, ${c.descricao}, ${c.tipo}, ${c.valor},
         ${c.ingresso_tipo_id}, ${c.max_usos_total}, ${c.max_usos_por_cpf},
         ${c.vigencia_inicio}::timestamp at time zone ${FUSO},
         ${c.vigencia_fim}::timestamp at time zone ${FUSO})
      returning id
    `;
    await registrar({
      atorId: eu?.id,
      acao: "eventos.cupom.criado",
      entidade: "eventos.cupons",
      entidadeId: String(criado?.id ?? ""),
      detalhe: { evento_id: c.eventoId, codigo: c.codigo, tipo: c.tipo, valor: c.valor },
    });
  } catch (e) {
    falharNoEvento(c.eventoId, traduzirCupom(e instanceof Error ? e.message : String(e)), "cupons");
  }

  revalidatePath(rotaDoEvento(c.eventoId, "cupons"));
  redirect(`${rotaDoEvento(c.eventoId, "cupons")}&ok=${encodeURIComponent("Cupom cadastrado.")}`);
}

export async function editarCupom(formData: FormData) {
  const eu = await exigirCapacidade("eventos.gerir");
  const c = camposDoCupom(formData);

  const id = Number(formData.get("id") ?? 0);
  if (!id) falharNoEvento(c.eventoId, "Cupom não informado.", "cupons");

  const sql = conexao();
  try {
    await sql`
      update eventos.cupons set
        codigo = ${c.codigo}, descricao = ${c.descricao},
        tipo = ${c.tipo}, valor = ${c.valor},
        ingresso_tipo_id = ${c.ingresso_tipo_id},
        max_usos_total = ${c.max_usos_total},
        max_usos_por_cpf = ${c.max_usos_por_cpf},
        vigencia_inicio = ${c.vigencia_inicio}::timestamp at time zone ${FUSO},
        vigencia_fim = ${c.vigencia_fim}::timestamp at time zone ${FUSO}
      where id = ${id} and evento_id = ${c.eventoId}
    `;
    await registrar({
      atorId: eu?.id,
      acao: "eventos.cupom.editado",
      entidade: "eventos.cupons",
      entidadeId: String(id),
      detalhe: { evento_id: c.eventoId, codigo: c.codigo },
    });
  } catch (e) {
    falharNoEvento(c.eventoId, traduzirCupom(e instanceof Error ? e.message : String(e)), "cupons");
  }

  revalidatePath(rotaDoEvento(c.eventoId, "cupons"));
  redirect(`${rotaDoEvento(c.eventoId, "cupons")}&ok=${encodeURIComponent("Cupom salvo.")}`);
}

/**
 * Desativa em vez de apagar.
 *
 * ⚠️ `inscricoes.cupom_id` é `on delete set null`: apagar o cupom não derruba
 * a inscrição, mas APAGA a explicação de por que ela saiu mais barata. O
 * desconto continua gravado e ninguém mais sabe de onde veio.
 */
export async function alternarCupomAtivo(formData: FormData) {
  const eu = await exigirCapacidade("eventos.gerir");

  const eventoId = Number(formData.get("evento_id") ?? 0);
  const id = Number(formData.get("id") ?? 0);
  const ativo = formData.get("ativo") === "true";
  if (!eventoId) falhar("Evento não informado.");
  if (!id) falharNoEvento(eventoId, "Cupom não informado.", "cupons");

  const sql = conexao();
  await sql`update eventos.cupons set ativo = ${!ativo} where id = ${id} and evento_id = ${eventoId}`;
  await registrar({
    atorId: eu?.id,
    acao: ativo ? "eventos.cupom.desativado" : "eventos.cupom.reativado",
    entidade: "eventos.cupons",
    entidadeId: String(id),
    detalhe: { evento_id: eventoId },
  });

  revalidatePath(rotaDoEvento(eventoId, "cupons"));
  redirect(
    `${rotaDoEvento(eventoId, "cupons")}&ok=${encodeURIComponent(
      ativo ? "Cupom desativado." : "Cupom reativado."
    )}`
  );
}

// ─── Troca de titular ────────────────────────────────────────────────────────

/**
 * Passa o ingresso para outra pessoa, sem cancelar e vender de novo.
 *
 * ⚠️ O caminho do cancelamento jogaria o valor na fila de estorno e cobraria
 * outra vez: o dinheiro sairia e voltaria ao caixa sem nada ter mudado, e a
 * tesouraria trabalharia uma devolução que ninguém pediu. Por isso a troca é
 * operação própria, e não um atalho para "cancela e revende".
 *
 * ⚠️ Quem era titular fica GRAVADO em `titular_anterior_id`. Sem isso, a
 * pessoa que comprou some do histórico — e quem pagou some do evento em que
 * pagou.
 */
export async function trocarTitular(formData: FormData) {
  const eu = await exigirCapacidade("eventos.inscricoes.gerir");

  const id = Number(formData.get("id") ?? 0);
  // ⚠️ Recebe o DOCUMENTO, não um id. Quem opera tem o CPF na mão; uma busca
  // aninhada dentro do modal obrigaria a sair dele, procurar e voltar — e o
  // modal não sobrevive a isso.
  const documento = String(formData.get("novo_titular") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const voltarPara = String(formData.get("voltar_para") ?? "").trim();

  // ⚠️ O tipo vai na CONST, não só no retorno. Sem a anotação explícita o
  // TypeScript não usa o `never` para estreitar o fluxo, e tudo depois de um
  // `volta(...)` continua parecendo alcançável.
  const volta: (chave: string, mensagem: string) => never = (chave, mensagem) => {
    const p = new URLSearchParams();
    if (voltarPara) p.set("pessoa", voltarPara);
    p.set(chave, mensagem);
    redirect(`/eventos/pessoas?${p}`);
  };

  if (!id) volta("erro", "Inscrição não informada.");
  if (!documento) volta("erro", "Informe o CPF ou passaporte de quem vai receber o ingresso.");
  if (!motivo) volta("erro", "Diga o motivo da troca — ele fica no histórico dos dois.");

  const sql = conexao();
  const [linha] = await sql<{
    status: InscricaoParaTrocar["status"];
    checkin_em: string | null;
    pessoa_id: string;
    evento_id: number;
    ingresso_tipo_id: number | null;
    unico_por_cpf: boolean | null;
    nome_atual: string;
  }[]>`
    select i.status, i.checkin_em, i.pessoa_id, i.evento_id, i.ingresso_tipo_id,
           t.unico_por_cpf, p.nome as nome_atual
      from eventos.inscricoes i
      join public.pessoas p on p.id = i.pessoa_id
      left join eventos.ingresso_tipos t on t.id = i.ingresso_tipo_id
     where i.id = ${id}
  `;
  if (!linha) volta("erro", "Inscrição não encontrada.");

  // ⚠️ Mesma preparação das buscas de tela (`prepararBusca`): sem ela, esta
  // resolução por documento divergiria das outras cinco — e o balcão aceitaria
  // um documento que a ficha não encontra.
  const busca = prepararBusca(documento);
  if (!busca) volta("erro", "Informe o CPF ou passaporte de quem vai receber o ingresso.");
  const [novaPessoa] = await sql<{ id: string; nome: string }[]>`
    select id, nome from public.pessoas
     where (${busca.digitos} <> '' and cpf = ${busca.digitos})
        or passaporte = ${busca.documento}
     limit 2
  `;
  if (!novaPessoa) {
    volta(
      "erro",
      `Ninguém com o documento ${documento} está no cadastro. Cadastre a pessoa antes de passar o ingresso.`
    );
  }
  const novoId = novaPessoa.id;

  const jaTem = await sql<{ ingresso_tipo_id: number }[]>`
    select distinct ingresso_tipo_id
      from eventos.inscricoes
     where evento_id = ${linha.evento_id} and pessoa_id = ${novoId}
       and ingresso_tipo_id is not null and status in ('pendente', 'pago')
  `;

  const veredito = podeTrocarTitular(
    {
      status: linha.status,
      checkinEm: linha.checkin_em,
      pessoaId: linha.pessoa_id,
      ingressoTipoId: linha.ingresso_tipo_id,
      unicoPorCpf: Boolean(linha.unico_por_cpf),
    },
    { id: novoId, jaTemDestesTipos: jaTem.map((l) => l.ingresso_tipo_id) }
  );
  if (!veredito.pode) volta("erro", veredito.motivo);

  // ⚠️ `where pessoa_id = <o de antes>` na própria gravação: se outra pessoa
  // trocou o titular entre a conferência e este comando, o segundo não acha
  // linha — em vez de sobrescrever a troca dela e registrar um titular
  // anterior que nunca foi titular.
  const [gravada] = await sql<{ id: number }[]>`
    update eventos.inscricoes
       set pessoa_id = ${novoId},
           titular_anterior_id = ${linha.pessoa_id},
           titular_trocado_em = now(),
           titular_trocado_por = ${eu?.id ?? null},
           titular_troca_motivo = ${motivo},
           atualizado_em = now()
     where id = ${id} and pessoa_id = ${linha.pessoa_id}
    returning id
  `;
  if (!gravada) volta("erro", "O titular foi trocado por outra pessoa enquanto esta tela estava aberta.");

  await registrar({
    atorId: eu?.id,
    acao: "eventos.inscricao.titular_trocado",
    entidade: "eventos.inscricoes",
    entidadeId: String(id),
    detalhe: { de: linha.pessoa_id, para: novoId, motivo },
  });

  revalidatePath("/eventos/pessoas");
  volta("ok", `Ingresso passou de ${linha.nome_atual} para ${novaPessoa.nome}.`);
}

// ─── Comissão ────────────────────────────────────────────────────────────────

/**
 * Quem trabalha no evento.
 *
 * ⚠️ `nome` é obrigatório e `pessoa_id` é opcional, e não o contrário. A
 * origem gravava só o nome, e metade da comissão de um evento antigo é gente
 * que nunca teve cadastro. Exigir o vínculo faria a tela recusar o que já está
 * no banco — e a conciliação, que é o trabalho de verdade, nunca começaria.
 */
const schemaMembro = z.object({
  nome: z.string().trim().min(3, "Informe o nome de quem trabalha no evento."),
  setor: z.string().trim().optional().transform((v) => v || null),
  funcao: z.string().trim().optional().transform((v) => v || null),
});

/** Acha a pessoa pelo documento, quando informado. Documento em branco é ok. */
async function pessoaDoDocumento(
  sql: ReturnType<typeof conexao>,
  documento: string
): Promise<{ id: string } | null | "nao_achou"> {
  const busca = prepararBusca(documento);
  if (!busca) return null;
  const [pessoa] = await sql<{ id: string }[]>`
    select id from public.pessoas
     where (${busca.digitos} <> '' and cpf = ${busca.digitos})
        or passaporte = ${busca.documento}
     limit 1
  `;
  return pessoa ?? "nao_achou";
}

export async function adicionarMembroComissao(formData: FormData) {
  const eu = await exigirCapacidade("eventos.comissao.gerir");

  const eventoId = Number(formData.get("evento_id") ?? 0);
  if (!eventoId) falhar("Evento não informado.");

  const dados = schemaMembro.safeParse(Object.fromEntries(formData));
  if (!dados.success) falharNoEvento(eventoId, dados.error.issues[0].message, "comissao");

  const sql = conexao();
  const achada = await pessoaDoDocumento(sql, String(formData.get("documento") ?? ""));
  if (achada === "nao_achou") {
    falharNoEvento(
      eventoId,
      "Ninguém com esse documento está no cadastro. Deixe em branco para registrar só o nome, e vincule depois.",
      "comissao"
    );
  }

  try {
    const [criado] = await sql<{ id: number }[]>`
      insert into eventos.comissao_membros (evento_id, pessoa_id, nome, setor, funcao)
      values (${eventoId}, ${achada?.id ?? null}, ${dados.data.nome},
              ${dados.data.setor}, ${dados.data.funcao})
      returning id
    `;
    await registrar({
      atorId: eu?.id,
      acao: "eventos.comissao.membro_incluido",
      entidade: "eventos.comissao_membros",
      entidadeId: String(criado?.id ?? ""),
      detalhe: { evento_id: eventoId, nome: dados.data.nome, vinculado: Boolean(achada?.id) },
    });
  } catch (e) {
    falharNoEvento(eventoId, e instanceof Error ? e.message : String(e), "comissao");
  }

  revalidatePath(rotaDoEvento(eventoId, "comissao"));
  redirect(`${rotaDoEvento(eventoId, "comissao")}&ok=${encodeURIComponent("Pessoa incluída na comissão.")}`);
}

export async function editarMembroComissao(formData: FormData) {
  const eu = await exigirCapacidade("eventos.comissao.gerir");

  const eventoId = Number(formData.get("evento_id") ?? 0);
  const id = Number(formData.get("id") ?? 0);
  if (!eventoId) falhar("Evento não informado.");
  if (!id) falharNoEvento(eventoId, "Pessoa da comissão não informada.", "comissao");

  const dados = schemaMembro.safeParse(Object.fromEntries(formData));
  if (!dados.success) falharNoEvento(eventoId, dados.error.issues[0].message, "comissao");

  const sql = conexao();
  const achada = await pessoaDoDocumento(sql, String(formData.get("documento") ?? ""));
  if (achada === "nao_achou") {
    falharNoEvento(
      eventoId,
      "Ninguém com esse documento está no cadastro. Deixe em branco para manter só o nome.",
      "comissao"
    );
  }

  // ⚠️ Documento em branco DESVINCULA, e isso é intencional: é como se corrige
  // um vínculo posto na pessoa errada. Manter o antigo faria a tela mostrar
  // uma correção que não aconteceu.
  await sql`
    update eventos.comissao_membros set
      nome = ${dados.data.nome},
      setor = ${dados.data.setor},
      funcao = ${dados.data.funcao},
      pessoa_id = ${achada?.id ?? null}
    where id = ${id} and evento_id = ${eventoId}
  `;
  await registrar({
    atorId: eu?.id,
    acao: "eventos.comissao.membro_editado",
    entidade: "eventos.comissao_membros",
    entidadeId: String(id),
    detalhe: { evento_id: eventoId, nome: dados.data.nome, vinculado: Boolean(achada?.id) },
  });

  revalidatePath(rotaDoEvento(eventoId, "comissao"));
  redirect(`${rotaDoEvento(eventoId, "comissao")}&ok=${encodeURIComponent("Comissão atualizada.")}`);
}

/**
 * Tira alguém da comissão.
 *
 * ⚠️ APAGA, e aqui isso está certo — ao contrário de evento, ingresso e cupom.
 * Nada aponta para esta linha: não há inscrição, pagamento nem comprovante
 * preso a ela. Quem saiu da equipe simplesmente não está na equipe, e uma
 * linha "desativada" numa lista de quem trabalha no dia seria ruído para quem
 * confere a escala. A trilha de auditoria guarda quem tirou e quando.
 */
export async function removerMembroComissao(formData: FormData) {
  const eu = await exigirCapacidade("eventos.comissao.gerir");

  const eventoId = Number(formData.get("evento_id") ?? 0);
  const id = Number(formData.get("id") ?? 0);
  if (!eventoId) falhar("Evento não informado.");
  if (!id) falharNoEvento(eventoId, "Pessoa da comissão não informada.", "comissao");

  const sql = conexao();
  const [removido] = await sql<{ nome: string }[]>`
    delete from eventos.comissao_membros
     where id = ${id} and evento_id = ${eventoId}
    returning nome
  `;
  if (!removido) falharNoEvento(eventoId, "Essa pessoa já tinha saído da comissão.", "comissao");

  await registrar({
    atorId: eu?.id,
    acao: "eventos.comissao.membro_removido",
    entidade: "eventos.comissao_membros",
    entidadeId: String(id),
    detalhe: { evento_id: eventoId, nome: removido.nome },
  });

  revalidatePath(rotaDoEvento(eventoId, "comissao"));
  redirect(
    `${rotaDoEvento(eventoId, "comissao")}&ok=${encodeURIComponent(`${removido.nome} saiu da comissão.`)}`
  );
}

// ─── Combos ──────────────────────────────────────────────────────────────────

function traduzirCombo(mensagem: string): string {
  if (mensagem.includes("combo_itens_combo_id_ingresso_tipo_id_key")) {
    return "O mesmo ingresso aparece duas vezes no combo. Some as quantidades numa linha só.";
  }
  if (mensagem.includes("valor_centavos")) {
    return "O preço do combo não pode ser negativo.";
  }
  if (mensagem.includes("quantidade")) {
    return "As quantidades não podem ser negativas.";
  }
  return mensagem;
}

const schemaCombo = z.object({
  nome: z.string().trim().min(3, "Dê um nome ao combo."),
  descricao: z.string().trim().optional().transform((v) => v || null),
});

/**
 * Os itens chegam como `item_<tipoId>` — um campo por tipo de ingresso do
 * evento, como no carrinho do balcão. Zero significa "não entra no combo".
 */
function itensDoCombo(formData: FormData): { tipoId: number; quantidade: number }[] {
  const itens: { tipoId: number; quantidade: number }[] = [];
  for (const [chave, valor] of formData.entries()) {
    if (!chave.startsWith("item_")) continue;
    const tipoId = Number(chave.slice(5));
    const quantidade = Math.trunc(Number(String(valor).trim() || 0));
    if (Number.isInteger(tipoId) && tipoId > 0 && quantidade > 0) {
      itens.push({ tipoId, quantidade });
    }
  }
  return itens;
}

function camposDoCombo(formData: FormData) {
  const eventoId = Number(formData.get("evento_id") ?? 0);
  if (!eventoId) falhar("Evento não informado.");

  const dados = schemaCombo.safeParse(Object.fromEntries(formData));
  if (!dados.success) falharNoEvento(eventoId, dados.error.issues[0].message, "combos");

  const itens = itensDoCombo(formData);
  // ⚠️ Combo sem item é um preço que não entrega nada. O banco aceitaria a
  // linha — `combo_itens` é tabela à parte —, e quem comprasse pagaria por
  // ingresso nenhum.
  if (itens.length === 0) {
    falharNoEvento(eventoId, "Escolha ao menos um ingresso para o combo entregar.", "combos");
  }

  return {
    eventoId,
    ...dados.data,
    valor_centavos: centavosDe(String(formData.get("valor") ?? "")) ?? 0,
    quantidade: inteiroOuNulo(formData.get("quantidade")),
    limite_por_cpf: inteiroOuNulo(formData.get("limite_por_cpf")),
    max_parcelas: inteiroOuNulo(formData.get("max_parcelas")) ?? 1,
    venda_inicio: quandoOuNulo(formData.get("venda_inicio")),
    venda_fim: quandoOuNulo(formData.get("venda_fim")),
    itens,
  };
}

export async function criarCombo(formData: FormData) {
  const eu = await exigirCapacidade("eventos.gerir");
  const c = camposDoCombo(formData);

  const sql = conexao();
  try {
    // ⚠️ Combo e itens na MESMA transação. Criado o combo e falhando os itens,
    // ficaria no banco um combo que não entrega nada — vendável, e entregando
    // ingresso nenhum a quem pagasse.
    await sql.begin(async (tx) => {
      const [criado] = await tx<{ id: number }[]>`
        insert into eventos.combos
          (evento_id, nome, descricao, valor_centavos, quantidade,
           limite_por_cpf, max_parcelas, venda_inicio, venda_fim)
        values
          (${c.eventoId}, ${c.nome}, ${c.descricao}, ${c.valor_centavos}, ${c.quantidade},
           ${c.limite_por_cpf}, ${c.max_parcelas},
           ${c.venda_inicio}::timestamp at time zone ${FUSO},
           ${c.venda_fim}::timestamp at time zone ${FUSO})
        returning id
      `;
      await tx`
        insert into eventos.combo_itens ${tx(
          c.itens.map((i) => ({
            combo_id: criado.id,
            ingresso_tipo_id: i.tipoId,
            quantidade: i.quantidade,
          })),
          "combo_id", "ingresso_tipo_id", "quantidade"
        )}
      `;
      await registrar({
        atorId: eu?.id,
        acao: "eventos.combo.criado",
        entidade: "eventos.combos",
        entidadeId: String(criado.id),
        detalhe: { evento_id: c.eventoId, nome: c.nome, itens: c.itens.length },
      });
    });
  } catch (e) {
    falharNoEvento(c.eventoId, traduzirCombo(e instanceof Error ? e.message : String(e)), "combos");
  }

  revalidatePath(rotaDoEvento(c.eventoId, "combos"));
  redirect(`${rotaDoEvento(c.eventoId, "combos")}&ok=${encodeURIComponent("Combo cadastrado.")}`);
}

export async function editarCombo(formData: FormData) {
  const eu = await exigirCapacidade("eventos.gerir");
  const c = camposDoCombo(formData);

  const id = Number(formData.get("id") ?? 0);
  if (!id) falharNoEvento(c.eventoId, "Combo não informado.", "combos");

  const sql = conexao();
  try {
    await sql.begin(async (tx) => {
      await tx`
        update eventos.combos set
          nome = ${c.nome}, descricao = ${c.descricao},
          valor_centavos = ${c.valor_centavos}, quantidade = ${c.quantidade},
          limite_por_cpf = ${c.limite_por_cpf}, max_parcelas = ${c.max_parcelas},
          venda_inicio = ${c.venda_inicio}::timestamp at time zone ${FUSO},
          venda_fim = ${c.venda_fim}::timestamp at time zone ${FUSO}
        where id = ${id} and evento_id = ${c.eventoId}
      `;
      // ⚠️ Troca a composição inteira em vez de conciliar item a item. Dentro
      // da transação, apagar e reinserir é atômico — e conciliar deixaria a
      // porta aberta para um item órfão quando alguém tirasse o último.
      // `inscricoes.combo_id` é `on delete set null` e não aponta para o item,
      // então nenhuma compra antiga se perde nisso.
      await tx`delete from eventos.combo_itens where combo_id = ${id}`;
      await tx`
        insert into eventos.combo_itens ${tx(
          c.itens.map((i) => ({
            combo_id: id,
            ingresso_tipo_id: i.tipoId,
            quantidade: i.quantidade,
          })),
          "combo_id", "ingresso_tipo_id", "quantidade"
        )}
      `;
      await registrar({
        atorId: eu?.id,
        acao: "eventos.combo.editado",
        entidade: "eventos.combos",
        entidadeId: String(id),
        detalhe: { evento_id: c.eventoId, nome: c.nome, itens: c.itens.length },
      });
    });
  } catch (e) {
    falharNoEvento(c.eventoId, traduzirCombo(e instanceof Error ? e.message : String(e)), "combos");
  }

  revalidatePath(rotaDoEvento(c.eventoId, "combos"));
  redirect(`${rotaDoEvento(c.eventoId, "combos")}&ok=${encodeURIComponent("Combo salvo.")}`);
}

/** Desativa em vez de apagar, como o ingresso e o cupom. */
export async function alternarComboAtivo(formData: FormData) {
  const eu = await exigirCapacidade("eventos.gerir");

  const eventoId = Number(formData.get("evento_id") ?? 0);
  const id = Number(formData.get("id") ?? 0);
  const ativo = formData.get("ativo") === "true";
  if (!eventoId) falhar("Evento não informado.");
  if (!id) falharNoEvento(eventoId, "Combo não informado.", "combos");

  const sql = conexao();
  await sql`update eventos.combos set ativo = ${!ativo} where id = ${id} and evento_id = ${eventoId}`;
  await registrar({
    atorId: eu?.id,
    acao: ativo ? "eventos.combo.desativado" : "eventos.combo.reativado",
    entidade: "eventos.combos",
    entidadeId: String(id),
    detalhe: { evento_id: eventoId },
  });

  revalidatePath(rotaDoEvento(eventoId, "combos"));
  redirect(
    `${rotaDoEvento(eventoId, "combos")}&ok=${encodeURIComponent(
      ativo ? "Combo desativado." : "Combo reativado."
    )}`
  );
}
