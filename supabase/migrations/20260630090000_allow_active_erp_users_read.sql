create or replace function public.is_active_erp_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_sistema
    where lower(email) = lower(auth.email())
      and lower(coalesce(status, 'ativo')) <> 'inativo'
  );
$$;

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'obrigacoes',
    'clientes',
    'setores',
    'usuarios_sistema',
    -- A tabela chama grupos_clientes (plural). Escrito no singular, o
    -- to_regclass abaixo devolvia null e a tabela era pulada em silencio.
    'grupos_clientes',
    'cliente_obrigacoes'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    policy_name := format('%s_active_erp_users_select', table_name);

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = policy_name
    ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.is_active_erp_user())',
        policy_name,
        table_name
      );
    end if;
  end loop;
end $$;
