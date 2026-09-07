import "server-only";

/**
 * Cifra de credencial, com a barreira do servidor.
 *
 * A implementação está em `cripto-nucleo.ts`, que não importa `server-only` —
 * porque o script de carga é Node puro e precisa cifrar a chave da Cielo antes
 * de gravá-la. Este arquivo é o que a APLICAÇÃO usa: reexporta o núcleo e
 * acrescenta a garantia de que nada disso vai parar no navegador.
 */
export { cifragemDisponivel, cifrar, decifrar } from "./cripto-nucleo";
