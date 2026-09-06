/**
 * As variáveis que o Supabase exige, com erro que diz onde arrumá-las.
 *
 * ⚠️ POR QUE ISTO EXISTE. Com `process.env.X!`, faltar uma variável produz a
 * mensagem genérica da biblioteca — "Your project's URL and Key are required
 * to create a Supabase client" — com um link para o painel do Supabase. E o
 * problema não está lá: está na hospedagem, que não passou a variável. A
 * mensagem manda quem depura para o lugar errado, e no proxy ela vira um 500
 * seco: a pessoa vê "Internal Server Error" e ninguém tem por onde começar.
 *
 * Sem `server-only`: o proxy e o cliente do navegador também passam por aqui.
 */
function exigirVariavel(nome: string, complemento: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    throw new Error(
      `${nome} não está definida no ambiente. Sem ela o sistema não fala com o banco ` +
        `e nenhuma tela protegida abre. Defina em Vercel → Settings → Environment ` +
        `Variables (marcando Production), ou no .env.local em desenvolvimento. ${complemento}`
    );
  }
  return valor;
}

export function urlSupabase(): string {
  return exigirVariavel(
    "NEXT_PUBLIC_SUPABASE_URL",
    "O valor é https://<ref>.supabase.co, em Project Settings → API."
  );
}

export function chaveAnonima(): string {
  return exigirVariavel(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "É a chave `anon public`, em Project Settings → API. Ela é pública por " +
      "desenho: quem protege as linhas é o RLS, não o segredo da chave."
  );
}

export function chaveDeServico(): string {
  return exigirVariavel(
    "SUPABASE_SERVICE_ROLE_KEY",
    "É a `service_role`, em Project Settings → API. ⚠️ Ela IGNORA o RLS: " +
      "nunca com prefixo NEXT_PUBLIC_, nunca no navegador."
  );
}
