/**
 * Cor de marca, do jeito que o CSS entende.
 *
 * ⚠️ Regra pura porque a cor digitada vai direto para um `style` inline, e daí
 * para dentro de uma folha de estilo. Texto de gente entrando em lugar onde
 * certos caracteres MANDAM em vez de valer é o mesmo problema do `%` no
 * `ilike` e do `entreAspas` no PostgREST — só que aqui o estrago é uma
 * declaração CSS inventada por quem preencheu o campo.
 *
 * O formato aceito é o hexadecimal de seis dígitos, com `#`. Nome de cor
 * (`red`), `rgb()` e `hsl()` ficam de fora de propósito: não por serem
 * inválidos em CSS, mas porque aceitar uma gramática maior é aceitar
 * caracteres que precisam de outra conferência — e a marca de um evento não
 * precisa de mais que isto.
 */

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * @returns a cor normalizada em caixa alta, ou `null` quando não é cor.
 *
 * Aceita três dígitos por conveniência de quem digita (`#036`) e expande, para
 * que o que fica gravado tenha sempre a mesma forma.
 */
export function corDeMarca(texto: string | null | undefined): string | null {
  const limpo = String(texto ?? "").trim();
  if (!limpo) return null;

  const curto = /^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/.exec(limpo);
  const cheio = curto ? `#${curto[1]}${curto[1]}${curto[2]}${curto[2]}${curto[3]}${curto[3]}` : limpo;

  return HEX.test(cheio) ? cheio.toUpperCase() : null;
}
