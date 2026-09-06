import { Campo, GrupoCampos, Input } from "@/componentes/ui";

/**
 * Conta Cielo da entidade.
 *
 * Cada Organização, cada Regional e cada Academia recebe na SUA conta — o
 * dinheiro do ingresso cai em quem promove o evento, não numa conta central.
 * Por isso os dados moram no cadastro da entidade, e não numa tela de
 * configuração à parte: quem cria a Regional já cadastra por onde ela recebe.
 *
 * ⚠️ A Merchant Key nunca volta para a tela. Deixar em branco mantém a que já
 * está gravada; quem quiser trocar digita a nova. Se aparecesse preenchida,
 * bastaria abrir o modal com o DevTools ligado para lê-la.
 */
export default function CamposCielo({
  merchantId,
  nomeLoja,
  temChave,
}: {
  merchantId?: string;
  nomeLoja?: string;
  temChave?: boolean;
}) {
  return (
    <GrupoCampos
      titulo="Conta Cielo"
      descricao="Onde entra o dinheiro dos ingressos vendidos por esta entidade. Sem conta cadastrada, ela não vende — só recebe inscrição gratuita."
    >
      <div className="sni-form-grid">
        <Campo label="Merchant ID" dica="O identificador da loja, no painel da Cielo.">
          <Input name="cielo_merchant_id" defaultValue={merchantId ?? ""} maxLength={80} />
        </Campo>
        <Campo label="Nome da loja" dica="Como aparece na fatura de quem compra.">
          <Input name="cielo_nome_loja" defaultValue={nomeLoja ?? ""} maxLength={120} />
        </Campo>
      </div>
      <Campo
        label="Merchant Key"
        dica={
          temChave
            ? "Já existe uma chave guardada. Deixe em branco para mantê-la; preencha só para trocar."
            : "A chave secreta da conta. Fica cifrada no banco e não volta a aparecer nesta tela."
        }
      >
        <Input
          name="cielo_merchant_key"
          type="password"
          autoComplete="off"
          placeholder={temChave ? "••••••••  (guardada)" : ""}
          maxLength={200}
        />
      </Campo>
    </GrupoCampos>
  );
}
