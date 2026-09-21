import "server-only";
import { conexao } from "./db";

/**
 * Em que versão o banco de produção está — e se ele está atrás do código.
 *
 * ⚠️ POR QUE ISTO EXISTE. `docs/publicacao.md` já avisa que CI verde não prova
 * que o código está no ar, e manda conferir o deploy. Faltava a terceira
 * esteira: a MIGRAÇÃO. O job que a aplica está preso ao ambiente `Production`,
 * e ambiente com aprovação exigida devolve `action_required` — o merge
 * acontece, a Vercel publica, e o esquema fica para trás sem ninguém ver.
 *
 * O resultado é o pior tipo de defeito deste projeto: nada quebra. A tela nova
 * abre, a venda funciona, e só uma coluna que deveria ter default nasce nula —
 * o erro aparece dias depois, na porta do evento, com a pessoa na frente.
 *
 * ⚠️ A LISTA É CÓDIGO, e não leitura do disco. `supabase/migrations/` não entra
 * no pacote que a Vercel publica: só o que é importado vai junto. Um
 * `readdirSync` aqui funcionaria no desenvolvimento e devolveria "nenhuma
 * migração esperada" em produção — que é exatamente a resposta tranquilizadora
 * e errada. Quem mantém a lista em dia é o teste `estado-do-banco`, que lê a
 * pasta e reprova a diferença dizendo qual linha falta.
 */
export const MIGRACOES_ESPERADAS: readonly string[] = [
  "20260906190000", // fundacao_plataforma
  "20260906200000", // seed_estrutura_publicada
  "20260906210000", // primeiro_acesso_e_credenciais
  "20260906220000", // email_compartilhado
  "20260907010000", // esquema_eventos
  "20260907030000", // pessoa_estrangeira
  "20260907040000", // unidade_conferir
  "20260907050000", // cnpj_alfanumerico
  "20260907060000", // cache_de_cep
  "20260907070000", // ficha_da_pessoa
  "20260907080000", // contato_e_redes
  "20260907090000", // departamentos
  "20260907100000", // mandatos_e_colegiados
  "20260907110000", // missao_sagrada
  "20260907120000", // contas_bancarias
  "20260907130000", // revistas_e_reunioes
  "20260907140000", // pasc_e_agenda
  "20260907150000", // produto_disponivel
  "20260907180000", // organizacao_de_verdade
  "20260907190000", // papel_com_recorte_de_organizacao
  "20260907200000", // visao_respeita_o_rls
  "20260921030000", // qr_do_ingresso
  "20260921040000", // fotos_da_unidade
];

export type EstadoDoBanco =
  | { lido: true; aplicadas: number; faltando: readonly string[] }
  /** Não foi possível perguntar — e isso NÃO é o mesmo que "está tudo certo". */
  | { lido: false; motivo: string };

/**
 * ⚠️ Fala Postgres direto (`db.ts`), e não pelo cliente Supabase. A tabela
 * `supabase_migrations.schema_migrations` vive num schema que o PostgREST não
 * expõe: pelo cliente do navegador ela simplesmente não existe. É o mesmo
 * motivo pelo qual o módulo `eventos` fala direto (decisão 0003), aplicado a
 * uma informação de infraestrutura em vez de a dados de domínio.
 *
 * ⚠️ E devolve o MOTIVO quando falha, em vez de uma lista vazia. Uma falha de
 * leitura lida como "nada faltando" transformaria esta tela na segunda fonte
 * de falsa tranquilidade do sistema.
 */
export async function estadoDoBanco(): Promise<EstadoDoBanco> {
  try {
    const sql = conexao();
    const linhas = await sql<{ version: string }[]>`
      select version from supabase_migrations.schema_migrations
    `;
    const aplicadas = new Set(linhas.map((l) => l.version));
    return {
      lido: true,
      aplicadas: aplicadas.size,
      faltando: MIGRACOES_ESPERADAS.filter((v) => !aplicadas.has(v)),
    };
  } catch (e) {
    return {
      lido: false,
      motivo: e instanceof Error ? e.message : String(e),
    };
  }
}
