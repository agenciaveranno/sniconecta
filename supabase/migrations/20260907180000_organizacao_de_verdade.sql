-- A lista de escolha de Organização é de ORGANIZAÇÕES, não de Departamentos
--
-- `organizacoes.e_organizacao` nasceu na migração dos Departamentos para
-- separar as duas coisas que a tabela guarda: algumas unidades administrativas
-- da Sede SÃO Organizações doutrinárias — Fraternidade, Pomba Branca, Jovens,
-- Prosperidade — e outras não: Jurídico, Controladoria, Editoração.
--
-- A coluna existia e ninguém filtrava por ela. O `<select>` de Organização do
-- cadastro de Associação Local oferecia os catorze Departamentos
-- administrativos, e também a "Indefinida" — que a carga criou como DÍVIDA a
-- revisar, para as 15.404 pessoas cujas Associações Locais a origem não
-- amarrava a nenhuma Organização. Escolher a dívida de boa-fé a transformaria
-- em destino permanente, e ninguém saberia distinguir depois.
--
-- ⚠️ As telas passaram a filtrar, mas filtro de tela não protege quem não
-- passa por tela: a carga escreve `unidades.organizacao_id` direto. A garantia
-- fica onde a decisão 0007 manda, no banco.
--
-- ⚠️ E vale só para o que MUDAR daqui em diante. As unidades que já apontam
-- para a "Indefinida" são exatamente a dívida a reconciliar: recusá-las
-- retroativamente impediria de editar o telefone das Associações Locais que
-- mais precisam ser revisadas — a correção viraria bloqueio.
create or replace function app.validar_unidade()
returns trigger language plpgsql as $$
declare
  permitidos text[];
  exige      boolean;
  tipo_pai   text;
  e_org      boolean;
begin
  select pais_permitidos, exige_organizacao
    into permitidos, exige
    from tipos_unidade where codigo = new.tipo;

  if permitidos is null then
    raise exception 'Tipo de unidade desconhecido: %.', new.tipo;
  end if;

  -- Quem pode ter pai, precisa ter.
  if new.pai_id is null then
    if array_length(permitidos, 1) is not null then
      raise exception 'Unidade do tipo % precisa estar dentro de outra.', new.tipo;
    end if;
  else
    select tipo into tipo_pai from unidades where id = new.pai_id;
    if not (tipo_pai = any (permitidos)) then
      raise exception
        'Unidade do tipo % não pode ficar dentro de unidade do tipo %.',
        new.tipo, tipo_pai;
    end if;
  end if;

  if exige and new.organizacao_id is null then
    raise exception 'Unidade do tipo % precisa de uma organização.', new.tipo;
  end if;
  if not exige and new.organizacao_id is not null then
    raise exception 'Unidade do tipo % não tem organização.', new.tipo;
  end if;

  -- Só quando a organização MUDA: o que já está gravado é dívida a revisar,
  -- não erro a punir.
  if new.organizacao_id is not null
     and (tg_op = 'INSERT' or new.organizacao_id is distinct from old.organizacao_id) then
    select e_organizacao into e_org from organizacoes where id = new.organizacao_id;
    if not coalesce(e_org, false) then
      raise exception
        'Essa é uma unidade administrativa da Sede Central, não uma Organização — a Associação Local precisa estar ligada a uma Organização.';
    end if;
  end if;

  return new;
end $$;
