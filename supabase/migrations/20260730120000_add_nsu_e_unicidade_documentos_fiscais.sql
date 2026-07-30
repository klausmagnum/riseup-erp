-- O NSU é o identificador sequencial que a SEFAZ atribui a cada documento
-- destinado ao CNPJ. É único por cliente e é o que permite deduplicar de forma
-- confiável: a chave de acesso sozinha não serve, porque um mesmo documento
-- aparece na distribuição como resumo e depois como XML completo, e os eventos
-- (cancelamento, CC-e) repetem a chave da nota original.

alter table public.documentos_fiscais
  add column if not exists nsu text,
  add column if not exists completude text,
  add column if not exists drive_file_id text;

comment on column public.documentos_fiscais.nsu is
  'Número Sequencial Único atribuído pela SEFAZ na distribuição de DF-e';
comment on column public.documentos_fiscais.completude is
  'resumo | completo | evento — resumo indica que falta manifestação do destinatário para obter o XML integral';

-- Impede que a mesma entrada da distribuição seja gravada duas vezes.
create unique index if not exists documentos_fiscais_cliente_nsu_idx
  on public.documentos_fiscais (cliente_id, nsu)
  where nsu is not null;

-- Consulta mais frequente do painel: documentos de um cliente por período.
create index if not exists documentos_fiscais_cliente_data_idx
  on public.documentos_fiscais (cliente_id, data_emissao desc);

-- Fila de sincronização: a coluna abaixo evita que o cron reprocesse quem já
-- foi atendido no ciclo corrente e permite retomar de onde parou.
alter table public.clientes
  add column if not exists sincronizacao_nfe_ativa boolean default true,
  add column if not exists proxima_sincronizacao_nfe timestamptz;

comment on column public.clientes.proxima_sincronizacao_nfe is
  'Antes deste horário o cliente não deve ser consultado. Usado para respeitar o bloqueio de consumo indevido (cStat 656) da SEFAZ.';

create index if not exists clientes_fila_sincronizacao_idx
  on public.clientes (proxima_sincronizacao_nfe asc nulls first)
  where sincronizacao_nfe_ativa is true;
