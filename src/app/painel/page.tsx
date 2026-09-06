import Link from "next/link";
import * as Icones from "@tabler/icons-react";
import Painel from "@/componentes/Painel";
import { Alerta, Card, TituloPagina, Vazio } from "@/componentes/ui";
import { pessoaAtual } from "@/lib/auth";
import { MODULOS } from "@/modulos/registro";

/** Hub pós-login: atalhos por capacidade. Cada módulo tem o próprio painel. */
export default async function PainelPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const eu = await pessoaAtual();
  const atalhos = MODULOS.flatMap((m) => m.itens.filter((i) => eu?.pode(i.capacidade)));

  return (
    <Painel titulo="Início">
      <TituloPagina descricao={`Bem-vindo, ${eu?.nome ?? ""}.`}>SNI Conecta</TituloPagina>
      {erro && (
        <div style={{ marginBottom: 16 }}>
          <Alerta tipo="danger" icone={<Icones.IconAlertCircle size={20} className="ti" />}>{erro}</Alerta>
        </div>
      )}
      {atalhos.length === 0 ? (
        <Vazio icone={<Icones.IconLock size={34} className="ti" />} titulo="Nenhum acesso liberado ainda">
          Sua conta existe, mas nenhum papel foi concedido. Peça a quem administra o acesso.
        </Vazio>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {atalhos.map((a) => {
            const C = (Icones as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[a.icone];
            return (
              <Link key={a.href} href={a.href} style={{ textDecoration: "none" }}>
                <Card className="sni-clickable" style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--txt-2)" }}>
                  <span className="sni-card-icon blue">{C ? <C size={20} className="ti" /> : null}</span>
                  <span style={{ fontWeight: 600 }}>{a.rotulo}</span>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </Painel>
  );
}
