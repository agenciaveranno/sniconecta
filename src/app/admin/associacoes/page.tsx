import ListaDeUnidades from "../estrutura/ListaDeUnidades";

export default function AssociacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  return (
    <ListaDeUnidades
      tipo="associacao_local"
      titulo="Associações Locais"
      descricao="Onde o Associado participa. Toda Associação Local pertence a uma Organização e fica dentro de uma Regional — direto ou dentro de um Núcleo."
      searchParams={searchParams}
    />
  );
}
