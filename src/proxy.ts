import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Proxy de sessão (o "middleware" do Next 16). Três garantias:
//  1. Rota pública não fala com o Supabase: fica de pé com o Auth fora do ar.
//  2. Rota de API não passa por aqui: tem o próprio guard e precisa poder
//     RECUSAR com 401/503, em vez de ser redirecionada para o login.
//     ⚠️ Já aconteceu de um cron receber a página de login com status 200 e
//     ninguém perceber. Endpoint chamado por máquina fica fora daqui.
//  3. Checagem de sessão tem prazo (3 s). Estourou → trata como sem sessão.

const PUBLICAS_EXATAS = new Set(["/", "/login", "/politicas"]);
const PUBLICAS_PREFIXO = ["/e/", "/comprar", "/certificado/", "/l/", "/descadastro", "/r/"];

export function rotaPublica(pathname: string): boolean {
  return PUBLICAS_EXATAS.has(pathname) || PUBLICAS_PREFIXO.some((p) => pathname.startsWith(p));
}

export function rotaDeApi(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function comPrazo<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (rotaDeApi(pathname) || rotaPublica(pathname)) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );

  const user = await comPrazo(
    supabase.auth.getUser().then((r) => r.data.user).catch(() => null),
    3000,
    null
  );

  if (!user) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.search = pathname !== "/painel" ? `?voltar=${encodeURIComponent(pathname)}` : "";
    return NextResponse.redirect(login);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|.*\\.(?:png|jpg|jpeg|svg|webp|woff2)$).*)"],
};
