/**
 * Gera um slug URL-safe a partir de um nome (usado nas landing pages por
 * localidade — seção 11). Remove acentos, baixa a caixa e junta com hífens.
 */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacríticos combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
