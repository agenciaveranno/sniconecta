"use client";

import { IconPrinter } from "@tabler/icons-react";
import { Botao } from "@/componentes/ui";

/**
 * ⚠️ Cliente por um motivo só: `window.print()` não existe no servidor. Tudo o
 * mais desta tela é servidor — inclusive o desenho do QR, para que a impressão
 * funcione mesmo antes de qualquer script rodar.
 *
 * ⚠️ E a classe `sni-sem-impressao` some do papel. Um botão "Imprimir"
 * impresso no comprovante é a marca de quem esqueceu do `@media print`.
 */
export default function BotaoImprimir() {
  return (
    <span className="sni-sem-impressao">
      <Botao
        type="button"
        onClick={() => window.print()}
        icone={<IconPrinter size={18} className="ti" />}
      >
        Imprimir
      </Botao>
    </span>
  );
}
