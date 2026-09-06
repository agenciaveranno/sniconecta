"use client";

import { useState } from "react";
import CamposCielo from "@/componentes/CamposCielo";
import { Campo, Input, Select } from "@/componentes/ui";
import type { LocalRow, TipoLocalRow, UnidadeRow } from "@/lib/supabase/tipos";

/**
 * Campos do local, um componente só para criar e editar — pelo mesmo motivo de
 * `CamposUnidade`: campo novo nasce nos dois lugares ou em nenhum.
 *
 * É cliente porque o bloco da Cielo depende do tipo escolhido: só a Academia
 * recebe em conta própria, e mostrar o bloco num salão alugado faria alguém
 * cadastrar ali a conta da Regional.
 */
export default function CamposLocal({
  tipos,
  unidades,
  local,
  cielo,
  podeVerCielo,
}: {
  tipos: TipoLocalRow[];
  unidades: Pick<UnidadeRow, "id" | "nome">[];
  local?: LocalRow;
  cielo?: { merchant_id: string; nome_loja: string; temSegredo: boolean };
  podeVerCielo?: boolean;
}) {
  const [tipo, setTipo] = useState(local?.tipo ?? "");
  const escolhido = tipos.find((t) => t.codigo === tipo);

  return (
    <>
      {local && <input type="hidden" name="id" value={local.id} />}

      <div className="sni-form-grid">
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
        <Campo
          label="Sob a responsabilidade de"
          dica="Deixe em branco quando for de terceiro — hotel ou salão alugado."
        >
          <Select name="unidade" defaultValue={local?.unidade_id ?? ""}>
            <option value="">De terceiro</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      <Campo label="Nome" obrigatorio>
        <Input name="nome" defaultValue={local?.nome ?? ""} required maxLength={150} />
      </Campo>

      <div className="sni-form-grid">
        <Campo label="CEP">
          <Input name="cep" defaultValue={local?.cep ?? ""} maxLength={9} className="sni-input num" />
        </Campo>
        <Campo label="CNPJ" dica="A Academia é filial da Sede Central e tem CNPJ próprio.">
          <Input name="cnpj" defaultValue={local?.cnpj ?? ""} maxLength={18} className="sni-input num" />
        </Campo>
      </div>

      <div className="sni-form-grid">
        <Campo label="Logradouro">
          <Input name="logradouro" defaultValue={local?.logradouro ?? ""} maxLength={150} />
        </Campo>
        <Campo label="Número">
          <Input name="numero" defaultValue={local?.numero ?? ""} maxLength={20} />
        </Campo>
      </div>

      <div className="sni-form-grid">
        <Campo label="Complemento">
          <Input name="complemento" defaultValue={local?.complemento ?? ""} maxLength={80} />
        </Campo>
        <Campo label="Bairro">
          <Input name="bairro" defaultValue={local?.bairro ?? ""} maxLength={80} />
        </Campo>
      </div>

      <div className="sni-form-grid">
        <Campo label="Cidade">
          <Input name="cidade" defaultValue={local?.cidade ?? ""} maxLength={100} />
        </Campo>
        <Campo label="UF">
          <Input name="uf" defaultValue={local?.uf ?? ""} maxLength={2} />
        </Campo>
      </div>

      <div className="sni-form-grid">
        <Campo label="Telefone">
          <Input name="telefone" defaultValue={local?.telefone ?? ""} maxLength={20} className="sni-input num" />
        </Campo>
        <Campo label="E-mail">
          <Input name="email" type="email" defaultValue={local?.email ?? ""} maxLength={150} />
        </Campo>
      </div>

      <div className="sni-form-grid">
        <Campo label="Código" dica="A numeração própria da instituição, se houver.">
          <Input name="codigo" defaultValue={local?.codigo ?? ""} maxLength={30} />
        </Campo>
        <Campo
          label="Endereço na web"
          dica="Letras minúsculas, números e hífen. Depois de publicado, mudar quebra o link."
        >
          <Input
            name="slug"
            defaultValue={local?.slug ?? ""}
            maxLength={150}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
          />
        </Campo>
      </div>

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
