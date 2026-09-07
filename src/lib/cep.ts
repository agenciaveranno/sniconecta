import "server-only";
import { criarClienteServico } from "@/lib/supabase/service";

/**
 * Consulta de CEP (decisão 0014).
 *
 * ⚠️ Nada aqui pode LANÇAR. O CEP ajuda a preencher; a falha dele não impede
 * ninguém de cadastrar. Toda saída é `Endereco | null`, e `null` significa
 * "não sei", nunca "não pode".
 */

export type Endereco = {
  cep: string;
  logradouro: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  fonte: string;
};

// ⚠️ A máscara mora em `dominio/endereco-formato.ts` e é de LÁ que a tela a
// importa. Este arquivo é `server-only`: reexportá-la daqui criava um segundo
// caminho para a mesma função, e o componente cliente que o descobrisse
// quebrava o build.
import { somenteDigitosCep } from "@/lib/dominio/endereco-formato";

/** Corta a espera. Balcão parado esperando rede é pior que campo vazio. */
const TEMPO_LIMITE = 4000;

async function buscarJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const resposta = await fetch(url, {
      signal: AbortSignal.timeout(TEMPO_LIMITE),
      headers: { accept: "application/json" },
    });
    if (!resposta.ok) return null;
    return (await resposta.json()) as Record<string, unknown>;
  } catch {
    // Rede fora, provedor fora, resposta que não é JSON: tudo vira "não sei".
    return null;
  }
}

const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
};

/**
 * Ordem, e não escolha: um CEP que a BrasilAPI não conhece o ViaCEP às vezes
 * conhece. Tentar os dois custa menos que um endereço errado.
 */
const PROVEDORES: { fonte: string; url: (cep: string) => string; ler: (j: Record<string, unknown>) => Omit<Endereco, "cep" | "fonte"> | null }[] = [
  {
    fonte: "brasilapi",
    url: (cep) => `https://brasilapi.com.br/api/cep/v2/${cep}`,
    ler: (j) => {
      const cidade = texto(j.city);
      const uf = texto(j.state);
      if (!cidade || !uf) return null;
      return { logradouro: texto(j.street), complemento: null, bairro: texto(j.neighborhood), cidade, uf: uf.toUpperCase().slice(0, 2) };
    },
  },
  {
    fonte: "viacep",
    url: (cep) => `https://viacep.com.br/ws/${cep}/json/`,
    ler: (j) => {
      // ⚠️ O ViaCEP responde 200 com `{ "erro": true }` quando não conhece o
      // CEP. Sem esta linha, "não encontrado" viraria um endereço vazio
      // gravado no cache — e o CEP certo nunca mais seria consultado.
      if (j.erro) return null;
      const cidade = texto(j.localidade);
      const uf = texto(j.uf);
      if (!cidade || !uf) return null;
      return { logradouro: texto(j.logradouro), complemento: texto(j.complemento), bairro: texto(j.bairro), cidade, uf: uf.toUpperCase().slice(0, 2) };
    },
  },
];

export async function consultarCep(entrada: string): Promise<Endereco | null> {
  const cep = somenteDigitosCep(entrada);
  if (cep.length !== 8) return null;

  const servico = criarClienteServico();

  // 1. O que já se sabe. Responde sem rede, e é onde a base oficial entrará.
  try {
    const { data } = await servico.from("ceps").select("*").eq("cep", cep).maybeSingle();
    if (data) return data as Endereco;
  } catch {
    // Cache indisponível não impede consultar: segue para a rede.
  }

  // 2. Os provedores, em ordem.
  for (const p of PROVEDORES) {
    const json = await buscarJson(p.url(cep));
    if (!json) continue;
    const lido = p.ler(json);
    if (!lido) continue;

    const achado: Endereco = { cep, ...lido, fonte: p.fonte };
    try {
      // ⚠️ `upsert` e não `insert`: duas telas podem consultar o mesmo CEP ao
      // mesmo tempo, e a segunda não pode falhar por causa disso.
      await servico.from("ceps").upsert(achado, { onConflict: "cep" });
    } catch {
      // Não conseguir guardar não invalida o que se descobriu.
    }
    return achado;
  }

  return null;
}
