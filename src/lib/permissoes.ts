/**
 * MATRIZ de capacidades. É dado, não código: a Sede corrige num lugar só.
 *
 * Capacidade é nomeada pela AÇÃO, com prefixo do módulo. Nunca por tela.
 * Papel é { tipo, localidade_id, edicao_id }; uma pessoa acumula papéis.
 * `sede` tem localidade nula e vale nacionalmente.
 *
 * ⚠️ Os papéis e capacidades do módulo `ciclo` são os do sistema existente e
 * devem ser substituídos pela versão dele ao entrar aqui. Os do módulo
 * `eventos` são proposta desta sessão — o domínio de eventos é NACIONAL,
 * sem escopo por localidade, por isso os dois papéis abaixo não carregam
 * localidade.
 */

export type TipoPapel =
  // ciclo (existentes)
  | "sede"
  | "coordenador"
  | "orientador"
  | "presidente_uap"
  | "professor"
  | "aluno"
  // eventos (proposta)
  | "eventos_admin"
  | "eventos_operador";

export type Capacidade =
  // comum
  | "pessoa.gerir"
  | "papel.conceder"
  | "auditoria.ver"
  | "configuracao.gerir"
  | "acesso.gerir"
  // ciclo (resumo; a lista completa vem com o módulo)
  | "ciclo.estrutura.gerir"
  | "ciclo.edicao.gerir"
  | "ciclo.matricula.ver"
  | "ciclo.matricula.decidir"
  | "ciclo.financeiro.ver"
  | "ciclo.presenca.lancar"
  | "ciclo.certificado.emitir"
  // eventos
  | "eventos.gerir"           // eventos, tipos de convite, combos, cupons, locais, promotores, orientadores
  | "eventos.vender"          // venda balcão
  | "eventos.checkin"
  | "eventos.inscricoes.ver"  // dashboard, relatórios, ficha do participante
  | "eventos.inscricoes.gerir" // transferir, trocar titular, cancelar
  | "eventos.estornos.gerir"
  | "eventos.comissao.gerir"
  | "eventos.configurar";     // Cielo, SMTP, WhatsApp, marca

type Matriz = Record<TipoPapel, readonly Capacidade[]>;

const TUDO_EVENTOS: readonly Capacidade[] = [
  "eventos.gerir", "eventos.vender", "eventos.checkin", "eventos.inscricoes.ver",
  "eventos.inscricoes.gerir", "eventos.estornos.gerir", "eventos.comissao.gerir", "eventos.configurar",
];

export const MATRIZ: Matriz = {
  sede: [
    "pessoa.gerir", "papel.conceder", "auditoria.ver", "configuracao.gerir", "acesso.gerir",
    "ciclo.estrutura.gerir", "ciclo.edicao.gerir", "ciclo.matricula.ver", "ciclo.matricula.decidir",
    "ciclo.financeiro.ver", "ciclo.presenca.lancar", "ciclo.certificado.emitir",
    ...TUDO_EVENTOS,
  ],
  coordenador: ["ciclo.edicao.gerir", "ciclo.matricula.ver", "ciclo.matricula.decidir", "ciclo.financeiro.ver", "ciclo.presenca.lancar", "ciclo.certificado.emitir"],
  orientador: ["ciclo.matricula.ver"],
  presidente_uap: ["ciclo.matricula.ver"],
  professor: ["ciclo.presenca.lancar"],
  aluno: [],
  eventos_admin: ["pessoa.gerir", ...TUDO_EVENTOS],
  eventos_operador: ["eventos.vender", "eventos.checkin", "eventos.inscricoes.ver"],
};

/** Papéis que valem em qualquer localidade. */
export const PAPEIS_NACIONAIS: ReadonlySet<TipoPapel> = new Set(["sede", "eventos_admin", "eventos_operador"]);

export function capacidadesDe(tipo: TipoPapel): readonly Capacidade[] {
  return MATRIZ[tipo] ?? [];
}
