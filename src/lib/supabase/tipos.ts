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
  nome: string;
  nome_curto: string | null;
  codigo: string | null;
  slug: string | null;
  cidade: string | null;
  uf: string | null;
  pais: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type TipoUnidadeRow = {
  codigo: string;
  nome: string;
  plural: string;
  nivel: number;
  ordem: number;
  ativo: boolean;
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
  cpf: string;
  cod_sni: string | null;
  nome: string;
  nome_social: string | null;
  email: string | null;
  nascimento: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  auth_user_id: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type PapelRow = {
  id: string;
  pessoa_id: string;
  tipo: string;
  unidade_id: string | null;
  ativo: boolean;
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
    };
    Views: { [_ in never]: never };
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
