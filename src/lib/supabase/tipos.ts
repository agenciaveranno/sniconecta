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
  cidade: string | null;
  uf: string | null;
  pais: string;
  cnpj: string | null;
  telefone: string | null;
  /** 'pt-BR' ou 'ja': parte das Regionais conduz as atividades em japonês. */
  idioma: string;
  ativo: boolean;
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
  /** A Academia é filial da Sede Central e tem CNPJ próprio, como a Regional. */
  cnpj: string | null;
  latitude: string | null;
  longitude: string | null;
  observacoes: string | null;
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

export type OrganizacaoRow = {
  id: string;
  codigo: string | null;
  nome: string;
  nome_curto: string | null;
  ordem: number;
  ativo: boolean;
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

export type PapelRow = {
  id: string;
  pessoa_id: string;
  tipo: string;
  /** Nulo = nacional. Preenchido = vale nesta unidade e nas descendentes. */
  unidade_id: string | null;
  ativo: boolean;
  /** Quem concedeu. É o que faz "quem deu acesso a essa pessoa?" ter resposta. */
  concedido_por: string | null;
  criado_em: string;
};

export type TipoPapelRow = {
  codigo: string;
  nome: string;
  modulo: string;
  escopo: "nacional" | "unidade";
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
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
