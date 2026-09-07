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
  /**
   * A tela EXISTE. Falso = está no plano, e a barra lateral não a mostra.
   *
   * ⚠️ Sem isto, o registro anuncia o mapa inteiro do sistema e a pessoa
   * descobre o que não existe clicando: um 404 no meio do menu não distingue
   * "ainda não foi feito" de "quebrou", e quem viu um passa a desconfiar de
   * todos os outros. Item novo nasce ausente daqui e ganha a linha no mesmo
   * commit que cria a rota.
   */
  pronto?: boolean;
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
      { href: "/admin/pessoas", rotulo: "Pessoas e acesso", icone: "IconUserCog", capacidade: "pessoa.gerir", pronto: true },
      // ⚠️ Três itens, e não um "Estrutura" só: a Sede trabalha um degrau por
      // vez, e a árvore inteira numa tela obriga a caçar a Regional certa entre
      // mil Associações Locais. A árvore continua em /admin/estrutura, ligada
      // de cada uma das três — ela responde "onde isto fica", que a lista não.
      { href: "/admin/regionais", rotulo: "Regionais", icone: "IconMap2", capacidade: "estrutura.gerir", pronto: true },
      { href: "/admin/nucleos", rotulo: "Núcleos", icone: "IconTopologyStar3", capacidade: "estrutura.gerir", pronto: true },
      { href: "/admin/associacoes", rotulo: "Associações Locais", icone: "IconUsersGroup", capacidade: "estrutura.gerir", pronto: true },
      { href: "/admin/estrutura", rotulo: "Árvore da instituição", icone: "IconSitemap", capacidade: "estrutura.gerir", pronto: true },
      { href: "/admin/organizacoes", rotulo: "Departamentos", icone: "IconBuildingArch", capacidade: "estrutura.gerir", pronto: true },
      { href: "/admin/locais", rotulo: "Locais", icone: "IconMapPin", capacidade: "estrutura.gerir", pronto: true },
      { href: "/admin/configuracoes", rotulo: "Configurações", icone: "IconSettings", capacidade: "configuracao.gerir", pronto: true },
      { href: "/admin/auditoria", rotulo: "Auditoria", icone: "IconHistory", capacidade: "auditoria.ver" },
    ],
  },
];
