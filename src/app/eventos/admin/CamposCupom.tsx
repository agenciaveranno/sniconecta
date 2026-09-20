import { Campo, Input, Select, Textarea } from "@/componentes/ui";
import type { CupomDoEvento } from "@/modulos/eventos/consultas";

/**
 * Os campos do cupom, no modal de criar e no de editar.
 *
 * ⚠️ O campo "Desconto" muda de significado com o tipo: percentual é um
 * inteiro de 0 a 100, valor é dinheiro em reais. O rótulo diz qual é, porque
 * um "10" num cupom de dez reais gravado como percentual daria 10% — e o erro
 * só apareceria na primeira venda.
 */
export default function CamposCupom({
  eventoId,
  cupom,
  tipos,
}: {
  eventoId: number;
  cupom?: CupomDoEvento;
  tipos: { id: number; nome: string }[];
}) {
  return (
    <>
      <input type="hidden" name="evento_id" value={eventoId} />
      {cupom && <input type="hidden" name="id" value={cupom.id} />}

      <Campo
        label="Código"
        obrigatorio
        dica="O que a pessoa digita. Não distingue maiúscula de minúscula."
      >
        <Input
          name="codigo"
          defaultValue={cupom?.codigo ?? ""}
          required
          maxLength={40}
          placeholder="VERAO10"
          style={{ textTransform: "uppercase" }}
        />
      </Campo>

      <Campo label="Descrição" dica="Para quem administra — não aparece na compra.">
        <Textarea name="descricao" defaultValue={cupom?.descricao ?? ""} rows={2} maxLength={300} />
      </Campo>

      <div className="form-grid">
        <Campo label="Tipo de desconto" obrigatorio>
          <Select name="tipo" defaultValue={cupom?.tipo ?? "percentual"} required>
            <option value="percentual">Percentual (%)</option>
            <option value="valor">Valor em reais</option>
          </Select>
        </Campo>
        <Campo
          label="Desconto"
          obrigatorio
          dica="Percentual: 0 a 100. Valor: em reais."
        >
          <Input
            name="valor"
            inputMode="decimal"
            required
            defaultValue={
              cupom
                ? cupom.tipo === "percentual"
                  ? String(cupom.valor)
                  : (cupom.valor / 100).toFixed(2).replace(".", ",")
                : ""
            }
            placeholder="10"
          />
        </Campo>
      </div>

      {/* ⚠️ Preso a um tipo, o cupom desconta SÓ aquele tipo — não o carrinho.
          Sem isso, a "meia entrada" de 50% pagaria metade do jantar de quem
          somasse os dois no mesmo pedido. */}
      <Campo
        label="Vale para"
        dica="Preso a um ingresso, desconta só ele — nunca o carrinho inteiro."
      >
        <Select name="ingresso_tipo_id" defaultValue={cupom?.ingresso_tipo_id ?? ""}>
          <option value="">Qualquer ingresso do evento</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </Select>
      </Campo>

      <div className="form-grid">
        <Campo label="Usos no total" dica="Em branco = sem limite.">
          <Input
            name="max_usos_total"
            type="number"
            min={0}
            defaultValue={cupom?.max_usos_total ?? ""}
            placeholder="Sem limite"
          />
        </Campo>
        <Campo label="Usos por pessoa" dica="Em branco = sem limite.">
          <Input
            name="max_usos_por_cpf"
            type="number"
            min={0}
            defaultValue={cupom?.max_usos_por_cpf ?? ""}
            placeholder="Sem limite"
          />
        </Campo>
      </div>

      <div className="form-grid">
        <Campo label="Vale a partir de" dica="Em branco: vale desde já.">
          <Input name="vigencia_inicio" type="datetime-local" defaultValue={cupom?.vigencia_inicio ?? ""} />
        </Campo>
        <Campo label="Vale até" dica="Em branco: não vence.">
          <Input name="vigencia_fim" type="datetime-local" defaultValue={cupom?.vigencia_fim ?? ""} />
        </Campo>
      </div>
    </>
  );
}
