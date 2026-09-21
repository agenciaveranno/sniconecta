import criarQr from "qrcode-generator";

/**
 * O código do ingresso virando desenho.
 *
 * ⚠️ Regra pura, e a mais pura de todas: texto entra, matriz de pontos sai.
 * Nem banco, nem React, nem navegador. A mesma matriz serve ao comprovante
 * impresso, ao que for enviado por e-mail e ao que o checkout público mostrar
 * na tela — e desenhar em cada lugar faria três QRs do mesmo código com
 * tamanhos e margens diferentes, dos quais um leitor lê dois.
 *
 * ⚠️ E o desenho é SVG, não imagem. Imagem exigiria gerar arquivo, guardar em
 * algum lugar e servir por URL — três coisas que podem falhar entre a venda e
 * a impressão. SVG vai dentro da própria página, sem ida a lugar nenhum, e
 * imprime nítido em qualquer tamanho, que é o que a porta precisa.
 */

/** Nível de correção de erro: `M` recupera ~15% do desenho borrado ou dobrado. */
const CORRECAO = "M" as const;

/**
 * @returns matriz quadrada: `true` é ponto escuro.
 * @throws quando o texto não cabe em nenhuma versão de QR.
 */
export function matrizDoCodigo(texto: string): boolean[][] {
  const limpo = texto.trim();
  if (!limpo) throw new Error("Não há código para desenhar.");

  // Versão 0 = "escolha a menor que couber". Fixar uma versão faria um código
  // um caractere maior deixar de caber, sem aviso nenhum.
  const qr = criarQr(0, CORRECAO);
  qr.addData(limpo);
  qr.make();

  const lado = qr.getModuleCount();
  return Array.from({ length: lado }, (_, linha) =>
    Array.from({ length: lado }, (_, coluna) => qr.isDark(linha, coluna))
  );
}

/**
 * Os retângulos escuros, em coordenadas de 0 a `lado`, já com a margem.
 *
 * ⚠️ A MARGEM (quiet zone) faz parte do padrão, não é enfeite. Um QR colado na
 * borda do papel ou de outro elemento não é lido: o leitor precisa do vão
 * branco para achar onde o desenho começa. Quatro módulos é o mínimo da norma.
 */
export const MARGEM = 4;

export type DesenhoQr = {
  /** Lado do `viewBox`, já somada a margem dos dois lados. */
  lado: number;
  pontos: { x: number; y: number }[];
};

export function desenharCodigo(texto: string): DesenhoQr {
  const matriz = matrizDoCodigo(texto);
  const pontos: { x: number; y: number }[] = [];
  for (const [y, linha] of matriz.entries()) {
    for (const [x, escuro] of linha.entries()) {
      if (escuro) pontos.push({ x: x + MARGEM, y: y + MARGEM });
    }
  }
  return { lado: matriz.length + MARGEM * 2, pontos };
}
