"use client";

import { useState } from "react";
import { Input } from "@/componentes/ui";
import { mascararCpf } from "@/lib/dominio/cpf";
import { mascararCnpj } from "@/lib/dominio/cnpj";

/**
 * Campo que mostra pontuação e envia só o que identifica.
 *
 * ⚠️ A pontuação é APARÊNCIA, nunca dado. O banco guarda `61278388000181`, e é
 * por esse texto que se busca, se compara e se deduplica — gravar
 * "61.278.388/0001-81" faria o mesmo CNPJ digitado sem pontos virar uma
 * segunda empresa, e nada perceberia.
 *
 * Por isso são dois campos: o visível, que a pessoa edita com a máscara, e um
 * `hidden` com o `name` de verdade, que leva os caracteres limpos. O servidor
 * normaliza de novo — a máscara ajuda quem digita, não substitui validação.
 *
 * CNPJ aceita LETRA porque a Receita passou a emitir alfanumérico; CPF, não.
 */
export default function CampoMascarado({
  tipo,
  name,
  defaultValue,
  required,
  id,
}: {
  tipo: "cpf" | "cnpj";
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  id?: string;
}) {
  const mascarar = tipo === "cpf" ? mascararCpf : mascararCnpj;
  const [valor, setValor] = useState(mascarar(defaultValue ?? ""));
  const limpo =
    tipo === "cpf"
      ? valor.replace(/\D/g, "")
      : valor.toUpperCase().replace(/[^0-9A-Z]/g, "");

  return (
    <>
      <Input
        id={id}
        value={valor}
        onChange={(e) => setValor(mascarar(e.target.value))}
        required={required}
        // Um a mais que a forma completa, para a pontuação caber.
        maxLength={tipo === "cpf" ? 14 : 18}
        className="sni-input num"
        // ⚠️ `inputMode` numérico só no CPF: no CNPJ alfanumérico o teclado do
        // celular precisa ter letras, senão a pessoa não consegue digitar o
        // próprio documento.
        inputMode={tipo === "cpf" ? "numeric" : "text"}
        autoCapitalize={tipo === "cnpj" ? "characters" : "off"}
        spellCheck={false}
        placeholder={tipo === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
      />
      <input type="hidden" name={name} value={limpo} />
    </>
  );
}
