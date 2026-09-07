/**
 * Migração MySQL (Railway) → Postgres (Supabase), por fases e REPETÍVEL.
 *
 *   MIGRACAO_MYSQL_URL=mysql://leitura:...  DATABASE_URL=postgresql://...  npm run migrar [-- --fase=pessoas] [--dry-run]
 *
 * Cada tabela de destino guarda o id antigo em `legado_id`; o script faz
 * upsert por ele. Rode quantas vezes quiser: hoje, amanhã, na virada.
 * No fim imprime um relatório com contagens por fase e as rejeições com o
 * motivo — e grava em migracao-relatorio-<data>.json (ignorado pelo git).
 * O relatório NÃO contém dado pessoal além do id antigo.
 *
 * Quem roda é quem tem acesso às duas conexões. O dado não passa por
 * terceiros. O usuário do MySQL deve ser SOMENTE LEITURA.
 *
 * ORDEM DAS FASES importa e não é alfabética: não dá para gravar inscrição
 * antes do evento a que ela pertence, nem evento antes do tipo de ingresso
 * que ele vende. Uma fase que falha interrompe as seguintes — continuar
 * gravaria filhos órfãos que ninguém sabe de onde vieram.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import postgres from "postgres";
import {
  bool as booleano, centavos, chaveNucleo, cielo, data, deLista, numero, texto,
  tipoDeCampo, transformarParticipante, type ParticipanteMysql,
  type PessoaDestino,
} from "./lib/transformar";

/**
 * `rejeitadas` é o que NÃO entrou. `pendencias` é o que entrou e precisa de
 * olho humano depois.
 *
 * ⚠️ Separados de propósito. Somar as duas faria 15 mil pessoas que foram
 * gravadas corretamente aparecerem como falha, e ninguém autoriza uma carga
 * assim. E juntar no sentido contrário — chamar tudo de sucesso — esconderia
 * justamente a lista que alguém precisa revisar.
 */
type Relatorio = Record<string, {
  lidas: number;
  gravadas: number;
  rejeitadas: Record<string, number>;
  pendencias: Record<string, number>;
  avisos: number;
}>;

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? "true"];
}));
const dryRun = args.get("dry-run") === "true";
// ⚠️ "todas" e "" são sinônimos de rodar tudo. A validação contra o catálogo
// de fases acontece em `principal()`, depois que FASES existe — nome errado
// PARA a carga, e não a deixa passar sem rodar nada.
const soFase = (() => {
  const v = args.get("fase");
  return !v || v === "todas" ? null : v;
})();

const ORIGEM = process.env.MIGRACAO_MYSQL_URL;
const DESTINO = process.env.DATABASE_URL;
if (!ORIGEM || !DESTINO) {
  console.error("Faltam MIGRACAO_MYSQL_URL e/ou DATABASE_URL. Nada foi lido nem gravado.");
  process.exit(1);
}

// ⚠️ Declaradas aqui e ABERTAS dentro de `principal()`. O `await` no corpo do
// módulo obrigaria a saída a ser ESM, e o projeto compila estes scripts como
// CommonJS — o erro é de compilação, não de execução: o arquivo nem carrega,
// e nada do que ele faz chega a ser tentado.
let origem: mysql.Connection;
/**
 * ⚠️ `pool` é a conexão; `destino` é POR ONDE se escreve. No ensaio, `destino`
 * vira o handle de uma TRANSAÇÃO que é desfeita no fim — assim o ensaio executa
 * exatamente o SQL que a gravação executaria, e não sobra nada.
 *
 * Antes disso o ensaio não rodava SQL nenhum: contava linhas e validava a
 * transformação. Quatro execuções em produção foram gastas descobrindo, uma de
 * cada vez, coisas que só o banco sabe — coluna que não existe, índice único
 * que colide. Nenhuma delas era visível sem executar.
 */
let pool: ReturnType<typeof postgres>;
let destino: ReturnType<typeof postgres>;
const relatorio: Relatorio = {};
const rejeicoesDetalhe: { fase: string; legado_id: number; motivo: string }[] = [];

/**
 * O que fazer com quem foi recusado. Um número sozinho no relatório vira
 * "quatro pessoas se perderam"; com a saída ao lado, vira uma tarefa.
 *
 * ⚠️ Estrangeiro agora tem lugar no cadastro (decisão 0013), mas o sistema de
 * ORIGEM não tem campo de passaporte — não há o que migrar. As quatro entram
 * pela tela com o documento na mão. Inventar documento seria dado falso para
 * sempre.
 */
const SAIDA: Record<string, string> = {
  sem_cpf: "sem CPF na origem; se for estrangeira, cadastrar pela tela com o passaporte",
  cpf_invalido: "CPF não confere; se for estrangeira, cadastrar pela tela com o passaporte",
  sem_nome: "sem nome na origem; nada identifica essa linha",
};

function conta(fase: string) {
  relatorio[fase] ??= { lidas: 0, gravadas: 0, rejeitadas: {}, pendencias: {}, avisos: 0 };
  return relatorio[fase];
}

// ─── Fases ────────────────────────────────────────────────────────────────

async function fasePessoas() {
  const r = conta("pessoas");
  const [linhas] = await origem.query<mysql.RowDataPacket[]>("SELECT * FROM Participant ORDER BY id");
  r.lidas = linhas.length;

  /**
   * CPF já visto → a pessoa que ficou com ele.
   *
   * ⚠️ A ORIGEM TEM O MESMO CPF EM LINHAS DIFERENTES: a mesma pessoa cadastrada
   * duas vezes, em anos diferentes, sem que o sistema antigo impedisse. O
   * `on conflict (legado_id)` não vê isso — são ids de origem distintos — e a
   * carga batia no índice único do CPF e parava.
   *
   * Unificar não é remendo, é o motivo de existir cadastro único: as duas
   * inscrições passam a ser da MESMA pessoa, e o histórico dela deixa de estar
   * partido em dois. Criar duas pessoas seria reproduzir no sistema novo
   * exatamente o problema que ele veio resolver.
   *
   * Começa com o que JÁ ESTÁ no destino para a carga ser repetível: rodar de
   * novo não pode duplicar o que a execução anterior unificou.
   */
  // ⚠️ Marca para "esta linha ainda vai ser inserida, o id real não existe".
  // Antes era a string "gravada", que ia parar num `where id = …` de coluna
  // uuid e derrubava a fase com `invalid input syntax for type uuid`.
  const PENDENTE = "(ainda-nao-inserida)";
  const porCpf = new Map<string, { id: string; legado_id: number | null }>();
  // ⚠️ `cod_sni` é ÚNICO no destino e tem check de só-dígitos. A origem tem os
  // dois problemas: CodSNI com letra, e o mesmo CodSNI em duas pessoas de CPF
  // diferente. Qualquer um dos dois derruba o `insert` de mil linhas INTEIRO —
  // não a linha, o lote. Aqui o valor é conferido antes de entrar; o recusado
  // vai para `migracao_extras`, onde ninguém o perde, e se anuncia no relatório.
  const codSniDe = new Map<string, number | null>();
  const pendente = (motivo: string) => { r.pendencias[motivo] = (r.pendencias[motivo] ?? 0) + 1; };
  for (const l of await destino<{ id: string; cpf: string; legado_id: number | null }[]>`
    select id, cpf, legado_id from public.pessoas where cpf is not null`) {
    porCpf.set(l.cpf, { id: l.id, legado_id: l.legado_id });
  }
  // ⚠️ Guarda de QUEM é cada CodSNI, não só que ele existe. Numa segunda
  // execução o número da própria pessoa já está no banco: um `Set` o acusaria
  // de colidir consigo mesmo, e o `on conflict … do update` o apagaria.
  for (const l of await destino<{ cod_sni: string; legado_id: number | null }[]>`
    select cod_sni, legado_id from public.pessoas where cod_sni is not null`) {
    codSniDe.set(l.cod_sni, l.legado_id);
  }

  const aInserir: Record<string, unknown>[] = [];
  // Unificações de CPF repetido, aplicadas depois do lote — ver o bloco no fim
  // desta função.
  const unificacoes: { dono: { id: string; legado_id: number | null }; p: PessoaDestino }[] = [];

  const lote: ReturnType<typeof transformarParticipante>[] = linhas.map((l) => transformarParticipante(l as ParticipanteMysql));
  for (const item of lote) {
    if (!item.ok) {
      r.rejeitadas[item.motivo] = (r.rejeitadas[item.motivo] ?? 0) + 1;
      rejeicoesDetalhe.push({ fase: "pessoas", legado_id: item.legado_id, motivo: item.motivo });
      continue;
    }
    r.avisos += item.avisos.length;

    const p = item.pessoa;

    // ── Mesma pessoa, dois cadastros na origem ──
    //
    // Quem chega primeiro (menor id de origem) É a pessoa. Quem chega depois
    // completa o que falta e some como cadastro à parte.
    const jaExiste = porCpf.get(p.cpf!);

    // ⚠️ A pessoa da Sede nasce por MIGRAÇÃO, sem `legado_id`, e também está na
    // origem. Sem este ramo ela cairia na unificação, o id de origem ficaria só
    // dentro de `unificados`, e as inscrições dela seriam rejeitadas como
    // "pessoa não migrada". Adotar o id resolve na raiz: a partir daqui ela é
    // uma linha comum, atualizada pelo `on conflict` como todas as outras.
    if (jaExiste && jaExiste.legado_id === null) {
      r.pendencias["já estava cadastrada no sistema — a origem só preencheu vazios"] =
        (r.pendencias["já estava cadastrada no sistema — a origem só preencheu vazios"] ?? 0) + 1;

      // ⚠️ NÃO cai no `on conflict do update` depois disto, e é de propósito:
      // aquele caminho sobrescreve nome e e-mail com os da origem. Esta linha
      // foi posta por uma pessoa, não por carga — é ela que tem a conta do
      // Supabase e o papel — e trocar o e-mail dela pelo do sistema antigo
      // mexeria em quem consegue entrar. Dado digitado por gente ganha de dado
      // importado; a origem preenche o que está vazio e nada mais.
      //
      // `migracao_extras` PRECISA ser gravado mesmo assim: é de lá que a fase
      // `vinculos` lê a Regional, a Organização e a Associação Local. Sem isso
      // a pessoa ficaria sem vínculo nenhum, invisível em toda tela que lista
      // por unidade. O `||` mescla em vez de trocar, para não apagar o que
      // outra fase tenha deixado ali.
      await destino`
        update public.pessoas set
          legado_id   = ${p.legado_id},
          telefone    = coalesce(telefone, ${p.telefone}),
          nascimento  = coalesce(nascimento, ${p.nascimento}),
          logradouro  = coalesce(logradouro, ${p.endereco}),
          bairro      = coalesce(bairro, ${p.bairro}),
          cidade      = coalesce(cidade, ${p.cidade}),
          uf          = coalesce(uf, ${p.estado}),
          migracao_extras = coalesce(migracao_extras, '{}'::jsonb) || ${destino.json({
            regional: p.regional_nome,
            organizacao: p.organizacao_nome,
            associacao_local: p.associacao_local,
            primeira_vez: p.primeira_vez,
            cadastro_anterior_a_carga: true,
          })}
        where id = ${jaExiste.id}`;

      jaExiste.legado_id = p.legado_id;
      porCpf.set(p.cpf!, jaExiste);
      r.gravadas++;
      continue;
    }

    if (jaExiste && jaExiste.legado_id !== p.legado_id) {
      r.pendencias["CPF repetido na origem — cadastros unificados"] =
        (r.pendencias["CPF repetido na origem — cadastros unificados"] ?? 0) + 1;
      rejeicoesDetalhe.push({ fase: "pessoas", legado_id: p.legado_id,
        motivo: `CPF já é do cadastro ${jaExiste.legado_id ?? "?"}; unificados` });

      // ⚠️ A unificação fica PARA DEPOIS do lote. O dono pode ser uma linha
      // que ainda não foi inserida — o `porCpf` a registra com um id de
      // mentira, porque o id real só existe depois do `insert`. Rodando aqui,
      // o `where id = 'gravada'` estourava com `invalid input syntax for type
      // uuid` e derrubava a fase inteira. Não apareceu na carga de verdade só
      // porque o banco já tinha as pessoas da tentativa anterior; numa base
      // limpa, com dois cadastros de mesmo CPF na origem, ela morre na hora.
      unificacoes.push({ dono: jaExiste, p });
      continue;
    }


    // ⚠️ O endereço vai para as colunas de verdade — `logradouro`, `bairro`,
    // `cidade`, `uf` — e NÃO para um campo único. A versão anterior grudava os
    // quatro numa string e mandava para uma coluna `endereco` que não existe:
    // a carga parava na primeira pessoa. Juntar também apagaria a única coisa
    // que a origem separa direito, e é justamente o que a tela precisa em
    // campos distintos para editar.
    //
    // `numero` e `complemento` ficam nulos porque a origem tem UM campo de
    // texto livre para a rua inteira. Fatiar por vírgula acertaria em parte dos
    // casos e erraria calado no resto — endereço errado é pior que incompleto.
    //
    // Regional, organização e associação local seguem em `migracao_extras`: a
    // fase `vinculos` é quem os resolve para a árvore.
    // ⚠️ Acumula em vez de inserir. `porCpf` é atualizado JÁ, e não depois do
    // lote: se a origem tiver o mesmo CPF duas vezes dentro do mesmo lote, a
    // segunda precisa cair na unificação — senão as duas entram no mesmo
    // comando e o índice único derruba o lote inteiro, com as mil linhas dele.
    // ⚠️ CodSNI conferido ANTES de entrar no lote: só dígitos, e ainda não
    // usado. Recusado, ele vai para os extras — perder o número seria pior que
    // guardá-lo fora da coluna, e mantê-lo derrubaria as mil linhas do lote.
    let codSni = p.cod_sni;
    let codSniRecusado: string | null = null;
    if (codSni && !/^\d+$/.test(codSni)) {
      codSniRecusado = codSni;
      codSni = null;
      pendente("CodSNI com caractere não numérico — guardado nos extras");
    } else if (codSni && codSniDe.has(codSni) && codSniDe.get(codSni) !== p.legado_id) {
      codSniRecusado = codSni;
      codSni = null;
      pendente("CodSNI repetido na origem — guardado nos extras do segundo");
    }
    if (codSni) codSniDe.set(codSni, p.legado_id);

    aInserir.push({
      legado_id: p.legado_id,
      cpf: p.cpf,
      cod_sni: codSni,
      nome: p.nome,
      email: p.email,
      telefone: p.telefone,
      nascimento: p.nascimento,
      logradouro: p.endereco,
      bairro: p.bairro,
      cidade: p.cidade,
      uf: p.estado,
      migracao_extras: destino.json({
        regional: p.regional_nome,
        organizacao: p.organizacao_nome,
        associacao_local: p.associacao_local,
        primeira_vez: p.primeira_vez,
        ...(codSniRecusado ? { cod_sni_recusado: codSniRecusado, conferir: true } : {}),
      }),
      criado_em: p.criado_em ?? new Date().toISOString(),
    });
    porCpf.set(p.cpf!, { id: PENDENTE, legado_id: p.legado_id });
    r.gravadas++;
  }

  for (const lote of emLotes(aInserir)) {
    // ⚠️ Colunas EXPLÍCITAS, e não deduzidas do primeiro objeto. Duas razões:
    // uma chave a mais ou a menos num objeto do meio mudaria calado o conjunto
    // de colunas do comando; e é por esta lista que o teste
    // `colunas-da-carga` confere cada nome contra o `create table` — sem ela, a
    // carga voltaria a poder escrever numa coluna que não existe.
    await destino`
      insert into public.pessoas ${destino(lote, "legado_id", "cpf", "cod_sni", "nome", "email", "telefone", "nascimento", "logradouro", "bairro", "cidade", "uf", "migracao_extras", "criado_em")}
      on conflict (legado_id) do update set
        cpf = excluded.cpf, cod_sni = excluded.cod_sni, nome = excluded.nome, email = excluded.email,
        telefone = excluded.telefone, nascimento = excluded.nascimento,
        logradouro = excluded.logradouro, bairro = excluded.bairro,
        cidade = excluded.cidade, uf = excluded.uf,
        migracao_extras = excluded.migracao_extras`;
  }

  // ⚠️ AGORA, com as linhas gravadas e com id de verdade. O dono é achado pelo
  // `legado_id` quando ele entrou nesta execução, e pelo id quando já estava no
  // banco — as duas formas existem porque `porCpf` mistura as duas origens.
  //
  // ⚠️ `coalesce` só PREENCHE buraco, nunca sobrescreve: o cadastro mais novo
  // costuma ter telefone e endereço atualizados, e o mais antigo costuma ter
  // campos que o novo deixou em branco. Sobrescrever trocaria dado bom por
  // vazio em metade dos casos.
  //
  // ⚠️ `cod_sni` fica DE FORA do coalesce mesmo estando vazio: ele é único, e o
  // CodSNI deste cadastro pode já pertencer a uma terceira pessoa — a carga
  // pararia de novo, agora no meio. Vai para os extras, onde ninguém o perde e
  // ninguém colide com ele.
  for (const { dono, p } of unificacoes) {
    const alvo = dono.id === PENDENTE ? null : dono.id;
    await destino`
      update public.pessoas set
        email       = coalesce(email, ${p.email}),
        telefone    = coalesce(telefone, ${p.telefone}),
        nascimento  = coalesce(nascimento, ${p.nascimento}),
        logradouro  = coalesce(logradouro, ${p.endereco}),
        bairro      = coalesce(bairro, ${p.bairro}),
        cidade      = coalesce(cidade, ${p.cidade}),
        uf          = coalesce(uf, ${p.estado}),
        migracao_extras = coalesce(migracao_extras, '{}'::jsonb) || jsonb_build_object(
          'unificados',
          coalesce(migracao_extras->'unificados', '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object('legado_id', ${p.legado_id}::integer, 'nome', ${p.nome}::text,
                               'cod_sni', ${p.cod_sni}::text, 'conferir', true)))
      where ${alvo ? destino`id = ${alvo}::uuid` : destino`legado_id = ${dono.legado_id}`}`;
  }
}

// ─── Apoio ────────────────────────────────────────────────────────────────

/**
 * Quantas linhas vão num comando só.
 *
 * ⚠️ Uma inserção por linha custa uma IDA E VOLTA por linha. Com dezesseis mil
 * pessoas e outras tantas de vínculo, pelo pooler, isso é mais de uma hora — e
 * uma hora de espera não é um ciclo de trabalho: ninguém roda o ensaio antes
 * de gravar se o ensaio demora tudo isso, que é justamente o hábito que a
 * transação desfeita veio criar.
 *
 * Mil por vez porque o Postgres tem teto de 65.535 parâmetros por comando: com
 * treze colunas, mil linhas dão treze mil parâmetros, com folga larga.
 */
const LOTE = 1000;

/**
 * Traduz um valor da origem para uma lista fechada do destino e ANOTA o que não
 * conhece.
 *
 * ⚠️ É o antídoto para a armadilha que já custou execuções: coluna com
 * `check (x in (...))` recebendo palavra que a origem escolheu. Sem isto, a
 * primeira divergência de vocabulário derruba a fase inteira, e cada execução
 * descobre uma. Com isto, a carga atravessa e o relatório diz TODAS as palavras
 * que faltam traduzir, de uma vez.
 */
function daLista(
  r: Relatorio[string],
  campo: string,
  bruto: unknown,
  permitidos: readonly string[],
  padrao: string,
  sinonimos: Record<string, string> = {}
): string {
  const { valor, desconhecido } = deLista(bruto, permitidos, padrao, sinonimos);
  if (desconhecido) {
    const motivo = `${campo} "${desconhecido}" desconhecido — virou "${padrao}"`;
    r.pendencias[motivo] = (r.pendencias[motivo] ?? 0) + 1;
  }
  return valor;
}

function emLotes<T>(itens: T[], tamanho = LOTE): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

async function ler(tabela: string, ordem = "id"): Promise<Record<string, unknown>[]> {
  const [linhas] = await origem.query<mysql.RowDataPacket[]>(
    `SELECT * FROM \`${tabela}\` ORDER BY ${ordem}`
  );
  return linhas as Record<string, unknown>[];
}

/**
 * Mapa legado_id → id do destino, para as fases que apontam para outras.
 *
 * ⚠️ NO ENSAIO O MAPA VEM DA ORIGEM, e isso não é atalho: é o que faz o ensaio
 * dizer a verdade. Lido do destino, ele viria VAZIO — nada foi gravado —, e
 * toda linha filha seria contada como "pai não migrado". A primeira execução
 * relatou 1.237 inscrições rejeitadas de 1.237 lidas, o que parece uma carga
 * inteiramente quebrada e era só o ensaio se olhando no espelho.
 *
 * Com o mapa da origem, a checagem passa a responder o que interessa de fato:
 * a linha pai EXISTE? Um filho órfão de verdade continua sendo rejeitado.
 */
async function mapaDe(tabelaDestino: string): Promise<Map<number, number>> {
  const linhas = await destino<{ id: number; legado_id: number }[]>`
    select id, legado_id from ${destino(tabelaDestino)} where legado_id is not null`;
  return new Map(linhas.map((l) => [l.legado_id, l.id]));
}

let cachePessoas: Map<number, string> | null = null;

/** O mesmo, para `pessoas`, cujo id de destino é uuid. */
async function mapaPessoas(): Promise<Map<number, string>> {
  // ⚠️ Duas entradas por pessoa unificada. Quando a origem tinha o mesmo CPF em
  // dois cadastros, um deles não virou linha em `pessoas` — virou item em
  // `migracao_extras.unificados`. Sem mapear esse id também, TODA inscrição
  // feita pelo cadastro que sumiu seria rejeitada como "pessoa não migrada", e
  // o histórico dela ficaria pela metade: o pior resultado possível, porque a
  // unificação existe justamente para juntar os dois.
  // ⚠️ Memoizado: `mapaPessoas()` é chamado por vínculos, compras e comissão,
  // e varria as dezesseis mil linhas de `pessoas` extraindo jsonb uma vez para
  // cada. O mapa não muda depois da fase `pessoas` — as três chamadas leem a
  // mesma resposta.
  if (cachePessoas) return cachePessoas;

  const linhas = await destino<{ id: string; legado_id: number | null; unificados: { legado_id: number }[] | null }[]>`
    select id, legado_id, migracao_extras->'unificados' as unificados
      from public.pessoas
     where legado_id is not null or migracao_extras ? 'unificados'`;
  const mapa = new Map<number, string>();
  cachePessoas = mapa;
  for (const l of linhas) {
    if (l.legado_id !== null) mapa.set(l.legado_id, l.id);
    for (const u of l.unificados ?? []) mapa.set(Number(u.legado_id), l.id);
  }
  return mapa;
}

// ─── vínculos ─────────────────────────────────────────────────────────────

/**
 * Põe cada pessoa na Regional, Organização e Associação Local dela — criando
 * as unidades que ainda não existem.
 *
 * A origem guarda os três como TEXTO LIVRE em `Participant`. Aqui eles viram
 * estrutura de verdade: a Regional casa com a árvore que veio do site
 * institucional, a Organização com o catálogo, e a Associação Local — que não
 * existe em lugar nenhum ainda — é criada sob a Regional certa.
 *
 * ⚠️ O CASAMENTO É POR NOME NORMALIZADO, e é onde mora o risco. "REGIONAL SÃO
 * PAULO", "Regional Sao Paulo" e "São Paulo" são a mesma coisa para uma pessoa
 * e três coisas para um `=`. Sem normalizar, a carga criaria Regionais
 * duplicadas ao lado das verdadeiras, e os relatórios passariam a somar
 * metade em cada uma — erro que só aparece quando alguém estranha um total.
 *
 * ⚠️ A CHAVE DA ASSOCIAÇÃO LOCAL INCLUI A ORGANIZAÇÃO. Toda AL pertence a uma
 * Organização (regra da instituição), então "AL Centro / Prosperidade" e "AL
 * Centro / Jovens" são DUAS Associações Locais, não uma com duas organizações.
 * Tratá-las como uma faria a segunda sumir.
 */

async function faseVinculos() {
  const r = conta("vinculos");
  // Conta e amostra são campos separados de propósito: a amostra é truncada
  // para o relatório caber, e somar pelo tamanho dela mentiria o total.
  const criadas = { regionais: 0, organizacoes: 0, associacoes: 0 };
  const amostra = { regionais: [] as string[], organizacoes: [] as string[] };

  const [sede] = await destino<{ id: string }[]>`
    select id from public.unidades where tipo = 'sede_central' limit 1`;
  if (!sede) throw new Error("Sem Sede Central no destino: aplique as migrações antes.");

  // Catálogos existentes. ⚠️ Lidos do DESTINO mesmo no ensaio, e isso está
  // certo: as 114 Regionais já estão lá, e é justamente contra elas que o
  // casamento precisa ser medido antes de gravar.
  const regionais = new Map<string, string>();
  for (const u of await destino<{ id: string; nome: string }[]>`
    select id, nome from public.unidades where tipo = 'regional'`) {
    regionais.set(chaveNucleo(u.nome), u.id);
  }

  const organizacoes = new Map<string, string>();
  for (const o of await destino<{ id: string; nome: string }[]>`
    select id, nome from public.organizacoes`) {
    organizacoes.set(chaveNucleo(o.nome), o.id);
  }

  const associacoes = new Map<string, string>();
  for (const u of await destino<{ id: string; nome: string; pai_id: string; organizacao_id: string }[]>`
    select id, nome, pai_id, organizacao_id from public.unidades where tipo = 'associacao_local'`) {
    associacoes.set(`${u.pai_id}|${u.organizacao_id}|${chaveNucleo(u.nome)}`, u.id);
  }

  const pessoas = await mapaPessoas();
  const participantes = await ler("Participant");
  r.lidas = participantes.length;

  // Quem já tem vínculo ativo não é tocado: a carga é repetível, e sobrescrever
  // apagaria uma correção feita à mão na tela.
  const jaVinculadas = new Set(
    (await destino<{ pessoa_id: string }[]>`
      select pessoa_id from public.pessoa_unidade_vinculos where data_fim is null`)
      .map((v) => v.pessoa_id)
  );

  const vinculos: Record<string, unknown>[] = [];
  const rejeitar = (motivo: string) => { r.rejeitadas[motivo] = (r.rejeitadas[motivo] ?? 0) + 1; };
  const pendente = (motivo: string) => { r.pendencias[motivo] = (r.pendencias[motivo] ?? 0) + 1; };

  /**
   * A Organização de quem tem Associação Local e não tem Organização.
   *
   * ⚠️ São 15.404 pessoas — 92% da base. Descartar a AL delas jogaria fora o
   * nome que a origem tem, e ninguém reconstrói isso depois. Pendurá-las numa
   * Organização EXPLICITAMENTE indefinida preserva a AL, põe cada pessoa na
   * AL certa, e deixa a dívida visível: a tela lista, alguém move a AL para a
   * Organização correta, e as pessoas vão junto — sem retrabalho pessoa a
   * pessoa.
   *
   * `ordem` alta para cair no fim de toda lista de escolha: ela não é uma
   * opção que se ofereça a quem está cadastrando.
   */
  let indefinidaId: string | undefined;
  const organizacaoIndefinida = async (): Promise<string> => {
    if (indefinidaId) return indefinidaId;
    const jaTem = organizacoes.get(chaveNucleo("Indefinida"));
    if (jaTem) return (indefinidaId = jaTem);
    // ⚠️ `e_organizacao = false`: a "Indefinida" é uma DÍVIDA a revisar, não uma
    // Organização doutrinária. Marcada, ela apareceria na lista de escolha de
    // quem cadastra uma Associação Local — e alguém escolheria, de boa-fé,
    // transformando o balde temporário em destino permanente.
    const [nova] = await destino<{ id: string }[]>`
      insert into public.organizacoes (nome, ordem, e_organizacao)
      values ('Indefinida', 900, false)
      on conflict (nome) do update set ordem = 900, e_organizacao = false
      returning id`;
    organizacoes.set(chaveNucleo("Indefinida"), nova.id);
    return (indefinidaId = nova.id);
  };

  /**
   * Onde ficam as pessoas cuja Regional a origem não diz.
   *
   * ⚠️ Associação Local só existe dentro de Regional ou Núcleo — regra do
   * catálogo `tipos_unidade`, e o gatilho recusa o contrário. Para a AL
   * "Sede Central" existir, precisa haver uma Regional entre ela e a Sede.
   * Ela é um degrau de espera com o mesmo nome, não uma Regional de verdade:
   * `conferir` marca as duas para a tela de reconciliação.
   *
   * A alternativa seria afrouxar `pais_permitidos` para deixar AL pender da
   * Sede Central. Isso mudaria a árvore para sempre — a tela de cadastro
   * passaria a oferecer a Sede como pai de qualquer AL nova — por causa de
   * um balde temporário de 144 pessoas. Duas linhas de dado se apagam quando
   * a Sede disser a Regional certa; uma regra afrouxada não.
   */
  let alSedeId: string | undefined;
  // Como a AL "Sede Central" chegou a existir: criada por esta carga, ou já
  // vinda da origem porque alguém tem "SEDE CENTRAL" escrito na Regional. As
  // duas são corretas, e a diferença muda o que a tela de conferência mostra —
  // por isso o relatório diz qual foi, em vez de deixar o total explicar.
  const sedeCentral = { pessoas: 0, regionalReaproveitada: false, alReaproveitada: false };
  const associacaoSedeCentral = async (): Promise<string> => {
    sedeCentral.pessoas++;
    if (alSedeId) return alSedeId;

    const chaveSede = chaveNucleo("Sede Central");
    let regionalSede = regionais.get(chaveSede);
    sedeCentral.regionalReaproveitada = Boolean(regionalSede);
    if (!regionalSede) {
      const [nova] = await destino<{ id: string }[]>`
        insert into public.unidades (tipo, pai_id, nome, migracao_extras)
        values ('regional', ${sede.id}, 'Sede Central',
                ${destino.json({ origem: "Credenciamento", motivo: "Regional desconhecida na origem", conferir: true })})
        returning id`;
      regionalSede = nova.id;
      regionais.set(chaveSede, regionalSede);
      criadas.regionais++;
      if (amostra.regionais.length < 40) amostra.regionais.push("Sede Central");
    }

    const organizacaoId = await organizacaoIndefinida();
    const chave = `${regionalSede}|${organizacaoId}|${chaveSede}`;
    const jaTem = associacoes.get(chave);
    sedeCentral.alReaproveitada = Boolean(jaTem);
    if (jaTem) return (alSedeId = jaTem);

    const [linha] = await destino<{ id: string }[]>`
      insert into public.unidades (tipo, pai_id, organizacao_id, nome, migracao_extras)
      values ('associacao_local', ${regionalSede}, ${organizacaoId}, 'Sede Central',
              ${destino.json({ origem: "Credenciamento", motivo: "Regional desconhecida na origem", conferir: true })})
      returning id`;
    const nova = linha.id;
    associacoes.set(chave, nova);
    criadas.associacoes++;
    return (alSedeId = nova);
  };

  for (const p of participantes) {
    const pessoa = pessoas.get(Number(p.id));
    if (!pessoa) { rejeitar("pessoa não migrada"); continue; }
    if (jaVinculadas.has(pessoa)) { r.avisos++; continue; }

    // ── Regional ──
    //
    // Sem Regional na origem, a pessoa fica na SEDE CENTRAL. Decisão da Sede:
    // é um lugar provisório e verdadeiro — ela pertence à instituição, e a
    // qual Regional ninguém sabe. Deixá-la sem vínculo nenhum a esconderia de
    // toda tela que lista por unidade.
    // Uma fonte só para o destino: a Sede é o padrão, e cada ramo abaixo diz
    // por que sai dele. O ternário antes atribuía `sede.id` e o `if` logo
    // depois reatribuía o MESMO valor — quem mexesse num sem mexer no outro
    // mudaria em silêncio onde 144 pessoas vão parar.
    const chaveRegional = chaveNucleo(p.regional);
    let regionalId = sede.id;
    if (!chaveRegional) {
      pendente("sem Regional na origem — ficou na Associação Local Sede Central");
    } else if (regionais.has(chaveRegional)) {
      regionalId = regionais.get(chaveRegional)!;
    } else {
      const nome = texto(p.regional)!;
      const [nova] = await destino<{ id: string }[]>`
        insert into public.unidades (tipo, pai_id, nome, migracao_extras)
        values ('regional', ${sede.id}, ${nome},
                ${destino.json({ origem: "Credenciamento", nome_bruto: nome, conferir: true })})
        returning id`;
      regionalId = nova.id;
      regionais.set(chaveRegional, regionalId);
      criadas.regionais++;
      if (amostra.regionais.length < 40) amostra.regionais.push(nome);
    }

    // ── Organização ──
    const chaveOrg = chaveNucleo(p.organizacao);
    let organizacaoId = chaveOrg ? organizacoes.get(chaveOrg) : undefined;
    if (chaveOrg && !organizacaoId) {
      const nome = texto(p.organizacao)!;
      const [nova] = await destino<{ id: string }[]>`
        insert into public.organizacoes (nome) values (${nome})
        on conflict (nome) do update set nome = excluded.nome
        returning id`;
      organizacaoId = nova.id;
      organizacoes.set(chaveOrg, organizacaoId);
      criadas.organizacoes++;
      if (amostra.organizacoes.length < 20) amostra.organizacoes.push(nome);
    }

    // ── Associação Local ──
    //
    // Sem AL, ou sem Organização, a pessoa fica na REGIONAL. Não é o ideal, e
    // é melhor que inventar: uma AL sem organização o banco recusa, e chutar
    // uma organização poria a pessoa no lugar errado — que é pior que num
    // lugar menos específico.
    const chaveAl = chaveNucleo(p.associacaoLocal);
    let unidadeDestino = regionalId;

    // Sem Regional na origem, a pessoa vai para a Associação Local "Sede
    // Central" — decisão da Sede. Toda pessoa fica numa AL, como todo mundo,
    // e o balde a revisar é UMA unidade, não 144 pessoas soltas.
    //
    // ⚠️ Criar aqui a AL que a origem traz seria pior: sem saber a Regional,
    // ela nasceria sob a Regional de espera e viraria uma segunda "AL Centro"
    // ao lado da verdadeira, que alguém teria de fundir depois. O nome que a
    // origem tem vai para o detalhe do relatório, que é a lista de conferência.
    if (!chaveRegional) {
      unidadeDestino = await associacaoSedeCentral();
      if (chaveAl) {
        rejeicoesDetalhe.push({ fase: "vinculos", legado_id: Number(p.id),
          motivo: `sem Regional; AL da origem preservada só no relatório: ${texto(p.associacaoLocal)}` });
      }
    } else if (chaveAl) {
      // Sem Organização na origem, a AL nasce sob "Indefinida" — ver acima.
      if (!organizacaoId) {
        organizacaoId = await organizacaoIndefinida();
        pendente("Organização indefinida — revisar a Associação Local");
      }
      const chave = `${regionalId}|${organizacaoId}|${chaveAl}`;
      let alId = associacoes.get(chave);
      if (!alId) {
        const nome = texto(p.associacaoLocal)!;
        const [nova] = await destino<{ id: string }[]>`
          insert into public.unidades (tipo, pai_id, organizacao_id, nome, migracao_extras)
          values ('associacao_local', ${regionalId}, ${organizacaoId}, ${nome},
                  ${destino.json({ origem: "Credenciamento", nome_bruto: nome, conferir: true })})
          returning id`;
        alId = nova.id;
        associacoes.set(chave, alId);
        criadas.associacoes++;
      }
      unidadeDestino = alId;
    } else {
      pendente("sem Associação Local na origem — ficou na Regional");
    }

    // ⚠️ Em lote, como em `pessoas`: dezesseis mil idas e voltas pelo pooler
    // levam mais de meia hora, e um ensaio que demora tudo isso ninguém roda.
    // `jaVinculadas` já garantiu que ninguém entra duas vezes no mesmo lote.
    vinculos.push({ pessoa_id: pessoa, unidade_id: unidadeDestino, motivo: "carga do Credenciamento" });
    r.gravadas++;
  }

  for (const lote of emLotes(vinculos)) {
    await destino`
      insert into public.pessoa_unidade_vinculos ${destino(lote, "pessoa_id", "unidade_id", "motivo")}
      on conflict do nothing`;
  }

  // As criadas vão para o relatório: são nomes de unidade, não dado pessoal, e
  // é a lista que alguém precisa conferir depois — Regional criada por engano
  // é Regional duplicada ao lado da verdadeira.
  console.log(
    `   Regionais novas: ${criadas.regionais}` +
    (amostra.regionais.length ? ` (${amostra.regionais.slice(0, 8).join("; ")}${criadas.regionais > 8 ? "; …" : ""})` : "") +
    ` | Organizações novas: ${criadas.organizacoes}` +
    (amostra.organizacoes.length ? ` (${amostra.organizacoes.join("; ")})` : "") +
    ` | Associações Locais novas: ${criadas.associacoes}`
  );
  console.log(
    `   Sede Central: ${sedeCentral.pessoas} pessoas sem Regional na origem` +
    ` | Regional ${sedeCentral.regionalReaproveitada ? "já existia" : "criada agora"}` +
    ` | AL ${sedeCentral.alReaproveitada ? "já existia" : "criada agora"}`
  );
  rejeicoesDetalhe.push({ fase: "vinculos", legado_id: 0, motivo:
    `criadas: ${criadas.regionais} regionais, ${criadas.organizacoes} organizações, ${criadas.associacoes} associações locais` });
}

// ─── estrutura ────────────────────────────────────────────────────────────

/**
 * O que a origem chamava de estrutura NÃO vira estrutura institucional.
 *
 * ⚠️ `Regional` e `Organizacao` na origem são listas de nomes em texto, sem
 * vínculo com a árvore de `unidades` — e a árvore real já veio do site
 * institucional, com 114 Regionais. Importá-las criaria uma segunda verdade
 * sobre a mesma instituição, e ninguém saberia qual consultar.
 *
 * Então esta fase importa só o que é do MÓDULO: `Local` (onde o evento
 * acontece) e `Orientador` (quem conduz). O casamento entre os nomes antigos
 * e a árvore é trabalho de tela, com uma pessoa decidindo caso a caso.
 */
async function faseEstrutura() {
  const r = conta("estrutura");

  const locais = await ler("Local");
  r.lidas += locais.length;
  for (const l of locais) {
    // Local do módulo vira local COMUM: a Academia já está lá pelo seed, e
    // duas listas de lugares seriam duas respostas para "onde é o evento?".
    //
    // ⚠️ Conflita por `legado_id`, e não `do nothing` solto. O insert não
    // trazia NENHUMA coluna única preenchida — `codigo`, `slug` e `legado_id`
    // ficavam todas vazias —, então o `on conflict` nunca podia disparar: a
    // segunda execução duplicava todos os locais, contra a promessa do
    // cabeçalho de que a carga é repetível. A coluna existe na tabela
    // exatamente para isto e estava sem uso.
    await destino`
      insert into public.locais (legado_id, tipo, nome, logradouro, bairro, cidade, uf, telefone, email, observacoes)
      values (${Number(l.id)}, 'outro', ${texto(l.nome)}, ${texto(l.endereco)}, ${texto(l.bairro)},
              ${texto(l.cidade)}, ${texto(l.estado)}, ${texto(l.telefone)}, ${texto(l.email)},
              ${`Importado do Credenciamento (id ${l.id}).` + (texto(l.contaCielo) ? " Tinha conta Cielo em texto livre." : "")})
      on conflict (legado_id) do update set
        nome = excluded.nome, logradouro = excluded.logradouro, bairro = excluded.bairro,
        cidade = excluded.cidade, uf = excluded.uf, telefone = excluded.telefone,
        email = excluded.email`;
    r.gravadas++;
  }

  const orientadores = await ler("Orientador");
  r.lidas += orientadores.length;
  for (const o of orientadores) {
    await destino`
      insert into eventos.orientadores (legado_id, nome, foto_url, bio)
      values (${Number(o.id)}, ${texto(o.nome)}, ${texto(o.fotoUrl)}, ${texto(o.bio)})
      on conflict (legado_id) do update set
        nome = excluded.nome, foto_url = excluded.foto_url, bio = excluded.bio`;
    r.gravadas++;
  }
}

// ─── eventos ──────────────────────────────────────────────────────────────

/**
 * As opções de um campo personalizado, vindas de uma coluna de texto livre.
 *
 * ⚠️ `JSON.parse` solto derrubava a fase inteira de eventos. A coluna é texto
 * na origem, e uma linha antiga com "Sim,Não" em vez de JSON estourava um
 * `SyntaxError` sem ninguém pegar — e `compras`, `comissao` e `sequencias`
 * nunca chegavam a rodar. O mesmo risco em `participantesJson` já era tratado
 * com `try/catch` a poucas linhas daqui, com a razão escrita: perder o pedido
 * inteiro é pior que perder o campo.
 *
 * Aqui vale o mesmo. O campo entra sem opções e a linha SE ANUNCIA no
 * relatório, para alguém abrir e conferir.
 */
function opcoesDoCampo(r: ReturnType<typeof conta>, bruto: unknown) {
  if (bruto == null || String(bruto).trim() === "") return null;
  try {
    return destino.json(JSON.parse(String(bruto)));
  } catch {
    r.pendencias["opções do campo em formato ilegível — campo ficou sem opções"] =
      (r.pendencias["opções do campo em formato ilegível — campo ficou sem opções"] ?? 0) + 1;
    return null;
  }
}

async function faseEventos() {
  const r = conta("eventos");

  // A Organização que promove os dois eventos existentes. Informada pela
  // Sede: ambos são da Associação da Prosperidade (decisão 0012 — o evento
  // declara quem promove, e a conta Cielo vem daí).
  const [prosperidade] = await destino<{ id: string }[]>`
    select id from public.organizacoes where nome = 'Associação da Prosperidade' limit 1`;

  const eventos = await ler("Evento");
  r.lidas += eventos.length;
  for (const e of eventos) {
    await destino`
      insert into eventos.eventos (
        legado_id, nome, slug, data_inicial, data_final, ativo,
        promotor_organizacao_id,
        voucher_banner_url, voucher_logo_url, voucher_cor_primaria, voucher_cor_secundaria,
        voucher_boas_vindas, voucher_instrucoes, voucher_rodape, voucher_mostrar,
        migracao_extras, criado_em)
      values (
        ${Number(e.id)}, ${texto(e.nome)}, ${texto(e.slug)}, ${data(e.dataInicial)}, ${data(e.dataFinal)},
        ${booleano(e.ativo)}, ${prosperidade?.id ?? null},
        ${texto(e.voucherBannerUrl)}, ${texto(e.voucherLogoUrl)},
        ${texto(e.voucherCorPrimaria) ?? '#132460'}, ${texto(e.voucherCorSecundaria) ?? '#B45309'},
        ${texto(e.voucherBoasVindas)}, ${texto(e.voucherInstrucoes)}, ${texto(e.voucherRodape)},
        ${destino.json({
          participante: booleano(e.voucherMostrarParticipante),
          evento: booleano(e.voucherMostrarEvento),
          ingresso: booleano(e.voucherMostrarIngresso),
          qrcode: booleano(e.voucherMostrarQRCode),
          pagamento: booleano(e.voucherMostrarPagamento),
        })},
        ${destino.json({ local_antigo_id: numero(e.localId), promotor_antigo_id: numero(e.promotorId), conta_cielo_antiga_id: numero(e.cieloAccountId) })},
        ${data(e.createdAt) ?? new Date().toISOString()})
      on conflict (legado_id) do update set
        nome = excluded.nome, slug = excluded.slug,
        data_inicial = excluded.data_inicial, data_final = excluded.data_final,
        ativo = excluded.ativo, promotor_organizacao_id = excluded.promotor_organizacao_id,
        atualizado_em = now()`;
    r.gravadas++;
  }

  const mapaEvento = await mapaDe("eventos.eventos");

  const tipos = await ler("IngressoTipo");
  r.lidas += tipos.length;
  for (const t of tipos) {
    const evento = mapaEvento.get(Number(t.eventoId));
    if (!evento) { r.rejeitadas["evento não migrado"] = (r.rejeitadas["evento não migrado"] ?? 0) + 1; continue; }
    await destino`
      insert into eventos.ingresso_tipos (
        legado_id, evento_id, nome, descricao, valor_centavos, max_parcelas, quantidade,
        venda_inicio, venda_fim, idade_min, idade_max, unico_por_cpf, papel,
        exige_principal, exibir_venda_publica, ativo, criado_em)
      values (${Number(t.id)}, ${evento}, ${texto(t.nome)}, ${texto(t.descricao)},
              ${centavos(t.valor)}, ${numero(t.maxParcelas) || 1}, ${numero(t.quantidade)},
              ${data(t.vendaInicio)}, ${data(t.vendaFim)},
              ${numero(t.idadeMin)}, ${numero(t.idadeMax)},
              ${booleano(t.unicoPorCpf)}, ${daLista(r, "papel do ingresso", t.papel, ["principal", "adicional"], "adicional", { main: "principal", extra: "adicional", secundario: "adicional" })},
              ${booleano(t.exigePrincipal)}, ${booleano(t.exibirVendaPublica)},
              ${booleano(t.ativo)}, ${data(t.createdAt) ?? new Date().toISOString()})
      on conflict (legado_id) do update set
        nome = excluded.nome, valor_centavos = excluded.valor_centavos,
        quantidade = excluded.quantidade, ativo = excluded.ativo`;
    r.gravadas++;
  }

  const mapaTipo = await mapaDe("eventos.ingresso_tipos");

  const campos = await ler("IngressoCampo");
  r.lidas += campos.length;
  for (const c of campos) {
    const tipo = mapaTipo.get(Number(c.ingressoTipoId));
    if (!tipo) { r.rejeitadas["tipo de ingresso não migrado"] = (r.rejeitadas["tipo de ingresso não migrado"] ?? 0) + 1; continue; }
    // ⚠️ A origem fala o vocabulário de um formulário HTML ("text", "select",
    // "checkbox") e o destino fala o da instituição. Passar o valor cru fez a
    // fase inteira parar no `check` do banco — e derrubar dezesseis mil pessoas
    // por causa de um rótulo de campo é a troca errada. O que não se traduz
    // vira `texto`, que aceita o que a pessoa digitou, e SE ANUNCIA.
    const traduzido = tipoDeCampo(c.tipo);
    if (traduzido.desconhecido) {
      r.pendencias[`tipo de campo "${traduzido.desconhecido}" desconhecido — virou texto`] =
        (r.pendencias[`tipo de campo "${traduzido.desconhecido}" desconhecido — virou texto`] ?? 0) + 1;
    }

    await destino`
      insert into eventos.ingresso_campos (legado_id, ingresso_tipo_id, rotulo, tipo, opcoes, obrigatorio, ordem, ativo)
      values (${Number(c.id)}, ${tipo}, ${texto(c.label)}, ${traduzido.tipo},
              ${opcoesDoCampo(r, c.opcoesJson)},
              ${booleano(c.obrigatorio)}, ${numero(c.ordem) || 0}, ${booleano(c.ativo)})
      on conflict (legado_id) do update set rotulo = excluded.rotulo, ativo = excluded.ativo`;
    r.gravadas++;
  }

  const combos = await ler("Combo");
  r.lidas += combos.length;
  for (const c of combos) {
    const evento = mapaEvento.get(Number(c.eventoId));
    if (!evento) { r.rejeitadas["evento não migrado"] = (r.rejeitadas["evento não migrado"] ?? 0) + 1; continue; }
    await destino`
      insert into eventos.combos (legado_id, evento_id, nome, descricao, valor_centavos, quantidade,
                                  venda_inicio, venda_fim, limite_por_cpf, max_parcelas, ativo, criado_em)
      values (${Number(c.id)}, ${evento}, ${texto(c.nome)}, ${texto(c.descricao)}, ${centavos(c.valor)},
              ${numero(c.quantidade)}, ${data(c.vendaInicio)}, ${data(c.vendaFim)},
              ${numero(c.limitePorCpf)}, ${numero(c.maxParcelas) || 1}, ${booleano(c.ativo)},
              ${data(c.createdAt) ?? new Date().toISOString()})
      on conflict (legado_id) do update set nome = excluded.nome, valor_centavos = excluded.valor_centavos, ativo = excluded.ativo`;
    r.gravadas++;
  }

  const mapaCombo = await mapaDe("eventos.combos");

  const itens = await ler("ComboItem");
  r.lidas += itens.length;
  for (const i of itens) {
    const combo = mapaCombo.get(Number(i.comboId));
    const tipo = mapaTipo.get(Number(i.ingressoTipoId));
    if (!combo || !tipo) { r.rejeitadas["combo ou tipo não migrado"] = (r.rejeitadas["combo ou tipo não migrado"] ?? 0) + 1; continue; }
    await destino`
      insert into eventos.combo_itens (combo_id, ingresso_tipo_id, quantidade)
      values (${combo}, ${tipo}, ${numero(i.quantidade) || 1})
      on conflict (combo_id, ingresso_tipo_id) do update set quantidade = excluded.quantidade`;
    r.gravadas++;
  }

  const cupons = await ler("Cupom");
  r.lidas += cupons.length;
  for (const c of cupons) {
    const evento = mapaEvento.get(Number(c.eventoId));
    if (!evento) { r.rejeitadas["evento não migrado"] = (r.rejeitadas["evento não migrado"] ?? 0) + 1; continue; }
    // ⚠️ Percentual fica como número inteiro (0..100); valor vira centavos.
    // A origem guarda os dois na mesma coluna DECIMAL, e multiplicar um
    // percentual por 100 daria 5000% de desconto.
    // ⚠️ O padrão é `valor`, e não `percentual`: um cupom de "10" lido como
    // percentual dá 10% de desconto; lido como valor, dá dez centavos. Errar
    // para menos é corrigível; errar para mais já saiu do caixa.
    const tipo = daLista(r, "tipo de cupom", c.tipo, ["percentual", "valor"], "valor",
      { percent: "percentual", porcentagem: "percentual", pct: "percentual", fixed: "valor", fixo: "valor" });
    await destino`
      insert into eventos.cupons (legado_id, evento_id, codigo, descricao, tipo, valor,
                                  ingresso_tipo_id, combo_id, max_usos_total, max_usos_por_cpf,
                                  vigencia_inicio, vigencia_fim, ativo, criado_em)
      values (${Number(c.id)}, ${evento}, ${texto(c.codigo)}, ${texto(c.descricao)}, ${tipo},
              ${tipo === 'percentual' ? Math.round(Number(c.valor)) : centavos(c.valor)},
              ${mapaTipo.get(Number(c.ingressoTipoId)) ?? null}, ${mapaCombo.get(Number(c.comboId)) ?? null},
              ${numero(c.maxUsosTotal)}, ${numero(c.maxUsosPorCpf)},
              ${data(c.vigenciaInicio)}, ${data(c.vigenciaFim)},
              ${booleano(c.ativo)}, ${data(c.createdAt) ?? new Date().toISOString()})
      on conflict (legado_id) do update set codigo = excluded.codigo, valor = excluded.valor, ativo = excluded.ativo`;
    r.gravadas++;
  }

  const mapaOrientador = await mapaDe("eventos.orientadores");
  const vinculos = await ler("EventoOrientador");
  r.lidas += vinculos.length;
  for (const v of vinculos) {
    const evento = mapaEvento.get(Number(v.eventoId));
    const orientador = mapaOrientador.get(Number(v.orientadorId));
    if (!evento || !orientador) { r.rejeitadas["evento ou orientador não migrado"] = (r.rejeitadas["evento ou orientador não migrado"] ?? 0) + 1; continue; }
    await destino`
      insert into eventos.evento_orientadores (evento_id, orientador_id, ordem)
      values (${evento}, ${orientador}, ${numero(v.ordem) || 0})
      on conflict (evento_id, orientador_id) do update set ordem = excluded.ordem`;
    r.gravadas++;
  }
}

// ─── compras ──────────────────────────────────────────────────────────────

/**
 * Pedidos, inscrições e o que pende delas.
 *
 * É a fase que carrega dinheiro, e por isso a mais desconfiada: uma inscrição
 * sem pessoa, sem evento ou com valor errado não é gravada pela metade — é
 * rejeitada, com o id antigo no relatório, para alguém olhar.
 */
async function faseCompras() {
  const r = conta("compras");
  const pessoas = await mapaPessoas();

  const mapaEvento = await mapaDe("eventos.eventos");
  const mapaTipo = await mapaDe("eventos.ingresso_tipos");
  const mapaCombo = await mapaDe("eventos.combos");
  const mapaCupom = await mapaDe("eventos.cupons");

  const rejeita = (motivo: string, id: number) => {
    r.rejeitadas[motivo] = (r.rejeitadas[motivo] ?? 0) + 1;
    rejeicoesDetalhe.push({ fase: "compras", legado_id: id, motivo });
  };

  // ── Pedidos ──
  for (const p of await ler("PedidoPendente")) {
    r.lidas++;
    const comprador = pessoas.get(Number(p.compradorId));
    const evento = mapaEvento.get(Number(p.eventoId));
    if (!comprador) { rejeita("comprador não migrado", Number(p.id)); continue; }
    if (!evento) { rejeita("evento não migrado", Number(p.id)); continue; }

    // `participantesJson` é texto na origem e pode estar malformado numa
    // linha antiga. Um pedido é histórico: perder o snapshot é ruim, perder o
    // pedido inteiro é pior.
    let participantes: unknown = [];
    try { participantes = p.participantesJson ? JSON.parse(String(p.participantesJson)) : []; }
    catch { r.avisos++; participantes = { bruto: String(p.participantesJson) }; }

    await destino`
      insert into eventos.pedidos (
        legado_id, comprador_id, comprador_cpf, evento_id, ingresso_tipo_id, combo_id,
        quantidade, cupom_id, valor_original_centavos, desconto_centavos,
        participantes, status, cielo, inscricao_ids, criado_em, atualizado_em)
      values (${Number(p.id)}, ${comprador}, ${texto(p.compradorCpf)}, ${evento},
              ${mapaTipo.get(Number(p.ingressoTipoId)) ?? null}, ${mapaCombo.get(Number(p.comboId)) ?? null},
              ${numero(p.quantity) || 1}, ${mapaCupom.get(Number(p.cupomId)) ?? null},
              ${centavos(p.valorOriginal)}, ${centavos(p.descontoAplicado)},
              ${destino.json(participantes as never)}, ${daLista(r, "status do pedido", p.status, ["pendente", "confirmado", "cancelado", "expirado"], "pendente", { pending: "pendente", paid: "confirmado", confirmed: "confirmado", pago: "confirmado", canceled: "cancelado", cancelled: "cancelado", expired: "expirado" })},
              ${destino.json(cielo(p) as never)},
              ${texto(p.inscricaoIds)?.split(",").map(Number).filter(Number.isFinite) ?? null},
              ${data(p.createdAt) ?? new Date().toISOString()}, ${data(p.updatedAt) ?? new Date().toISOString()})
      on conflict (legado_id) do update set
        status = excluded.status, cielo = excluded.cielo,
        inscricao_ids = excluded.inscricao_ids, atualizado_em = excluded.atualizado_em`;
    r.gravadas++;
  }

  const mapaPedido = await mapaDe("eventos.pedidos");

  // ── Inscrições ──
  //
  // ⚠️ Duas passagens. As colunas de transferência e de cancelamento apontam
  // para OUTRA inscrição, que pode ainda não existir quando esta é gravada.
  // Gravar tudo de uma vez exigiria ordenar por uma dependência que forma
  // ciclo — A transferida para B, B com âncora em A. A segunda passagem
  // resolve os ponteiros quando todas já estão lá.
  const inscricoes = await ler("Inscricao");
  for (const i of inscricoes) {
    r.lidas++;
    const pessoa = pessoas.get(Number(i.participanteId));
    const evento = mapaEvento.get(Number(i.eventoId));
    if (!pessoa) { rejeita("participante não migrado", Number(i.id)); continue; }
    if (!evento) { rejeita("evento não migrado", Number(i.id)); continue; }

    const temEstorno = i.estornoStatus || i.estornoValor;
    await destino`
      insert into eventos.inscricoes (
        legado_id, pessoa_id, evento_id, ingresso_tipo_id, combo_id, pedido_id, cupom_id,
        comprador_id, compra_grupo_id, numero_convite, forma_pagamento, tipo_venda, status,
        valor_original_centavos, desconto_centavos, data_compra, checkin_em, qr_code,
        credenciamento_pedido, pix_data, pix_recibo, cortesia_motivo, cielo,
        cancelado_em, cancelado_por, cancelamento_motivo, cancelamento_ancora_id,
        estorno_status, estorno, titular_trocado_em, titular_troca_motivo,
        titular_anterior_id, observacao, migracao_extras, criado_em)
      values (
        ${Number(i.id)}, ${pessoa}, ${evento},
        ${mapaTipo.get(Number(i.ingressoTipoId)) ?? null}, ${mapaCombo.get(Number(i.comboId)) ?? null},
        ${mapaPedido.get(Number(i.pedidoId)) ?? null}, ${mapaCupom.get(Number(i.cupomId)) ?? null},
        ${pessoas.get(Number(i.compradorId)) ?? null},
        ${texto(i.compraGrupoId)}, ${texto(i.numeroConvite)}, ${texto(i.formaPagamento)},
        ${daLista(r, "tipo de venda", i.tipoVenda, ["online", "balcao", "importado", "cortesia"], "importado",
          { web: "online", site: "online", internet: "online", presencial: "balcao", counter: "balcao", manual: "balcao", free: "cortesia", gratuito: "cortesia", brinde: "cortesia" })},
        ${daLista(r, "status da inscrição", i.status, ["pendente", "pago", "cancelado", "expirado", "transferido"], "pendente",
          { paid: "pago", confirmado: "pago", pending: "pendente", canceled: "cancelado", cancelled: "cancelado", estornado: "cancelado", expired: "expirado", transferred: "transferido" })},
        ${centavos(i.valorOriginal)}, ${centavos(i.descontoAplicado)},
        ${data(i.dataPurchase)}, ${data(i.checkinAt)}, ${texto(i.qrCode)},
        ${texto(i.credenciamentoPedido)}, ${data(i.pixData)}, ${texto(i.pixRecibo)},
        ${texto(i.cortesiaMotivo)}, ${destino.json(cielo(i) as never)},
        ${data(i.canceladoEm)}, ${null}, ${texto(i.cancelamentoMotivo)}, ${numero(i.cancelamentoAncoraId)},
        ${i.estornoStatus == null || String(i.estornoStatus).trim() === ""
          ? null
          : daLista(r, "status do estorno", i.estornoStatus, ["pendente", "feito", "recusado"], "pendente",
              { refunded: "feito", refund: "feito", done: "feito", concluido: "feito", efetuado: "feito",
                pending: "pendente", solicitado: "pendente", aberto: "pendente",
                denied: "recusado", rejected: "recusado", negado: "recusado" })},
        ${temEstorno ? destino.json({
            valor_centavos: centavos(i.estornoValor),
            forma: texto(i.estornoForma),
            efetuado_em: data(i.estornoEfetuadoEm) as never,
            efetuado_por: texto(i.estornoEfetuadoPor),
            comprovante: texto(i.estornoComprovante),
            observacao: texto(i.estornoObservacao),
          } as never) : null},
        ${data(i.titularTrocadoEm)}, ${texto(i.titularTrocaMotivo)},
        ${pessoas.get(Number(i.titularAnteriorId)) ?? null},
        ${texto(i.observacao)},
        ${destino.json({
          transferido_para_legado: numero(i.transferidoParaInscricaoId),
          transferido_de_legado: numero(i.origemTransferenciaId),
          transferido_para_evento_legado: numero(i.transferidoParaEventoId),
          transferido_em: data(i.transferidoEm) as never,
          transferido_por: texto(i.transferidoPor),
          cancelado_por_nome: texto(i.canceladoPor),
          titular_trocado_por_nome: texto(i.titularTrocadoPor),
        } as never)},
        ${data(i.createdAt) ?? new Date().toISOString()})
      on conflict (legado_id) do update set
        status = excluded.status, checkin_em = excluded.checkin_em,
        estorno_status = excluded.estorno_status, estorno = excluded.estorno,
        cielo = excluded.cielo, atualizado_em = now()`;
    r.gravadas++;
  }

  {
    // Segunda passagem: os ponteiros entre inscrições, agora que todas existem.
    await destino`
      update eventos.inscricoes i set
        transferido_para_id = alvo.id,
        transferido_em = (i.migracao_extras->>'transferido_em')::timestamptz
      from eventos.inscricoes alvo
      where alvo.legado_id = (i.migracao_extras->>'transferido_para_legado')::integer
        and i.migracao_extras->>'transferido_para_legado' is not null`;
    await destino`
      update eventos.inscricoes i set transferido_de_id = anterior.id
      from eventos.inscricoes anterior
      where anterior.legado_id = (i.migracao_extras->>'transferido_de_legado')::integer
        and i.migracao_extras->>'transferido_de_legado' is not null`;
  }

  // ── Respostas dos campos personalizados ──
  const mapaInscricao = await mapaDe("eventos.inscricoes");
  const mapaCampo = await mapaDe("eventos.ingresso_campos");
  for (const a of await ler("InscricaoResposta")) {
    r.lidas++;
    const inscricao = mapaInscricao.get(Number(a.inscricaoId));
    if (!inscricao) { rejeita("inscrição não migrada", Number(a.id)); continue; }
    await destino`
      insert into eventos.inscricao_respostas (id, inscricao_id, campo_id, rotulo, valor, criado_em)
      values (${Number(a.id)}, ${inscricao}, ${mapaCampo.get(Number(a.campoId)) ?? null},
              ${texto(a.label)}, ${texto(a.valor)}, ${data(a.createdAt) ?? new Date().toISOString()})
      on conflict (id) do update set valor = excluded.valor`;
    r.gravadas++;
  }

  // ── Carrinhos abandonados ──
  for (const c of await ler("CarrinhoAbandonado")) {
    r.lidas++;
    const evento = mapaEvento.get(Number(c.eventoId));
    if (!evento) { rejeita("evento não migrado", Number(c.id)); continue; }
    await destino`
      insert into eventos.carrinhos_abandonados (
        legado_id, evento_id, ingresso_tipo_id, pessoa_id, nome, email, telefone, cpf,
        quantidade, convertido, criado_em, atualizado_em)
      values (${Number(c.id)}, ${evento}, ${mapaTipo.get(Number(c.ingressoTipoId)) ?? null},
              ${pessoas.get(Number(c.participanteId)) ?? null}, ${texto(c.nome)}, ${texto(c.email)},
              ${texto(c.telefone)}, ${texto(c.cpf)}, ${numero(c.quantity) || 1}, ${booleano(c.convertido)},
              ${data(c.createdAt) ?? new Date().toISOString()}, ${data(c.updatedAt) ?? new Date().toISOString()})
      on conflict (legado_id) do update set convertido = excluded.convertido`;
    r.gravadas++;
  }

  // ⚠️ MagicLink NÃO é migrado. São tokens de acesso com prazo — os antigos já
  // venceram, e trazer token para um sistema novo aumenta a superfície de
  // ataque sem ganhar nada. Quem precisar de acesso pede um link novo.
}

// ─── comissão, configuração, auditoria ────────────────────────────────────

async function faseComissao() {
  const r = conta("comissao");
  const pessoas = await mapaPessoas();
  const mapaEvento = await mapaDe("eventos.eventos");

  // Lida UMA vez: a segunda leitura, só para montar `setoresAntigos`, pedia ao
  // MySQL a mesma resposta — e abria a porta para as duas discordarem, numa
  // carga que se apoia em ser repetível.
  const setoresOrigem = await ler("ComissaoSetorPadrao");

  for (const s of setoresOrigem) {
    r.lidas++;
    await destino`
      insert into eventos.comissao_setores_padrao (nome, ordem)
      values (${texto(s.nome)}, ${numero(s.ordem) || 0})
      on conflict (nome) do update set ordem = excluded.ordem`;
    r.gravadas++;
  }

  const setores = new Map(
    (await destino<{ id: number; nome: string }[]>`select id, nome from eventos.comissao_setores_padrao`)
      .map((l) => [l.nome, l.id])
  );
  const setoresAntigos = new Map(
    setoresOrigem.map((s) => [Number(s.id), texto(s.nome) ?? ""])
  );

  for (const f of await ler("ComissaoFuncaoPadrao")) {
    r.lidas++;
    await destino`
      insert into eventos.comissao_funcoes_padrao (setor_id, nome, ordem)
      values (${setores.get(setoresAntigos.get(Number(f.setorId)) ?? "") ?? null},
              ${texto(f.nome)}, ${numero(f.ordem) || 0})
      on conflict do nothing`;
    r.gravadas++;
  }

  for (const m of await ler("ComissaoMembro")) {
    r.lidas++;
    const evento = mapaEvento.get(Number(m.eventoId));
    if (!evento) { r.rejeitadas["evento não migrado"] = (r.rejeitadas["evento não migrado"] ?? 0) + 1; continue; }
    const pessoa = pessoas.get(Number(m.participanteId));
    const [nome] = pessoa
      ? await destino<{ nome: string }[]>`select nome from public.pessoas where id = ${pessoa}`
      : [{ nome: "(sem cadastro)" }];
    await destino`
      insert into eventos.comissao_membros (legado_id, evento_id, pessoa_id, nome, setor, funcao, criado_em)
      values (${Number(m.id)}, ${evento}, ${pessoa ?? null}, ${nome?.nome ?? "(sem cadastro)"},
              ${texto(m.setor)}, ${texto(m.funcao)}, ${data(m.createdAt) ?? new Date().toISOString()})
      on conflict (legado_id) do update set setor = excluded.setor, funcao = excluded.funcao`;
    r.gravadas++;
  }
}

/**
 * Configuração e a conta Cielo.
 *
 * ⚠️ A `merchantKey` está EM CLARO na origem. Aqui ela é cifrada antes de
 * tocar o disco (`src/lib/cripto.ts`), e o valor em claro não aparece em log
 * nem no relatório. É a única fase que exige CREDENCIAIS_ENCRYPTION_KEY.
 */
async function faseConfiguracao() {
  const r = conta("configuracao");
  // ⚠️ `cripto-nucleo`, não `cripto`: o segundo importa `server-only`, que só
  // resolve dentro do Next. Aqui é Node puro.
  const { cifragemDisponivel, cifrar } = await import("../src/lib/cripto-nucleo");

  // ⚠️ Sem chave de cifra a fase se PULA, e não estoura. Ela grava uma linha —
  // a conta Cielo — e derrubar a carga por causa dela adiaria dezesseis mil
  // pessoas. Fica declarado no relatório, e roda sozinha depois.
  //
  // Gravar a chave em claro "por enquanto" não é opção: seria exatamente o
  // problema que a origem tem, trazido para o sistema novo.
  // ⚠️ Vale no ensaio TAMBÉM: o ensaio passou a executar SQL de verdade, e sem
  // a chave ele estouraria aqui em vez de reproduzir o que a gravação faria.
  if (!cifragemDisponivel()) {
    r.rejeitadas["fase pulada: sem CREDENCIAIS_ENCRYPTION_KEY"] = 1;
    console.log("(pulada: sem chave de cifra)");
    return;
  }

  const [prosperidade] = await destino<{ id: string }[]>`
    select id from public.organizacoes where nome = 'Associação da Prosperidade' limit 1`;

  for (const c of await ler("CieloAccount")) {
    r.lidas++;
    if (!prosperidade) { r.rejeitadas["organização promotora não encontrada"] = 1; continue; }
    await destino`
      insert into public.credenciais (servico, ambiente, organizacao_id, publico, segredo)
      values ('cielo', ${texto(c.environment) === 'sandbox' ? 'sandbox' : 'producao'},
              ${prosperidade.id},
              ${destino.json({ merchant_id: texto(c.merchantId) ?? "", nome_loja: texto(c.nome) ?? "" })},
              ${cifrar(String(c.merchantKey))})
      on conflict (servico, organizacao_id, ambiente) where organizacao_id is not null
      do update set publico = excluded.publico, segredo = excluded.segredo, atualizado_em = now()`;
    r.gravadas++;
  }

  // ⚠️ `Configuracao` é lida e CONTADA, não aplicada. As chaves do sistema
  // antigo decidiam comportamento que aqui já foi decidido de outro jeito —
  // aplicá-las sem revisão é como um sistema novo volta a se comportar como o
  // velho sem ninguém ter pedido. Entram uma a uma, pela tela, quando alguém
  // olhar o que ainda faz sentido.
  const chaves = await ler("Configuracao", "chave");
  r.lidas += chaves.length;
  r.avisos += chaves.length;
}

async function faseAuditoria() {
  const r = conta("auditoria");
  for (const a of await ler("AuditLog")) {
    r.lidas++;
    const [pessoa] = await destino<{ id: string }[]>`
      select id from public.pessoas where email = ${texto(a.userEmail)} limit 1`;
    await destino`
      insert into public.auditoria (pessoa_id, acao, entidade, entidade_id, detalhe, ip, criado_em)
      values (${pessoa?.id ?? null}, ${texto(a.acao)}, ${texto(a.entidade)}, ${texto(a.entidadeId)},
              ${destino.json({ origem: "credenciamento", detalhes: texto(a.detalhes), ator: texto(a.userEmail) })},
              ${texto(a.ip)}, ${data(a.createdAt) ?? new Date().toISOString()})`;
    r.gravadas++;
  }
}

/**
 * As sequências continuam depois do maior id importado.
 *
 * ⚠️ Sem isto, a primeira venda no sistema novo tentaria o id 1 — que já é de
 * uma inscrição de 2024 — e a carga inteira pareceria corrompida por um erro
 * de chave duplicada no primeiro cliente do balcão.
 */
async function faseSequencias() {
  const r = conta("sequencias");
  const tabelas = [
    "eventos.orientadores", "eventos.eventos", "eventos.ingresso_tipos",
    "eventos.ingresso_campos", "eventos.combos", "eventos.combo_itens",
    "eventos.cupons", "eventos.pedidos", "eventos.inscricoes",
    "eventos.inscricao_respostas", "eventos.carrinhos_abandonados",
    "eventos.comissao_setores_padrao", "eventos.comissao_funcoes_padrao",
    "eventos.comissao_membros",
  ];
  for (const t of tabelas) {
    r.lidas++;
    await destino.unsafe(
      `select setval(pg_get_serial_sequence('${t}', 'id'),
              greatest((select coalesce(max(id), 0) from ${t}), 1))`
    );
    r.gravadas++;
  }
}

const FASES: Record<string, () => Promise<void>> = {
  pessoas: fasePessoas,
  // Depois de `pessoas` porque precisa delas, e antes de `eventos` porque a
  // estrutura institucional é do sistema inteiro, não do módulo.
  vinculos: faseVinculos,
  estrutura: faseEstrutura,
  eventos: faseEventos,
  compras: faseCompras,
  comissao: faseComissao,
  configuracao: faseConfiguracao,
  auditoria: faseAuditoria,
  sequencias: faseSequencias,
};

// ─── Execução ─────────────────────────────────────────────────────────────

/** Sai do `begin` sem commit. Não é erro: é como se pede rollback. */
class Desfazer extends Error {}

/**
 * A fase que parou, se alguma parou.
 *
 * ⚠️ Guardada em vez de propagada na hora porque o RELATÓRIO ainda precisa ser
 * impresso: ele diz quantas linhas entraram antes da parada, e é a única
 * informação que permite retomar. Mas o processo termina com erro — nas duas
 * últimas execuções a carga parou no meio e o workflow ficou VERDE, o que é
 * exatamente o tipo de sinal que faz alguém achar que está tudo certo.
 */
let paradaFatal: unknown = null;

async function rodarFases() {
  let rodou = 0;
  for (const [nome, fase] of Object.entries(FASES)) {
    if (soFase && soFase !== nome) continue;
    rodou++;
    process.stdout.write(`→ ${nome}${dryRun ? " (ensaio)" : ""}… `);
    try {
      await fase();
      console.log("ok");
    } catch (e) {
      console.log(`PAROU: ${e instanceof Error ? e.message : e}`);
      // ⚠️ Interrompe as seguintes: elas dependem desta, e continuar gravaria
      // filhos órfãos que ninguém sabe de onde vieram.
      //
      // No ensaio a exceção precisa SUBIR: dentro de uma transação, um comando
      // que falha aborta a transação inteira, e todo comando seguinte responde
      // "current transaction is aborted". Seguir daria uma cascata de erros
      // falsos que esconderia o de verdade.
      paradaFatal = e;
      if (dryRun) throw e;
      if (!soFase) break;
    }
  }
  if (rodou === 0) throw new Error("Nenhuma fase rodou. Confira o argumento --fase.");
}

async function principal() {
  // ⚠️ Antes de abrir conexão: um nome de fase que não existe fazia a carga
  // pular TODAS as fases, imprimir um relatório vazio e sair com sucesso. Um
  // no-op com cara de carga concluída é o pior resultado possível — pior que
  // um erro, porque ninguém vai conferir o que acha que já foi feito.
  if (soFase && !(soFase in FASES)) {
    throw new Error(
      `Fase "${soFase}" não existe. As que existem: ${Object.keys(FASES).join(", ")} — ou "todas".`
    );
  }

  origem = await mysql.createConnection(ORIGEM!);
  pool = postgres(DESTINO!, { prepare: false, max: 3 });

  const inicio = Date.now();
  try {
    if (dryRun) {
      // A transação executa TUDO e nada fica: `DESFAZER` sai do `begin` por
      // exceção, que é como o postgres.js pede um rollback. É o único jeito de
      // o ensaio ver o que só o banco sabe — e ver TODAS as fases de uma vez,
      // em vez de uma por execução em produção.
      try {
        await pool.begin(async (tx) => {
          destino = tx as unknown as typeof destino;
          await rodarFases();
          throw new Desfazer();
        });
      } catch (e) {
        // A parada já foi registrada em `paradaFatal` e impressa pela fase; aqui
        // só se deixa a transação desfeita e segue para o relatório.
        if (!(e instanceof Desfazer) && e !== paradaFatal) throw e;
      }
      console.log("   (ensaio: tudo foi executado no banco e DESFEITO — nada ficou)");
    } else {
      destino = pool;
      await rodarFases();
    }
  } finally {
    await origem.end();
    await pool.end();
  }

  const saida = {
    executadoEm: new Date().toISOString(),
    dryRun,
    duracaoSegundos: Math.round((Date.now() - inicio) / 1000),
    fases: relatorio,
    rejeicoes: rejeicoesDetalhe,
  };
  const arquivo = `migracao-relatorio-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(arquivo, JSON.stringify(saida, null, 2));

  console.log("\nRelatório:");
  console.table(
    Object.fromEntries(
      Object.entries(relatorio).map(([k, v]) => [
        k,
        {
          lidas: v.lidas,
          gravadas: v.gravadas,
          rejeitadas: Object.values(v.rejeitadas).reduce((a, b) => a + b, 0),
          revisar: Object.values(v.pendencias).reduce((a, b) => a + b, 0),
          avisos: v.avisos,
        },
      ])
    )
  );
  for (const [fase, v] of Object.entries(relatorio)) {
    for (const [motivo, n] of Object.entries(v.rejeitadas)) {
      console.log(`  ❌ ${fase}: ${n} × ${motivo}${SAIDA[motivo] ? ` — ${SAIDA[motivo]}` : ""}`);
    }
    for (const [motivo, n] of Object.entries(v.pendencias)) console.log(`  ⚠️  ${fase}: ${n} × ${motivo} (gravado, revisar depois)`);
  }
  console.log(`Gravado em ${arquivo} (não contém dado pessoal; não versionar).`);

  // ⚠️ DEPOIS do relatório, e não em vez dele. A carga que para no meio tem de
  // deixar o workflow VERMELHO: nas execuções anteriores ela parou na primeira
  // fase e o GitHub marcou sucesso, que é o sinal que faz todo mundo seguir em
  // frente achando que dezesseis mil pessoas entraram.
  if (paradaFatal) {
    throw paradaFatal instanceof Error
      ? paradaFatal
      : new Error(String(paradaFatal));
  }
}

principal().catch((e) => {
  console.error(`\nA carga NÃO terminou: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
