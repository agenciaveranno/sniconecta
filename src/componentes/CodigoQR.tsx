import { desenharCodigo } from "@/lib/dominio/qr";

/**
 * O código do ingresso desenhado, em SVG, no servidor.
 *
 * ⚠️ Sem `"use client"` e sem biblioteca no navegador: o desenho já vai pronto
 * no HTML. Gerado no cliente, ele apareceria depois da página — e a impressão,
 * que é o uso principal, sai antes de o script rodar em metade dos casos.
 *
 * ⚠️ `shape-rendering="crispEdges"` não é enfeite: sem ele, o antialiasing
 * borra a beira de cada módulo, e num QR impresso pequeno isso é a diferença
 * entre ler de primeira e a pessoa ficar virando o papel na porta.
 */
export default function CodigoQR({
  codigo,
  tamanho = 180,
}: {
  codigo: string;
  tamanho?: number;
}) {
  const { lado, pontos } = desenharCodigo(codigo);
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox={`0 0 ${lado} ${lado}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Código do ingresso ${codigo}`}
    >
      {/* Fundo branco explícito: em tema escuro ou papel colorido, um QR sem
          fundo próprio fica com os módulos claros da cor de trás — e deixa de
          ter contraste para o leitor. */}
      <rect width={lado} height={lado} fill="#FFFFFF" />
      {pontos.map((p) => (
        <rect key={`${p.x},${p.y}`} x={p.x} y={p.y} width={1} height={1} fill="#000000" />
      ))}
    </svg>
  );
}
