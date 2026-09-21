import { Campo, Input } from "@/componentes/ui";
import type { CatalogoDaComissao, MembroDaComissao } from "@/modulos/eventos/consultas";

/**
 * Quem trabalha no evento.
 *
 * ⚠️ O NOME é obrigatório e o documento é opcional — não o contrário. A origem
 * gravava só o nome, e parte da comissão de um evento antigo é gente que nunca
 * teve cadastro. Exigir o vínculo faria a tela recusar o que já está no banco,
 * e a conciliação — que é o trabalho de verdade — nunca começaria.
 *
 * ⚠️ Setor e função são `datalist`, não `select` fechado. O catálogo tem 10
 * setores e 34 funções, mas o que veio da carga é texto solto que pode não
 * casar com nenhum: um seletor fechado obrigaria a escolher outro valor para
 * salvar qualquer coisa, e a correção viraria perda do que estava lá.
 */
export default function CamposMembro({
  eventoId,
  membro,
  catalogo,
}: {
  eventoId: number;
  membro?: MembroDaComissao;
  catalogo: CatalogoDaComissao;
}) {
  return (
    <>
      <input type="hidden" name="evento_id" value={eventoId} />
      {membro && <input type="hidden" name="id" value={membro.id} />}

      <Campo label="Nome" obrigatorio>
        <Input name="nome" defaultValue={membro?.nome ?? ""} required maxLength={200} />
      </Campo>

      <Campo
        label="CPF ou passaporte"
        dica="Opcional. Preenchido, liga esta pessoa ao cadastro. Em branco, desfaz o vínculo."
      >
        <Input
          name="documento"
          defaultValue={membro?.documento ?? ""}
          maxLength={20}
          placeholder="000.000.000-00"
        />
      </Campo>

      <div className="form-grid">
        <Campo label="Setor" dica="Escolha do catálogo ou escreva.">
          <Input name="setor" defaultValue={membro?.setor ?? ""} list="setores-comissao" maxLength={120} />
        </Campo>
        <Campo label="Função" dica="Escolha do catálogo ou escreva.">
          <Input name="funcao" defaultValue={membro?.funcao ?? ""} list="funcoes-comissao" maxLength={120} />
        </Campo>
      </div>

      <datalist id="setores-comissao">
        {catalogo.setores.map((s) => (
          <option key={s.id} value={s.nome} />
        ))}
      </datalist>
      <datalist id="funcoes-comissao">
        {catalogo.funcoes.map((f) => (
          <option key={f.id} value={f.nome}>
            {f.setor ?? ""}
          </option>
        ))}
      </datalist>
    </>
  );
}
