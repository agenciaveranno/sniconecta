"use client";

import { useState } from "react";
import CamposCielo from "@/componentes/CamposCielo";
import { Campo, Input, Select } from "@/componentes/ui";
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
export default function CamposUnidade({
  tipos,
  unidades,
  organizacoes,
  unidade,
  cielo,
  podeVerCielo,
}: {
  tipos: TipoUnidadeRow[];
  unidades: Pick<UnidadeRow, "id" | "nome" | "tipo">[];
  organizacoes: OrganizacaoRow[];
  unidade?: UnidadeRow;
  /** Parte pública da conta já cadastrada. A chave secreta nunca chega aqui. */
  cielo?: { merchant_id: string; nome_loja: string; temSegredo: boolean };
  podeVerCielo?: boolean;
}) {
  const [tipo, setTipo] = useState(unidade?.tipo ?? "");
  const escolhido = tipos.find((t) => t.codigo === tipo);

  const permitidos = escolhido?.pais_permitidos ?? [];
  const superiores = unidades.filter(
    (u) => u.id !== unidade?.id && permitidos.includes(u.tipo)
  );
  const nomeDoTipo = new Map(tipos.map((t) => [t.codigo, t.nome]));

  return (
    <>
      {unidade && <input type="hidden" name="id" value={unidade.id} />}

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

      {/* Sem tipo escolhido não há o que oferecer: as opções mudam conforme
          ele, e uma lista com tudo convidaria ao erro. */}
      {escolhido && permitidos.length > 0 && (
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
      {escolhido && permitidos.length === 0 && (
        <input type="hidden" name="pai" value="" />
      )}

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
            {organizacoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Select>
        </Campo>
      )}

      <Campo label="Nome" obrigatorio>
        <Input name="nome" defaultValue={unidade?.nome ?? ""} required maxLength={150} />
      </Campo>

      <div className="sni-form-grid">
        <Campo
          label="Idioma das atividades"
          dica="Decide em que língua esta unidade recebe convite, comprovante e certificado."
        >
          <Select name="idioma" defaultValue={unidade?.idioma ?? "pt-BR"}>
            <option value="pt-BR">Português</option>
            <option value="ja">Japonês</option>
          </Select>
        </Campo>
        <Campo label="CNPJ" dica="A Regional é filial da Sede Central e tem CNPJ próprio.">
          <Input name="cnpj" defaultValue={unidade?.cnpj ?? ""} maxLength={18} />
        </Campo>
      </div>

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

      {/* Só o tipo que recebe em conta própria mostra o bloco — e só para quem
          administra configuração. Quem cadastra a estrutura não precisa
          enxergar por onde entra o dinheiro. */}
      {podeVerCielo && escolhido?.aceita_conta_cielo && (
        <CamposCielo
          merchantId={cielo?.merchant_id}
          nomeLoja={cielo?.nome_loja}
          temChave={cielo?.temSegredo}
        />
      )}
    </>
  );
}
