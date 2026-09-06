/**
 * Exporta uma AMOSTRA ANONIMIZADA do MySQL para testar o script de migração
 * fora do ambiente de produção. Nomes, CPFs, e-mails, telefones e endereços
 * são substituídos por valores fictícios (CPF fictício com dígito verificador
 * válido); a forma dos dados (nulos, vazios, formatos estranhos) é
 * preservada, porque é isso que a migração precisa tratar.
 *
 *   MIGRACAO_MYSQL_URL=... npm run amostra -- --linhas=50
 *
 * Gera amostra-<data>.json (ignorado pelo git). Pode ser compartilhado.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";

const linhasAlvo = Number(process.argv.find((a) => a.startsWith("--linhas="))?.split("=")[1] ?? 50);
const url = process.env.MIGRACAO_MYSQL_URL;
if (!url) { console.error("Falta MIGRACAO_MYSQL_URL."); process.exit(1); }

function cpfFicticio(semente: number): string {
  // 9 dígitos derivados da semente + DV calculado → CPF válido e inexistente na prática
  const base = String(100000000 + (semente * 7919) % 900000000).padStart(9, "0").split("").map(Number);
  const dv = (d: number[], t: number) => { let s = 0; for (let i = 0; i < t; i++) s += d[i] * (t + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(base, 9); const d2 = dv([...base, d1], 10);
  return [...base, d1, d2].join("");
}

// Preserva a FORMA: nulo fica nulo, vazio fica vazio, formatado fica formatado.
const mesmaForma = (orig: unknown, novo: string) => (orig === null || orig === undefined ? orig : String(orig).trim() === "" ? "" : novo);
const cpfMesmaForma = (orig: unknown, novo: string) =>
  orig === null || orig === undefined ? orig : String(orig).includes(".") ? `${novo.slice(0, 3)}.${novo.slice(3, 6)}.${novo.slice(6, 9)}-${novo.slice(9)}` : String(orig).trim() === "" ? "" : novo;

const conn = await mysql.createConnection(url);
const [linhas] = await conn.query<mysql.RowDataPacket[]>("SELECT * FROM Participant ORDER BY RAND() LIMIT ?", [linhasAlvo]);
await conn.end();

const amostra = linhas.map((l, i) => ({
  ...l,
  nomeCompleto: mesmaForma(l.nomeCompleto, `Pessoa Fictícia ${i + 1}`),
  cpf: cpfMesmaForma(l.cpf, cpfFicticio(i + 1)),
  email: mesmaForma(l.email, `pessoa${i + 1}@exemplo.invalido`),
  telefone: mesmaForma(l.telefone, "(11) 90000-0000"),
  endereco: mesmaForma(l.endereco, "Rua Fictícia, 1"),
  codSNI: mesmaForma(l.codSNI, String(100000 + i)),
}));

const arquivo = `amostra-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(arquivo, JSON.stringify(amostra, null, 2));
console.log(`${amostra.length} linhas anonimizadas em ${arquivo}`);
