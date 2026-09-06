/**
 * Endereço público do sistema.
 *
 * POR QUE EXISTE. O certificado imprime um link de validação, e link sem
 * domínio não valida nada: quem recebe o documento fica sem como conferi-lo.
 * Isso fazia `NEXT_PUBLIC_SITE_URL` ser obrigatória antes de existir domínio
 * próprio — uma configuração manual para dizer ao sistema um endereço que a
 * própria hospedagem já sabe.
 *
 * A Vercel publica `VERCEL_PROJECT_PRODUCTION_URL` com o domínio de produção
 * do projeto, e ele não muda a cada deploy (ao contrário de `VERCEL_URL`, que
 * aponta para a implantação específica e por isso não serve para um documento
 * que vai durar anos). Usar essa retaguarda faz o certificado nascer válido
 * sem configuração nenhuma.
 *
 * A variável explícita continua vencendo: no dia em que houver domínio
 * próprio, defini-la basta, e os certificados novos já saem com ele. Os
 * antigos guardam o link que tinham — trocar o domínio depois é assunto de
 * redirecionamento, não de código.
 */
export function enderecoPublico(): string {
  const explicito = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicito) return explicito.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return "";
}
