/**
 * Importa o catálogo de livraria.sni.org.br para `produtos`.
 *
 *   DATABASE_URL=postgresql://… npm run importar-livraria [-- --dry-run]
 *
 * ⚠️ ESCRITO SEM ACESSO À LOJA. O ambiente de desenvolvimento tem saída para a
 * internet bloqueada por política (403 no CONNECT), então nada aqui foi
 * verificado contra o site de verdade — só roda no GitHub Actions.
 *
 * Por isso o script DESCOBRE a plataforma em vez de supor: tenta VTEX, depois
 * WooCommerce, e diz qual respondeu. A primeira execução tem de ser
 * `--dry-run`: os nomes e preços impressos são a única conferência possível
 * antes de gravar.
 *
 * ⚠️ IMAGENS NÃO ENTRAM, por decisão da Sede. `imagens` fica vazio.
 */
import "dotenv/config";
import postgres from "postgres";

const LOJA = (process.env.LOJA_URL ?? "https://livraria.sni.org.br").replace(/\/+$/, "");
const dryRun = process.argv.includes("--dry-run");
const DESTINO = process.env.DATABASE_URL;
if (!DESTINO) {
  console.error("Falta DATABASE_URL. Nada foi lido nem gravado.");
  process.exit(1);
}

type Produto = {
  nome: string;
  url: string;
  preco_centavos: number;
  descricao_curta: string | null;
  descricao_longa: string | null;
  codigo: string | null;
  codigo_barras: string | null;
  categorias: string[];
  disponivel: boolean;
};

/** ⚠️ `Math.round`: 19.90 * 100 dá 1989.9999999999998 em ponto flutuante. */
function centavos(valor: unknown): number {
  const n = typeof valor === "number" ? valor : Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function limpar(html: unknown): string | null {
  const t = String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#8217;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return t ? t : null;
}

/** Corta a espera: loja fora do ar não pode travar o job por meia hora. */
async function buscar(url: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { accept: "application/json", "user-agent": "SNI-Conecta/1.0 (importacao de catalogo)" },
    });
    if (!r.ok && r.status !== 206) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// ─── VTEX ────────────────────────────────────────────────────────────────────

/**
 * A API de catálogo da VTEX é pública e paginada por `_from`/`_to`, com teto de
 * 50 por página.
 *
 * ⚠️ E com TETO DE 2.500 no total quando não se filtra por categoria — a
 * plataforma simplesmente para de devolver. Por isso a varredura é POR
 * CATEGORIA, com uma passada solta no fim para o que não estiver em nenhuma:
 * uma loja com 3.000 títulos perderia 500 calada.
 */
async function vtexArvore(): Promise<{ id: number; nome: string }[]> {
  const raiz = (await buscar(`${LOJA}/api/catalog_system/pub/category/tree/5`)) as
    | { id: number; name: string; children?: unknown[] }[]
    | null;
  if (!Array.isArray(raiz)) return [];

  const achatada: { id: number; nome: string }[] = [];
  const descer = (nos: unknown[]) => {
    for (const n of nos as { id: number; name: string; children?: unknown[] }[]) {
      achatada.push({ id: n.id, nome: n.name });
      if (Array.isArray(n.children) && n.children.length) descer(n.children);
    }
  };
  descer(raiz);
  return achatada;
}

async function vtexPagina(filtro: string, de: number): Promise<Record<string, unknown>[] | null> {
  const url = `${LOJA}/api/catalog_system/pub/products/search${filtro}${filtro.includes("?") ? "&" : "?"}_from=${de}&_to=${de + 49}`;
  const json = await buscar(url);
  return Array.isArray(json) ? (json as Record<string, unknown>[]) : null;
}

function vtexExtrair(p: Record<string, unknown>): Produto {
  const itens = (p.items ?? []) as Record<string, unknown>[];
  const primeiro = itens[0] ?? {};
  const vendedores = (primeiro.sellers ?? []) as Record<string, unknown>[];
  const oferta = (vendedores[0]?.commertialOffer ?? {}) as Record<string, unknown>;

  // Preço de CAPA é o "de", quando existe; senão o praticado.
  const preco = centavos(oferta.ListPrice) || centavos(oferta.Price);

  // ⚠️ A disponibilidade vem da LOJA, não de um palpite: a VTEX diz quantos há
  // em estoque e se está vendendo. Deduzir "tem preço, logo tem estoque" faria
  // o catálogo prometer o que a livraria não entrega.
  //
  // E preço zero derruba a disponibilidade de qualquer jeito — o banco não
  // aceita produto sem preço à venda, e a alternativa seria oferecê-lo por
  // zero real.
  const emEstoque = Number(oferta.AvailableQuantity ?? 0) > 0 && oferta.IsAvailable !== false;

  // "/Livros/Educação/" → ["Livros", "Educação"]. A VTEX manda o caminho
  // inteiro em cada entrada; a mais funda é a que tem mais barras.
  const caminhos = ((p.categories ?? []) as string[])
    .map((c) => c.split("/").filter(Boolean))
    .sort((a, b) => b.length - a.length);

  return {
    nome: String(p.productName ?? "").trim(),
    url: String(p.link ?? `${LOJA}/${p.linkText ?? ""}/p`),
    preco_centavos: preco,
    descricao_curta: limpar(p.metaTagDescription),
    descricao_longa: limpar(p.description),
    codigo: p.productReference ? (String(p.productReference).trim() || null) : null,
    codigo_barras: (primeiro.ean && /^[0-9]{8,14}$/.test(String(primeiro.ean)))
      ? String(primeiro.ean)
      : null,
    categorias: caminhos[0] ?? [],
    disponivel: emEstoque && preco > 0,
  };
}

async function lerVtex(): Promise<Produto[] | null> {
  const teste = await vtexPagina("", 0);
  if (teste === null) return null;
  console.log("   plataforma reconhecida: VTEX");

  // ⚠️ Chave é o `productId`, não o nome: a mesma obra aparece em várias
  // categorias, e sem a chave ela entraria uma vez por categoria.
  const porId = new Map<string, Produto>();
  const guardar = (linhas: Record<string, unknown>[]) => {
    for (const l of linhas) porId.set(String(l.productId ?? l.linkText), vtexExtrair(l));
  };
  guardar(teste);

  const categorias = await vtexArvore();
  console.log(`   ${categorias.length} categorias no catálogo`);

  for (const c of categorias) {
    for (let de = 0; de < 2500; de += 50) {
      const lote = await vtexPagina(`?fq=C:${c.id}`, de);
      if (!lote || lote.length === 0) break;
      guardar(lote);
      if (lote.length < 50) break;
    }
  }

  // A passada solta, para o que não está em categoria nenhuma.
  for (let de = 50; de < 2500; de += 50) {
    const lote = await vtexPagina("", de);
    if (!lote || lote.length === 0) break;
    guardar(lote);
    if (lote.length < 50) break;
  }

  return [...porId.values()];
}

// ─── WooCommerce ─────────────────────────────────────────────────────────────

function wooExtrair(p: Record<string, unknown>): Produto {
  const precos = (p.prices ?? {}) as Record<string, unknown>;
  const menor = Number(precos.currency_minor_unit ?? 2);
  const bruto = Number(precos.regular_price ?? precos.price ?? 0);
  const preco = menor === 2 ? bruto : Math.round(bruto / 10 ** (menor - 2));

  return {
    nome: String(p.name ?? "").trim(),
    url: String(p.permalink ?? ""),
    preco_centavos: Number.isFinite(preco) && preco > 0 ? preco : 0,
    descricao_curta: limpar(p.short_description),
    descricao_longa: limpar(p.description),
    codigo: p.sku ? (String(p.sku).trim() || null) : null,
    codigo_barras: null,
    categorias: ((p.categories ?? []) as { name?: string }[])
      .map((c) => String(c.name ?? "").trim())
      .filter(Boolean),
    disponivel: p.is_in_stock !== false && preco > 0,
  };
}

async function lerWoo(): Promise<Produto[] | null> {
  const teste = await buscar(`${LOJA}/wp-json/wc/store/v1/products?per_page=1`);
  if (!Array.isArray(teste)) return null;
  console.log("   plataforma reconhecida: WooCommerce");

  const todos: Produto[] = [];
  for (let pagina = 1; pagina <= 100; pagina++) {
    const lote = await buscar(`${LOJA}/wp-json/wc/store/v1/products?per_page=100&page=${pagina}`);
    if (!Array.isArray(lote) || lote.length === 0) break;
    todos.push(...(lote as Record<string, unknown>[]).map(wooExtrair));
    if (lote.length < 100) break;
  }
  return todos;
}

// ─── Classificação ───────────────────────────────────────────────────────────

/**
 * Onde o produto entra no catálogo da instituição.
 *
 * ⚠️ Tudo aqui decide pela CATEGORIA DA LOJA, nunca pelo título. O primeiro
 * ensaio mostrou que as regras que a Sede pediu já existem lá dentro —
 * "Contos infantis", "Assinatura" — e casar por nome acertaria "A Abelha
 * Abelinda" e erraria no dia em que entrasse um infantil chamado "Preceitos".
 * Título é texto de marketing; categoria é classificação.
 */

/** Prateleira de vitrine, não tipo de produto. Ver `classificar`. */
const VITRINE = /^(lan[çc]amentos?|promo[çc][õo]es?|ofertas?|destaques?|mais vendidos?|novidades?)$/i;

/** Sem acento, sem caixa, sem espaço dobrado — para comparar nome com nome. */
function chave(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O que a Sede decidiu, um a um, sobre produtos que a loja NÃO classifica.
 *
 * ⚠️ Lista explícita porque não há dado de onde derivar: estes títulos estão só
 * em "Lançamentos", que é prateleira de vitrine. A loja não diz o que eles são,
 * e uma pessoa decidiu olhando. Encodar a decisão dela é honesto; inventar uma
 * regra que a reproduza por acaso, não.
 *
 * ⚠️ E o casamento é pelo nome INTEIRO, nunca por trecho. "Kit: Livro A Fé que
 * muda o seu destino + Pingente de Acrílico Azul" CONTÉM "A Fé que muda o seu
 * Destino": por trecho, o kit — que tem pingente dentro — viraria livro.
 *
 * Some sozinha no dia em que a loja classificar o produto: quem tem categoria
 * de verdade nem chega aqui.
 */
const DECISOES_DA_SEDE = new Map<string, { raiz: string; assunto: string | null }>(
  [
    "A fé que muda o seu Destino",
    "Podemos Ser Mais Felizes",
    "Educação da vida: Um tesouro valioso",
    "A Potencialidade Latente do Ser Humano",
  ].map((nome) => [chave(nome), { raiz: "Livros", assunto: null }])
);

function classificar(nome: string, categorias: string[]): {
  raiz: string;
  assunto: string | null;
  vitrineSoZinha: boolean;
} {
  const decidido = DECISOES_DA_SEDE.get(chave(nome));
  if (decidido) return { ...decidido, vitrineSoZinha: false };

  const tem = (re: RegExp) => categorias.some((c) => re.test(c.trim()));

  // ⚠️ ASSINATURA DE REVISTA NÃO É COTA DE REVISTA. A assinatura são 12
  // exemplares enviados pelo Correio — produto, com preço, comprado na
  // livraria. A cota é o mínimo mensal retirado na Associação Local conforme a
  // função doutrinária, e mora no módulo de revistas. Mesmo substantivo, coisas
  // diferentes: sem categoria própria, a assinatura ficaria ao lado do incenso,
  // e quem conferisse as revistas do mês acharia que há duas verdades sobre
  // revista no sistema.
  if (tem(/assinatura/i)) {
    return { raiz: "Assinaturas de Revista", assunto: null, vitrineSoZinha: false };
  }

  // ⚠️ A loja guarda os infantis em "Contos infantis", FORA da árvore de
  // Livros. Seguir a loja ao pé da letra os deixaria entre incenso e talismã, e
  // ninguém procura livro infantil ali. Decisão da Sede: `Livros / Livros
  // Infantis`.
  if (tem(/contos?\s*infantis|infanto/i)) {
    return { raiz: "Livros", assunto: "Livros Infantis", vitrineSoZinha: false };
  }

  // ⚠️ "Lançamentos" é PRATELEIRA DE VITRINE, não tipo: cabe livro e cabe
  // pingente, e o produto sai de lá quando deixa de ser novidade. O que está
  // SÓ nela não tem classificação de verdade na loja — vai para Artigos
  // Religiosos, que é o destino de tudo que não é livro, mas SE ANUNCIA no
  // relatório: são poucos, e alguém decide um a um em vez de o script chutar
  // pelo título.
  const semVitrine = categorias.filter((c) => !VITRINE.test(c.trim()));
  const vitrineSoZinha = categorias.length > 0 && semVitrine.length === 0;

  const eLivro = semVitrine.some((c) => /livro|book/i.test(c));
  if (!eLivro) return { raiz: "Artigos Religiosos", assunto: null, vitrineSoZinha };

  // A subcategoria é a mais funda que NÃO é a palavra "Livros" em si.
  const assunto = [...semVitrine].reverse().find((c) => !/^livros?$/i.test(c.trim()));
  return { raiz: "Livros", assunto: assunto ?? null, vitrineSoZinha: false };
}

// ─── Execução ────────────────────────────────────────────────────────────────

async function principal() {
  console.log(`→ lendo ${LOJA}${dryRun ? " (ensaio)" : ""}…`);

  // ⚠️ VTEX primeiro porque é o que a loja aparenta ser. Se ela não responder,
  // WooCommerce; se nenhuma, o script PARA e diz — em vez de gravar um catálogo
  // vazio e parecer que deu certo.
  const produtos = (await lerVtex()) ?? (await lerWoo());
  if (produtos === null) {
    throw new Error(
      `Nem a API da VTEX nem a do WooCommerce responderam em ${LOJA}. ` +
      "Nada foi gravado. Confira a URL, ou me diga qual é a plataforma."
    );
  }
  if (produtos.length === 0) {
    throw new Error(`A loja respondeu, mas com zero produtos. Nada foi gravado.`);
  }

  const destino = postgres(DESTINO!, { prepare: false, max: 3 });
  const relatorio = { lidos: produtos.length, gravados: 0, semNome: 0, semPreco: 0, semEstoque: 0, teste: 0, semClassificacao: [] as string[] };

  try {
    const categorias = new Map<string, string>();
    for (const c of await destino<{ id: string; nome: string }[]>`
      select id, nome from produto_categorias`) {
      categorias.set(c.nome.toLowerCase(), c.id);
    }

    const categoriaDe = async (raiz: string, assunto: string | null): Promise<string> => {
      const nome = assunto ? `${raiz} — ${assunto}` : raiz;
      const achada = categorias.get(nome.toLowerCase());
      if (achada) return achada;
      if (dryRun) return "simulada";
      const [nova] = await destino<{ id: string }[]>`
        insert into produto_categorias (nome, pai_id)
        values (${nome}, ${categorias.get(raiz.toLowerCase()) ?? null})
        on conflict (nome) do update set nome = excluded.nome
        returning id`;
      categorias.set(nome.toLowerCase(), nova.id);
      return nova.id;
    };

    for (const p of produtos) {
      if (!p.nome) { relatorio.semNome++; continue; }

      // ⚠️ A loja tem produto de teste publicado ("PRODUTO DE TESTE - FAVOR NÃO
      // COMPRAR"). Ele não é catálogo, e entraria ao lado dos livros de verdade
      // — na tela, na busca e em qualquer relatório de vendas.
      if (/produto de teste|n[aã]o comprar|\bteste\b.*n[aã]o/i.test(p.nome)) {
        relatorio.teste++;
        console.log(`   ⊘ ignorado (produto de teste): ${p.nome}`);
        continue;
      }
      if (p.preco_centavos <= 0) relatorio.semPreco++;
      if (!p.disponivel) relatorio.semEstoque++;

      const { raiz, assunto, vitrineSoZinha } = classificar(p.nome, p.categorias);
      if (vitrineSoZinha) {
        relatorio.semClassificacao.push(p.nome);
      }
      const categoriaId = await categoriaDe(raiz, assunto);

      if (dryRun) {
        // ⚠️ A categoria CRUA da loja sai junto no ensaio. Sem ela não dá para
        // escrever regra nenhuma de reclassificação: eu veria "Artigos
        // Religiosos" — o resultado da minha própria regra — e não o que a
        // loja de fato diz, que é a única base para mudá-la.
        console.log(
          `   ${raiz}${assunto ? ` / ${assunto}` : ""} · ${p.nome} · ` +
          `R$ ${(p.preco_centavos / 100).toFixed(2)}${p.codigo_barras ? ` · ${p.codigo_barras}` : ""}` +
          `${p.disponivel ? "" : "  ⟨sem estoque⟩"}` +
          `   [loja: ${p.categorias.join(" > ") || "sem categoria"}]`
        );
        relatorio.gravados++;
        continue;
      }

      // ⚠️ Repetível pela URL: rodar de novo ATUALIZA em vez de duplicar. Sem
      // isto, a segunda execução dobraria o catálogo inteiro.
      await destino`
        insert into produtos (categoria_id, nome, codigo, codigo_barras,
                              descricao_curta, descricao_longa, preco_capa_centavos, origem_url,
                              disponivel)
        values (${categoriaId}, ${p.nome}, ${p.codigo}, ${p.codigo_barras},
                ${p.descricao_curta}, ${p.descricao_longa}, ${p.preco_centavos}, ${p.url},
                ${p.disponivel})
        on conflict (origem_url) do update set
          nome = excluded.nome,
          categoria_id = excluded.categoria_id,
          codigo_barras = coalesce(excluded.codigo_barras, produtos.codigo_barras),
          descricao_curta = excluded.descricao_curta,
          descricao_longa = excluded.descricao_longa,
          preco_capa_centavos = excluded.preco_capa_centavos,
          disponivel = excluded.disponivel,
          atualizado_em = now()`;
      relatorio.gravados++;
    }
  } finally {
    await destino.end();
  }

  console.log(`\n${dryRun ? "Ensaio" : "Gravado"}: ${relatorio.gravados} de ${relatorio.lidos} produtos.`);
  if (relatorio.semNome) console.log(`  ❌ ${relatorio.semNome} sem nome — não dá para cadastrar.`);
  if (relatorio.semPreco) console.log(`  ⚠️  ${relatorio.semPreco} sem preço, com zero — conferir na tela.`);
  if (relatorio.semEstoque) console.log(`  ⟨⟩ ${relatorio.semEstoque} sem estoque na loja, no catálogo e marcados como tal.`);
  if (relatorio.teste) console.log(`  ⊘ ${relatorio.teste} produto(s) de teste da loja, ignorados.`);
  if (relatorio.semClassificacao.length) {
    console.log(
      `  ⚠️  ${relatorio.semClassificacao.length} produto(s) só em prateleira de vitrine ` +
      `("Lançamentos" e afins), sem classificação de verdade na loja. Ficaram em ` +
      `Artigos Religiosos — confira um a um:`
    );
    for (const n of relatorio.semClassificacao) console.log(`       · ${n}`);
  }
}

principal().catch((e) => {
  console.error(`\nA importação NÃO terminou: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
