/**
 * Tipos das tabelas e funções do schema comum usadas pelo cliente Supabase.
 *
 * ⚠️ Escritos à mão. Quando o projeto Supabase existir, substituir por
 * `supabase gen types typescript` e apagar este arquivo. Até lá, o que está
 * aqui é o CONTRATO que `src/lib/auth.ts` espera da migração de fundação
 * (`supabase/migrations/20260906190000_fundacao_plataforma.sql`) — divergir
 * daqui é erro que só aparece em execução.
 */

export type UnidadeRow = {
  id: string;
  tipo: string;
  pai_id: string | null;
  /** Obrigatória na Associação Local, nula nos demais degraus. */
  organizacao_id: string | null;
  nome: string;
  nome_curto: string | null;
  codigo: string | null;
  slug: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  pais: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  /** Número que RECEBE WhatsApp — separado do fixo de propósito. */
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  site: string | null;
  /** 'pt-BR' ou 'ja': parte das Regionais conduz as atividades em japonês. */
  idioma: string;
  ativo: boolean;
  /**
   * De onde a unidade veio quando nasceu de uma carga: o nome bruto da origem e
   * `conferir: true` enquanto ninguém olhou. Nulo em unidade cadastrada na tela.
   */
  migracao_extras: Record<string, unknown> | null;
  criado_em: string;
  atualizado_em: string;
};

export type TipoLocalRow = {
  codigo: string;
  nome: string;
  plural: string;
  /** Recebe pagamento em conta própria: o cadastro mostra o bloco da Cielo. */
  aceita_conta_cielo: boolean;
  ordem: number;
  ativo: boolean;
};

/** Onde o evento acontece. Academia de Treinamento Espiritual, hotel, salão. */
export type LocalRow = {
  id: string;
  tipo: string;
  nome: string;
  codigo: string | null;
  slug: string | null;
  unidade_id: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  email: string | null;
  whatsapp: string | null;
  facebook: string | null;
  instagram: string | null;
  tiktok: string | null;
  site: string | null;
  /** A Academia é filial da Sede Central e tem CNPJ próprio, como a Regional. */
  cnpj: string | null;
  latitude: string | null;
  longitude: string | null;
  observacoes: string | null;
  /** Da instituição (Academia, salão da Regional) ou de terceiro (hotel). */
  proprio: boolean;
  capacidade: number | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  diaria_centavos: number | null;
  ativo: boolean;
};

export type TipoUnidadeRow = {
  codigo: string;
  nome: string;
  plural: string;
  /** Tipos que podem ser a unidade superior. Vazio = fica no topo. */
  pais_permitidos: string[];
  exige_organizacao: boolean;
  /** Recebe pagamento em conta própria: o cadastro mostra o bloco da Cielo. */
  aceita_conta_cielo: boolean;
  ordem: number;
  ativo: boolean;
};

/** Onde a pessoa está hoje: a Regional, a Organização e a Associação Local. */
export type VinculoAtualRow = {
  pessoa_id: string;
  unidade_id: string;
  unidade_tipo: string;
  unidade_nome: string;
  organizacao_id: string | null;
  organizacao_nome: string | null;
  regional_id: string | null;
  data_inicio: string;
};

/**
 * Departamento da Sede Central — que, marcado, é também uma Organização
 * doutrinária. Um cadastro só para os dois: ver decisão do arquivo
 * `20260907090000_departamentos.sql`.
 */
export type OrganizacaoRow = {
  id: string;
  codigo: string | null;
  nome: string;
  nome_curto: string | null;
  descricao: string | null;
  /** Marcado: aparece na escolha da Associação Local. */
  e_organizacao: boolean;
  ordem: number;
  ativo: boolean;
};

/** Diretoria ou conselho. Duração e início de gestão são dado, não código. */
export type ColegiadoRow = {
  codigo: string;
  nome: string;
  sigla: string | null;
  ambito: "nacional" | "regional" | "academia" | "departamento" | "associacao_local";
  duracao_anos: number;
  mes_inicio: number | null;
  dia_inicio: number;
  ordem: number;
  ativo: boolean;
};

export type CargoRow = {
  codigo: string;
  colegiado: string;
  nome: string;
  /** Quantos cabem ao mesmo tempo. Nulo = sem teto. */
  vagas: number | null;
  /** `ordem` da função doutrinária mínima. Nulo = qualquer uma serve. */
  funcao_minima: number | null;
  vota: "sempre" | "nunca" | "desempate";
  e_secretario: boolean;
  e_gestor: boolean;
  ordem: number;
  ativo: boolean;
};

/** Quem ocupa (ou ocupou) um cargo. Encerrar é pôr data, nunca apagar. */
export type MandatoRow = {
  id: string;
  pessoa_id: string;
  cargo: string;
  unidade_id: string | null;
  local_id: string | null;
  organizacao_id: string | null;
  condicao: "efetivo" | "ouvinte";
  data_inicio: string;
  data_fim: string | null;
  motivo_fim: string | null;
  observacoes: string | null;
  criado_em: string;
  criado_por: string | null;
};

/**
 * Conta bancária de uma entidade — Sede, Regional, Academia, AL.
 *
 * ⚠️ Estas três tabelas NÃO têm GRANT para `authenticated`: quem as lê é o
 * servidor, com a chave de serviço, depois de conferir a capacidade. O tipo
 * entra aqui porque o cliente tipado é um só; o acesso é que não é.
 */
export type ContaBancariaRow = {
  id: string;
  unidade_id: string | null;
  local_id: string | null;
  organizacao_id: string | null;
  apelido: string;
  /** Sempre três dígitos, com zero à esquerda: o Banco do Brasil é "001". */
  banco_codigo: string | null;
  banco_nome: string | null;
  agencia: string | null;
  agencia_dv: string | null;
  conta: string | null;
  conta_dv: string | null;
  tipo: "corrente" | "poupanca" | "pagamento";
  titular: string | null;
  titular_documento: string | null;
  ativo: boolean;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
};

/** Chave Pix de uma conta. Várias por conta, de tipos diferentes. */
export type ChavePixRow = {
  id: string;
  conta_id: string;
  tipo: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";
  chave: string;
  ativo: boolean;
  criado_em: string;
};

/** Identificação do terminal. A credencial da operadora fica em `credenciais`. */
export type MaquininhaRow = {
  id: string;
  conta_id: string;
  apelido: string;
  operadora: string;
  numero_serie: string | null;
  numero_logico: string | null;
  ativo: boolean;
  criado_em: string;
};

/** Livro ou Artigo Religioso do catálogo. */
export type ProdutoRow = {
  id: string;
  categoria_id: string;
  nome: string;
  codigo: string | null;
  codigo_barras: string | null;
  descricao_curta: string | null;
  descricao_longa: string | null;
  idioma: string;
  preco_capa_centavos: number;
  origem_url: string | null;
  imagens: unknown[];
  /** Dá para comprar agora. Diferente de `ativo`: o indisponível continua na tela. */
  disponivel: boolean;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

/** Subdivisão de um Departamento, com gestor próprio. */
export type SecaoRow = {
  id: string;
  organizacao_id: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
  criado_em: string;
};

/** Endereço já consultado. Cache e porta de entrada da base dos Correios. */
export type CepRow = {
  cep: string;
  logradouro: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  fonte: string;
  criado_em: string;
};

export type PessoaRow = {
  id: string;
  /** Nulo só em quem é estrangeiro — aí o passaporte identifica (decisão 0013). */
  cpf: string | null;
  passaporte: string | null;
  cod_sni: string | null;
  nome: string;
  nome_social: string | null;
  email: string | null;
  nascimento: string | null;
  sexo: string | null;
  nome_pai: string | null;
  nome_mae: string | null;
  nome_conjuge: string | null;
  estado_civil: string | null;
  entrada_sni: string | null;
  motivo_entrada: string | null;
  profissao: string | null;
  empresa: string | null;
  formacao: string | null;
  /** Identificador alfabético para entrar, além de CPF e e-mail. */
  login: string | null;
  falecimento_causa: string | null;
  telefone: string | null;
  telefone2: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  pais: string;
  foto_url: string | null;
  /** Nulo = só histórico, sem conta. A maioria das pessoas fica assim. */
  auth_user_id: string | null;
  falecimento: string | null;
  /** Id da tabela de origem, para a migração ser repetível. */
  legado_id: number | null;
  /** O que a origem trazia em texto livre e ainda não casou com o catálogo. */
  migracao_extras: Record<string, unknown> | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

/** Documento da ficha. O arquivo mora no Storage; aqui fica o caminho. */
export type PessoaAnexoRow = {
  id: string;
  pessoa_id: string;
  tipo: string;
  descricao: string | null;
  caminho: string;
  nome_arquivo: string;
  mime: string | null;
  tamanho: number | null;
  criado_em: string;
  criado_por: string | null;
};

export type PapelRow = {
  id: string;
  pessoa_id: string;
  tipo: string;
  /** Nulo = nacional. Preenchido = vale nesta unidade e nas descendentes. */
  unidade_id: string | null;
  /**
   * Recorte por Organização, quando o tipo do papel o exige.
   *
   * ⚠️ Com ele, o alcance deixa de ser a subárvore inteira e passa a ser só as
   * unidades daquela Organização dentro dela. É o Presidente de UAP, que
   * responde pelas Associações Locais de UMA Organização na Regional dele —
   * não pelas das outras três.
   */
  organizacao_id: string | null;
  ativo: boolean;
  /** Quem concedeu. É o que faz "quem deu acesso a essa pessoa?" ter resposta. */
  concedido_por: string | null;
  criado_em: string;
};

export type TipoPapelRow = {
  codigo: string;
  nome: string;
  modulo: string;
  escopo: "nacional" | "unidade" | "unidade_organizacao";
  administra_unidade: boolean;
  ordem: number;
  ativo: boolean;
};

export type VinculoRow = {
  id: string;
  pessoa_id: string;
  unidade_id: string;
  data_inicio: string;
  data_fim: string | null;
  motivo: string | null;
};

export type FuncaoDoutrinariaRow = {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
};

type Tabela<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };

/**
 * Trilha de auditoria. `authenticated` só LÊ (e só a Sede); toda escrita é do
 * servidor, com `service_role` — trilha que o próprio ator pode escrever não é
 * trilha.
 */
export type AuditoriaRow = {
  id: number;
  pessoa_id: string | null;
  acao: string;
  entidade: string | null;
  entidade_id: string | null;
  detalhe: Record<string, unknown> | null;
  ip: string | null;
  criado_em: string;
};

/** Fila única de comunicação. Sem GRANT: destino e corpo são dado pessoal. */
export type NotificacaoRow = {
  id: number;
  pessoa_id: string | null;
  canal: "email" | "whatsapp";
  destino: string;
  template: string | null;
  variaveis: Record<string, unknown> | null;
  assunto: string | null;
  corpo: string;
  status: "pendente" | "enviada" | "falhou" | "cancelada";
  tentativas: number;
  ultimo_erro: string | null;
  chave_unica: string | null;
  criado_em: string;
  enviado_em: string | null;
};

export interface Database {
  public: {
    Tables: {
      unidades: Tabela<UnidadeRow>;
      tipos_unidade: Tabela<TipoUnidadeRow>;
      organizacoes: Tabela<OrganizacaoRow>;
      pessoas: Tabela<PessoaRow>;
      papeis: Tabela<PapelRow>;
      tipos_papel: Tabela<TipoPapelRow>;
      pessoa_unidade_vinculos: Tabela<VinculoRow>;
      funcoes_doutrinarias: Tabela<FuncaoDoutrinariaRow>;
      tipos_local: Tabela<TipoLocalRow>;
      locais: Tabela<LocalRow>;
      auditoria: Tabela<AuditoriaRow>;
      notificacoes: Tabela<NotificacaoRow>;
      ceps: Tabela<CepRow>;
      pessoa_anexos: Tabela<PessoaAnexoRow>;
      secoes: Tabela<SecaoRow>;
      produtos: Tabela<ProdutoRow>;
      colegiados: Tabela<ColegiadoRow>;
      cargos: Tabela<CargoRow>;
      mandatos: Tabela<MandatoRow>;
      contas_bancarias: Tabela<ContaBancariaRow>;
      chaves_pix: Tabela<ChavePixRow>;
      maquininhas: Tabela<MaquininhaRow>;
    };
    Views: {
      pessoa_vinculo_atual: { Row: VinculoAtualRow; Relationships: [] };
    };
    Functions: {
      /** A unidade e todos os ancestrais dela, da folha até a raiz. */
      ancestrais: {
        Args: { alvo: string };
        Returns: { unidade_id: string }[];
      };
      /**
       * Fecha o vínculo atual e abre o novo NA MESMA transação.
       *
       * ⚠️ Em dois comandos separados, a recusa do segundo pela RLS deixava a
       * pessoa sem vínculo nenhum — e sem vínculo ela some de toda tela que
       * lista por unidade, inclusive para quem acabou de movê-la.
       */
      mover_pessoa: {
        Args: { p_pessoa: string; p_unidade: string };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
