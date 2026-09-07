/**
 * Formato do CEP. Separado de `src/lib/cep.ts` porque AQUELE é `server-only`
 * — importa o cliente de serviço — e a máscara precisa rodar no navegador.
 */

export function somenteDigitosCep(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "").slice(0, 8);
}

export function mascararCep(v: string): string {
  const d = somenteDigitosCep(v);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function formatarCep(v: string | null | undefined): string {
  const d = somenteDigitosCep(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (v ?? "");
}
