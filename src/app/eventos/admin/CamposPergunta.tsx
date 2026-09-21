import { Campo, Input, Select, Textarea } from "@/componentes/ui";
import { TIPOS_DE_CAMPO } from "@/lib/dominio/campos";
import type { PerguntaDoIngresso, TipoDeIngresso } from "@/modulos/eventos/consultas";

/**
 * Os campos de uma pergunta do ingresso.
 *
 * ⚠️ As alternativas são um campo de TEXTO, uma por linha, e não uma lista com
 * botão de acrescentar. Quem cadastra "P, M, G, GG" digita quatro linhas de uma
 * vez; uma lista obrigaria quatro cliques em "adicionar" e quatro campos, para
 * o mesmo resultado. O formato também cola de uma planilha.
 *
 * ⚠️ E o campo fica SEMPRE visível, mesmo quando o tipo escolhido não usa
 * alternativas. Escondê-lo exigiria estado de cliente num formulário que é
 * servidor inteiro — e o servidor ignora o que não se aplica, dizendo na dica
 * quando ele vale.
 */
export default function CamposPergunta({
  eventoId,
  pergunta,
  tipos,
}: {
  eventoId: number;
  pergunta?: PerguntaDoIngresso;
  tipos: TipoDeIngresso[];
}) {
  return (
    <>
      <input type="hidden" name="evento_id" value={eventoId} />
      {pergunta && <input type="hidden" name="id" value={pergunta.id} />}

      <Campo label="A pergunta" obrigatorio dica="Como ela aparece para quem responde.">
        <Input
          name="rotulo"
          defaultValue={pergunta?.rotulo ?? ""}
          required
          maxLength={200}
          placeholder="Tamanho da camiseta"
        />
      </Campo>

      {/* ⚠️ Trocar a pergunta de ingresso depois deixaria respostas ligadas a
          um ingresso que não as faz mais. Na edição o ingresso é fixo. */}
      {pergunta ? (
        <Campo label="Ingresso" dica="Não muda depois de criada — as respostas já estão presas a ele.">
          <Input defaultValue={pergunta.ingresso} disabled />
        </Campo>
      ) : (
        <Campo label="De qual ingresso" obrigatorio>
          <Select name="ingresso_tipo_id" required defaultValue="">
            <option value="" disabled>
              Escolha…
            </option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </Select>
        </Campo>
      )}

      <div className="form-grid">
        <Campo label="Tipo de resposta" obrigatorio>
          <Select name="tipo" defaultValue={pergunta?.tipo ?? "texto"} required>
            {TIPOS_DE_CAMPO.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo label="Ordem" dica="Menor aparece primeiro.">
          <Input name="ordem" type="number" min={0} max={99} defaultValue={pergunta?.ordem ?? 0} />
        </Campo>
      </div>

      <Campo
        label="Alternativas"
        dica="Uma por linha. Vale só para “Escolha uma” e “Escolha várias”; nos outros tipos é ignorado."
      >
        <Textarea
          name="opcoes"
          rows={4}
          defaultValue={(pergunta?.opcoes ?? []).join("\n")}
          placeholder={"P\nM\nG"}
        />
      </Campo>

      <label className="sni-check">
        <input type="checkbox" name="obrigatorio" defaultChecked={pergunta?.obrigatorio ?? false} />
        <span>Obrigatória — sem resposta, a inscrição não se completa</span>
      </label>
    </>
  );
}
