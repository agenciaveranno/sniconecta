import ResgatarConvite from "@/componentes/ResgatarConvite";

// A home pública de cada módulo (landing de evento, landing de localidade)
// vive na rota do módulo. A raiz manda para o painel; sem sessão, o proxy
// manda para o login.
//
// ⚠️ Não pode ser `redirect()` puro. O convite do Supabase aterrissa aqui
// quando o "Site URL" aponta para a raiz, e o token vem no FRAGMENTO da URL —
// que o servidor não enxerga. Um redirecionamento de servidor descartaria um
// acesso válido sem deixar rastro, e a pessoa veria a tela de entrada com o
// convite ainda na barra de endereços.
//
// Então: a rede de segurança roda no navegador, acha o token e encaminha para
// quem sabe usá-lo; quem chega sem token segue para o painel pelo `<meta>`,
// que funciona mesmo sem JavaScript.
export default function Home() {
  return (
    <>
      <meta httpEquiv="refresh" content="0; url=/painel" />
      <ResgatarConvite />
      <noscript>
        <a href="/painel">Entrar no painel</a>
      </noscript>
    </>
  );
}
