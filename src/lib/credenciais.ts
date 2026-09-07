import "server-only";
import { z } from "zod";
import { pessoaAtual } from "@/lib/auth";
import { cifrar, decifrar } from "@/lib/cripto";
import { criarClienteServico } from "@/lib/supabase/service";

/**
 * Credencial de serviço externo: Cielo por entidade, SMTP da instituição.
 *
 * Duas regras mandam aqui, e as duas existem para o mesmo fim — que um dump do
 * banco, ou um erro de RLS amanhã, não entregue a conta de ninguém:
 *
 * 1. O segredo (merchant key, senha do SMTP) vai CIFRADO, sempre. Quem cifra é
 *    este arquivo; o banco só guarda o texto.
 * 2. A tabela não tem GRANT para `anon` nem `authenticated`. Só o servidor
 *    alcança, com `service_role` — daí o `server-only` no topo.
 *
 * A tela nunca recebe o segredo de volta. Recebe a parte pública e a dica de
 * que existe segredo gravado: é o suficiente para conferir e para saber se
 * precisa preencher.
 */

/** Dono da conta. Cielo: exatamente um. SMTP: nenhum — é da instituição. */
export type Dono =
  | { organizacao: string }
  | { unidade: string }
  | { local: string }
  | { instituicao: true };

export type Ambiente = "producao" | "sandbox";

/**
 * A Cielo separa o identificador da loja do segredo que a autentica. O
 * merchant id aparece em tela para conferência — é ele que se compara com o
 * painel da Cielo quando uma venda não cai na conta certa.
 */
export const cieloPublico = z.object({
  merchant_id: z.string().trim().min(1, "Informe o Merchant ID da conta Cielo."),
  /** Nome da loja como aparece na fatura do comprador. */
  nome_loja: z.string().trim().max(120).optional().default(""),
});

export const smtpPublico = z.object({
  host: z.string().trim().min(1, "Informe o servidor de envio."),
  porta: z.coerce.number().int().min(1).max(65535),
  // 465 fala TLS desde o primeiro byte; 587 começa em claro e sobe com
  // STARTTLS. Errar isto dá "conexão encerrada" sem explicação nenhuma.
  seguranca: z.enum(["ssl", "starttls", "nenhuma"]).default("starttls"),
  usuario: z.string().trim().min(1, "Informe o usuário do servidor de envio."),
  remetente_nome: z.string().trim().min(1, "Informe o nome que assina os e-mails."),
  remetente_email: z.string().trim().email("O e-mail do remetente não parece válido."),
});

export type CieloPublico = z.infer<typeof cieloPublico>;
export type SmtpPublico = z.infer<typeof smtpPublico>;

const FORMATOS = { cielo: cieloPublico, smtp: smtpPublico } as const;
export type Servico = keyof typeof FORMATOS;

/** O que a tela recebe: a parte pública e se há segredo, nunca o segredo. */
export type CredencialVisivel<T> = {
  id: string;
  ambiente: Ambiente;
  publico: T;
  temSegredo: boolean;
  ativo: boolean;
  atualizado_em: string;
};

/**
 * Aplica o filtro do dono a uma consulta.
 *
 * ⚠️ `.match({ unidade_id: null })` NÃO procura por vazio. O PostgREST traduz
 * aquilo para `unidade_id=eq.null`, e o Postgres lê `null` como TEXTO: a
 * consulta morre com `invalid input syntax for type uuid: "null"`.
 *
 * E isso não atingia só o SMTP. TODA credencial tem pelo menos duas das três
 * colunas de dono vazias — a Cielo da Regional tem `organizacao_id` e
 * `local_id` vazios, a do SMTP tem as três —, então ler ou gravar credencial
 * nenhuma funcionava. A tela de Configurações abria com erro 500.
 *
 * Coluna vazia se procura com `.is(coluna, null)`. Como o dono é sempre
 * "uma coluna preenchida e as outras vazias", o filtro é montado aqui, uma vez,
 * em vez de repetido em cada consulta — onde a próxima esqueceria de novo.
 */
type ConsultaFiltravel = {
  eq(coluna: string, valor: string): ConsultaFiltravel;
  is(coluna: string, valor: null): ConsultaFiltravel;
};

function porDono<Q extends ConsultaFiltravel>(consulta: Q, dono: Dono): Q {
  let q: ConsultaFiltravel = consulta;
  for (const [coluna, valor] of Object.entries(colunasDoDono(dono))) {
    q = valor === null ? q.is(coluna, null) : q.eq(coluna, valor);
  }
  return q as Q;
}

function colunasDoDono(dono: Dono) {
  if ("organizacao" in dono) return { organizacao_id: dono.organizacao, unidade_id: null, local_id: null };
  if ("unidade" in dono) return { organizacao_id: null, unidade_id: dono.unidade, local_id: null };
  if ("local" in dono) return { organizacao_id: null, unidade_id: null, local_id: dono.local };
  return { organizacao_id: null, unidade_id: null, local_id: null };
}

type LinhaCredencial = {
  id: string;
  servico: string;
  ambiente: Ambiente;
  publico: Record<string, unknown>;
  segredo: string | null;
  ativo: boolean;
  atualizado_em: string;
};

/**
 * Lê a credencial de um dono. Devolve `null` quando não há — quem chama decide
 * se isso é erro. Para a venda é: sem conta Cielo cadastrada, a Regional não
 * pode vender, e a mensagem tem de dizer isso, não "erro ao processar".
 */
export async function lerCredencial<S extends Servico>(
  servico: S,
  dono: Dono,
  ambiente: Ambiente = "producao"
): Promise<CredencialVisivel<z.infer<(typeof FORMATOS)[S]>> | null> {
  const supabase = criarClienteServico();
  const { data, error } = await porDono(
    supabase
      .from("credenciais" as never)
      .select("id, servico, ambiente, publico, segredo, ativo, atualizado_em")
      .match({ servico, ambiente }),
    dono
  ).maybeSingle();

  if (error) throw new Error(`Não foi possível ler a credencial de ${servico}: ${error.message}`);
  if (!data) return null;

  const linha = data as unknown as LinhaCredencial;
  return {
    id: linha.id,
    ambiente: linha.ambiente,
    publico: FORMATOS[servico].parse(linha.publico) as z.infer<(typeof FORMATOS)[S]>,
    temSegredo: Boolean(linha.segredo),
    ativo: linha.ativo,
    atualizado_em: linha.atualizado_em,
  };
}

/**
 * Abre o segredo. Só no ponto de uso — na chamada à Cielo, no envio do e-mail.
 * Nunca para mostrar em tela: uma vez exibido, ele está no histórico do
 * navegador e no log de quem estiver com o DevTools aberto.
 */
export async function abrirSegredo(servico: Servico, dono: Dono, ambiente: Ambiente = "producao") {
  const supabase = criarClienteServico();
  const { data, error } = await porDono(
    supabase
      .from("credenciais" as never)
      .select("segredo, ativo")
      .match({ servico, ambiente }),
    dono
  ).maybeSingle();

  if (error) throw new Error(`Não foi possível ler a credencial de ${servico}: ${error.message}`);
  const linha = data as unknown as { segredo: string | null; ativo: boolean } | null;
  if (!linha || !linha.ativo || !linha.segredo) return null;
  return decifrar(linha.segredo);
}

/**
 * Grava. O segredo em branco MANTÉM o que já estava: a tela nunca recebe o
 * valor atual de volta, então um campo vazio significa "não mexi nele", não
 * "apague". Apagar de verdade é `removerCredencial`.
 */
export async function salvarCredencial<S extends Servico>(
  servico: S,
  dono: Dono,
  dados: { publico: unknown; segredo?: string | null; ambiente?: Ambiente; ativo?: boolean },
  atualizadoPor?: string | null
) {
  const publico = FORMATOS[servico].parse(dados.publico);
  const ambiente = dados.ambiente ?? "producao";
  const supabase = criarClienteServico();
  const chave = { servico, ambiente, ...colunasDoDono(dono) };

  const atual = await porDono(
    supabase
      .from("credenciais" as never)
      .select("id, segredo")
      .match({ servico, ambiente }),
    dono
  ).maybeSingle();
  const anterior = atual.data as unknown as { id: string; segredo: string | null } | null;

  const segredo = dados.segredo?.trim()
    ? cifrar(dados.segredo.trim())
    : (anterior?.segredo ?? null);

  const linha = {
    ...chave,
    publico,
    segredo,
    ativo: dados.ativo ?? true,
    atualizado_em: new Date().toISOString(),
    atualizado_por: atualizadoPor ?? null,
  };

  const { error } = anterior
    ? await supabase.from("credenciais" as never).update(linha as never).eq("id", anterior.id)
    : await supabase.from("credenciais" as never).insert(linha as never);

  if (error) throw new Error(`Não foi possível guardar a credencial de ${servico}: ${error.message}`);
}

export async function removerCredencial(servico: Servico, dono: Dono, ambiente: Ambiente = "producao") {
  const supabase = criarClienteServico();
  const { error } = await porDono(
    supabase.from("credenciais" as never).delete().match({ servico, ambiente }),
    dono
  );
  if (error) throw new Error(`Não foi possível remover a credencial de ${servico}: ${error.message}`);
}

/**
 * As contas de um serviço, em bloco, indexadas pelo dono.
 *
 * A tela de estrutura tem centenas de linhas: uma consulta por linha faria a
 * página abrir em segundos. Devolve só a parte pública e se há segredo — o
 * segredo nunca sai daqui.
 */
export async function listarCredenciais<S extends Servico>(
  servico: S,
  ambiente: Ambiente = "producao"
): Promise<Map<string, CredencialVisivel<z.infer<(typeof FORMATOS)[S]>>>> {
  const supabase = criarClienteServico();
  const { data, error } = await supabase
    .from("credenciais" as never)
    .select("id, ambiente, organizacao_id, unidade_id, local_id, publico, segredo, ativo, atualizado_em")
    .match({ servico, ambiente });

  if (error) throw new Error(`Não foi possível ler as credenciais de ${servico}: ${error.message}`);

  const mapa = new Map<string, CredencialVisivel<z.infer<(typeof FORMATOS)[S]>>>();
  for (const bruto of (data ?? []) as unknown as (LinhaCredencial & {
    organizacao_id: string | null;
    unidade_id: string | null;
    local_id: string | null;
  })[]) {
    const dono = bruto.organizacao_id ?? bruto.unidade_id ?? bruto.local_id;
    if (!dono) continue;
    const formato = FORMATOS[servico].safeParse(bruto.publico);
    // ⚠️ Uma linha em formato antigo não pode derrubar a listagem inteira: a
    // pessoa perderia o acesso à tela onde justamente corrigiria o cadastro.
    if (!formato.success) continue;
    mapa.set(dono, {
      id: bruto.id,
      ambiente: bruto.ambiente,
      publico: formato.data as z.infer<(typeof FORMATOS)[S]>,
      temSegredo: Boolean(bruto.segredo),
      ativo: bruto.ativo,
      atualizado_em: bruto.atualizado_em,
    });
  }
  return mapa;
}

/**
 * Grava (ou apaga) a conta Cielo de uma entidade a partir do formulário dela.
 *
 * Cada Organização, cada Regional e cada Academia recebe na SUA conta, então
 * a conta mora no cadastro da entidade — e três telas gravam a mesma coisa.
 * Estava escrito três vezes, palavra por palavra; a quarta chamada divergiu e
 * apagou a conta das Regionais em silêncio. Uma cópia só, aqui, ao lado de
 * `salvarCredencial` e `removerCredencial`, que já falam em `Dono`.
 *
 * ⚠️ Roda DEPOIS de a entidade existir e falha só o passo dela: uma Regional
 * cadastrada com a chave digitada errada não pode desaparecer junto com o
 * erro. A pessoa reabre e corrige só a conta.
 */
export async function guardarCieloDoFormulario(formData: FormData, dono: Dono) {
  // ⚠️ O porteiro fica AQUI, e não em cada chamador. Conta bancária é dado da
  // Sede: quem cadastra estrutura não necessariamente mexe em por onde entra
  // dinheiro. Deixar a checagem no chamador é o mesmo tipo de repetição que
  // deixou esta função triplicada — a quarta tela esqueceria.
  const eu = await pessoaAtual();
  if (!eu?.pode("configuracao.gerir")) return;

  // ⚠️ Formulário que NÃO desenhou o bloco da Cielo não decide nada sobre a
  // conta. Sem esta linha, salvar o telefone de uma Regional numa tela que não
  // mostra a conta manda o Merchant ID em branco — e "em branco" abaixo quer
  // dizer APAGAR. A marca vem de `CamposCielo`, o único que sabe se o bloco
  // foi desenhado; nenhuma tela precisa lembrar de nada.
  if (!formData.get("cielo_na_tela")) return;

  const merchantId = String(formData.get("cielo_merchant_id") ?? "").trim();

  // ⚠️ Merchant ID em branco APAGA a conta. É o único jeito de a entidade
  // parar de receber: se apenas ignorasse o campo vazio, quem limpou o
  // cadastro sairia da tela achando que desligou a venda, e o dinheiro
  // continuaria caindo na conta antiga. Vale também quando o tipo muda para um
  // que não recebe em conta própria — o bloco some e o campo vem vazio.
  if (!merchantId) {
    await removerCredencial("cielo", dono);
    return;
  }

  await salvarCredencial(
    "cielo",
    dono,
    {
      publico: {
        merchant_id: merchantId,
        nome_loja: String(formData.get("cielo_nome_loja") ?? "").trim(),
      },
      segredo: String(formData.get("cielo_merchant_key") ?? ""),
    },
    eu.id
  );
}

/** O que a tela precisa saber sobre a conta Cielo de uma entidade. */
export type ContaCieloNaTela = CieloPublico & { temSegredo: boolean };

/**
 * As contas Cielo prontas para a tela, indexadas pelo id do dono.
 *
 * As quatro telas que cadastram entidade faziam a mesma coisa: checar a
 * capacidade, listar as credenciais e adaptar cada uma ao formato do
 * formulário — com o formato redeclarado à mão em cada arquivo. Como o tipo é
 * estrutural e anônimo, esquecer um deles não dava erro de compilação; dava
 * campo em branco numa tela só, que foi como a conta das Regionais sumiu.
 *
 * ⚠️ Devolve mapa VAZIO para quem não pode ver, em vez de recusar: conta
 * bancária é dado da Sede, e quem só cadastra estrutura continua editando o
 * endereço da unidade sem enxergar por onde ela recebe.
 */
export async function contasCieloVisiveis(
  podeVer: boolean
): Promise<Map<string, ContaCieloNaTela>> {
  if (!podeVer) return new Map();
  const contas = await listarCredenciais("cielo");
  return new Map(
    [...contas].map(([dono, c]) => [dono, { ...c.publico, temSegredo: c.temSegredo }])
  );
}
