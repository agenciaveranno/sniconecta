import { Campo, GrupoCampos, Input, Select } from "@/componentes/ui";
import type { PessoaRow, UnidadeRow } from "@/lib/supabase/tipos";

/**
 * Campos da pessoa, um componente só para criar e editar — campo novo nasce
 * nos dois lugares ou em nenhum.
 *
 * Não é cliente: nada aqui muda conforme o que se escolhe. A unidade só
 * aparece no cadastro; mudar de unidade depois é `moverPessoa`, que encerra o
 * vínculo anterior em vez de trocá-lo — o vínculo velho é o que explica em que
 * Associação Local a pessoa estava quando fez o curso do ano passado.
 */
export default function CamposPessoa({
  pessoa,
  unidades,
}: {
  pessoa?: PessoaRow;
  unidades?: Pick<UnidadeRow, "id" | "nome">[];
}) {
  return (
    <>
      {pessoa && <input type="hidden" name="id" value={pessoa.id} />}

      <Campo label="Nome completo" obrigatorio>
        <Input name="nome" defaultValue={pessoa?.nome ?? ""} required maxLength={150} />
      </Campo>

      <Campo
        label="Nome social"
        dica="Preenchido, é ele que aparece na tela, no crachá e no certificado."
      >
        <Input name="nome_social" defaultValue={pessoa?.nome_social ?? ""} maxLength={150} />
      </Campo>

      <div className="sni-form-grid">
        <Campo label="CPF" obrigatorio dica="É ele que identifica a pessoa no sistema inteiro.">
          <Input
            name="cpf"
            defaultValue={pessoa?.cpf ?? ""}
            required
            maxLength={14}
            className="sni-input num"
            inputMode="numeric"
          />
        </Campo>
        <Campo label="CodSNI" dica="Só dígitos. Zeros à esquerda contam.">
          <Input
            name="cod_sni"
            defaultValue={pessoa?.cod_sni ?? ""}
            maxLength={20}
            className="sni-input num"
            inputMode="numeric"
          />
        </Campo>
      </div>

      <div className="sni-form-grid">
        <Campo
          label="E-mail"
          dica="Pode repetir na família — mas só uma pessoa por e-mail consegue ter acesso ao sistema."
        >
          <Input name="email" type="email" defaultValue={pessoa?.email ?? ""} maxLength={150} />
        </Campo>
        <Campo label="Telefone">
          <Input
            name="telefone"
            defaultValue={pessoa?.telefone ?? ""}
            maxLength={20}
            className="sni-input num"
          />
        </Campo>
      </div>

      <div className="sni-form-grid">
        <Campo label="Nascimento">
          <Input name="nascimento" type="date" defaultValue={pessoa?.nascimento ?? ""} />
        </Campo>
        <Campo label="Sexo">
          <Select name="sexo" defaultValue={pessoa?.sexo ?? ""}>
            <option value="">Não informado</option>
            <option value="F">Feminino</option>
            <option value="M">Masculino</option>
            <option value="O">Outro</option>
          </Select>
        </Campo>
      </div>

      {unidades && (
        <Campo
          label="Associação Local"
          dica="Define a Regional e a Organização da pessoa — as três vêm juntas, por aqui."
        >
          <Select name="unidade" defaultValue="">
            <option value="">Definir depois</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Select>
        </Campo>
      )}

      <GrupoCampos titulo="Endereço">
        <div className="sni-form-grid">
          <Campo label="CEP">
            <Input name="cep" defaultValue={pessoa?.cep ?? ""} maxLength={9} className="sni-input num" />
          </Campo>
          <Campo label="Bairro">
            <Input name="bairro" defaultValue={pessoa?.bairro ?? ""} maxLength={80} />
          </Campo>
        </div>
        <div className="sni-form-grid">
          <Campo label="Logradouro">
            <Input name="logradouro" defaultValue={pessoa?.logradouro ?? ""} maxLength={150} />
          </Campo>
          <Campo label="Número">
            <Input name="numero" defaultValue={pessoa?.numero ?? ""} maxLength={20} />
          </Campo>
        </div>
        <div className="sni-form-grid">
          <Campo label="Complemento">
            <Input name="complemento" defaultValue={pessoa?.complemento ?? ""} maxLength={80} />
          </Campo>
          <Campo label="Cidade">
            <Input name="cidade" defaultValue={pessoa?.cidade ?? ""} maxLength={100} />
          </Campo>
        </div>
        <Campo label="UF">
          <Input name="uf" defaultValue={pessoa?.uf ?? ""} maxLength={2} />
        </Campo>
      </GrupoCampos>
    </>
  );
}
