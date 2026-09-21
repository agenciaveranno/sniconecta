import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { semComentarios } from "./util/fonte";

/**
 * As fotos da unidade, e o balde onde elas moram.
 *
 * ⚠️ O erro aqui é caro e silencioso das duas formas possíveis: um balde
 * PÚBLICO transforma o que subiu por engano em URL permanente que não sai do
 * cache de ninguém; uma linha apagada sem o arquivo deixa lixo cobrado no
 * armazenamento que ninguém sabe que existe. Nenhum dos dois quebra nada.
 */

const FOTOS = semComentarios(readFileSync("src/lib/fotos.ts", "utf8"));
const ANEXOS = semComentarios(readFileSync("src/lib/anexos.ts", "utf8"));
const ACOES = semComentarios(readFileSync("src/app/admin/estrutura/actions.ts", "utf8"));
const ABA = readFileSync("src/app/admin/estrutura/[id]/page.tsx", "utf8");

const MIGRACOES = readdirSync("supabase/migrations")
  .filter((a) => a.endsWith(".sql"))
  .map((a) => readFileSync(`supabase/migrations/${a}`, "utf8"))
  .join("\n");

const MIGRACAO = MIGRACOES.slice(MIGRACOES.indexOf("create table unidade_fotos"));

describe("o balde é privado", () => {
  it("o bucket nasce com public = false", () => {
    // ⚠️ Foto de fachada é pública por natureza, mas o que sobe por engano
    // numa tela de upload é documento, é foto de criança. Privado é a escolha
    // REVERSÍVEL: virar a chave depois é fácil; despublicar não existe.
    const bloco = MIGRACAO.slice(MIGRACAO.indexOf("storage.buckets"));
    expect(bloco).toContain("'fotos-unidades', 'fotos-unidades', false");
  });

  it("a criação do bucket é condicional, senão derruba o harness de RLS", () => {
    // O harness roda num Postgres puro, sem o schema `storage` do Supabase.
    expect(MIGRACAO).toContain("table_schema = 'storage'");
  });

  it("a tabela nasce com RLS e sem grant", () => {
    expect(MIGRACAO).toContain("alter table unidade_fotos enable row level security");
    expect(MIGRACAO).not.toMatch(/grant[\s\S]{0,80}unidade_fotos/i);
  });

  it("o navegador não fala com o balde: só URL assinada", () => {
    expect(FOTOS).toContain("createSignedUrls(");
    expect(FOTOS).not.toContain("getPublicUrl");
  });
});

describe("uma capa, garantida pelo banco", () => {
  it("o índice único parcial existe", () => {
    // ⚠️ Duas capas fazem a listagem do site escolher no critério do `order
    // by` — que muda quando alguém acrescenta uma coluna — e a unidade troca
    // de foto sozinha.
    expect(MIGRACAO).toMatch(/create unique index \w+ on unidade_fotos\(unidade_id\) where capa/);
  });

  it("a primeira foto vira capa sozinha", () => {
    expect(FOTOS).toContain("capa: (count ?? 0) === 0");
  });

  it("apagar a capa promove outra", () => {
    const apagar = FOTOS.slice(FOTOS.indexOf("export async function apagarFoto"));
    expect(apagar).toContain("foto.capa");
    expect(apagar).toContain("{ capa: true }");
  });

  it("trocar a capa tira de todas ANTES de pôr na escolhida", () => {
    // Pôr primeiro dá conflito com o índice único, e o erro que chega à tela
    // fala de restrição em vez de falar de capa.
    const definir = FOTOS.slice(FOTOS.indexOf("export async function definirCapa"));
    const tira = definir.indexOf("{ capa: false }");
    const poe = definir.indexOf("{ capa: true }");
    expect(tira).toBeGreaterThan(-1);
    expect(poe).toBeGreaterThan(tira);
  });
});

describe("arquivo e linha não se separam", () => {
  it("falha ao gravar a linha desfaz o upload", () => {
    // ⚠️ Sem isto, o arquivo fica no balde sem linha que o referencie:
    // invisível na tela, cobrado no armazenamento, e impossível de apagar
    // depois porque ninguém sabe que existe.
    const guardar = FOTOS.slice(FOTOS.indexOf("export async function guardarFoto"));
    const insert = guardar.indexOf(".insert(");
    const remove = guardar.indexOf(".remove([caminho])");
    expect(remove).toBeGreaterThan(insert);
  });

  it("apaga a linha primeiro, o arquivo depois", () => {
    // Na ordem inversa, uma falha ao apagar a linha deixaria a tela mostrando
    // uma foto cujo arquivo já não existe.
    const apagar = FOTOS.slice(FOTOS.indexOf("export async function apagarFoto"));
    expect(apagar.indexOf(".delete()")).toBeLessThan(apagar.indexOf("storage.from(BALDE_FOTOS).remove"));
  });

  it("o caminho leva UUID, e não o nome do arquivo", () => {
    // Duas "fachada.jpg" da mesma unidade se sobrescreveriam, e a primeira
    // sumiria sem ninguém notar.
    expect(FOTOS).toContain("randomUUID()");
  });
});

describe("a unidade amarra toda escrita", () => {
  it("apagar e trocar capa filtram por unidade_id", () => {
    // ⚠️ A escrita usa a chave de serviço, que ignora RLS. Sem amarrar a foto
    // à unidade conferida, bastava trocar o id no formulário para apagar a
    // foto de uma unidade fora do alcance. É a mesma lição de `apagarAnexo`.
    // ⚠️ A asserção olha CADA COMANDO DE ESCRITA, e não o corpo da função.
    // `apagarFoto` filtra por unidade em três lugares; tanto um `toContain`
    // solto quanto uma contagem mínima passavam com o filtro do `delete`
    // removido, satisfeitos pelos outros dois. Foi o que a mutação mostrou —
    // duas vezes.
    const comandos = (corpo: string, gatilho: string) =>
      corpo
        .split(gatilho)
        .slice(1)
        .map((depois) => depois.slice(0, depois.indexOf(";")));

    const apagar = FOTOS.slice(FOTOS.indexOf("export async function apagarFoto"));
    const deletes = comandos(apagar, ".delete()");
    expect(deletes.length, "não achei o delete — o extrator cegou").toBe(1);
    expect(deletes[0], "o delete não amarra a unidade").toContain('.eq("unidade_id", unidadeId)');
    expect(deletes[0], "o delete não amarra a foto").toContain('.eq("id", id)');

    const definir = FOTOS.slice(FOTOS.indexOf("export async function definirCapa"));
    const viraCapa = comandos(definir, "{ capa: true }");
    expect(viraCapa.length, "não achei a promoção a capa").toBe(1);
    expect(viraCapa[0], "promover a capa não amarra a unidade")
      .toContain('.eq("unidade_id", unidadeId)');

    expect(ANEXOS).toContain('.eq("pessoa_id"');
  });

  it("as ações exigem estrutura.gerir", () => {
    for (const fn of ["subirFotoDaUnidade", "removerFotoDaUnidade", "definirCapaDaUnidade"]) {
      const corpo = ACOES.slice(ACOES.indexOf(`export async function ${fn}`));
      expect(corpo.slice(0, 200), fn).toContain('exigirCapacidade("estrutura.gerir")');
    }
  });

  it("o teto é conferido no servidor, não só escondendo o botão", () => {
    // A tela pode estar aberta em duas abas, e o formulário chega de qualquer
    // lugar.
    expect(FOTOS).toContain("MAXIMO_POR_UNIDADE");
    const guardar = FOTOS.slice(FOTOS.indexOf("export async function guardarFoto"));
    expect(guardar).toContain(">= MAXIMO_POR_UNIDADE");
  });
});

describe("a tela diz quando a migração ainda não aplicou", () => {
  it("trata a tabela ausente em vez de estourar 500", () => {
    expect(FOTOS).toMatch(/if \(error\) return null/);
    expect(ABA).toContain("fotos === null");
    expect(ABA).toContain("Estado do");
  });
});
