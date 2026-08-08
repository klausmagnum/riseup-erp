-- Tarefas pessoais do My Desktop.
--
-- Sao as tarefas do dia a dia que cada funcionario cadastra para si ("conferir
-- parcelamento do cliente XYZ todo dia 02"). Elas aparecem na agenda de
-- obrigacoes junto das obrigacoes do escritorio, porem so para quem cadastrou.
--
-- O recorte por dono e feito no servidor: /api/tarefas-pessoais filtra por
-- usuario_id antes de devolver ou gravar qualquer linha. RLS fica ligado e sem
-- policy nenhuma, no mesmo desenho de 20260802210000_fechar_leitura_anonima.sql
-- — nem anon nem authenticated leem estas tabelas direto do browser; quem toca
-- nelas e a service role, pela rota.

create table if not exists public.tarefas_pessoais (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios_sistema(id) on delete cascade,
  titulo text not null,
  descricao text,
  tipo text not null default 'Único',
  recorrencia text not null default 'Mensal',
  data_inicio date,
  prazo date not null,
  prioridade text not null default 'Media',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tarefas_pessoais
  add column if not exists usuario_id uuid,
  add column if not exists titulo text,
  add column if not exists descricao text,
  add column if not exists tipo text default 'Único',
  add column if not exists recorrencia text default 'Mensal',
  add column if not exists data_inicio date,
  add column if not exists prazo date,
  add column if not exists prioridade text default 'Media',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists tarefas_pessoais_usuario_idx
  on public.tarefas_pessoais (usuario_id, prazo);

-- Conclusao por ocorrencia, e nao um status unico na tarefa: uma tarefa mensal
-- marcada como feita em 02/08 precisa voltar a aparecer em 02/09. Por isso a
-- chave e (tarefa, data da ocorrencia).
create table if not exists public.tarefas_pessoais_conclusoes (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas_pessoais(id) on delete cascade,
  usuario_id uuid not null references public.usuarios_sistema(id) on delete cascade,
  data_ocorrencia date not null,
  concluida_em timestamptz not null default now(),
  unique (tarefa_id, data_ocorrencia)
);

create index if not exists tarefas_pessoais_conclusoes_usuario_idx
  on public.tarefas_pessoais_conclusoes (usuario_id, data_ocorrencia);

alter table public.tarefas_pessoais enable row level security;
alter table public.tarefas_pessoais_conclusoes enable row level security;

-- Nenhuma policy e criada de proposito. Se um dia o browser precisar ler estas
-- tabelas direto, a policy tem que comparar o dono da linha com o usuario da
-- sessao — algo como usuario_id = (select id from usuarios_sistema where
-- lower(email) = lower(auth.email())) — nunca a is_active_erp_user(), que
-- liberaria a tarefa de um funcionario para todos os outros.

-- Confere o resultado: rls_ligado deve ser true e policies deve ser 0.
select
  c.relname as tabela,
  c.relrowsecurity as rls_ligado,
  count(p.policyname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public'
  and c.relname in ('tarefas_pessoais', 'tarefas_pessoais_conclusoes')
group by c.relname, c.relrowsecurity
order by c.relname;
