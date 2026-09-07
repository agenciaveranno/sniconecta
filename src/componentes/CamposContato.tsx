import { Campo, GrupoCampos, Input } from "@/componentes/ui";

/**
 * Telefone, WhatsApp e redes. O mesmo bloco na Sede, na Regional, na
 * Associação Local e no local de evento — campo novo nasce nos quatro ou em
 * nenhum.
 *
 * ⚠️ WhatsApp é campo PRÓPRIO. Na maioria das unidades o fixo atende e o
 * celular responde: são números diferentes, e juntá-los faria a fila de
 * mensagens mandar WhatsApp para um número que não recebe — sem ninguém
 * descobrir que a mensagem não chegou.
 */
export default function CamposContato({
  valores,
}: {
  valores?: {
    telefone?: string | null;
    email?: string | null;
    whatsapp?: string | null;
    facebook?: string | null;
    instagram?: string | null;
    tiktok?: string | null;
    site?: string | null;
  };
}) {
  return (
    <>
      <GrupoCampos titulo="Contato">
        <div className="sni-form-grid">
          <Campo label="Telefone fixo">
            <Input name="telefone" defaultValue={valores?.telefone ?? ""} maxLength={20} className="sni-input num" />
          </Campo>
          <Campo label="WhatsApp" dica="O número que recebe mensagem. É por ele que o sistema avisa.">
            <Input name="whatsapp" defaultValue={valores?.whatsapp ?? ""} maxLength={20} className="sni-input num" />
          </Campo>
        </div>
        <Campo label="E-mail">
          <Input name="email" type="email" defaultValue={valores?.email ?? ""} maxLength={150} />
        </Campo>
      </GrupoCampos>

      <GrupoCampos
        titulo="Na internet"
        descricao="Cole o endereço inteiro, como ele aparece no navegador — começando com https://."
      >
        <div className="sni-form-grid">
          <Campo label="Site">
            <Input name="site" type="url" defaultValue={valores?.site ?? ""} maxLength={300} placeholder="https://" />
          </Campo>
          <Campo label="Facebook">
            <Input name="facebook" type="url" defaultValue={valores?.facebook ?? ""} maxLength={300} placeholder="https://facebook.com/" />
          </Campo>
        </div>
        <div className="sni-form-grid">
          <Campo label="Instagram">
            <Input name="instagram" type="url" defaultValue={valores?.instagram ?? ""} maxLength={300} placeholder="https://instagram.com/" />
          </Campo>
          <Campo label="TikTok">
            <Input name="tiktok" type="url" defaultValue={valores?.tiktok ?? ""} maxLength={300} placeholder="https://tiktok.com/@" />
          </Campo>
        </div>
      </GrupoCampos>
    </>
  );
}
