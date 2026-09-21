import { Campo, Input, Textarea } from "@/componentes/ui";
import { formatarCentavos } from "@/lib/dominio/dinheiro";
import type { ComboDoEvento, TipoDeIngresso } from "@/modulos/eventos/consultas";

/**
 * Os campos do combo, no modal de criar e no de editar.
 *
 * ⚠️ A composição é UM CAMPO POR TIPO DE INGRESSO do evento, com quantidade —
 * o mesmo formato do carrinho do balcão. Zero significa "não entra". Uma lista
 * de "adicionar item" com seletor obrigaria a abrir, escolher e confirmar uma
 * vez por ingresso, e o combo tem dois ou três.
 */
export default function CamposCombo({
  eventoId,
  combo,
  tipos,
}: {
  eventoId: number;
  combo?: ComboDoEvento;
  tipos: TipoDeIngresso[];
}) {
  const quantidadeDe = (tipoId: number) =>
    combo?.itens.find((i) => i.ingresso_tipo_id === tipoId)?.quantidade ?? 0;

  return (
    <>
      <input type="hidden" name="evento_id" value={eventoId} />
      {combo && <input type="hidden" name="id" value={combo.id} />}

      <Campo label="Nome" obrigatorio>
        <Input
          name="nome"
          defaultValue={combo?.nome ?? ""}
          required
          maxLength={120}
          placeholder="Pacote completo, Fim de semana…"
        />
      </Campo>

      <Campo label="Descrição" dica="Aparece na tela de compra.">
        <Textarea name="descricao" defaultValue={combo?.descricao ?? ""} rows={2} maxLength={500} />
      </Campo>

      <div className="form-grid">
        <Campo label="Preço do combo" obrigatorio dica="Em reais. É este o valor cobrado.">
          <Input
            name="valor"
            inputMode="decimal"
            required
            defaultValue={combo ? (combo.valor_centavos / 100).toFixed(2).replace(".", ",") : ""}
            placeholder="0,00"
          />
        </Campo>
        <Campo label="Parcelas" dica="Máximo de vezes no cartão.">
          <Input
            name="max_parcelas"
            type="number"
            min={1}
            max={12}
            defaultValue={combo?.max_parcelas ?? 1}
          />
        </Campo>
      </div>

      <div className="form-grid">
        <Campo label="Quantidade disponível" dica="Em branco = sem limite.">
          <Input
            name="quantidade"
            type="number"
            min={0}
            defaultValue={combo?.quantidade ?? ""}
            placeholder="Sem limite"
          />
        </Campo>
        <Campo label="Limite por pessoa" dica="Em branco = sem limite.">
          <Input
            name="limite_por_cpf"
            type="number"
            min={0}
            defaultValue={combo?.limite_por_cpf ?? ""}
            placeholder="Sem limite"
          />
        </Campo>
      </div>

      <div className="form-grid">
        <Campo label="Venda abre em" dica="Em branco: abre com o evento.">
          <Input name="venda_inicio" type="datetime-local" defaultValue={combo?.venda_inicio ?? ""} />
        </Campo>
        <Campo label="Venda fecha em" dica="Em branco: não fecha sozinha.">
          <Input name="venda_fim" type="datetime-local" defaultValue={combo?.venda_fim ?? ""} />
        </Campo>
      </div>

      <fieldset className="sni-grupo-campos">
        <legend className="sni-grupo-campos-legenda">O que o combo entrega</legend>
        <p className="hint sni-grupo-campos-apoio">
          Quantos ingressos de cada tipo. Zero deixa o tipo de fora. Combo sem
          nenhum item é um preço que não entrega nada.
        </p>
        {tipos.map((t) => (
          <Campo
            key={t.id}
            label={t.nome}
            dica={`${formatarCentavos(t.valor_centavos)} avulso`}
          >
            <Input
              name={`item_${t.id}`}
              type="number"
              min={0}
              max={20}
              defaultValue={quantidadeDe(t.id)}
              style={{ width: 90 }}
            />
          </Campo>
        ))}
      </fieldset>
    </>
  );
}
