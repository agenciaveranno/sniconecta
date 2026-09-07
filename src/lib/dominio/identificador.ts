import { cpfValido, somenteDigitos } from "@/lib/dominio/cpf";
import { normalizarPassaporte, passaporteValido } from "@/lib/dominio/passaporte";

/**
 * Como o texto digitado na tela de login é procurado no cadastro.
 *
 * ⚠️ Uma TABELA de tentativas, e não um encadeado de `if/else if`. Era assim
 * antes, e o último ramo engolia o resto: quem digitasse o `login`
 * ("maria.silva") caía no ramo do passaporte — `normalizarPassaporte` o
 * transformava em "MARIASILVA", que passa na validação de formato —, a busca
 * não achava nada e a resposta era "Credenciais inválidas". O campo `login`
 * era prometido na tela de cadastro, tinha check no banco e validação em zod,
 * e não servia para entrar. Numa lista, acrescentar uma forma de identificação
 * é acrescentar uma linha, e nenhuma linha engole a seguinte.
 *
 * ⚠️ A ordem importa: o CPF vem antes do passaporte porque um passaporte pode
 * ser só dígitos (os Estados Unidos emitem assim), e onze dígitos são um CPF
 * muito mais provavelmente do que um passaporte.
 *
 * ⚠️ E a resposta é sempre a mesma para "não achei" e para "senha errada" —
 * quem responde por aqui não pode revelar quais documentos existem no cadastro.
 */
export const TENTATIVAS: {
  coluna: "cpf" | "passaporte" | "login";
  serve: (bruto: string) => boolean;
  valor: (bruto: string) => string;
}[] = [
  {
    coluna: "cpf",
    serve: (b) => /^\d+$/.test(b.replace(/[.\-\s]/g, "")) && somenteDigitos(b).length === 11
      && cpfValido(somenteDigitos(b)),
    valor: (b) => somenteDigitos(b),
  },
  {
    coluna: "passaporte",
    serve: (b) => passaporteValido(normalizarPassaporte(b)),
    valor: (b) => normalizarPassaporte(b),
  },
  {
    coluna: "login",
    serve: (b) => b.trim().length > 0,
    valor: (b) => b.trim().toLowerCase(),
  },
];

