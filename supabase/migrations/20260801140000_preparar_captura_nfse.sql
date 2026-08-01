-- Prepara o banco para a captura de NFS-e pelo ambiente nacional (ADN).
--
-- Três mudanças, todas necessárias antes de a primeira NFS-e ser gravada.

-- 1. Deduplicação por fluxo de origem.
--
-- O NSU da NFS-e é uma sequência própria do ADN, independente da SEFAZ: o
-- cliente tem um NSU 7 da NF-e e um NSU 7 da NFS-e, que são documentos
-- diferentes. O índice antigo era (cliente_id, nsu) e trataria o segundo como
-- duplicata do primeiro, descartando a nota em silêncio.
drop index if exists public.documentos_fiscais_cliente_nsu_idx;

create unique index if not exists documentos_fiscais_cliente_fonte_nsu_idx
  on public.documentos_fiscais (cliente_id, coalesce(origem, ''), nsu)
  where nsu is not null;

comment on index public.documentos_fiscais_cliente_fonte_nsu_idx is
  'Deduplica por fluxo: o NSU da SEFAZ e o do ADN sao sequencias independentes.';

-- 2. Estado da sincronização de NFS-e, espelhando o que já existe para NF-e.
alter table public.clientes
  add column if not exists ultimo_nsu_nfse_recebida bigint,
  add column if not exists sincronizacao_nfse_ativa boolean default true,
  add column if not exists ultima_sincronizacao_nfse timestamptz,
  add column if not exists ultima_sincronizacao_nfse_status text,
  add column if not exists mensagem_ultima_sincronizacao_nfse text,
  add column if not exists proxima_sincronizacao_nfse timestamptz;

comment on column public.clientes.proxima_sincronizacao_nfse is
  'Antes deste horario o cliente nao deve ser consultado no ADN. O ambiente nacional responde HTTP 429 a consumo repetido.';

create index if not exists clientes_fila_sincronizacao_nfse_idx
  on public.clientes (proxima_sincronizacao_nfse asc nulls first)
  where sincronizacao_nfse_ativa is true;

-- 3. Classificação por modelo só vale para chave de 44 dígitos.
--
-- A chave da NFS-e tem 50 dígitos, e as posições 21-22 dela não são o modelo
-- do documento. Sem esta guarda, uma NFS-e cujos dígitos 21-22 calhassem de
-- ser "55" cairia no quadro de NF-e. Verificado contra chave real do ADN:
-- 24081021222408768000131000000000318024101188374898.
drop view if exists public.painel_fiscal_documentos_por_tipo;

create view public.painel_fiscal_documentos_por_tipo as
select
  d.cliente_id,

  -- O evento carrega a chave da nota a que se refere, então pelo modelo ele
  -- seria uma NF-e. Por isso a completude decide antes da chave.
  case
    when d.completude = 'evento' then 'Evento'
    when length(d.chave_acesso) = 44 and substring(d.chave_acesso from 21 for 2) = '55' then 'NFe'
    when length(d.chave_acesso) = 44 and substring(d.chave_acesso from 21 for 2) = '65' then 'NFCe'
    when length(d.chave_acesso) = 44 and substring(d.chave_acesso from 21 for 2) = '57' then 'CTe'
    when length(d.chave_acesso) = 44 and substring(d.chave_acesso from 21 for 2) = '67' then 'CTeOS'
    when length(d.chave_acesso) = 44 and substring(d.chave_acesso from 21 for 2) = '58' then 'MDFe'
    -- NFS-e tem chave de 50 dígitos e cai aqui, pelo tipo gravado.
    else coalesce(nullif(d.tipo_documento, ''), 'Outros')
  end as familia,

  -- Saída é o que o próprio cliente emitiu. Na NFS-e o emitente é o prestador
  -- do serviço, então a mesma regra separa prestadas de tomadas.
  case
    when nullif(regexp_replace(coalesce(c.identificacao, ''), '\D', '', 'g'), '') is not null
     and d.emitente_cnpj_cpf = regexp_replace(c.identificacao, '\D', '', 'g')
    then 'saida'
    else 'entrada'
  end as direcao,

  coalesce(nullif(d.completude, ''), 'indefinido') as situacao,
  d.data_emissao,

  count(*)          as quantidade,
  max(d.created_at) as ultima_captura

from public.documentos_fiscais d
join public.clientes c on c.id = d.cliente_id

where d.deleted_at is null
  and (d.status_processamento is null or d.status_processamento <> 'Substituido')

group by 1, 2, 3, 4, 5;

comment on view public.painel_fiscal_documentos_por_tipo is
  'Quantidade de documentos capturados por cliente, familia (NFe, NFCe, NFSe, CTe...), direcao (entrada/saida), situacao e data de emissao. Alimenta os quadros da tela do cliente.';
