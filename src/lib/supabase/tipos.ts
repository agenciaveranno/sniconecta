/**
 * Tipos das tabelas do schema comum usadas pelo cliente Supabase.
 *
 * ⚠️ Escritos à mão enquanto o schema comum não está na main. Quando as
 * migrações do `ciclo` chegarem, substitua por `supabase gen types typescript`
 * e apague este arquivo. Até lá, o que está aqui é o CONTRATO que
 * `src/lib/auth.ts` espera das tabelas `pessoas` e `papeis`.
 */
export type PessoaRow = {
  id: string;
  cpf: string;
  cod_sni: string | null;
  nome: string;
  email: string | null;
  telefone: string | null;
  nascimento: string | null;
  auth_user_id: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type PapelRow = {
  id: string;
  pessoa_id: string;
  tipo: string;
  localidade_id: string | null;
  edicao_id: string | null;
  criado_em: string;
};

type Tabela<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      pessoas: Tabela<PessoaRow>;
      papeis: Tabela<PapelRow>;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
