import {
  IconAlertCircle,
  IconCircleCheck,
  IconIdBadge2,
  IconLock,
  IconMapPin,
  IconShieldCheck,
} from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import {
  Alerta, Badge, Botao, Campo, Card, CardCabecalho, Input, Num, Recado, TituloPagina, TituloSecao,
} from "@/componentes/ui";
import { pessoaAtual } from "@/lib/auth";
import { NOME_PAPEL, type TipoPapel } from "@/lib/permissoes";
import { formatarCpf } from "@/lib/dominio/cpf";
import { formatarPassaporte } from "@/lib/dominio/passaporte";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { PessoaRow, UnidadeRow, VinculoAtualRow } from "@/lib/supabase/tipos";
import { redirect } from "next/navigation";
import { trocarMinhaSenha } from "./actions";

export const metadata = { title: "Minha conta" };

/**
 * A própria pessoa, sem depender de operador.
 *
 * ⚠️ Não exige capacidade nenhuma, de propósito: toda pessoa que consegue
 * entrar precisa poder trocar a própria senha. Exigir `acesso.gerir` faria a
 * única saída para uma senha vazada ser pedir a outra pessoa — que teria de
 * DEFINIR a senha por ela, e passar a conhecê-la.
 */
export default async function MinhaContaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { erro, ok } = await searchParams;
  const eu = await pessoaAtual();
  if (!eu) redirect("/login");

  const supabase = await criarClienteServidor();

  // ⚠️ As três JUNTAS. As unidades dos papéis já vêm da sessão, não do
  // resultado das outras duas, então nada aqui precisa esperar nada — e em
  // série cada consulta somava sua ida e volta ao banco no tempo de tela em
  // branco.
  const unidadesDosPapeis = eu.papeis.map((p) => p.unidadeId).filter((x): x is string => !!x);
  const [rPessoa, rVinculo, rUnidades] = await Promise.all([
    supabase.from("pessoas").select("*").eq("id", eu.id).maybeSingle(),
    supabase.from("pessoa_vinculo_atual").select("*").eq("pessoa_id", eu.id).maybeSingle(),
    unidadesDosPapeis.length
      ? supabase.from("unidades").select("id, nome").in("id", unidadesDosPapeis)
      : Promise.resolve({ data: [] }),
  ]);

  const pessoa = rPessoa.data as PessoaRow | null;
  const vinculo = rVinculo.data as VinculoAtualRow | null;
  const unidades = rUnidades.data;
  const nomeUnidade = new Map(
    ((unidades ?? []) as Pick<UnidadeRow, "id" | "nome">[]).map((u) => [u.id, u.nome])
  );

  return (
    <Painel titulo="Minha conta">
      <TituloPagina
        titulo="Minha conta"
        descricao="Seus dados, onde você está na instituição e o que o sistema deixa você fazer."
      />

      <Recado erro={erro} ok={ok} />

      <TituloSecao>Quem você é</TituloSecao>
      <Card>
        <CardCabecalho
          icone={<IconIdBadge2 size={20} className="ti" />}
          titulo={pessoa?.nome_social || eu.nome}
        />
        <dl className="sni-dados">
          <div>
            {/* O rótulo segue o documento: chamar de "CPF" o passaporte de
                quem é estrangeiro seria a tela mentindo o nome do que mostra. */}
            <dt>{pessoa && !pessoa.cpf ? "Passaporte" : "CPF"}</dt>
            <dd>
              <Num>
                {!pessoa
                  ? "—"
                  : pessoa.cpf
                    ? formatarCpf(pessoa.cpf)
                    : formatarPassaporte(pessoa.passaporte)}
              </Num>
            </dd>
          </div>
          <div>
            <dt>CodSNI</dt>
            <dd>{pessoa?.cod_sni ? <Num>{pessoa.cod_sni}</Num> : "—"}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>{eu.email ?? "—"}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{pessoa?.telefone ? <Num>{pessoa.telefone}</Num> : "—"}</dd>
          </div>
        </dl>
        {/* Quem corrige o cadastro é quem administra pessoas: o CPF identifica
            no sistema inteiro, e uma correção errada aqui espalharia por todos
            os módulos de uma vez. */}
        <p className="hint" style={{ marginTop: 16 }}>
          Algum dado errado? Quem administra pessoas corrige — o CPF identifica você
          no sistema inteiro, e a correção precisa passar por quem responde por ela.
        </p>
      </Card>

      <TituloSecao>Onde você está</TituloSecao>
      <Card>
        <CardCabecalho
          icone={<IconMapPin size={20} className="ti" />}
          titulo={vinculo?.unidade_nome ?? "Sem vínculo registrado"}
        />
        {vinculo ? (
          <dl className="sni-dados">
            <div>
              <dt>Organização</dt>
              <dd>{vinculo.organizacao_nome ?? "—"}</dd>
            </div>
            <div>
              <dt>Desde</dt>
              <dd>
                <Num>{new Date(vinculo.data_inicio).toLocaleDateString("pt-BR")}</Num>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="hint">
            Você ainda não foi vinculado a uma Associação Local. É esse vínculo que
            define sua Regional e sua Organização.
          </p>
        )}
      </Card>

      <TituloSecao>O que você pode fazer</TituloSecao>
      <Card>
        <CardCabecalho icone={<IconShieldCheck size={20} className="ti" />} titulo={eu.rotuloPapel} />
        {eu.papeis.length === 0 ? (
          <p className="hint">
            Você entra no sistema, mas ainda não tem papel nenhum — por isso as telas
            aparecem vazias. Quem administra os papéis concede o seu.
          </p>
        ) : (
          <>
            <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
              {eu.papeis.map((p, i) => (
                <Badge key={i} tom={p.unidadeId ? "gray" : "blue"}>
                  {NOME_PAPEL[p.tipo as TipoPapel] ?? p.tipo}
                  {p.unidadeId ? ` · ${nomeUnidade.get(p.unidadeId) ?? "?"}` : " · nacional"}
                </Badge>
              ))}
            </span>
            <p className="hint" style={{ marginTop: 12 }}>
              Papel concedido numa unidade vale também nas unidades abaixo dela.
            </p>
          </>
        )}
      </Card>

      <TituloSecao>Trocar minha senha</TituloSecao>
      <Card>
        <p className="hint" style={{ marginBottom: 20, maxWidth: "68ch" }}>
          A senha atual é pedida porque a sessão pode estar aberta num computador
          emprestado. Sem ela, quem passasse por uma tela destrancada tomaria a conta.
        </p>
        <form action={trocarMinhaSenha} style={{ display: "grid", gap: 16, maxWidth: 420 }}>
          <Campo label="Senha atual" obrigatorio>
            <Input name="atual" type="password" autoComplete="current-password" required />
          </Campo>
          <Campo label="Senha nova" obrigatorio dica="Ao menos 8 caracteres, e nada previsível.">
            <Input name="nova" type="password" autoComplete="new-password" minLength={8} required />
          </Campo>
          <Campo label="Repita a senha nova" obrigatorio>
            <Input name="confirmacao" type="password" autoComplete="new-password" required />
          </Campo>
          <div>
            <Botao type="submit" icone={<IconLock size={18} className="ti" />}>
              Trocar senha
            </Botao>
          </div>
        </form>
      </Card>
    </Painel>
  );
}
