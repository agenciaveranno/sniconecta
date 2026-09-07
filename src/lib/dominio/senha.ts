/**
 * Regra de senha definida pela Sede para outra pessoa.
 *
 * Módulo puro: a validação real acontece no servidor, mas a regra mora aqui
 * para ser testável e para a tela e a Server Action dizerem exatamente a mesma
 * coisa.
 *
 * O RISCO QUE ESTA REGRA EXISTE PARA IMPEDIR. Quem cadastra trinta pessoas
 * numa tarde cai no atalho óbvio: usar o CPF como senha. Neste sistema isso é
 * pior do que a preguiça de sempre, porque o CPF **também é o identificador
 * de login** (§4.2). Senha igual ao CPF significa que quem tem a lista de
 * presença tem a conta — basta digitar o mesmo número duas vezes. Vale o
 * mesmo para o CodSNI, que circula em planilha, e para o e-mail.
 */

export const MIN_SENHA = 8;

/**
 * O que a senha não pode ser. Passado pela camada de servidor a partir do
 * cadastro da pessoa — nunca digitado pelo operador.
 */
export interface DadosDaPessoa {
  cpf?: string | null;
  passaporte?: string | null;
  codSni?: string | null;
  email?: string | null;
  nome?: string | null;
}

/** Sequências que aparecem sozinhas em qualquer lista de senha vazada. */
const OBVIAS = [
  "12345678",
  "123456789",
  "1234567890",
  "senha123",
  "password",
  "qwertyui",
  "abcd1234",
  "mudar123",
  "trocar123",
];

export interface ResultadoSenha {
  ok: boolean;
  erro?: string;
}

function soDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

export function validarSenha(
  senha: string,
  confirmacao: string,
  pessoa: DadosDaPessoa = {},
): ResultadoSenha {
  if (senha.length < MIN_SENHA) {
    return { ok: false, erro: `A senha precisa de pelo menos ${MIN_SENHA} caracteres.` };
  }
  // Espaço nas pontas é invisível e some ao copiar e colar: a pessoa recebe a
  // senha, digita o que vê, e não entra.
  if (senha !== senha.trim()) {
    return { ok: false, erro: "A senha não pode começar ou terminar com espaço." };
  }
  // Confirmação existe porque a senha é definida às cegas: um erro de digitação
  // aqui tranca a pessoa fora de uma conta cuja senha ninguém conhece.
  if (senha !== confirmacao) {
    return { ok: false, erro: "A confirmação não confere com a senha." };
  }

  const minuscula = senha.toLowerCase();
  if (OBVIAS.includes(minuscula)) {
    return { ok: false, erro: "Essa senha é previsível demais. Escolha outra." };
  }

  const digitos = soDigitos(senha);
  const cpf = pessoa.cpf ? soDigitos(pessoa.cpf) : "";
  if (cpf.length === 11 && digitos.includes(cpf)) {
    return {
      ok: false,
      erro: "A senha não pode conter o CPF — ele também é o login desta pessoa.",
    };
  }

  // O passaporte identifica quem não tem CPF, e é o que essa pessoa digita
  // para entrar: vale a mesma regra. Comparação sem caixa e sem separador,
  // igual à normalização do cadastro.
  const passaporte = (pessoa.passaporte ?? "").replace(/[\s.\-/]/g, "").toUpperCase();
  if (passaporte.length >= 5 && senha.replace(/[\s.\-/]/g, "").toUpperCase().includes(passaporte)) {
    return {
      ok: false,
      erro: "A senha não pode conter o passaporte — ele também é o login desta pessoa.",
    };
  }

  const cod = pessoa.codSni ? soDigitos(pessoa.codSni) : "";
  if (cod.length >= 4 && digitos === cod) {
    return { ok: false, erro: "A senha não pode ser o CodSNI." };
  }

  const local = pessoa.email?.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && minuscula === local) {
    return { ok: false, erro: "A senha não pode ser o e-mail da pessoa." };
  }

  const primeiro = pessoa.nome?.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (primeiro.length >= 4 && minuscula === primeiro) {
    return { ok: false, erro: "A senha não pode ser o primeiro nome da pessoa." };
  }

  return { ok: true };
}

/**
 * Alfabeto sem os pares que se confundem quando a senha é ditada por telefone
 * ou copiada de um papel: 0/O, 1/l/I, 5/S, 2/Z.
 *
 * Vale o gasto porque esta senha nasce para ser TRANSMITIDA por um humano a
 * outro. Uma senha forte que a pessoa não consegue digitar volta como chamado
 * de suporte, e o suporte resolve gerando outra — ou pior, uma fraca.
 */
const ALFABETO = "ABCDEFGHJKMNPQRTUVWXYabcdefghijkmnopqrstuvwxyz346789";

/**
 * Gera senha legível. `aleatorios` recebe a quantidade de bytes e devolve os
 * bytes — injetado para o teste ser determinístico; em produção é
 * `crypto.randomBytes`.
 */
export function gerarSenha(
  tamanho = 12,
  aleatorios: (n: number) => Uint8Array = () => {
    throw new Error("gerarSenha exige uma fonte de aleatoriedade.");
  },
): string {
  // Descarta os bytes que cairiam fora de um múltiplo inteiro do alfabeto.
  // Sem isso as primeiras letras sairiam mais vezes que as últimas — viés
  // pequeno, mas gratuito de evitar.
  const limite = Math.floor(256 / ALFABETO.length) * ALFABETO.length;
  let saida = "";
  while (saida.length < tamanho) {
    for (const b of aleatorios(tamanho * 2)) {
      if (b >= limite) continue;
      saida += ALFABETO[b % ALFABETO.length];
      if (saida.length === tamanho) break;
    }
  }
  return saida;
}
