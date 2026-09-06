import { redirect } from "next/navigation";

// A home pública de cada módulo (landing de evento, landing de localidade)
// vive na rota do módulo. A raiz manda para o painel; sem sessão, o proxy
// manda para o login.
export default function Home() {
  redirect("/painel");
}
