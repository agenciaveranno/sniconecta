import { Campo, Input, Select, Textarea } from "@/componentes/ui";
import type { TipoDeIngresso } from "@/modulos/eventos/consultas";

/**
 * Os campos do tipo de ingresso, no modal de criar e no de editar.
 *
 * ⚠️ O valor é digitado em REAIS e guardado em centavos. O campo é `text` e
 * não `number` de propósito: `number` recusa "1.234,56" calado em teclado
 * brasileiro — o campo fica vazio e a pessoa não sabe por quê. Quem converte é
 * `centavosDe`, que aceita as duas grafias.
 */
export default function CamposIngresso({
  eventoId,
  tipo,
}: {
  eventoId: number;
  tipo?: TipoDeIngresso;
}) {
  return (
    <>
      <input type="hidden" name="evento_id" value={eventoId} />
      {tipo && <input type="hidden" name="id" value={tipo.id} />}

      <Campo label="Nome" obrigatorio>
        <Input
          name="nome"
          defaultValue={tipo?.nome ?? ""}
          required
          maxLength={120}
          placeholder="Inteira, Meia, Jantar, Transporte…"
        />
      </Campo>

      <Campo label="Descrição" dica="Aparece na tela de compra, abaixo do nome.">
        <Textarea name="descricao" defaultValue={tipo?.descricao ?? ""} rows={2} maxLength={500} />
      </Campo>

      <div className="form-grid">
        <Campo label="Valor" dica="Em reais. Zero para ingresso gratuito.">
          <Input
            name="valor"
            inputMode="decimal"
            defaultValue={tipo ? (tipo.valor_centavos / 100).toFixed(2).replace(".", ",") : "0,00"}
            placeholder="0,00"
          />
        </Campo>
        <Campo label="Parcelas" dica="Máximo de vezes no cartão.">
          <Input name="max_parcelas" type="number" min={1} max={12} defaultValue={tipo?.max_parcelas ?? 1} />
        </Campo>
      </div>

      {/* ⚠️ Em branco é SEM LIMITE, e zero é esgotado. São coisas diferentes, e
          é por isso que o campo não tem valor padrão: um `0` pré-preenchido
          criaria o tipo já sem nenhum ingresso à venda. */}
      <Campo
        label="Quantidade disponível"
        dica="Em branco = sem limite. Zero = esgotado."
      >
        <Input
          name="quantidade"
          type="number"
          min={0}
          defaultValue={tipo?.quantidade ?? ""}
          placeholder="Sem limite"
        />
      </Campo>

      <div className="form-grid">
        <Campo label="Venda abre em" dica="Em branco: abre junto com o evento.">
          <Input name="venda_inicio" type="datetime-local" defaultValue={tipo?.venda_inicio ?? ""} />
        </Campo>
        <Campo label="Venda fecha em" dica="Em branco: não fecha sozinha.">
          <Input name="venda_fim" type="datetime-local" defaultValue={tipo?.venda_fim ?? ""} />
        </Campo>
      </div>

      <div className="form-grid">
        <Campo label="Idade mínima">
          <Input name="idade_min" type="number" min={0} max={120} defaultValue={tipo?.idade_min ?? ""} />
        </Campo>
        <Campo label="Idade máxima">
          <Input name="idade_max" type="number" min={0} max={120} defaultValue={tipo?.idade_max ?? ""} />
        </Campo>
      </div>

      {/* ⚠️ `principal` é o que sozinho dá entrada no evento; `adicional` só
          existe acompanhando um — jantar, transporte. Um evento sem nenhum
          principal não vende nada, e é isso que a tela avisa na lista. */}
      <Campo
        label="Papel"
        dica="Principal dá entrada sozinho. Adicional só acompanha um principal."
      >
        <Select name="papel" defaultValue={tipo?.papel ?? "principal"}>
          <option value="principal">Principal</option>
          <option value="adicional">Adicional</option>
        </Select>
      </Campo>

      {/* ⚠️ `sni-check` é a classe do sistema, e os rótulos ficam soltos em vez
          de dentro de um `Campo`: `Campo` ENVOLVE o controle com o `<label>`
          para o clique no texto focar o campo, e um label envolvendo três
          caixas não tem qual focar. Cada caixa traz o próprio rótulo. */}
      <label className="sni-check">
        <input type="checkbox" name="unico_por_cpf" defaultChecked={tipo?.unico_por_cpf ?? false} />
        <span>Um por pessoa — o mesmo CPF não compra dois</span>
      </label>
      <label className="sni-check">
        <input type="checkbox" name="exige_principal" defaultChecked={tipo?.exige_principal ?? false} />
        <span>Exige um ingresso principal na mesma compra — só vale para adicional</span>
      </label>
      <label className="sni-check">
        <input
          type="checkbox"
          name="exibir_venda_publica"
          defaultChecked={tipo?.exibir_venda_publica ?? true}
        />
        <span>Aparece na venda pública (desmarque para vender só no balcão)</span>
      </label>
    </>
  );
}
