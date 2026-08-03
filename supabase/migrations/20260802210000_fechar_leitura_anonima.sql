-- Fecha a leitura anonima das tabelas e visoes do ERP.
--
-- A chave anonima do Supabase vai no JavaScript da pagina, ou seja, e publica.
-- Com ela era possivel ler, sem login nenhum, 97 clientes, 50 obrigacoes, 7
-- setores, 3 grupos e as duas visoes do painel fiscal (97 e 223 linhas).
--
-- O que sustenta o app depois disto: a policy de select para usuario ativo,
-- criada em 20260630090000_allow_active_erp_users_read.sql, e as rotas de API,
-- que usam a service role e nao passam por RLS. As telas de cadastro de cliente
-- e de grupos ja gravam por /api/clientes e /api/grupos-clientes — rodar este
-- script antes desse deploy estar no ar quebra o salvamento delas.

-- 1. RLS ligado. Sem isto as policies existem mas nao valem nada.
do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'clientes',
    'obrigacoes',
    'setores',
    'grupos_clientes',
    'usuarios_sistema',
    'cliente_obrigacoes'
  ]
  loop
    if to_regclass(format('public.%I', tabela)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', tabela);
  end loop;
end $$;

-- 2. Remove as policies que alcancam o papel anonimo nessas tabelas.
--
-- O filtro e limitado a estas quatro de proposito: derrubar toda policy de
-- 'public' do schema tiraria tambem regras de que usuario logado depende em
-- outras tabelas.
do $$
declare
  politica record;
begin
  for politica in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('clientes', 'obrigacoes', 'setores', 'grupos_clientes')
      and roles && array['anon', 'public']::name[]
  loop
    execute format('drop policy %I on public.%I', politica.policyname, politica.tablename);
    raise notice 'policy anonima removida: % em %', politica.policyname, politica.tablename;
  end loop;
end $$;

-- 3. As visoes nao respeitam RLS por conta propria: quem le uma view usa as
-- permissoes de quem a criou. Aqui elas so sao consultadas pelas rotas de API
-- com service role, entao anon e authenticated perdem o acesso direto.
do $$
declare
  visao text;
begin
  foreach visao in array array[
    'painel_fiscal_clientes',
    'painel_fiscal_documentos_por_tipo'
  ]
  loop
    if to_regclass(format('public.%I', visao)) is null then
      continue;
    end if;

    execute format('revoke all on public.%I from anon, authenticated', visao);

    -- Passa a view a rodar com as permissoes de quem consulta, para que o RLS
    -- das tabelas de baixo valha tambem por dentro dela. Exige Postgres 15+.
    begin
      execute format('alter view public.%I set (security_invoker = on)', visao);
    exception
      when others then
        raise notice 'security_invoker nao pode ser ligado em %: %', visao, sqlerrm;
    end;
  end loop;
end $$;

-- 4. Confere o resultado: rls_ligado deve ser true nas seis tabelas, e
-- policies_anonimas deve ser 0 em todas.
select
  c.relname as tabela,
  c.relrowsecurity as rls_ligado,
  count(p.policyname) filter (where p.roles && array['anon', 'public']::name[]) as policies_anonimas,
  count(p.policyname) as policies_no_total
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public'
  and c.relname in ('clientes', 'obrigacoes', 'setores', 'grupos_clientes', 'usuarios_sistema', 'cliente_obrigacoes')
group by c.relname, c.relrowsecurity
order by c.relname;
