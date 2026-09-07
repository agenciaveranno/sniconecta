"use client";

import { useState } from "react";
import { CampoChave } from "@/componentes/ui";

/**
 * "Este Departamento é uma Organização doutrinária?"
 *
 * ⚠️ É a marca que decide se ele aparece na escolha da Associação Local.
 * Desmarcado, o Departamento Jurídico deixa de ser oferecido a quem cadastra
 * uma AL — que é o que a Sede pediu ao pedir um cadastro só para os dois.
 *
 * O `hidden` acompanha porque checkbox desmarcado NÃO É ENVIADO pelo
 * navegador: sem ele, desmarcar não chegaria ao servidor e a marca nunca
 * poderia ser tirada.
 */
export default function ToggleOrganizacao({ inicial }: { inicial?: boolean }) {
  const [ligado, setLigado] = useState(inicial ?? true);

  return (
    <>
      <CampoChave
        rotulo="É uma Organização doutrinária"
        dica="Marcado, aparece na escolha da Associação Local: Fraternidade, Pomba Branca, Jovens, Prosperidade. Desmarcado, é só Departamento administrativo da Sede Central."
        ligado={ligado}
        onClick={() => setLigado((v) => !v)}
      />
      <input type="hidden" name="e_organizacao" value={ligado ? "1" : "0"} />
    </>
  );
}
