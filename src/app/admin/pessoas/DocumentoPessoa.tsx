"use client";

import { useState } from "react";
import { Campo, CampoChave, Input } from "@/componentes/ui";

/**
 * CPF ou passaporte — exatamente um dos dois (decisão 0013).
 *
 * É o único pedaço cliente do formulário, e por um motivo: a pergunta muda o
 * campo que aparece. Mostrar os dois e deixar a pessoa escolher qual preencher
 * convida a preencher os dois, e o banco recusa — com o erro chegando só
 * depois de salvar.
 *
 * ⚠️ O campo escondido é DESMONTADO, não escondido com `display:none`. Campo
 * escondido continua no formulário e continua enviando o que tem dentro: quem
 * digitasse o CPF, mudasse de ideia e marcasse estrangeiro, mandaria os dois.
 */
export default function DocumentoPessoa({
  cpf,
  passaporte,
}: {
  cpf?: string | null;
  passaporte?: string | null;
}) {
  const [estrangeiro, setEstrangeiro] = useState(Boolean(passaporte));

  return (
    <>
      <CampoChave
        rotulo="Pessoa estrangeira, sem CPF"
        dica="Estrangeiro se identifica pelo passaporte. Vale para quem veio de fora e vai participar de evento aqui."
        ligado={estrangeiro}
        onClick={() => setEstrangeiro((v) => !v)}
      />

      {estrangeiro ? (
        <Campo
          label="Passaporte"
          obrigatorio
          dica="Como está no documento: letras e números, sem espaço nem traço."
        >
          <Input
            name="passaporte"
            defaultValue={passaporte ?? ""}
            required
            maxLength={20}
            className="num"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </Campo>
      ) : (
        <Campo label="CPF" obrigatorio dica="É ele que identifica a pessoa no sistema inteiro.">
          <Input
            name="cpf"
            defaultValue={cpf ?? ""}
            required
            maxLength={14}
            className="num"
            inputMode="numeric"
          />
        </Campo>
      )}
    </>
  );
}
