import ListaDeUnidades from "../estrutura/ListaDeUnidades";

/**
 * ⚠️ Aqui NÃO se escolhe onde a Regional fica. Toda Regional é da Sede
 * Central, por definição da instituição — o servidor a pendura lá.
 */
export default function RegionaisPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  return (
    <ListaDeUnidades
      tipo="regional"
      titulo="Regionais"
      descricao="Toda Regional é da SEICHO-NO-IE DO BRASIL e responde à Sede Central — não há onde escolher, e por isso o cadastro não pergunta."
      searchParams={searchParams}
    />
  );
}
