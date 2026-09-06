/**
 * Extrai a estrutura institucional publicada no site da SEICHO-NO-IE DO BRASIL
 * e gera a migração de seed.
 *
 * POR QUE UM SCRIPT, E NÃO SQL ESCRITO À MÃO. São 114 Regionais e 7 Academias.
 * Digitar isso é uma tarde de trabalho e um punhado de erros de transcrição que
 * ninguém encontra depois. Com o script, a origem de cada campo fica
 * documentada, a extração se refaz quando o site muda, e a migração continua
 * sendo o artefato revisado — é ela que o CI aplica, não este script.
 *
 * ⚠️ O QUE ESTE SCRIPT NÃO FAZ. Ele não inventa dado. Onde o endereço
 * publicado não separa bairro e cidade, os campos ficam VAZIOS e o endereço
 * completo vai para `logradouro`. Cidade errada é pior que cidade em branco:
 * a branca alguém preenche, a errada vira relatório torto que ninguém confere.
 * O relatório impresso no fim diz exatamente quantas ficaram incompletas.
 *
 *   npx tsx scripts/extrair-sni.ts
 *
 * Requer rede para sni.org.br.
 */

const PAGINAS = {
  regionaisPt: "https://sni.org.br/onde-encontrar/regionais-em-portugues/",
  regionaisJa: "https://sni.org.br/onde-encontrar/regionais-em-japones/",
} as const;

/** As sete Academias têm página própria; o índice só lista os links. */
const ACADEMIAS = [
  "https://sni.org.br/academias/academia-sul-americana-de-treinamento-espiritual-da-seicho-no-ie-ibiuna-sp/",
  "https://sni.org.br/academias/academia-de-treinamento-espiritual-da-seicho-no-ie-santa-tecla-rs/",
  "https://sni.org.br/academias/academia-de-treinamento-espiritual-da-seicho-no-ie-santa-fe-ba/",
  "https://sni.org.br/academias/academia-de-treinamento-espiritual-da-seicho-no-ie-curitiba-pr/",
  "https://sni.org.br/academias/academia-de-treinamento-espiritual-da-seicho-no-ie-minas-gerais-mg/",
  "https://sni.org.br/academias/academia-de-treinamento-espiritual-da-seicho-no-ie-amazonia-am/",
  "https://sni.org.br/academias/academia-de-treinamento-espiritual-da-seicho-no-ie-goias-go/",
];

const UFS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);

/** O site às vezes escreve o estado por extenso ("Goiânia-Goiás"). */
const POR_EXTENSO: Record<string, string> = {
  "GOIÁS":"GO","SÃO PAULO":"SP","MINAS GERAIS":"MG","PARANÁ":"PR","BAHIA":"BA",
  "CEARÁ":"CE","PARÁ":"PA","AMAZONAS":"AM","MARANHÃO":"MA","PIAUÍ":"PI",
  "PERNAMBUCO":"PE","PARAÍBA":"PB","SERGIPE":"SE","ALAGOAS":"AL",
  "ESPÍRITO SANTO":"ES","RIO DE JANEIRO":"RJ","SANTA CATARINA":"SC",
  "RIO GRANDE DO SUL":"RS","RIO GRANDE DO NORTE":"RN","MATO GROSSO":"MT",
  "MATO GROSSO DO SUL":"MS","DISTRITO FEDERAL":"DF","RONDÔNIA":"RO",
  "TOCANTINS":"TO","RORAIMA":"RR","ACRE":"AC","AMAPÁ":"AP",
};

export interface Unidade {
  nome: string;
  idioma: string;
  logradouro: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  slug: string;
}

// ─── Texto ───────────────────────────────────────────────────────────────────

/** HTML → texto, preservando a quebra de linha que separa os campos. */
export function paraTexto(html: string): string {
  let t = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // Todo fim de bloco vira quebra de linha, não só `</p>`: nas páginas das
  // Academias o endereço mora dentro de <div>, e sem isto ele se cola ao texto
  // vizinho e deixa de ser reconhecível como endereço.
  t = t.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|td|tr|section)\s*>/gi, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = t
    .replace(/&nbsp;| /g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&ndash;|–|—|‑/g, "-")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return t
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n");
}

export function slugificar(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Extração ────────────────────────────────────────────────────────────────

/** As Regionais vivem em acordeões do Elementor: título fora, corpo dentro. */
export function acordeoes(html: string): { titulo: string; corpo: string }[] {
  const limpo = html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // ⚠️ Captura o CABEÇALHO inteiro, não a âncora do título: em pelo menos uma
  // Regional o site tem um <a id="..."> aninhado dentro do <a> do título, e
  // uma expressão que pare no primeiro </a> devolve string vazia — a unidade
  // some da carga sem erro nenhum.
  const titulos = [...limpo.matchAll(
    /<div[^>]*class="[^"]*elementor-tab-title[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  )];
  const corpos = [...limpo.matchAll(
    /<div id="elementor-tab-content-\d+"[^>]*>([\s\S]*?)(?=<div class="elementor-accordion-item"|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/gi
  )];
  return titulos.map((t) => {
    const corpo = corpos.find((c) => (c.index ?? 0) > (t.index ?? 0) + t[0].length);
    return {
      titulo: paraTexto(t[1]).trim(),
      corpo: corpo ? paraTexto(corpo[1]) : "",
    };
  });
}

export function acharTelefone(corpo: string): string | undefined {
  const rotulo =
    corpo.match(/(?:Telefone|Tel\.?|Fone)[^\n:]*:?\s*([^\n]+)/i) ??
    corpo.match(/WhatsApp[^\n:]*:?\s*([^\n]+)/i);
  if (!rotulo) return undefined;
  const n = rotulo[1].match(/\(?\d{2}\)?\s*\d?\s?\d{4}[-\s]?\d{4}/);
  return n ? n[0].replace(/\s+/g, " ").trim() : undefined;
}

export function acharEmail(corpo: string): string | undefined {
  const m = corpo.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
  return m ? m[0].toLowerCase() : undefined;
}

/**
 * Separa o endereço publicado.
 *
 * ⚠️ Divide só em " - " COM espaços: nome de rua tem hífen ("Rua S-2", "R. 19
 * de Dezembro"), e cortar neles despedaça o logradouro.
 */
export function acharEndereco(corpo: string): Partial<Unidade> {
  // ⚠️ O `$` fica FORA do grupo que exige `\n`: nas páginas das Academias o
  // endereço é uma linha solta, sem quebra depois, e uma expressão que só
  // termine em nova linha simplesmente não casa — a Academia entra sem
  // endereço nenhum, calada.
  const m = corpo.match(
    /(?:Endere[çc]o|End\.)\s*:?\s*([\s\S]*?)(?=\n\s*(?:Telefone|Tel\.|Fone|WhatsApp|Hor[áa]rio|Instagram|Facebook|E-?mail|Site)|$)/i
  );
  if (!m) return {};

  let bruto = m[1].split("\n").filter((l) => l.trim()).join(" - ");
  // Telefone colado no fim do endereço, na mesma linha: corta dali em diante.
  bruto = bruto.replace(/\s*[-|]\s*(?:Tel\.?|Fone|WhatsApp|Cel\.?)\b[\s\S]*$/i, "");

  const saida: Partial<Unidade> = {};
  const cep = bruto.match(/CEP\s*:?\s*(\d{2}\.?\d{3}[-\s]?\d{3})/i) ?? bruto.match(/\b(\d{5}-\d{3})\b/);
  if (cep) {
    saida.cep = cep[1].replace(/\D/g, "");
    bruto = bruto.slice(0, cep.index) + bruto.slice((cep.index ?? 0) + cep[0].length);
  }
  bruto = bruto.replace(/\bCEP\s*:?\s*/gi, "");

  const partes = bruto.split(/\s+[-|]\s+/).map((p) => p.trim().replace(/^[,\s-]+|[,\s-]+$/g, "")).filter(Boolean);
  if (partes.length === 0) return saida;

  // Onde está a UF na cauda do endereço? É ela que ancora cidade e bairro.
  let iUf = -1;
  for (let i = partes.length - 1; i >= 0; i--) {
    const p = partes[i].toUpperCase().replace(/[.\s]+$/, "");
    if (UFS.has(p) || POR_EXTENSO[p]) { iUf = i; break; }
    // "Goiânia-Goiás" ou "Campo Grande/MS" no mesmo segmento
    const junto = partes[i].match(/^(.*?)[-/]\s*([A-Za-zÀ-ÿ ]{2,})$/);
    if (junto) {
      const uf = junto[2].toUpperCase().trim();
      if (UFS.has(uf) || POR_EXTENSO[uf]) {
        partes[i] = junto[1].trim();
        partes.splice(i + 1, 0, uf);
        iUf = i + 1;
        break;
      }
    }
  }

  if (iUf >= 1) {
    const p = partes[iUf].toUpperCase().replace(/[.\s]+$/, "");
    saida.uf = UFS.has(p) ? p : POR_EXTENSO[p];
  }
  // ⚠️ Só existe cidade se sobrar alguma coisa ANTES dela. Com um trecho só,
  // ele é o logradouro — chamá-lo de cidade encheria o cadastro de cidades
  // como "Estrada da Belágua, 590".
  if (iUf >= 2) {
    saida.cidade = partes[iUf - 1];
    if (iUf >= 3) saida.bairro = partes[iUf - 2];
    saida.logradouro = partes.slice(0, Math.max(1, iUf - 2)).join(" - ");
  } else {
    // Sem UF no texto não dá para saber onde a cidade termina. O endereço
    // inteiro fica no logradouro, íntegro, e a Sede separa na tela.
    saida.logradouro = partes.join(" - ");
  }
  return saida;
}

async function baixar(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
  return r.text();
}

// ─── Geração da migração ─────────────────────────────────────────────────────

const aspas = (v: string | undefined | null) =>
  v === undefined || v === null || v === "" ? "null" : `'${v.replace(/'/g, "''")}'`;

async function principal() {
  const regionais: Unidade[] = [];

  for (const [pagina, idioma] of [
    [PAGINAS.regionaisPt, "pt-BR"],
    [PAGINAS.regionaisJa, "ja"],
  ] as const) {
    const html = await baixar(pagina);
    for (const { titulo, corpo } of acordeoes(html)) {
      const nome = titulo.replace(/^Regional\s+/i, "").trim();
      if (!nome) continue;
      const u: Unidade = {
        nome,
        idioma,
        slug: slugificar(nome),
        logradouro: "",
        telefone: acharTelefone(corpo),
        email: acharEmail(corpo),
        ...acharEndereco(corpo),
      };
      // A UF do PREFIXO do nome manda: "MS-DOURADOS" é MS, e o nome é o
      // cadastro oficial — o endereço publicado às vezes a omite.
      const prefixo = nome.match(/^([A-Z]{2})-/);
      if (prefixo && UFS.has(prefixo[1])) u.uf = prefixo[1];
      regionais.push(u);
    }
  }

  const academias: Unidade[] = [];
  for (const url of ACADEMIAS) {
    const texto = paraTexto(await baixar(url));
    const titulo = (texto.match(/Academia[^\n]*Treinamento Espiritual[^\n]*/i) ?? [""])[0].trim();

    // ⚠️ Cada página das sete usa um rótulo diferente ("End.:", "Localização:",
    // ou nenhum), e TODAS repetem o endereço da Sede Central no rodapé. Por
    // isso aqui não se procura rótulo: corta-se o rodapé e busca-se a linha que
    // parece endereço, descartando a da Sede — senão as sete Academias nascem
    // todas com o endereço do Jabaquara.
    // ⚠️ Não cortar por "Trabalhe Conosco": esse texto também está no MENU do
    // topo, e cortar ali descarta a página inteira. O que distingue o endereço
    // da Academia do da Sede é o próprio endereço, filtrado abaixo.
    const corpo = texto;
    const linhaEndereco =
      corpo
        .split("\n")
        .map((l) => l.replace(/^(?:End\.?|Endere[çc]o|Localiza[çc][ãa]o)\s*:?\s*/i, "").trim())
        .find(
          (l) =>
            /^(?:Rua|R\.|Av\.?|Avenida|Estrada|Rodovia|Travessa|Pra[çc]a|Mata)\s/i.test(l) &&
            !/Armando de Arruda Pereira/i.test(l) &&
            l.length < 220
        ) ?? "";

    const nome = titulo || url;
    academias.push({
      nome,
      idioma: "pt-BR",
      slug: slugificar(nome),
      logradouro: "",
      telefone: acharTelefone(corpo.replace(/\(11\)\s*5014-2217/g, "")) ?? undefined,
      email: acharEmail(corpo),
      ...acharEndereco(`Endereço: ${linhaEndereco}`),
    });
  }

  const incompletas = regionais.filter((r) => !r.cidade);
  const semTelefone = regionais.filter((r) => !r.telefone);

  console.error(`Regionais: ${regionais.length} (${regionais.filter((r) => r.idioma === "ja").length} em japonês)`);
  console.error(`  sem cidade separada: ${incompletas.length}  ·  sem telefone: ${semTelefone.length}`);
  console.error(`Academias: ${academias.length}`);

  console.log(gerarSql(regionais, academias, incompletas.length, semTelefone.length));
}

function linhaUnidade(u: Unidade): string {
  return `  (${aspas(u.nome)}, ${aspas(u.slug)}, ${aspas(u.idioma)}, ${aspas(u.logradouro)}, ` +
    `${aspas(u.bairro)}, ${aspas(u.cidade)}, ${aspas(u.uf)}, ${aspas(u.cep)}, ` +
    `${aspas(u.telefone)}, ${aspas(u.email)})`;
}

function gerarSql(regionais: Unidade[], academias: Unidade[], semCidade: number, semTelefone: number): string {
  return `-- ═══════════════════════════════════════════════════════════════════════════
-- Seed da estrutura publicada: Sede Central, ${regionais.length} Regionais e ${academias.length} Academias
--
-- Por quê: sem a árvore cadastrada não há onde vincular pessoa, conceder papel
-- nem realizar evento. São mais de cem Regionais — digitar à mão é uma tarde
-- de trabalho e um punhado de erros de transcrição que ninguém acha depois.
--
-- ORIGEM. Extraído do site institucional por \`scripts/extrair-sni.ts\`. Refazer
-- com \`npx tsx scripts/extrair-sni.ts > <esta migração>\` quando o site mudar.
--
-- ⚠️ O QUE NÃO VEIO, E POR QUÊ.
--   · O CÓDIGO de três dígitos de cada Regional não é publicado no site. Fica
--     nulo, para a Sede preencher em tela.
--   · O CNPJ de cada Regional também não é publicado. Só o da Sede Central,
--     que está no rodapé do site.
--   · ${String(semCidade).padStart(2)} Regionais não têm cidade separada e ${String(semTelefone).padStart(2)} não têm telefone: o endereço
--     publicado não os distingue. Nesses casos o endereço INTEIRO ficou em
--     \`logradouro\`, íntegro — nada foi inventado. Cidade errada é pior que
--     cidade em branco: a branca alguém preenche, a errada vira relatório
--     torto que ninguém confere.
--
-- Idempotente pelo slug: rodar de novo não duplica nem sobrescreve o que a
-- Sede já corrigiu à mão.
-- ═══════════════════════════════════════════════════════════════════════════

-- A raiz. Endereço e CNPJ do rodapé do site institucional.
insert into unidades (tipo, nome, slug, logradouro, numero, bairro, cidade, uf, cep, telefone, cnpj)
values (
  'sede_central', 'Sede Central', 'sede-central',
  'Avenida Engenheiro Armando de Arruda Pereira', '1266', 'Jabaquara',
  'São Paulo', 'SP', '04308900', '(11) 5014-2222', '61.278.388/0001-81'
)
on conflict (slug) do nothing;

-- As Regionais, filhas da Sede Central. O idioma vem da página em que cada uma
-- é publicada: o site as separa entre atividades em português e em japonês, e
-- é esse campo que decide em que língua a pessoa recebe convite e certificado.
insert into unidades (tipo, pai_id, nome, slug, idioma, logradouro, bairro, cidade, uf, cep, telefone, email)
select 'regional', (select id from unidades where slug = 'sede-central'),
       v.nome, v.slug, v.idioma, v.logradouro, v.bairro, v.cidade, v.uf, v.cep, v.telefone, v.email
  from (values
${regionais.map(linhaUnidade).join(",\n")}
  ) as v(nome, slug, idioma, logradouro, bairro, cidade, uf, cep, telefone, email)
on conflict (slug) do nothing;

-- As Academias de Treinamento Espiritual são LOCAIS, não unidades: recebem
-- evento, não têm gente vinculada nem papel concedido.
insert into locais (tipo, nome, slug, logradouro, bairro, cidade, uf, cep, telefone, email)
select 'academia', v.nome, v.slug, v.logradouro, v.bairro, v.cidade, v.uf, v.cep, v.telefone, v.email
  from (values
${academias.map((a) => `  (${aspas(a.nome)}, ${aspas(a.slug)}, ${aspas(a.logradouro)}, ${aspas(a.bairro)}, ${aspas(a.cidade)}, ${aspas(a.uf)}, ${aspas(a.cep)}, ${aspas(a.telefone)}, ${aspas(a.email)})`).join(",\n")}
  ) as v(nome, slug, logradouro, bairro, cidade, uf, cep, telefone, email)
on conflict (slug) do nothing;
`;
}

if (process.argv[1]?.endsWith("extrair-sni.ts")) {
  principal().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { aspas };
