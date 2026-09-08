-- A visão de mandatos precisa respeitar o RLS de quem consulta
--
-- `mandato_atual` foi criada sem `with (security_invoker = true)` — a única das
-- três visões do projeto sem ele. As outras duas o declaram com a razão escrita
-- na fundação: "a visão não tem RLS própria: `security_invoker` faz valer o RLS
-- das tabelas de baixo".
--
-- ⚠️ Sem a opção, a visão executa com os privilégios do DONO. O dono é o papel
-- que aplica as migrações, que é dono de `pessoas` — e dono de tabela é isento
-- do RLS dela, a menos que exista `force row level security`, que não existe em
-- nenhuma tabela deste projeto. `pessoas_le` simplesmente não era avaliada.
--
-- O resultado: qualquer autenticado — um aluno, cujo alcance em `pessoas` é a
-- própria linha e nada mais — leria pela visão o NOME de todo titular de cargo
-- do país, com colegiado, âmbito e unidade, por uma consulta direta ao
-- PostgREST. O comentário da própria migração que a criou afirmava o contrário:
-- "Quem pode ler a PESSOA já é limitado pelo RLS de `pessoas`".
--
-- Hoje a tabela `mandatos` está vazia — não há tela que a escreva e a carga não
-- a alimenta. Isto conserta antes da primeira posse, e não depois.
alter view public.mandato_atual set (security_invoker = true);

-- ⚠️ Defesa em profundidade, e a razão é a mesma que produziu o furo: a falha
-- foi UMA opção esquecida numa visão. Com `force`, o dono deixa de ser isento e
-- a próxima visão esquecida não vira leitura da tabela inteira — ela falha, que
-- é o que se quer.
--
-- Não afeta a carga nem o cron: os dois falam com `service_role`, que tem
-- `bypassrls` e continua passando por cima — é assim que a migração escreve as
-- dezesseis mil pessoas.
alter table pessoas force row level security;

-- ── Mover pessoa: um passo só, ou nenhum ───────────────────────────────────
--
-- `moverPessoa` fechava o vínculo atual e abria o novo em DUAS requisições
-- PostgREST — duas transações independentes. O fecho passa (a unidade antiga é
-- do operador) e a abertura é recusada quando a unidade nova está fora do
-- alcance dele: a pessoa fica SEM vínculo ativo.
--
-- ⚠️ E aí ela some para todo mundo, menos a Sede: `app.unidade_da_pessoa()`
-- devolve nulo, e `pessoas_le` compara com nulo. Some inclusive para o próprio
-- operador que a moveu — some da lista, e com ela o botão de mover. Ele não
-- tem por onde desfazer.
--
-- A lista de destino oferece TODAS as Associações Locais do país, porque
-- `unidades` é legível por qualquer autenticado: não é preciso forjar pedido
-- nenhum, basta escolher errado no menu.
--
-- ⚠️ `security invoker`, e não `definer`: o RLS tem de continuar valendo. A
-- função existe para dar TRANSAÇÃO aos dois passos, não para escapar da
-- policy — com `definer` ela viraria exatamente o buraco que fecha.
create or replace function public.mover_pessoa(p_pessoa uuid, p_unidade uuid)
returns void
language plpgsql
security invoker
set search_path = public as $$
begin
  update pessoa_unidade_vinculos
     set data_fim = current_date
   where pessoa_id = p_pessoa and data_fim is null;

  insert into pessoa_unidade_vinculos (pessoa_id, unidade_id)
  values (p_pessoa, p_unidade);
end $$;

revoke execute on function public.mover_pessoa(uuid, uuid) from public;
grant execute on function public.mover_pessoa(uuid, uuid) to authenticated, service_role;

comment on function public.mover_pessoa is
  'Fecha o vínculo atual e abre o novo NA MESMA transação. Em dois comandos '
  'separados, a recusa do segundo deixava a pessoa sem vínculo nenhum — e sem '
  'vínculo ela some de toda tela que lista por unidade.';
