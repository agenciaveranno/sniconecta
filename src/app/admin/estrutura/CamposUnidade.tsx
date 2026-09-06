import { Campo, Input, Select } from "@/componentes/ui";
import type { TipoUnidadeRow, UnidadeRow } from "@/lib/supabase/tipos";

/**
 * Campos da unidade, um componente só para o modal de criar e o de editar.
 *
 * Extraído justamente para as duas telas nunca divergirem: quando o cadastro
 * ganha um campo, ele nasce nos dois lugares ou em nenhum.
 */
export default function CamposUnidade({
  tipos,
  unidades,
  unidade,
  paiSugerido,
}: {
  tipos: TipoUnidadeRow[];
  unidades: Pick<UnidadeRow, "id" | "nome" | "tipo">[];
  unidade?: UnidadeRow;
  /** Pré-seleciona a unidade superior ao criar a partir de uma linha. */
  paiSugerido?: string;
}) {
  return (
    <>
      {unidade && <input type="hidden" name="id" value={unidade.id} />}

      <div className="sni-form-grid">
        <Campo label="Tipo" obrigatorio>
          <Select name="tipo" defaultValue={unidade?.tipo ?? ""} required>
            <option value="" disabled>
              Escolha…
            </option>
            {tipos.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.nome}
              </option>
            ))}
          </Select>
        </Campo>

        <Campo
          label="Dentro de"
          dica="A Sede Central é a única que fica no topo, sem unidade superior."
        >
          <Select name="pai" defaultValue={unidade?.pai_id ?? paiSugerido ?? ""}>
            <option value="">— nenhuma (topo) —</option>
            {unidades
              .filter((u) => u.id !== unidade?.id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
          </Select>
        </Campo>
      </div>

      <Campo label="Nome" obrigatorio>
        <Input name="nome" defaultValue={unidade?.nome ?? ""} required maxLength={150} />
      </Campo>

      <div className="sni-form-grid">
        <Campo label="Cidade">
          <Input name="cidade" defaultValue={unidade?.cidade ?? ""} maxLength={100} />
        </Campo>
        <Campo label="UF">
          <Input name="uf" defaultValue={unidade?.uf ?? ""} maxLength={2} />
        </Campo>
      </div>

      <div className="sni-form-grid">
        <Campo label="Código" dica="A numeração própria da instituição, se houver.">
          <Input name="codigo" defaultValue={unidade?.codigo ?? ""} maxLength={30} />
        </Campo>
        <Campo
          label="Endereço na web"
          dica="Letras minúsculas, números e hífen. Depois de publicado, mudar quebra o link."
        >
          <Input
            name="slug"
            defaultValue={unidade?.slug ?? ""}
            maxLength={150}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
          />
        </Campo>
      </div>
    </>
  );
}
