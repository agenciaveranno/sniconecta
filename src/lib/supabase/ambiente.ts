/**
 * As variáveis que o Supabase exige, com erro que diz onde arrumá-las.
 *
 * ⚠️ POR QUE ISTO EXISTE. Com `process.env.X!`, faltar uma variável produz a
 * mensagem genérica da biblioteca — "Your project's URL and Key are required
 * to create a Supabase client" — com um link para o painel do Supabase. E o
 * problema não está lá: está na hospedagem, que não passou a variável. No
 * proxy isso vira um 500 seco, e ninguém tem por onde começar.
 *
 * ⚠️ E POR QUE CADA LEITURA É LITERAL. `process.env.NEXT_PUBLIC_SUPABASE_URL`
 * está escrito por extenso em cada função, e não `process.env[nome]` com o
 * nome vindo de um parâmetro — que seria mais curto e ESTARIA ERRADO. O Next
 * substitui essas variáveis no pacote do navegador em tempo de compilação,
 * procurando a referência LITERAL no código. Com a chave calculada não há o
 * que procurar: o servidor continuaria funcionando, e só o navegador receberia
 * `undefined` — sempre, mesmo com tudo configurado. Já custou um convite que
 * chegou e não abriu.
 *
 * Sem `server-only`: o proxy e o cliente do navegador também passam por aqui.
 */
function exigir(valor: string | undefined, nome: string, complemento: string): string {
  const limpo = valor?.trim();
  if (!limpo) {
    throw new Error(
      `${nome} não está definida no ambiente. Sem ela o sistema não fala com o banco ` +
        `e nenhuma tela protegida abre. Defina em Vercel → Settings → Environment ` +
        `Variables (marcando Production), ou no .env.local em desenvolvimento. ${complemento}`
    );
  }
  return limpo;
}

export function urlSupabase(): string {
  return exigir(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL",
    "O valor é https://<ref>.supabase.co, em Project Settings → API."
  );
}

export function chaveAnonima(): string {
  return exigir(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "É a chave `anon public`, em Project Settings → API. Ela é pública por " +
      "desenho: quem protege as linhas é o RLS, não o segredo da chave."
  );
}

export function chaveDeServico(): string {
  return exigir(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY",
    "É a `service_role`, em Project Settings → API. ⚠️ Ela IGNORA o RLS: " +
      "nunca com prefixo NEXT_PUBLIC_, nunca no navegador."
  );
}
