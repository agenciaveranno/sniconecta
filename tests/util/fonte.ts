/**
 * Código-fonte SEM os comentários, para os testes que leem código.
 *
 * ⚠️ POR QUE EXISTE. Quatro vezes nesta sessão um teste que lê código se
 * confundiu com o COMENTÁRIO que explica a regra que ele vigia:
 *
 *   · `assert "sql.unsafe" not in s` reprovou porque o comentário citava
 *     `sql.unsafe`;
 *   · `toContain("order by id")` passou verde com o SQL sem `order by id`,
 *     porque o comentário três linhas acima tinha as palavras;
 *   · `not.toContain('"use client"')` reprovou um arquivo correto, porque o
 *     comentário explicava que ele NÃO leva a diretiva;
 *   · `not.toContain("multiple")` reprovou porque o comentário dizia
 *     "não é um `select multiple`".
 *
 * Duas dessas passaram vigiando nada, que é o pior dos dois lados. O padrão é
 * sempre o mesmo: quem escreve um comentário bom cita o que está evitando, e a
 * citação fica indistinguível do código para uma busca de texto.
 *
 * A regra que tiramos disso: asserção sobre código se faz na FORMA (início de
 * linha, atributo JSX, chamada de função) ou sobre o fonte sem comentários.
 * Nunca sobre texto solto.
 */

/**
 * ⚠️ Não é um analisador de JavaScript, e não precisa ser. Ele erra em dois
 * casos conhecidos — `//` dentro de string (uma URL) e `/*` dentro de string —
 * e os dois falham para o lado SEGURO: apagam código a mais, nunca comentário
 * a menos. Uma asserção de ausência continua valendo; uma de presença falha
 * alto em vez de passar caladinha.
 */
export function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((linha) => {
      const i = linha.indexOf("//");
      // Linha que é só indentação + comentário some inteira; o resto mantém o
      // código antes das barras.
      return i === -1 ? linha : linha.slice(0, i);
    })
    .join("\n");
}
