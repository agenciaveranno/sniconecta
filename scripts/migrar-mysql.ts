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
 * Estado: fase `pessoas` implementada. As demais estão listadas e lançam
 * "não implementada" — vão sendo preenchidas conforme o schema `eventos`
 * vira migração.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
import postgres from "postgres";
import { transformarParticipante, type ParticipanteMysql } from "./lib/transformar";

type Relatorio = Record<string, { lidas: number; gravadas: number; rejeitadas: Record<string, number>; avisos: number }>;

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

const origem = await mysql.createConnection(ORIGEM);
const destino = postgres(DESTINO, { prepare: false, max: 3 });
const relatorio: Relatorio = {};
const rejeicoesDetalhe: { fase: string; legado_id: number; motivo: string }[] = [];

function conta(fase: string) {
  relatorio[fase] ??= { lidas: 0, gravadas: 0, rejeitadas: {}, avisos: 0 };
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

const FASES: Record<string, () => Promise<void>> = {
  pessoas: fasePessoas,
  estrutura: async () => naoImplementada("estrutura (regionais, organizações, locais, promotores, orientadores)"),
  eventos: async () => naoImplementada("eventos (eventos, tipos de convite, campos, combos, cupons, orientadores do evento)"),
  compras: async () => naoImplementada("compras (pedidos, inscrições, respostas, magic links, carrinhos)"),
  comissao: async () => naoImplementada("comissão"),
  configuracao: async () => naoImplementada("configuração e segredos (cifrados)"),
  auditoria: async () => naoImplementada("auditoria"),
  sequencias: async () => naoImplementada("setval das sequências após a carga"),
};

function naoImplementada(nome: string): never {
  throw new Error(`Fase ${nome} ainda não implementada — entra quando o schema eventos virar migração.`);
}

// ─── Execução ─────────────────────────────────────────────────────────────

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
      if (!soFase) break; // fases seguintes dependem desta
    }
  }
} finally {
  await origem.end();
  await destino.end();
}

const saida = { executadoEm: new Date().toISOString(), dryRun, duracaoSegundos: Math.round((Date.now() - inicio) / 1000), fases: relatorio, rejeicoes: rejeicoesDetalhe };
const arquivo = `migracao-relatorio-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(arquivo, JSON.stringify(saida, null, 2));
console.log("\nRelatório:");
console.table(Object.fromEntries(Object.entries(relatorio).map(([k, v]) => [k, { lidas: v.lidas, gravadas: v.gravadas, rejeitadas: Object.values(v.rejeitadas).reduce((a, b) => a + b, 0), avisos: v.avisos }])));
for (const [fase, v] of Object.entries(relatorio)) {
  for (const [motivo, n] of Object.entries(v.rejeitadas)) console.log(`  ${fase}: ${n} × ${motivo}`);
}
console.log(`Gravado em ${arquivo} (não contém dado pessoal; não versionar).`);
