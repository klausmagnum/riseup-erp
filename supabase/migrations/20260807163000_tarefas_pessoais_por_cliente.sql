-- Tarefa pessoal para varios clientes ou por regime tributario.
--
-- A tarefa deixa de ser sempre solta: ela pode valer para uma lista de clientes
-- escolhidos a dedo, para todos os clientes de certos regimes tributarios, ou
-- para ninguem (a tarefa em si, como era ate agora).
--
-- Os regimes ficam guardados como regime, e nao expandidos em ids de cliente:
-- assim um cliente novo de Lucro Presumido entra na tarefa sozinho, sem
-- precisar reeditar. A lista de clientes de uma tarefa e resolvida na leitura,
-- em app/lib/tarefasPessoais.ts.
--
-- Roda depois de 20260807120000_criar_tarefas_pessoais.sql.

alter table public.tarefas_pessoais
  add column if not exists clientes_vinculados text[] not null default '{}',
  add column if not exists regimes text[] not null default '{}';

-- A conclusao passa a ser por cliente, igual a das obrigacoes: finalizar a
-- tarefa do cliente A no dia 02 nao finaliza a do cliente B no mesmo dia.
-- cliente_id nulo e a tarefa sem cliente nenhum.
alter table public.tarefas_pessoais_conclusoes
  add column if not exists cliente_id uuid;

-- A unicidade antiga (tarefa, dia) impediria o segundo cliente do mesmo dia.
do $$
declare
  restricao text;
begin
  for restricao in
    select conname
    from pg_constraint
    where conrelid = 'public.tarefas_pessoais_conclusoes'::regclass
      and contype = 'u'
      and array_length(conkey, 1) = 2
  loop
    execute format('alter table public.tarefas_pessoais_conclusoes drop constraint %I', restricao);
    raise notice 'unicidade antiga removida: %', restricao;
  end loop;
end $$;

-- `nulls not distinct` para que a tarefa sem cliente (cliente_id nulo) tambem
-- so possa ser concluida uma vez por dia. Exige Postgres 15+.
create unique index if not exists tarefas_pessoais_conclusoes_ocorrencia_idx
  on public.tarefas_pessoais_conclusoes (tarefa_id, data_ocorrencia, cliente_id) nulls not distinct;

-- Confere o resultado: as duas colunas novas na tarefa, a coluna e o indice
-- novos na conclusao.
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'tarefas_pessoais'
      and column_name in ('clientes_vinculados', 'regimes')) as colunas_na_tarefa,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'tarefas_pessoais_conclusoes'
      and column_name = 'cliente_id') as coluna_cliente,
  (select count(*) from pg_indexes
    where schemaname = 'public' and indexname = 'tarefas_pessoais_conclusoes_ocorrencia_idx') as indice_novo;
