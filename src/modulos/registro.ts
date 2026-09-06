import type { Capacidade } from "@/lib/permissoes";

/**
 * Registro declarativo dos módulos. A barra lateral e os atalhos do painel
 * leem daqui e mostram só o que a capacidade da pessoa libera. Módulo novo
 * entra com um bloco aqui, não com um `if` na barra.
 *
 * `icone` é o nome do ícone Tabler (IconX em @tabler/icons-react), resolvido
 * no cliente pelo AppShell.
 */
export interface ItemMenu {
  href: string;
  rotulo: string;
  icone: string;
  capacidade: Capacidade;
}

export interface Modulo {
  chave: string;
  rotulo: string;
  itens: ItemMenu[];
}

export const MODULOS: Modulo[] = [
  {
    chave: "ciclo",
    rotulo: "Ciclo de Estudos",
    itens: [
      { href: "/ciclo", rotulo: "Painel do Ciclo", icone: "IconSchool", capacidade: "ciclo.matricula.ver" },
    ],
  },
  {
    chave: "eventos",
    rotulo: "Eventos",
    itens: [
      { href: "/eventos", rotulo: "Dashboard", icone: "IconLayoutDashboard", capacidade: "eventos.inscricoes.ver" },
      { href: "/eventos/pessoas", rotulo: "Pessoas", icone: "IconUsers", capacidade: "eventos.inscricoes.ver" },
      { href: "/eventos/venda", rotulo: "Venda balcão", icone: "IconShoppingCart", capacidade: "eventos.vender" },
      { href: "/eventos/checkin", rotulo: "Check-in", icone: "IconCircleCheck", capacidade: "eventos.checkin" },
      { href: "/eventos/relatorios", rotulo: "Relatórios", icone: "IconChartBar", capacidade: "eventos.inscricoes.ver" },
      { href: "/eventos/estornos", rotulo: "Estornos", icone: "IconReceiptRefund", capacidade: "eventos.estornos.gerir" },
      { href: "/eventos/admin", rotulo: "Eventos e convites", icone: "IconCalendarEvent", capacidade: "eventos.gerir" },
      { href: "/eventos/configuracoes", rotulo: "Configurações", icone: "IconSettings", capacidade: "eventos.configurar" },
    ],
  },
  {
    chave: "comum",
    rotulo: "Administração",
    itens: [
      { href: "/admin/pessoas", rotulo: "Pessoas e acesso", icone: "IconUserCog", capacidade: "pessoa.gerir" },
      { href: "/admin/estrutura", rotulo: "Estrutura", icone: "IconSitemap", capacidade: "estrutura.gerir" },
      { href: "/admin/auditoria", rotulo: "Auditoria", icone: "IconHistory", capacidade: "auditoria.ver" },
    ],
  },
];
