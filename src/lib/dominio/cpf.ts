/** CPF só dígitos. O banco guarda assim; a tela formata na saída. */
export function somenteDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Valida o dígito verificador. O `check` do banco só olha o formato: um CPF
 * com DV errado passaria e viraria pessoa legítima — e no dia em que alguém
 * cadastrasse o CPF correto, nasceria uma segunda pessoa.
 */
export function cpfValido(v: string | null | undefined): boolean {
  const d = somenteDigitos(v);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // 000…, 111…: placeholders

  const dv = (tamanho: number) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function formatarCpf(v: string | null | undefined): string {
  const d = somenteDigitos(v);
  if (d.length !== 11) return v ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * Máscara progressiva, para aplicar a cada tecla.
 *
 * Aceita o que já foi digitado e devolve com a pontuação até ali, sem exigir
 * que esteja completo. Ver a pontuação aparecer é o que faz a pessoa perceber
 * na hora que digitou caractere a mais ou a menos — e não depois de salvar.
 */
export function mascararCpf(v: string): string {
  const d = somenteDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
