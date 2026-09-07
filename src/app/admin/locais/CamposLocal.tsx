"use client";

import { useState } from "react";
import CamposCielo from "@/componentes/CamposCielo";
import CamposContato from "@/componentes/CamposContato";
import CamposEndereco from "@/componentes/CamposEndereco";
import CampoMascarado from "@/componentes/CampoMascarado";
import { Campo, CampoChave, GrupoCampos, Input, Select } from "@/componentes/ui";
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

  /**
   * ⚠️ Próprio da instituição ou de terceiro — e isso MUDA O QUE SE PEDE. O
   * local próprio é filial da Sede e tem CNPJ com a mesma raiz; um hotel tem
   * CNPJ de outra empresa, e o gatilho do banco recusaria se ele fosse marcado
   * como nosso. Do outro lado, salão alugado tem contato e diária, que não
   * fazem sentido numa Academia.
   */
  const [proprio, setProprio] = useState(local?.proprio ?? true);

  return (
    <>
      {local && <input type="hidden" name="id" value={local.id} />}

      <div className="form-grid">
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
            {/* ⚠️ A unidade ATUAL entra mesmo desativada. A lista traz só as
                ativas; um local cuja unidade responsável foi desativada abria
                o `<select>` em "De terceiro" — e salvar o endereço APAGAVA o
                responsável, transformando um imóvel da instituição em imóvel
                alugado sem ninguém decidir isso. */}
            {local?.unidade_id && !unidades.some((u) => u.id === local.unidade_id) && (
              <option value={local.unidade_id}>Unidade desativada — a revisar</option>
            )}
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

      <CampoChave
        rotulo="Próprio da SEICHO-NO-IE DO BRASIL"
        dica="Desmarcado, é local de terceiro — hotel, salão alugado — e o cadastro pede contato e diária em vez de CNPJ de filial."
        ligado={proprio}
        onClick={() => setProprio((v) => !v)}
      />
      <input type="hidden" name="proprio" value={proprio ? "1" : "0"} />

      <div className="form-grid">
        <Campo label="Capacidade" dica="Quantas pessoas cabem. Ajuda a escolher o local do evento.">
          <Input
            name="capacidade"
            type="number"
            min={1}
            defaultValue={local?.capacidade ?? ""}
            className="num"
          />
        </Campo>
        <Campo
          label="CNPJ"
          dica={
            proprio
              ? "Filial da Sede Central: a raiz tem de ser a mesma."
              : "CNPJ da empresa dona do local. Pode ser de qualquer raiz."
          }
        >
          <CampoMascarado tipo="cnpj" name="cnpj" defaultValue={local?.cnpj} />
        </Campo>
      </div>

      {/* Contato e diária só no que NÃO é nosso: numa Academia não há com quem
          negociar nem o que pagar. */}
      {!proprio && (
        <GrupoCampos titulo="Contratação">
          <div className="form-grid">
            <Campo label="Quem atende">
              <Input name="contato_nome" defaultValue={local?.contato_nome ?? ""} maxLength={150} />
            </Campo>
            <Campo label="Telefone de quem atende">
              <Input
                name="contato_telefone"
                defaultValue={local?.contato_telefone ?? ""}
                maxLength={20}
                className="num"
              />
            </Campo>
          </div>
          <Campo label="Diária" dica="Em reais. Serve de referência para orçar o evento.">
            <Input
              name="diaria"
              type="number"
              min={0}
              step="0.01"
              defaultValue={local?.diaria_centavos != null ? (local.diaria_centavos / 100).toFixed(2) : ""}
              className="num"
            />
          </Campo>
        </GrupoCampos>
      )}

      <GrupoCampos titulo="Endereço">
        <CamposEndereco valores={local} />
      </GrupoCampos>

      <CamposContato valores={local} />

      <div className="form-grid">
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
