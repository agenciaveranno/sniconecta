/** CNPJ só dígitos. O banco guarda assim; a tela formata na saída. */
export function somenteDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Valida o dígito verificador.
 *
 * Mesma razão do CPF: o `check` do banco só olha o formato. Um CNPJ com DV
 * errado passaria, e a nota fiscal emitida com ele volta — não na hora do
 * cadastro, mas semanas depois, quando ninguém lembra de onde veio.
 */
export function cnpjValido(v: string | null | undefined): boolean {
  const d = somenteDigitos(v);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false; // 000…, 111…: placeholders

  const dv = (tamanho: number) => {
    let peso = tamanho - 7;
    let soma = 0;
    for (let i = 0; i < tamanho; i++) {
      soma += Number(d[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/**
 * A raiz: os oito primeiros dígitos, que identificam a pessoa jurídica.
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

/** O número da filial: os quatro dígitos depois da barra. `0001` é a matriz. */
export function filialCnpj(v: string | null | undefined): string {
  return somenteDigitos(v).slice(8, 12);
}

export function formatarCnpj(v: string | null | undefined): string {
  const d = somenteDigitos(v);
  if (d.length !== 14) return v ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
