"use client";

import { useState } from "react";
import CamposContato from "@/componentes/CamposContato";
import CamposEndereco from "@/componentes/CamposEndereco";
import CampoMascarado from "@/componentes/CampoMascarado";
import { Campo, GrupoCampos, Input, Select } from "@/componentes/ui";
import type { OrganizacaoRow, TipoUnidadeRow, UnidadeRow } from "@/lib/supabase/tipos";

/**
 * Campos da unidade, um componente só para o modal de criar e o de editar.
 *
 * Extraído justamente para as duas telas nunca divergirem: quando o cadastro
 * ganha um campo, ele nasce nos dois lugares ou em nenhum.
 *
 * É cliente porque dois campos dependem do tipo escolhido: a lista de
 * unidades superiores e a organização. Deixar os dois sempre visíveis faria a
 * pessoa escolher uma organização para um Núcleo — que não tem — e só
 * descobrir no erro ao salvar.
 */
function permitidosDe(t?: TipoUnidadeRow): string[] {
  return t?.pais_permitidos ?? [];
}

export default function CamposUnidade({
  tipos,
  unidades,
  organizacoes,
  unidade,
  tipoFixo,
}: {
  tipos: TipoUnidadeRow[];
  unidades: Pick<UnidadeRow, "id" | "nome" | "tipo">[];
  organizacoes: OrganizacaoRow[];
  unidade?: UnidadeRow;
  /**
   * A tela já sabe o tipo — é a de Regionais, a de Núcleos ou a de ALs. Some
   * o seletor: perguntar "que tipo?" na tela chamada "Nova Regional" é
   * oferecer à pessoa a chance de responder errado.
   */
  tipoFixo?: string;
}) {
  const [tipo, setTipo] = useState(unidade?.tipo ?? tipoFixo ?? "");
  const escolhido = tipos.find((t) => t.codigo === tipo);

  /**
   * ⚠️ A REGIONAL NÃO PERGUNTA ONDE FICA. Toda Regional é da Sede Central, por
   * definição da instituição — não há segunda resposta possível. Um seletor
   * com uma opção só é uma pergunta cuja única serventia é poder ser
   * respondida errada, ou esquecida. Quem preenche é o servidor.
   */
  const escolhePai = escolhido !== undefined
    && permitidosDe(escolhido).length > 0
    && escolhido.codigo !== "regional";

  const permitidos = permitidosDe(escolhido);
  const superiores = unidades.filter(
    (u) => u.id !== unidade?.id && permitidos.includes(u.tipo)
  );
  const nomeDoTipo = new Map(tipos.map((t) => [t.codigo, t.nome]));

  return (
    <>
      {unidade && <input type="hidden" name="id" value={unidade.id} />}

      {tipoFixo ? (
        <input type="hidden" name="tipo" value={tipoFixo} />
      ) : (
        <Campo label="Tipo" obrigatorio>
          <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} required>
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
      )}

      {/* Sem tipo escolhido não há o que oferecer: as opções mudam conforme
          ele, e uma lista com tudo convidaria ao erro. */}
      {escolhePai && (
        <Campo
          label="Dentro de"
          obrigatorio
          dica={`Só ${permitidos.map((p) => nomeDoTipo.get(p) ?? p).join(" ou ")} pode receber ${escolhido.nome.toLowerCase()}.`}
        >
          <Select name="pai" defaultValue={unidade?.pai_id ?? ""} required>
            <option value="" disabled>
              Escolha…
            </option>
            {superiores.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Select>
        </Campo>
      )}
      {/* Sem seletor, o pai vem do servidor: a Sede Central para a Regional,
          nada para a própria Sede. */}
      {escolhido && !escolhePai && <input type="hidden" name="pai" value="" />}

      {escolhido?.exige_organizacao && (
        <Campo
          label="Organização"
          obrigatorio
          dica="O Núcleo não tem organização: ele é justamente a união de Associações Locais de organizações diferentes no mesmo endereço."
        >
          <Select name="organizacao" defaultValue={unidade?.organizacao_id ?? ""} required>
            <option value="" disabled>
              Escolha…
            </option>
            {/* ⚠️ Quem FILTRA é aqui, não a consulta. A lista de escolha é de
                ORGANIZAÇÕES doutrinárias — `e_organizacao` —, não dos
                Departamentos administrativos da Sede. Mas as Associações Locais
                que a carga pendurou na "Indefinida" apontam para uma que não
                está na lista: filtrando na consulta, o `<select>` abria já na
                primeira opção e salvar o TELEFONE reassinalava a Associação
                Local para outra Organização — apagando a marca de dívida que a
                migração deixou de pé justamente para ser revisada.

                A opção atual entra marcada como pendência, e some assim que
                alguém escolher uma de verdade. */}
            {organizacoes
              .filter((o) => o.e_organizacao || o.id === unidade?.organizacao_id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                  {o.e_organizacao ? "" : " — a revisar"}
                </option>
              ))}
          </Select>
        </Campo>
      )}

      {/* O código da instituição vem ANTES do nome: é por ele que a Sede
          identifica a unidade nos sistemas antigos, e quem confere um cadastro
          confere o código primeiro. */}
      <div className="form-grid">
        <Campo label="Código">
          <Input name="codigo" defaultValue={unidade?.codigo ?? ""} maxLength={30} />
        </Campo>
        <Campo label="Nome" obrigatorio>
          <Input name="nome" defaultValue={unidade?.nome ?? ""} required maxLength={150} />
        </Campo>
      </div>

      <div className="form-grid">
        <Campo label="Idioma das atividades">
          <Select name="idioma" defaultValue={unidade?.idioma ?? "pt-BR"}>
            <option value="pt-BR">Português</option>
            <option value="ja">Japonês</option>
          </Select>
        </Campo>
        <Campo label="CNPJ">
          <CampoMascarado tipo="cnpj" name="cnpj" defaultValue={unidade?.cnpj} />
        </Campo>
      </div>

      <GrupoCampos titulo="Endereço">
        <CamposEndereco valores={unidade} />
      </GrupoCampos>

      <CamposContato valores={unidade} />

      <Campo label="Endereço na web">
        <Input
          name="slug"
          defaultValue={unidade?.slug ?? ""}
          maxLength={150}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
        />
      </Campo>
    </>
  );
}
