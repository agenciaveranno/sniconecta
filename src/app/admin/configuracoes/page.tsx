import { IconMail } from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import {
  Alerta, Botao, Campo, Card, Input, Recado, Select, TituloPagina, TituloSecao,
} from "@/componentes/ui";
import { exigirCapacidadeNaPagina } from "@/lib/auth";
import { lerCredencial } from "@/lib/credenciais";
import { salvarSmtp } from "./actions";

export const metadata = { title: "Configurações" };

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { erro, ok } = await searchParams;
  await exigirCapacidadeNaPagina("configuracao.gerir");

  const smtp = await lerCredencial("smtp", { instituicao: true });
  const p = smtp?.publico;

  return (
    <Painel titulo="Configurações">
      <TituloPagina
        titulo="Configurações do sistema"
        descricao="O que é decisão da instituição mora aqui, editável em tela. O que é segredo de infraestrutura — chave do banco, chave de cifra — continua em variável de ambiente."
      />

      <Recado
        erro={erro}
        ok={ok && "Servidor de envio guardado. As próximas mensagens da fila saem por ele."}
      />

      <TituloSecao>Envio de e-mail</TituloSecao>

      <Card>
        <p className="hint" style={{ marginBottom: 20, maxWidth: "68ch" }}>
          É por aqui que saem convite, comprovante de compra e certificado.
          Enquanto não estiver preenchido, as mensagens ficam esperando na fila —
          nenhuma se perde, mas nenhuma chega.
        </p>

        <form action={salvarSmtp} className="sni-form">
          <div className="form-grid">
            <Campo label="Servidor" obrigatorio dica="O host SMTP do provedor.">
              <Input name="host" defaultValue={p?.host ?? ""} required maxLength={150} placeholder="smtp.provedor.com.br" />
            </Campo>
            <Campo label="Porta" obrigatorio>
              <Input
                name="porta"
                type="number"
                min={1}
                max={65535}
                defaultValue={p?.porta ?? 587}
                required
                className="num"
              />
            </Campo>
          </div>

          <div className="form-grid">
            <Campo
              label="Segurança"
              dica="465 fala TLS desde o primeiro byte; 587 começa em claro e sobe com STARTTLS. Errar aqui dá conexão encerrada sem explicação."
            >
              <Select name="seguranca" defaultValue={p?.seguranca ?? "starttls"}>
                <option value="starttls">STARTTLS (porta 587)</option>
                <option value="ssl">SSL/TLS (porta 465)</option>
                <option value="nenhuma">Sem criptografia</option>
              </Select>
            </Campo>
            <Campo label="Usuário" obrigatorio>
              <Input name="usuario" defaultValue={p?.usuario ?? ""} required maxLength={150} autoComplete="off" />
            </Campo>
          </div>

          <Campo
            label="Senha"
            dica={
              smtp?.temSegredo
                ? "Já existe uma senha guardada. Deixe em branco para mantê-la; preencha só para trocar."
                : "Fica cifrada no banco e não volta a aparecer nesta tela."
            }
          >
            <Input
              name="senha"
              type="password"
              autoComplete="new-password"
              placeholder={smtp?.temSegredo ? "••••••••  (guardada)" : ""}
              maxLength={200}
            />
          </Campo>

          <div className="form-grid">
            <Campo label="Nome do remetente" obrigatorio dica="Quem a pessoa vê assinando a mensagem.">
              <Input
                name="remetente_nome"
                defaultValue={p?.remetente_nome ?? "SNI Conecta"}
                required
                maxLength={80}
              />
            </Campo>
            <Campo
              label="E-mail do remetente"
              obrigatorio
              dica="Precisa ser de um domínio autorizado a enviar (SPF e DKIM), senão a mensagem cai em spam."
            >
              <Input
                name="remetente_email"
                type="email"
                defaultValue={p?.remetente_email ?? ""}
                required
                maxLength={150}
                placeholder="nao-responda@sniconecta.com.br"
              />
            </Campo>
          </div>

          <div>
            <Botao type="submit" icone={<IconMail size={18} className="ti" />}>
              Guardar servidor de envio
            </Botao>
          </div>
        </form>
      </Card>
    </Painel>
  );
}
