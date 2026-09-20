import { Campo, Input, Select } from "@/componentes/ui";
import type { EventoParaEdicao, OpcaoPromotor } from "@/modulos/eventos/consultas";

/**
 * Os campos do evento, no modal de CRIAR e na aba de EDITAR — nunca dois
 * jeitos.
 *
 * ⚠️ Mora fora das duas telas porque agora são duas: criar continua em modal
 * na lista, editar virou aba na página do evento (decisão 0020). Duplicar o
 * formulário faria o campo que alguém acrescentasse num lado faltar no outro,
 * e ninguém descobre isso até a Sede reclamar que o dado sumiu ao editar.
 */
export default function CamposEvento({
  evento,
  locais,
  promotores,
}: {
  evento?: Pick<EventoParaEdicao, "id" | "nome" | "data_inicial" | "data_final" | "local_id"> & {
    promotor: string;
  };
  locais: { id: string; nome: string }[];
  promotores: OpcaoPromotor[];
}) {
  // Agrupa por Departamentos / Unidades / Locais, na ordem que a consulta deu.
  const grupos = [...new Set(promotores.map((p) => p.grupo))];

  return (
    <>
      {evento && <input type="hidden" name="id" value={evento.id} />}

      <Campo label="Nome" obrigatorio>
        <Input name="nome" defaultValue={evento?.nome ?? ""} required maxLength={200} />
      </Campo>

      <div className="form-grid">
        <Campo label="Começa em" obrigatorio>
          <Input name="data_inicial" type="date" defaultValue={evento?.data_inicial ?? ""} required />
        </Campo>
        <Campo label="Termina em" obrigatorio>
          <Input name="data_final" type="date" defaultValue={evento?.data_final ?? ""} required />
        </Campo>
      </div>

      <Campo label="Onde acontece">
        <Select name="local" defaultValue={evento?.local_id ?? ""}>
          <option value="">A definir</option>
          {locais.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </Select>
      </Campo>

      {/* ⚠️ UM campo para o promotor, embora sejam três colunas no banco. Um
          seletor por coluna deixaria preencher duas, e o banco recusaria
          depois de tudo preenchido. A lista traz só quem recebe em conta
          própria: promotor é quem diz em que conta o dinheiro cai. */}
      <Campo
        label="Quem promove"
        dica="Define em qual conta Cielo o dinheiro do evento cai. Sem promotor, o evento não vende."
      >
        <Select name="promotor" defaultValue={evento?.promotor ?? ""}>
          <option value="">A definir</option>
          {grupos.map((g) => (
            <optgroup key={g} label={g}>
              {promotores
                .filter((p) => p.grupo === g)
                .map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.nome}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Campo>
    </>
  );
}
