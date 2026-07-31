-- Adicionar colunas de sincronização de NF-e à tabela clientes
alter table public.clientes
add column if not exists ultimo_nsu_nfe_recebida integer default 0,
add column if not exists ultima_sincronizacao_nfe timestamptz,
add column if not exists ultima_sincronizacao_nfe_status text default 'Nunca',
add column if not exists mensagem_ultima_sincronizacao_nfe text;

-- Adicionar índice para melhorar query de clientes com certificados
create index if not exists clientes_ultima_sincronizacao_nfe_idx
on public.clientes (ultima_sincronizacao_nfe desc);

-- Comentários nas colunas
comment on column public.clientes.ultimo_nsu_nfe_recebida is 'Último NSU (número sequencial de uso) sincronizado de NF-es recebidas do Sefaz';
comment on column public.clientes.ultima_sincronizacao_nfe is 'Data e hora da última sincronização de NF-es recebidas';
comment on column public.clientes.ultima_sincronizacao_nfe_status is 'Status da última sincronização: Sucesso, Erro, Nunca';
comment on column public.clientes.mensagem_ultima_sincronizacao_nfe is 'Mensagem de erro (se houver) da última sincronização';
