/**
 * MATRIZ de capacidades. É dado, não código: a Sede corrige num lugar só.
 *
 * Capacidade é nomeada pela AÇÃO, nunca pela tela — tela muda de lugar, a ação
 * continua a mesma. Capacidade de módulo leva o prefixo do módulo; capacidade
 * de plataforma não leva nenhum, porque não pertence a módulo algum.
 *
 * DUAS CAMADAS, AMBAS NECESSÁRIAS. Esta matriz decide quais AÇÕES a pessoa
 * dispara; o RLS decide quais LINHAS ela alcança. O RLS continua sendo a
 * autorização real — esta matriz existe para a interface não oferecer o que o
 * banco vai negar, e para a checagem acontecer antes de a Server Action tocar
 * no banco.
 *
 * ⚠️ O prefixo é o que impede o vazamento entre domínios da mesma pessoa. Um
 * `financeiro.ver` sem prefixo faria quem coordena o curso enxergar, no dia em
 * que a Missão Sagrada entrar, quanto cada pessoa contribuiu — sem ninguém ter
 * decidido isso. Por isso é `ciclo.financeiro.ver`, e a contribuição será
 * `missao.contribuicao.ver`.
 */

/** Espelha o catálogo `tipos_papel` da migração de fundação. */
export type TipoPapel =
  | "sede"
  // ciclo
  | "coordenador"
  | "orientador"
  | "presidente_uap"
  | "professor"
  | "aluno"
  // eventos — nacionais: o domínio não tem escopo geográfico (decisão 0003)
  | "eventos_admin"
  | "eventos_operador";

export type Capacidade =
  // ── Plataforma (sem prefixo: não é de módulo nenhum) ──
  | "estrutura.gerir"      // unidades, locais
  | "pessoa.gerir"         // cadastro e edição de pessoas
  | "papel.conceder"
  | "acesso.gerir"         // criar conta de login, definir senha de outra pessoa
  | "configuracao.gerir"
  | "lgpd.decidir"         // decidir sobre pedidos de exclusão
  | "auditoria.ver"
  // Dar posse e encerrar mandato em colegiado — CDOR, DAC, Diretoria de AL.
  // ⚠️ Fica só com a Sede, e não por zelo: o banco já restringe a escrita de
  // `mandatos` a `app.e_sede()`. Dar posse é ato da Sede Central inclusive nos
  // cargos eleitos — a eleição acontece na Regional, o registro é nacional.
  // Espalhá-la para outro papel faria a tela oferecer o que a policy nega.
  | "mandato.conceder"
  // ── Ciclo de Estudos ──
  | "ciclo.tipos.gerir"              // tipos de turma, equivalências
  | "ciclo.programa.gerir"           // tema do ano, apostila nacional
  | "ciclo.edicao.gerir"
  | "ciclo.turma.gerir"
  | "ciclo.grade.gerir"
  | "ciclo.landing.editar"
  | "ciclo.matricula.ver"
  | "ciclo.matricula.decidir"
  | "ciclo.financeiro.ver"
  | "ciclo.desconto.autorizar"
  | "ciclo.politica_desconto.gerir"
  | "ciclo.prerequisito.dispensar"
  | "ciclo.presenca.lancar"
  | "ciclo.certificado.emitir"
  | "ciclo.prova.gerir"
  | "ciclo.importacao.executar"
  // ── Eventos ──
  | "eventos.gerir"            // eventos, convites, combos, cupons, promotores
  | "eventos.vender"           // venda balcão
  | "eventos.checkin"
  | "eventos.inscricoes.ver"   // painel, relatórios, ficha do participante
  | "eventos.inscricoes.gerir" // transferir, trocar titular, cancelar
  | "eventos.estornos.gerir"
  | "eventos.comissao.gerir"
  | "eventos.configurar";      // Cielo, e-mail, WhatsApp, marca

const PLATAFORMA: readonly Capacidade[] = [
  "estrutura.gerir", "pessoa.gerir", "papel.conceder", "acesso.gerir",
  "configuracao.gerir", "lgpd.decidir", "auditoria.ver", "mandato.conceder",
];

const CICLO: readonly Capacidade[] = [
  "ciclo.tipos.gerir", "ciclo.programa.gerir", "ciclo.edicao.gerir",
  "ciclo.turma.gerir", "ciclo.grade.gerir", "ciclo.landing.editar",
  "ciclo.matricula.ver", "ciclo.matricula.decidir", "ciclo.financeiro.ver",
  "ciclo.desconto.autorizar", "ciclo.politica_desconto.gerir",
  "ciclo.prerequisito.dispensar", "ciclo.presenca.lancar",
  "ciclo.certificado.emitir", "ciclo.prova.gerir", "ciclo.importacao.executar",
];

const EVENTOS: readonly Capacidade[] = [
  "eventos.gerir", "eventos.vender", "eventos.checkin", "eventos.inscricoes.ver",
  "eventos.inscricoes.gerir", "eventos.estornos.gerir", "eventos.comissao.gerir",
  "eventos.configurar",
];

/**
 * Quem pode o quê.
 *
 * O critério é: quem responde pela consequência decide. Dinheiro e matrícula
 * ficam com o Coordenador, que responde pela unidade. Conteúdo nacional
 * (apostila, tipos de turma, banco de questões) fica com a Sede, porque é
 * igual no Brasil inteiro. O Presidente de UAP enxerga o financeiro — responde
 * institucionalmente — mas não concede desconto, para não haver duas portas
 * para a mesma decisão.
 *
 * Três linhas não são escolha nossa e vêm da especificação do Ciclo: o
 * Coordenador autoriza descontos sem aval da Sede; o Orientador Responsável
 * dispensa o pré-requisito; aluno vê os próprios dados, professor vê a própria
 * turma, os papéis locais veem a própria unidade e a Sede vê tudo.
 */
export const MATRIZ: Record<TipoPapel, readonly Capacidade[]> = {
  // A Sede alcança tudo por princípio. Ver tudo e AGIR em tudo são coisas
  // diferentes: quando a Sede age em nome de uma unidade, a trilha de
  // auditoria registra autor, data e motivo — responsabilidade de quem chama,
  // não desta tabela.
  sede: [...PLATAFORMA, ...CICLO, ...EVENTOS],

  coordenador: [
    "pessoa.gerir", "papel.conceder",
    "ciclo.edicao.gerir", "ciclo.turma.gerir", "ciclo.grade.gerir",
    "ciclo.landing.editar", "ciclo.matricula.ver", "ciclo.matricula.decidir",
    "ciclo.financeiro.ver", "ciclo.desconto.autorizar",
    "ciclo.presenca.lancar", "ciclo.certificado.emitir",
  ],

  // A grade é trabalho conjunto: o Coordenador monta, o Orientador ajusta quem
  // conduz cada aula. A dispensa de pré-requisito é só dele.
  orientador: [
    "ciclo.grade.gerir", "ciclo.matricula.ver",
    "ciclo.prerequisito.dispensar", "ciclo.presenca.lancar",
  ],

  presidente_uap: ["pessoa.gerir", "ciclo.matricula.ver", "ciclo.financeiro.ver"],

  professor: ["ciclo.matricula.ver", "ciclo.presenca.lancar"],

  aluno: ["ciclo.matricula.ver"],

  eventos_admin: ["pessoa.gerir", ...EVENTOS],
  eventos_operador: ["eventos.vender", "eventos.checkin", "eventos.inscricoes.ver"],
};

/**
 * Papéis que valem em qualquer unidade.
 *
 * ⚠️ Espelha `tipos_papel.escopo = 'nacional'` na migração. Divergir daqui faz
 * a interface oferecer o que o gatilho do banco vai recusar.
 */
export const PAPEIS_NACIONAIS: ReadonlySet<TipoPapel> = new Set([
  "sede", "eventos_admin", "eventos_operador",
]);

/** Nome que a pessoa lê na tela. */
export const NOME_PAPEL: Record<TipoPapel, string> = {
  sede: "Sede Central",
  coordenador: "Coordenador do Ciclo",
  orientador: "Orientador Responsável",
  presidente_uap: "Presidente de UAP",
  professor: "Professor",
  aluno: "Aluno",
  eventos_admin: "Administrador de Eventos",
  eventos_operador: "Operador de Eventos",
};

/** Ordem de ABRANGÊNCIA, não de importância: serve para rotular a sessão. */
const ORDEM_ALCANCE: readonly TipoPapel[] = [
  "sede", "eventos_admin", "coordenador", "orientador", "presidente_uap",
  "eventos_operador", "professor", "aluno",
];

export function capacidadesDe(tipo: TipoPapel): readonly Capacidade[] {
  return MATRIZ[tipo] ?? [];
}

export function papelPrincipal(tipos: readonly TipoPapel[]): TipoPapel | null {
  for (const t of ORDEM_ALCANCE) if (tipos.includes(t)) return t;
  return null;
}
