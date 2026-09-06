-- ───────────────────────────────────────────────────────────────────────────
-- E-MAIL COMPARTILHADO EM FAMÍLIA
--
-- A base de origem tem 16.676 pessoas e **1.060 e-mails repetidos**: mãe que
-- compra para a família, casal com uma caixa só, filho que usa o e-mail do
-- pai. Não é sujeira de cadastro — é como as pessoas vivem, e o sistema não
-- pode recusar.
--
-- A decisão 0004 pôs `unique` em `pessoas.email` para que e-mail em branco não
-- derrubasse a segunda pessoa sem e-mail. Resolveu o vazio e criou outro
-- problema: com o unique, a carga rejeitaria milhares de pessoas legítimas, ou
-- as gravaria sem o e-mail que a instituição tem — e o comprovante deixaria de
-- chegar a quem sempre recebeu.
--
-- Ver `docs/decisoes/0011-email-nao-identifica-pessoa.md`.
-- ───────────────────────────────────────────────────────────────────────────

-- E-mail deixa de identificar pessoa. Quem identifica é o CPF (decisão 0002).
alter table pessoas drop constraint pessoas_email_key;

-- ⚠️ Mas continua único ENTRE QUEM TEM CONTA. Duas contas com o mesmo e-mail
-- seriam duas identidades para o mesmo login, e o Supabase Auth — que já exige
-- e-mail único em `auth.users` — mandaria as duas para a mesma sessão. Este
-- índice é a cinta de segurança do nosso lado: se a regra do Auth mudar, aqui
-- ainda quebra na hora de gravar, e não no dia em que alguém abrir a ficha da
-- irmã achando que é a sua.
create unique index uq_pessoa_email_com_conta
  on pessoas (email) where auth_user_id is not null;

-- ── O gatilho de ligação precisa desempatar ────────────────────────────────
--
-- Com e-mail repetido, `where email = new.email` atinge a família inteira. A
-- versão anterior ligaria a conta a TODAS elas — e como `auth_user_id` é
-- único, o banco recusaria; mas se recusasse depois de acertar uma, teria
-- ligado a conta à pessoa errada. Dar a sessão da mãe ao filho é o pior erro
-- que este sistema pode cometer: ele entrega o histórico, o CPF e o endereço
-- de outra pessoa.
--
-- Então: liga só quando a resposta é ÚNICA. Havendo dúvida, não liga — a
-- pessoa entra sem acesso, o que é chato e reversível, e a ambiguidade fica
-- registrada em auditoria para alguém resolver à mão.
create or replace function app.ligar_conta_a_pessoa()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare candidatas int;
begin
  select count(*) into candidatas
    from pessoas
   where email = new.email
     and auth_user_id is null;

  if candidatas = 1 then
    update pessoas
       set auth_user_id = new.id,
           atualizado_em = now()
     where email = new.email
       and auth_user_id is null;
  elsif candidatas > 1 then
    insert into auditoria (acao, entidade, entidade_id, detalhe)
    values ('conta.ligacao_ambigua', 'pessoas', new.id::text,
            jsonb_build_object(
              'motivo', 'mais de uma pessoa usa este e-mail',
              'candidatas', candidatas));
  end if;

  return new;
end
$$;

-- O caminho inverso corre o mesmo risco pelo outro lado: a pessoa ganha um
-- e-mail que já é de uma conta — só que a conta pode ser de outra pessoa da
-- casa. Só liga se a conta estiver livre E se ninguém mais na base usar aquele
-- e-mail sem conta.
create or replace function app.ligar_pessoa_a_conta()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare outras int;
begin
  if new.email is null or new.auth_user_id is not null then
    return new;
  end if;

  select count(*) into outras
    from pessoas p
   where p.email = new.email
     and p.auth_user_id is null
     and p.id <> new.id;

  if outras = 0 then
    select u.id into new.auth_user_id
      from auth.users u
     where u.email = new.email::text
       and not exists (select 1 from pessoas p where p.auth_user_id = u.id)
     limit 1;
  end if;

  return new;
end
$$;

-- ── Onde o e-mail da família fica guardado ─────────────────────────────────
--
-- Nada se perde: as duas pessoas ficam com o mesmo e-mail em `pessoas.email`,
-- e é por ele que as duas recebem comprovante e certificado. O que nenhuma das
-- duas ganha automaticamente é CONTA — para isso, cada uma precisa de um
-- e-mail só seu, e é a tela de acesso que vai pedir.
comment on column pessoas.email is
  'Pode repetir: família compartilha caixa. Único apenas entre quem tem conta.';
