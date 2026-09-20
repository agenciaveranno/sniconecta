import { Campo, GrupoCampos, Input, Select, Textarea } from "@/componentes/ui";
import { TIPOS_CONTA, type ContaBancaria } from "@/lib/contas";

/**
 * Campos de uma conta bancária. O mesmo bloco no modal de criar e no de
 * editar — campo novo nasce nos dois ou em nenhum.
 *
 * ⚠️ NENHUM campo aqui é senha, e isso é de propósito: o que esta tela guarda
 * é a IDENTIFICAÇÃO da conta — agência, número, titular. A credencial da
 * operadora (Merchant Key) vive cifrada em `credenciais`, noutro formulário.
 * Um `type="password"` no meio deste cadastro faria o navegador tratá-lo como
 * tela de login e preencher o resto sozinho (decisão 0019).
 */
export default function CamposConta({
  unidadeId,
  conta,
}: {
  unidadeId: string;
  conta?: ContaBancaria;
}) {
  return (
    <>
      <input type="hidden" name="unidade" value={unidadeId} />
      {conta && <input type="hidden" name="id" value={conta.id} />}

      <div className="form-grid">
        <Campo
          label="Apelido"
          obrigatorio
          dica="Como esta conta aparece nas listas — “Conta principal”, “Livraria”."
        >
          <Input name="apelido" defaultValue={conta?.apelido ?? ""} required maxLength={80} />
        </Campo>
        <Campo label="Tipo">
          <Select name="tipo" defaultValue={conta?.tipo ?? "corrente"}>
            {TIPOS_CONTA.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.nome}
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      <GrupoCampos titulo="No banco">
        <div className="form-grid">
          {/* ⚠️ Três dígitos. Quem digita "1" para o Banco do Brasil está certo
              na intenção: o servidor completa com zero à esquerda, porque todo
              arquivo bancário do país espera "001". */}
          <Campo label="Código do banco">
            <Input
              name="banco_codigo"
              defaultValue={conta?.banco_codigo ?? ""}
              maxLength={3}
              className="num"
              inputMode="numeric"
              placeholder="001"
            />
          </Campo>
          <Campo label="Nome do banco">
            <Input name="banco_nome" defaultValue={conta?.banco_nome ?? ""} maxLength={80} />
          </Campo>
        </div>
        <div className="form-grid">
          <Campo label="Agência">
            <Input name="agencia" defaultValue={conta?.agencia ?? ""} maxLength={10} className="num" />
          </Campo>
          <Campo label="Dígito da agência">
            <Input name="agencia_dv" defaultValue={conta?.agencia_dv ?? ""} maxLength={2} className="num" />
          </Campo>
        </div>
        <div className="form-grid">
          <Campo label="Conta">
            <Input name="conta" defaultValue={conta?.conta ?? ""} maxLength={20} className="num" />
          </Campo>
          <Campo label="Dígito da conta">
            <Input name="conta_dv" defaultValue={conta?.conta_dv ?? ""} maxLength={2} className="num" />
          </Campo>
        </div>
      </GrupoCampos>

      <GrupoCampos
        titulo="Titular"
        descricao="Quem consta como dono da conta no banco. Em geral a própria entidade, pelo CNPJ dela."
      >
        <div className="form-grid">
          <Campo label="Nome do titular">
            <Input name="titular" defaultValue={conta?.titular ?? ""} maxLength={150} />
          </Campo>
          <Campo label="CPF ou CNPJ do titular">
            <Input
              name="titular_documento"
              defaultValue={conta?.titular_documento ?? ""}
              maxLength={18}
              className="num"
            />
          </Campo>
        </div>
      </GrupoCampos>

      <Campo label="Observações">
        <Textarea name="observacoes" defaultValue={conta?.observacoes ?? ""} maxLength={500} />
      </Campo>
    </>
  );
}
