import { Campo, Input, Select } from "@/componentes/ui";
import { SEPARADOR_MULTIPLA } from "@/lib/dominio/campos";
import type { PerguntaRespondida } from "@/modulos/eventos/consultas";

/**
 * As perguntas de uma inscrição, para responder na ficha.
 *
 * ⚠️ O controle ACOMPANHA O TIPO da pergunta. Um campo de texto para "escolha
 * uma" deixa quem responde digitar o que quiser — e o servidor recusa depois,
 * com a pessoa achando que a tela quebrou. Aqui o seletor só oferece o que
 * vale.
 *
 * ⚠️ "Escolha várias" é um grupo de caixas, e não um `select multiple`: seletor
 * múltiplo exige segurar Ctrl para marcar mais de um, e no celular é pior
 * ainda. Caixas são o mesmo dado com um clique cada.
 */
export default function CamposResposta({
  inscricaoId,
  voltarPara,
  perguntas,
}: {
  inscricaoId: number;
  voltarPara: string;
  perguntas: PerguntaRespondida[];
}) {
  return (
    <>
      <input type="hidden" name="inscricao_id" value={inscricaoId} />
      <input type="hidden" name="voltar_para" value={voltarPara} />

      {perguntas.map((p) => {
        const nome = `campo_${p.campo_id}`;
        const marcados = (p.valor ?? "").split(SEPARADOR_MULTIPLA).filter(Boolean);

        if (p.tipo === "multipla") {
          return (
            <fieldset key={p.campo_id} className="sni-grupo-campos">
              <legend className="sni-grupo-campos-legenda">
                {p.rotulo}
                {p.obrigatorio && " *"}
              </legend>
              {(p.opcoes ?? []).map((o) => (
                <label key={o} className="sni-check">
                  <input type="checkbox" name={nome} value={o} defaultChecked={marcados.includes(o)} />
                  <span>{o}</span>
                </label>
              ))}
            </fieldset>
          );
        }

        if (p.tipo === "selecao") {
          return (
            <Campo key={p.campo_id} label={p.rotulo} obrigatorio={p.obrigatorio}>
              <Select name={nome} defaultValue={p.valor ?? ""} required={p.obrigatorio}>
                <option value="">—</option>
                {(p.opcoes ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </Campo>
          );
        }

        if (p.tipo === "booleano") {
          return (
            <label key={p.campo_id} className="sni-check">
              <input type="checkbox" name={nome} value="sim" defaultChecked={p.valor === "sim"} />
              <span>{p.rotulo}</span>
            </label>
          );
        }

        return (
          <Campo key={p.campo_id} label={p.rotulo} obrigatorio={p.obrigatorio}>
            <Input
              name={nome}
              type={p.tipo === "data" ? "date" : p.tipo === "numero" ? "number" : "text"}
              inputMode={p.tipo === "numero" ? "decimal" : undefined}
              defaultValue={p.valor ?? ""}
              required={p.obrigatorio}
              maxLength={500}
            />
          </Campo>
        );
      })}
    </>
  );
}
