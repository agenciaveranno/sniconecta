/**
 * Importa o catálogo de livraria.sni.org.br para `produtos`.
 *
 *   DATABASE_URL=postgresql://… npm run importar-livraria [-- --dry-run]
 *
 * ⚠️ NÃO FOI POSSÍVEL EXECUTAR ESTE SCRIPT CONTRA A LOJA DURANTE O
 * DESENVOLVIMENTO: o ambiente onde ele foi escrito bloqueia saída para a
 * internet. O que está aqui é a leitura de uma loja WooCommerce padrão, que é
 * o que a URL aparenta ser — e a PRIMEIRA execução tem de ser `--dry-run`,
 * olhando os nomes e preços impressos antes de deixar gravar.
 *
 * Se a loja não for WooCommerce, é `LOJA` e `extrair()` que mudam; o resto
 * (upsert por URL, categorias, relatório) continua valendo.
 *
 * ⚠️ IMAGENS NÃO ENTRAM, por decisão da Sede. O campo `imagens` fica vazio.
 */
import "dotenv/config";
import postgres from "postgres";

const LOJA = "https://livraria.sni.org.br";
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
  categorias: string[];
};

/** Centavos a partir de "R$ 29,90" ou "29.90". Nunca `parseFloat * 100`. */
function centavos(bruto: unknown): number {
  if (bruto === null || bruto === undefined) return 0;
  const t = String(bruto).replace(/[^\d,.-]/g, "").trim();
  if (!t) return 0;
  // ⚠️ "1.234,56" e "1234.56" são o mesmo número escrito de dois jeitos. Quem
  // tem vírgula usa ponto como milhar; quem não tem, usa ponto como decimal.
  const normalizado = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalizado);
  if (!Number.isFinite(n)) return 0;
  // ⚠️ `Math.round`: 19.90 * 100 dá 1989.9999999999998 em ponto flutuante, e
  // truncar tiraria um centavo de cada produto do catálogo.
  return Math.round(n * 100);
}

function limpar(html: unknown): string | null {
  const t = String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return t ? t : null;
}

/**
 * A API pública da Store do WooCommerce. Não exige credencial, pagina, e traz
 * nome, preço, descrições e categorias de uma vez — que é tudo o que se quer.
 */
async function paginaDaLoja(pagina: number): Promise<Record<string, unknown>[]> {
  const url = `${LOJA}/wp-json/wc/store/v1/products?per_page=100&page=${pagina}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) {
    if (r.status === 400 || r.status === 404) return []; // passou da última página
    throw new Error(`A loja respondeu ${r.status} em ${url}`);
  }
  const json = await r.json();
  return Array.isArray(json) ? (json as Record<string, unknown>[]) : [];
}

function extrair(p: Record<string, unknown>): Produto {
  const precos = (p.prices ?? {}) as Record<string, unknown>;
  // O WooCommerce devolve o preço já como inteiro na menor unidade, com
  // `currency_minor_unit` dizendo quantas casas. Confiar cegamente em "são
  // centavos" quebraria numa loja configurada com três casas.
  const menor = Number(precos.currency_minor_unit ?? 2);
  const bruto = String(precos.price ?? "0");
  const preco = menor === 2 ? Number(bruto) : Math.round(Number(bruto) / 10 ** (menor - 2));

  return {
    nome: String(p.name ?? "").trim(),
    url: String(p.permalink ?? ""),
    preco_centavos: Number.isFinite(preco) && preco > 0 ? preco : centavos(p.price_html),
    descricao_curta: limpar(p.short_description),
    descricao_longa: limpar(p.description),
    codigo: p.sku ? (String(p.sku).trim() || null) : null,
    categorias: ((p.categories ?? []) as { name?: string }[])
      .map((c) => String(c.name ?? "").trim())
      .filter(Boolean),
  };
}

/**
 * Livro ou Artigo Religioso, e a subcategoria de assunto.
 *
 * ⚠️ A regra da Sede: o que a loja classifica como livro vai para `Livros`,
 * com o assunto como subcategoria; TODO O RESTO vai para `Artigos Religiosos`.
 * Sem o "todo o resto", um produto de categoria imprevista ficaria sem
 * categoria — e a coluna é obrigatória, então a carga pararia.
 */
const ASSUNTOS = [
  "educação", "educacao", "jovens", "mulher", "meditação", "meditacao",
  "antepassados", "e-book", "ebook", "e-books", "infantil", "juvenil",
];

function classificar(categorias: string[]): { raiz: string; assunto: string | null } {
  const minusculas = categorias.map((c) => c.toLowerCase());
  const eLivro = minusculas.some((c) => c.includes("livro") || c.includes("book"));
  const assunto = categorias.find((c) =>
    ASSUNTOS.some((a) => c.toLowerCase().includes(a))
  );
  return {
    raiz: eLivro ? "Livros" : "Artigos Religiosos",
    assunto: eLivro ? (assunto ?? null) : null,
  };
}

async function principal() {
  const destino = postgres(DESTINO!, { prepare: false, max: 3 });
  const relatorio = { lidos: 0, gravados: 0, semNome: 0, semPreco: 0 };

  try {
    const produtos: Produto[] = [];
    for (let pagina = 1; pagina <= 100; pagina++) {
      const lote = await paginaDaLoja(pagina);
      if (lote.length === 0) break;
      produtos.push(...lote.map(extrair));
      process.stdout.write(`   página ${pagina}: ${lote.length} produtos\n`);
    }
    relatorio.lidos = produtos.length;

    // As categorias raiz já existem pela migração; as de assunto nascem aqui.
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
      const paiId = categorias.get(raiz.toLowerCase());
      const [nova] = await destino<{ id: string }[]>`
        insert into produto_categorias (nome, pai_id) values (${nome}, ${paiId ?? null})
        on conflict (nome) do update set nome = excluded.nome
        returning id`;
      categorias.set(nome.toLowerCase(), nova.id);
      return nova.id;
    };

    for (const p of produtos) {
      if (!p.nome) { relatorio.semNome++; continue; }
      if (p.preco_centavos <= 0) relatorio.semPreco++;

      const { raiz, assunto } = classificar(p.categorias);
      const categoriaId = await categoriaDe(raiz, assunto);

      if (dryRun) {
        console.log(`   ${raiz}${assunto ? ` / ${assunto}` : ""} · ${p.nome} · R$ ${(p.preco_centavos / 100).toFixed(2)}`);
        relatorio.gravados++;
        continue;
      }

      // ⚠️ Repetível pela URL: rodar de novo ATUALIZA em vez de duplicar. Sem
      // isto, a segunda execução dobraria o catálogo inteiro.
      await destino`
        insert into produtos (categoria_id, nome, codigo, descricao_curta, descricao_longa,
                              preco_capa_centavos, origem_url)
        values (${categoriaId}, ${p.nome}, ${p.codigo}, ${p.descricao_curta},
                ${p.descricao_longa}, ${p.preco_centavos}, ${p.url})
        on conflict (origem_url) do update set
          nome = excluded.nome,
          categoria_id = excluded.categoria_id,
          descricao_curta = excluded.descricao_curta,
          descricao_longa = excluded.descricao_longa,
          preco_capa_centavos = excluded.preco_capa_centavos,
          atualizado_em = now()`;
      relatorio.gravados++;
    }
  } finally {
    await destino.end();
  }

  console.log(`\n${dryRun ? "Ensaio" : "Gravado"}: ${relatorio.gravados} de ${relatorio.lidos} produtos.`);
  if (relatorio.semNome) console.log(`  ❌ ${relatorio.semNome} sem nome — não dá para cadastrar.`);
  if (relatorio.semPreco) console.log(`  ⚠️  ${relatorio.semPreco} sem preço, gravados com zero — conferir na tela.`);
}

principal().catch((e) => {
  console.error(`\nA importação NÃO terminou: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
