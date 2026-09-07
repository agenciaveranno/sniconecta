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
  bool as booleano, centavos, chaveNucleo, cielo, data, numero, texto,
  transformarParticipante, type ParticipanteMysql,
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
const soFase = args.get("fase");

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
let destino: ReturnType<typeof postgres>;
const relatorio: Relatorio = {};
const rejeicoesDetalhe: { fase: string; legado_id: number; motivo: string }[] = [];

function conta(fase: string) {
  relatorio[fase] ??= { lidas: 0, gravadas: 0, rejeitadas: {}, pendencias: {}, avisos: 0 };
  return relatorio[fase];
}

// ─── Fases ────────────────────────────────────────────────────────────────

async function fasePessoas() {
  const r = conta("pessoas");
  const [linhas] = await origem.query<mysql.RowDataPacket[]>("SELECT * FROM Participant ORDER BY id");
  r.lidas = linhas.length;

  const lote: ReturnType<typeof transformarParticipante>[] = linhas.map((l) => transformarParticipante(l as ParticipanteMysql));
  for (const item of lote) {
    if (!item.ok) {
      r.rejeitadas[item.motivo] = (r.rejeitadas[item.motivo] ?? 0) + 1;
      rejeicoesDetalhe.push({ fase: "pessoas", legado_id: item.legado_id, motivo: item.motivo });
      continue;
    }
    r.avisos += item.avisos.length;
    if (dryRun) { r.gravadas++; continue; }

    const p = item.pessoa;
    // ⚠️ Colunas de `pessoas` além das básicas (regional, organização,
    // associação local, primeira vez, endereço detalhado) dependem do schema
    // comum final. Enquanto ele não fecha, ficam em `migracao_extras` (jsonb)
    // para nada se perder e a fase seguinte resolver.
    await destino`
      insert into public.pessoas (legado_id, cpf, cod_sni, nome, email, telefone, nascimento, endereco, migracao_extras, criado_em)
      values (${p.legado_id}, ${p.cpf}, ${p.cod_sni}, ${p.nome}, ${p.email}, ${p.telefone}, ${p.nascimento},
              ${[p.endereco, p.bairro, p.cidade, p.estado].filter(Boolean).join(", ") || null},
              ${destino.json({ regional: p.regional_nome, organizacao: p.organizacao_nome, associacao_local: p.associacao_local, primeira_vez: p.primeira_vez })},
              ${p.criado_em ?? new Date().toISOString()})
      on conflict (legado_id) do update set
        cpf = excluded.cpf, cod_sni = excluded.cod_sni, nome = excluded.nome, email = excluded.email,
        telefone = excluded.telefone, nascimento = excluded.nascimento, endereco = excluded.endereco,
        migracao_extras = excluded.migracao_extras
    `;
    r.gravadas++;
  }
}

// ─── Apoio ────────────────────────────────────────────────────────────────

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
async function mapaDe(tabelaDestino: string, tabelaOrigem: string): Promise<Map<number, number>> {
  if (dryRun) {
    const linhas = await ler(tabelaOrigem);
    return new Map(linhas.map((l) => [Number(l.id), Number(l.id)]));
  }
  const linhas = await destino<{ id: number; legado_id: number }[]>`
    select id, legado_id from ${destino(tabelaDestino)} where legado_id is not null`;
  return new Map(linhas.map((l) => [l.legado_id, l.id]));
}

/** O mesmo, para `pessoas`, cujo id de destino é uuid. */
async function mapaPessoas(): Promise<Map<number, string>> {
  if (dryRun) {
    // No ensaio só entram as que PASSARIAM na validação — assim uma inscrição
    // de alguém com CPF inválido continua aparecendo como rejeitada, que é o
    // efeito real que a carga teria.
    const linhas = await ler("Participant");
    const mapa = new Map<number, string>();
    for (const l of linhas) {
      const r = transformarParticipante(l as unknown as ParticipanteMysql);
      if (r.ok) mapa.set(r.pessoa.legado_id, "simulado");
    }
    return mapa;
  }
  const linhas = await destino<{ id: string; legado_id: number }[]>`
    select id, legado_id from public.pessoas where legado_id is not null`;
  return new Map(linhas.map((l) => [l.legado_id, l.id]));
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
    if (dryRun) return (indefinidaId = "simulada:indefinida");
    const [nova] = await destino<{ id: string }[]>`
      insert into public.organizacoes (nome, ordem) values ('Indefinida', 900)
      on conflict (nome) do update set nome = excluded.nome
      returning id`;
    organizacoes.set(chaveNucleo("Indefinida"), nova.id);
    return (indefinidaId = nova.id);
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
    const chaveRegional = chaveNucleo(p.regional);
    let regionalId = chaveRegional ? regionais.get(chaveRegional) : sede.id;
    if (!chaveRegional) {
      pendente("sem Regional na origem — ficou na Sede Central");
      regionalId = sede.id;
    } else if (!regionalId) {
      const nome = texto(p.regional)!;
      if (!dryRun) {
        const [nova] = await destino<{ id: string }[]>`
          insert into public.unidades (tipo, pai_id, nome, migracao_extras)
          values ('regional', ${sede.id}, ${nome},
                  ${destino.json({ origem: "Credenciamento", nome_bruto: nome, conferir: true })})
          returning id`;
        regionalId = nova.id;
      } else {
        regionalId = `simulada:${chaveRegional}`;
      }
      regionais.set(chaveRegional, regionalId);
      criadas.regionais++;
      if (amostra.regionais.length < 40) amostra.regionais.push(nome);
    }

    // ── Organização ──
    const chaveOrg = chaveNucleo(p.organizacao);
    let organizacaoId = chaveOrg ? organizacoes.get(chaveOrg) : undefined;
    if (chaveOrg && !organizacaoId) {
      const nome = texto(p.organizacao)!;
      if (!dryRun) {
        const [nova] = await destino<{ id: string }[]>`
          insert into public.organizacoes (nome) values (${nome})
          on conflict (nome) do update set nome = excluded.nome
          returning id`;
        organizacaoId = nova.id;
      } else {
        organizacaoId = `simulada:${chaveOrg}`;
      }
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

    // ⚠️ Associação Local só existe dentro de Regional ou Núcleo — é regra do
    // catálogo `tipos_unidade`, e o banco recusa o contrário. Quem não tem
    // Regional na origem foi para a Sede Central, e pendurar a AL ali estouraria
    // a carga no meio. Fica na Sede Central com o nome da AL registrado na
    // pendência: chutar uma Regional para ela poria a pessoa no estado errado.
    if (chaveAl && !chaveRegional) {
      pendente("sem Regional — Associação Local não pôde ser criada");
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
        if (!dryRun) {
          const [nova] = await destino<{ id: string }[]>`
            insert into public.unidades (tipo, pai_id, organizacao_id, nome, migracao_extras)
            values ('associacao_local', ${regionalId}, ${organizacaoId}, ${nome},
                    ${destino.json({ origem: "Credenciamento", nome_bruto: nome, conferir: true })})
            returning id`;
          alId = nova.id;
        } else {
          alId = `simulada:${chave}`;
        }
        associacoes.set(chave, alId);
        criadas.associacoes++;
      }
      unidadeDestino = alId;
    } else {
      pendente("sem Associação Local na origem — ficou na Regional");
    }

    if (!dryRun) {
      await destino`
        insert into public.pessoa_unidade_vinculos (pessoa_id, unidade_id, motivo)
        values (${pessoa}, ${unidadeDestino}, 'carga do Credenciamento')
        on conflict do nothing`;
    }
    r.gravadas++;
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
    if (dryRun) { r.gravadas++; continue; }
    // Local do módulo vira local COMUM: a Academia já está lá pelo seed, e
    // duas listas de lugares seriam duas respostas para "onde é o evento?".
    await destino`
      insert into public.locais (tipo, nome, logradouro, bairro, cidade, uf, telefone, email, observacoes)
      values ('outro', ${texto(l.nome)}, ${texto(l.endereco)}, ${texto(l.bairro)},
              ${texto(l.cidade)}, ${texto(l.estado)}, ${texto(l.telefone)}, ${texto(l.email)},
              ${`Importado do Credenciamento (id ${l.id}).` + (texto(l.contaCielo) ? " Tinha conta Cielo em texto livre." : "")})
      on conflict do nothing`;
    r.gravadas++;
  }

  const orientadores = await ler("Orientador");
  r.lidas += orientadores.length;
  for (const o of orientadores) {
    if (dryRun) { r.gravadas++; continue; }
    await destino`
      insert into eventos.orientadores (legado_id, nome, foto_url, bio)
      values (${Number(o.id)}, ${texto(o.nome)}, ${texto(o.fotoUrl)}, ${texto(o.bio)})
      on conflict (legado_id) do update set
        nome = excluded.nome, foto_url = excluded.foto_url, bio = excluded.bio`;
    r.gravadas++;
  }
}

// ─── eventos ──────────────────────────────────────────────────────────────

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
    if (dryRun) { r.gravadas++; continue; }
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

  const mapaEvento = await mapaDe("eventos.eventos", "Evento");

  const tipos = await ler("IngressoTipo");
  r.lidas += tipos.length;
  for (const t of tipos) {
    const evento = mapaEvento.get(Number(t.eventoId));
    if (!evento) { r.rejeitadas["evento não migrado"] = (r.rejeitadas["evento não migrado"] ?? 0) + 1; continue; }
    if (dryRun) { r.gravadas++; continue; }
    await destino`
      insert into eventos.ingresso_tipos (
        legado_id, evento_id, nome, descricao, valor_centavos, max_parcelas, quantidade,
        venda_inicio, venda_fim, idade_min, idade_max, unico_por_cpf, papel,
        exige_principal, exibir_venda_publica, ativo, criado_em)
      values (${Number(t.id)}, ${evento}, ${texto(t.nome)}, ${texto(t.descricao)},
              ${centavos(t.valor)}, ${numero(t.maxParcelas) || 1}, ${numero(t.quantidade)},
              ${data(t.vendaInicio)}, ${data(t.vendaFim)},
              ${numero(t.idadeMin)}, ${numero(t.idadeMax)},
              ${booleano(t.unicoPorCpf)}, ${texto(t.papel) ?? 'adicional'},
              ${booleano(t.exigePrincipal)}, ${booleano(t.exibirVendaPublica)},
              ${booleano(t.ativo)}, ${data(t.createdAt) ?? new Date().toISOString()})
      on conflict (legado_id) do update set
        nome = excluded.nome, valor_centavos = excluded.valor_centavos,
        quantidade = excluded.quantidade, ativo = excluded.ativo`;
    r.gravadas++;
  }

  const mapaTipo = await mapaDe("eventos.ingresso_tipos", "IngressoTipo");

  const campos = await ler("IngressoCampo");
  r.lidas += campos.length;
  for (const c of campos) {
    const tipo = mapaTipo.get(Number(c.ingressoTipoId));
    if (!tipo) { r.rejeitadas["tipo de ingresso não migrado"] = (r.rejeitadas["tipo de ingresso não migrado"] ?? 0) + 1; continue; }
    if (dryRun) { r.gravadas++; continue; }
    await destino`
      insert into eventos.ingresso_campos (legado_id, ingresso_tipo_id, rotulo, tipo, opcoes, obrigatorio, ordem, ativo)
      values (${Number(c.id)}, ${tipo}, ${texto(c.label)}, ${texto(c.tipo) ?? 'texto'},
              ${c.opcoesJson ? destino.json(JSON.parse(String(c.opcoesJson))) : null},
              ${booleano(c.obrigatorio)}, ${numero(c.ordem) || 0}, ${booleano(c.ativo)})
      on conflict (legado_id) do update set rotulo = excluded.rotulo, ativo = excluded.ativo`;
    r.gravadas++;
  }

  const combos = await ler("Combo");
  r.lidas += combos.length;
  for (const c of combos) {
    const evento = mapaEvento.get(Number(c.eventoId));
    if (!evento) { r.rejeitadas["evento não migrado"] = (r.rejeitadas["evento não migrado"] ?? 0) + 1; continue; }
    if (dryRun) { r.gravadas++; continue; }
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

  const mapaCombo = await mapaDe("eventos.combos", "Combo");

  const itens = await ler("ComboItem");
  r.lidas += itens.length;
  for (const i of itens) {
    const combo = mapaCombo.get(Number(i.comboId));
    const tipo = mapaTipo.get(Number(i.ingressoTipoId));
    if (!combo || !tipo) { r.rejeitadas["combo ou tipo não migrado"] = (r.rejeitadas["combo ou tipo não migrado"] ?? 0) + 1; continue; }
    if (dryRun) { r.gravadas++; continue; }
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
    if (dryRun) { r.gravadas++; continue; }
    // ⚠️ Percentual fica como número inteiro (0..100); valor vira centavos.
    // A origem guarda os dois na mesma coluna DECIMAL, e multiplicar um
    // percentual por 100 daria 5000% de desconto.
    const tipo = texto(c.tipo) ?? 'valor';
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

  const mapaOrientador = await mapaDe("eventos.orientadores", "Orientador");
  const vinculos = await ler("EventoOrientador");
  r.lidas += vinculos.length;
  for (const v of vinculos) {
    const evento = mapaEvento.get(Number(v.eventoId));
    const orientador = mapaOrientador.get(Number(v.orientadorId));
    if (!evento || !orientador) { r.rejeitadas["evento ou orientador não migrado"] = (r.rejeitadas["evento ou orientador não migrado"] ?? 0) + 1; continue; }
    if (dryRun) { r.gravadas++; continue; }
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

  const mapaEvento = await mapaDe("eventos.eventos", "Evento");
  const mapaTipo = await mapaDe("eventos.ingresso_tipos", "IngressoTipo");
  const mapaCombo = await mapaDe("eventos.combos", "Combo");
  const mapaCupom = await mapaDe("eventos.cupons", "Cupom");

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
    if (dryRun) { r.gravadas++; continue; }

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
              ${destino.json(participantes as never)}, ${texto(p.status) ?? 'pendente'},
              ${destino.json(cielo(p) as never)},
              ${texto(p.inscricaoIds)?.split(",").map(Number).filter(Number.isFinite) ?? null},
              ${data(p.createdAt) ?? new Date().toISOString()}, ${data(p.updatedAt) ?? new Date().toISOString()})
      on conflict (legado_id) do update set
        status = excluded.status, cielo = excluded.cielo,
        inscricao_ids = excluded.inscricao_ids, atualizado_em = excluded.atualizado_em`;
    r.gravadas++;
  }

  const mapaPedido = await mapaDe("eventos.pedidos", "PedidoPendente");

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
    if (dryRun) { r.gravadas++; continue; }

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
        ${texto(i.tipoVenda) ?? 'importado'}, ${texto(i.status) ?? 'pago'},
        ${centavos(i.valorOriginal)}, ${centavos(i.descontoAplicado)},
        ${data(i.dataPurchase)}, ${data(i.checkinAt)}, ${texto(i.qrCode)},
        ${texto(i.credenciamentoPedido)}, ${data(i.pixData)}, ${texto(i.pixRecibo)},
        ${texto(i.cortesiaMotivo)}, ${destino.json(cielo(i) as never)},
        ${data(i.canceladoEm)}, ${null}, ${texto(i.cancelamentoMotivo)}, ${numero(i.cancelamentoAncoraId)},
        ${texto(i.estornoStatus)},
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

  if (!dryRun) {
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
  const mapaInscricao = await mapaDe("eventos.inscricoes", "Inscricao");
  const mapaCampo = await mapaDe("eventos.ingresso_campos", "IngressoCampo");
  for (const a of await ler("InscricaoResposta")) {
    r.lidas++;
    const inscricao = mapaInscricao.get(Number(a.inscricaoId));
    if (!inscricao) { rejeita("inscrição não migrada", Number(a.id)); continue; }
    if (dryRun) { r.gravadas++; continue; }
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
    if (dryRun) { r.gravadas++; continue; }
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
  const mapaEvento = await mapaDe("eventos.eventos", "Evento");

  for (const s of await ler("ComissaoSetorPadrao")) {
    r.lidas++;
    if (dryRun) { r.gravadas++; continue; }
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
    (await ler("ComissaoSetorPadrao")).map((s) => [Number(s.id), texto(s.nome) ?? ""])
  );

  for (const f of await ler("ComissaoFuncaoPadrao")) {
    r.lidas++;
    if (dryRun) { r.gravadas++; continue; }
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
    if (dryRun) { r.gravadas++; continue; }
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
  if (!dryRun && !cifragemDisponivel()) {
    r.rejeitadas["fase pulada: sem CREDENCIAIS_ENCRYPTION_KEY"] = 1;
    console.log("(pulada: sem chave de cifra)");
    return;
  }

  const [prosperidade] = await destino<{ id: string }[]>`
    select id from public.organizacoes where nome = 'Associação da Prosperidade' limit 1`;

  for (const c of await ler("CieloAccount")) {
    r.lidas++;
    if (dryRun) { r.gravadas++; continue; }
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
    if (dryRun) { r.gravadas++; continue; }
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
    if (dryRun) { r.gravadas++; continue; }
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

async function principal() {
  origem = await mysql.createConnection(ORIGEM!);
  destino = postgres(DESTINO!, { prepare: false, max: 3 });

  const inicio = Date.now();
  try {
    for (const [nome, fase] of Object.entries(FASES)) {
      if (soFase && soFase !== nome) continue;
      process.stdout.write(`→ ${nome}${dryRun ? " (dry-run)" : ""}… `);
      try {
        await fase();
        console.log("ok");
      } catch (e) {
        console.log(`PAROU: ${e instanceof Error ? e.message : e}`);
        // ⚠️ Interrompe as seguintes: elas dependem desta, e continuar
        // gravaria filhos órfãos que ninguém sabe de onde vieram.
        if (!soFase) break;
      }
    }
  } finally {
    await origem.end();
    await destino.end();
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
    for (const [motivo, n] of Object.entries(v.rejeitadas)) console.log(`  ❌ ${fase}: ${n} × ${motivo}`);
    for (const [motivo, n] of Object.entries(v.pendencias)) console.log(`  ⚠️  ${fase}: ${n} × ${motivo} (gravado, revisar depois)`);
  }
  console.log(`Gravado em ${arquivo} (não contém dado pessoal; não versionar).`);
}

principal().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
