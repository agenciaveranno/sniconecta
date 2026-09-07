import ListaDeUnidades from "../estrutura/ListaDeUnidades";

export default function NucleosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  return (
    <ListaDeUnidades
      tipo="nucleo"
      titulo="Núcleos"
      descricao="Degrau opcional entre a Regional e as Associações Locais: a união de Associações de organizações diferentes no mesmo endereço. Por isso o Núcleo não tem organização própria."
      searchParams={searchParams}
    />
  );
}
