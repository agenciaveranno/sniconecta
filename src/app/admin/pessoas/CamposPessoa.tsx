import { Campo, GrupoCampos, Input, Select, Textarea } from "@/componentes/ui";
import CamposEndereco from "@/componentes/CamposEndereco";
import DocumentoPessoa from "./DocumentoPessoa";
import type { PessoaRow, UnidadeRow } from "@/lib/supabase/tipos";

/**
 * Campos da pessoa, um componente só para criar e editar — campo novo nasce
 * nos dois lugares ou em nenhum.
 *
 * Servidor, tirando dois pedaços: o documento (CPF ou passaporte, decisão
 * 0013) e o endereço (o CEP preenche os irmãos, decisão 0014). Só ali o que se
 * escolhe muda o que aparece.
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

      <GrupoCampos titulo="Identificação">
        <div className="sni-form-grid">
          <Campo label="Nome completo" obrigatorio>
            <Input name="nome" defaultValue={pessoa?.nome ?? ""} required maxLength={150} />
          </Campo>
          <Campo
            label="Nome social"
            dica="Preenchido, é ele que aparece na tela, no crachá e no certificado."
          >
            <Input name="nome_social" defaultValue={pessoa?.nome_social ?? ""} maxLength={150} />
          </Campo>
        </div>

        <DocumentoPessoa cpf={pessoa?.cpf} passaporte={pessoa?.passaporte} />

        <div className="sni-form-grid">
          <Campo label="CodSNI" dica="Só dígitos. Zeros à esquerda contam.">
            <Input
              name="cod_sni"
              defaultValue={pessoa?.cod_sni ?? ""}
              maxLength={20}
              className="sni-input num"
              inputMode="numeric"
            />
          </Campo>
          <Campo
            label="Login"
            dica="Serve para entrar no sistema, além do CPF e do e-mail. Letras, números, ponto, hífen."
          >
            <Input
              name="login"
              defaultValue={pessoa?.login ?? ""}
              maxLength={30}
              autoCapitalize="off"
              spellCheck={false}
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
      </GrupoCampos>

      <GrupoCampos titulo="Contato">
        <div className="sni-form-grid">
          <Campo
            label="E-mail"
            dica="Pode repetir na família — mas só uma pessoa por e-mail consegue ter acesso ao sistema."
          >
            <Input name="email" type="email" defaultValue={pessoa?.email ?? ""} maxLength={150} />
          </Campo>
          <Campo label="Telefone">
            <Input name="telefone" defaultValue={pessoa?.telefone ?? ""} maxLength={20} className="sni-input num" />
          </Campo>
        </div>
        <Campo label="WhatsApp" dica="Se for o mesmo do telefone, repita — é por ele que a fila de mensagens envia.">
          <Input name="telefone2" defaultValue={pessoa?.telefone2 ?? ""} maxLength={20} className="sni-input num" />
        </Campo>
      </GrupoCampos>

      <GrupoCampos titulo="Família">
        <div className="sni-form-grid">
          <Campo label="Nome do pai">
            <Input name="nome_pai" defaultValue={pessoa?.nome_pai ?? ""} maxLength={150} />
          </Campo>
          <Campo label="Nome da mãe">
            <Input name="nome_mae" defaultValue={pessoa?.nome_mae ?? ""} maxLength={150} />
          </Campo>
        </div>
        <div className="sni-form-grid">
          <Campo label="Estado civil">
            <Select name="estado_civil" defaultValue={pessoa?.estado_civil ?? ""}>
              <option value="">Não informado</option>
              <option value="solteiro">Solteiro</option>
              <option value="casado">Casado</option>
              <option value="uniao_estavel">União estável</option>
              <option value="divorciado">Divorciado</option>
              <option value="viuvo">Viúvo</option>
            </Select>
          </Campo>
          <Campo label="Nome do cônjuge">
            <Input name="nome_conjuge" defaultValue={pessoa?.nome_conjuge ?? ""} maxLength={150} />
          </Campo>
        </div>
      </GrupoCampos>

      <GrupoCampos titulo="Na Seicho-No-Ie">
        <div className="sni-form-grid">
          <Campo
            label="Entrada na Seicho-No-Ie"
            dica="Quando a pessoa chegou. Não é a data do cadastro: quem chegou em 1978 tem cadastro de agora."
          >
            <Input name="entrada_sni" type="date" defaultValue={pessoa?.entrada_sni ?? ""} />
          </Campo>
        </div>
        <Campo label="O que a trouxe" dica="Nas palavras dela, se possível. É depoimento, não categoria.">
          <Textarea name="motivo_entrada" defaultValue={pessoa?.motivo_entrada ?? ""} maxLength={2000} rows={3} />
        </Campo>
      </GrupoCampos>

      <GrupoCampos titulo="Vida civil">
        <div className="sni-form-grid">
          <Campo label="Profissão">
            <Input name="profissao" defaultValue={pessoa?.profissao ?? ""} maxLength={120} />
          </Campo>
          <Campo label="Empresa">
            <Input name="empresa" defaultValue={pessoa?.empresa ?? ""} maxLength={150} />
          </Campo>
        </div>
        <Campo label="Formação">
          <Select name="formacao" defaultValue={pessoa?.formacao ?? ""}>
            <option value="">Não informada</option>
            <option value="fundamental">Ensino Fundamental</option>
            <option value="medio">Ensino Médio</option>
            <option value="superior">Ensino Superior</option>
            <option value="pos">Pós-graduação</option>
            <option value="mestrado">Mestrado</option>
            <option value="doutorado">Doutorado</option>
          </Select>
        </Campo>
      </GrupoCampos>

      <GrupoCampos titulo="Endereço">
        <CamposEndereco valores={pessoa} />
      </GrupoCampos>

      {unidades && (
        <GrupoCampos titulo="Onde ela fica">
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
        </GrupoCampos>
      )}

      {pessoa && (
        <GrupoCampos titulo="Falecimento">
          <div className="sni-form-grid">
            <Campo
              label="Data"
              dica="Quem faleceu continua no cadastro: a Missão Sagrada tem categoria de Santo Espiritual."
            >
              <Input name="falecimento" type="date" defaultValue={pessoa.falecimento ?? ""} />
            </Campo>
            <Campo label="Causa">
              <Input name="falecimento_causa" defaultValue={pessoa.falecimento_causa ?? ""} maxLength={200} />
            </Campo>
          </div>
        </GrupoCampos>
      )}
    </>
  );
}
