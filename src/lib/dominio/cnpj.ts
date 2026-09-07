/**
 * CNPJ — numérico e ALFANUMÉRICO.
 *
 * ⚠️ A Receita Federal passou a emitir CNPJ alfanumérico: os doze primeiros
 * caracteres podem ser letra ou dígito, e só os dois verificadores continuam
 * numéricos. Guardar em coluna numérica ou validar com `\d{14}` recusaria um
 * CNPJ legítimo — de um fornecedor, de um hotel que sedia evento — com a
 * pessoa esperando do outro lado do balcão.
 *
 * O cálculo do verificador é o MESMO de sempre; o que muda é de onde sai o
 * número de cada posição: em vez do dígito, o valor ASCII do caractere menos
 * 48. Para '0'–'9' isso devolve 0–9, então todo CNPJ numérico que valia antes
 * continua valendo, byte por byte. Não há duas regras, há uma que generaliza.
 */

/** Só o que identifica: letras maiúsculas e dígitos, sem pontuação. */
export function somenteDigitos(v: string | null | undefined): string {
  return (v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** ⚠️ Nome antigo mantido porque metade do sistema já o importa assim. */
export const normalizarCnpj = somenteDigitos;

/** '0'→0 … '9'→9, 'A'→17 … 'Z'→42. É a regra da Receita, não uma invenção. */
function valorDoCaractere(c: string): number {
  return c.charCodeAt(0) - 48;
}

export function cnpjValido(v: string | null | undefined): boolean {
  const d = somenteDigitos(v);
  if (d.length !== 14) return false;
  // Os dois últimos são SEMPRE numéricos, mesmo no alfanumérico.
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(d)) return false;
  // 00000000000000, AAAAAAAAAAAA00: placeholders que passariam no cálculo.
  if (/^(.)\1{11}/.test(d)) return false;

  const dv = (tamanho: number) => {
    let peso = tamanho - 7;
    let soma = 0;
    for (let i = 0; i < tamanho; i++) {
      soma += valorDoCaractere(d[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/** Verdadeiro quando o CNPJ usa letras — muda o que a tela pode assumir. */
export function cnpjAlfanumerico(v: string | null | undefined): boolean {
  return /[A-Z]/.test(somenteDigitos(v));
}

/**
 * A raiz: os oito primeiros caracteres, que identificam a pessoa jurídica.
 *
 * Toda unidade da SEICHO-NO-IE DO BRASIL é filial da Sede Central, então
 * todas compartilham esta raiz — o que muda é só o número da filial, depois
 * da barra. É isto que permite conferir um CNPJ digitado errado sem consultar
 * a Receita: se a raiz não bate, é de outra empresa.
 */
export function raizCnpj(v: string | null | undefined): string {
  return somenteDigitos(v).slice(0, 8);
}

export function mesmaRaiz(a: string | null | undefined, b: string | null | undefined): boolean {
  const ra = raizCnpj(a);
  const rb = raizCnpj(b);
  return ra.length === 8 && ra === rb;
}

/** O número da filial: os quatro caracteres depois da barra. `0001` é a matriz. */
export function filialCnpj(v: string | null | undefined): string {
  return somenteDigitos(v).slice(8, 12);
}

export function formatarCnpj(v: string | null | undefined): string {
  const d = somenteDigitos(v);
  if (d.length !== 14) return v ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Máscara progressiva, para aplicar a cada tecla.
 *
 * Aceita o que já foi digitado e devolve com a pontuação até ali — sem exigir
 * que o valor esteja completo. Digitar sem máscara e ver a pontuação aparecer
 * é o que faz a pessoa perceber na hora que errou a quantidade de caracteres.
 */
export function mascararCnpj(v: string): string {
  const d = somenteDigitos(v).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
