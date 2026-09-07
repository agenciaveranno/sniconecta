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
<<<<<<< HEAD
import { arbitroDeUnicos, classificar } from "./lib/livraria";
=======
import { classificar } from "./lib/livraria";
>>>>>>> origin/main

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
<<<<<<< HEAD
  const relatorio = {
    lidos: produtos.length, gravados: 0, semNome: 0, semPreco: 0,
    semEstoque: 0, teste: 0,
    semClassificacao: [] as string[],
    colisoes: [] as { campo: string; valor: string; nome: string; dono: string }[],
  };

  // ⚠️ A primeira gravação parou no meio com `produtos_codigo_key`: a loja
  // repete o mesmo código interno em produtos diferentes (kits, sobretudo), e
  // o banco exige que ele seja único — com razão, porque é por ele que a Sede
  // identifica um item no estoque. O `on conflict (origem_url)` não socorre:
  // o choque é em OUTRA chave.
  //
  // Repetido não é motivo para parar a carga inteira nem para inventar um
  // código: o item entra sem código e a colisão sai no relatório, com quem
  // ficou com ele, para a Sede corrigir na loja. `paradaFatal` abaixo garante
  // que qualquer outra falha ainda pare tudo — e diga quanto já entrou.
  let paradaFatal: unknown = null;
=======
  const relatorio = { lidos: produtos.length, gravados: 0, semNome: 0, semPreco: 0, semEstoque: 0, teste: 0, semClassificacao: [] as string[] };
>>>>>>> origin/main

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

<<<<<<< HEAD
    // Quem já é dono de cada valor único, no banco e nesta mesma execução.
    const donoDe = new Map<string, string>();
    if (!dryRun) {
      for (const r of await destino<{ origem_url: string | null; codigo: string | null; codigo_barras: string | null }[]>`
        select origem_url, codigo, codigo_barras from produtos
         where codigo is not null or codigo_barras is not null`) {
        const dono = r.origem_url ?? "(cadastrado à mão)";
        if (r.codigo) donoDe.set(`codigo:${r.codigo}`, dono);
        if (r.codigo_barras) donoDe.set(`codigo_barras:${r.codigo_barras}`, dono);
      }
    }

    const arbitro = arbitroDeUnicos(donoDe, relatorio.colisoes);

    // ⚠️ Ordem determinística: com a lista ordenada por URL, rodar de novo
    // escolhe SEMPRE o mesmo dono do código repetido. Sem isso, cada execução
    // o daria a um produto diferente e o estoque nunca assentaria.
    const emOrdem = [...produtos].sort((a, b) => a.url.localeCompare(b.url));

    for (const p of emOrdem) {
      if (!p.nome) { relatorio.semNome++; continue; }

=======
    for (const p of produtos) {
      if (!p.nome) { relatorio.semNome++; continue; }

>>>>>>> origin/main
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

      const codigo = arbitro.reservar("codigo", p.codigo, p.url, p.nome);
      const codigoBarras = arbitro.reservar("codigo_barras", p.codigo_barras, p.url, p.nome);

      // ⚠️ Repetível pela URL: rodar de novo ATUALIZA em vez de duplicar. Sem
      // isto, a segunda execução dobraria o catálogo inteiro.
      await destino`
        insert into produtos (categoria_id, nome, codigo, codigo_barras,
                              descricao_curta, descricao_longa, preco_capa_centavos, origem_url,
                              disponivel)
<<<<<<< HEAD
        values (${categoriaId}, ${p.nome}, ${codigo}, ${codigoBarras},
=======
        values (${categoriaId}, ${p.nome}, ${p.codigo}, ${p.codigo_barras},
>>>>>>> origin/main
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
  } catch (e) {
    // ⚠️ Diferente da migração, esta carga NÃO roda dentro de transação: o que
    // já entrou ficou. Morrer sem relatório deixaria o catálogo pela metade
    // sem ninguém saber quanto entrou nem onde parou.
    paradaFatal = e;
  } finally {
    await destino.end();
  }

  console.log(
    `\n${dryRun ? "Ensaio" : "Gravado"}: ${relatorio.gravados} de ${relatorio.lidos} produtos` +
    (paradaFatal !== null ? " — e a carga PAROU aqui: o catálogo está pela metade." : ".")
  );
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
<<<<<<< HEAD
  if (relatorio.colisoes.length) {
    console.log(
      `  ⚠️  ${relatorio.colisoes.length} código(s) repetido(s) na loja. O item entrou ` +
      `SEM código — dois produtos não podem dividir o mesmo. Corrija na loja e repita a carga:`
    );
    for (const c of relatorio.colisoes) {
      console.log(`       · ${c.nome} — ${c.campo} ${c.valor} já é de ${c.dono}`);
    }
  }

  if (paradaFatal !== null) throw paradaFatal;
=======
>>>>>>> origin/main
}

principal().catch((e) => {
  console.error(`\nA importação NÃO terminou: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
