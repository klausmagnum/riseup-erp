-- Prepara o banco para a captura de MDF-e.
--
-- A MDF-e tem serviço de distribuição próprio, hospedado na SVRS e não no
-- ambiente nacional da Receita, com fila de NSU independente da NF-e, do CT-e
-- e do ADN. A deduplicação por (cliente_id, origem, nsu) já separa os fluxos;
-- o que falta é o estado da fila.
--
-- A visão painel_fiscal_documentos_por_tipo já classifica o modelo 58 como
-- família MDFe desde 20260801100000, então os quadros da tela do cliente
-- passam a contar sozinhos assim que o primeiro manifesto for capturado.

alter table public.clientes
  add column if not exists ultimo_nsu_mdfe_recebida bigint,
  add column if not exists sincronizacao_mdfe_ativa boolean default true,
  add column if not exists ultima_sincronizacao_mdfe timestamptz,
  add column if not exists ultima_sincronizacao_mdfe_status text,
  add column if not exists mensagem_ultima_sincronizacao_mdfe text,
  add column if not exists proxima_sincronizacao_mdfe timestamptz;

comment on column public.clientes.proxima_sincronizacao_mdfe is
  'Antes deste horario o cliente nao deve ser consultado no MDFeDistribuicaoDFe. Respeita a janela do cStat 656.';

create index if not exists clientes_fila_sincronizacao_mdfe_idx
  on public.clientes (proxima_sincronizacao_mdfe asc nulls first)
  where sincronizacao_mdfe_ativa is true;

-- O painel decide o selo de situação olhando os fluxos juntos, então precisa
-- enxergar o da MDF-e também.
drop view if exists public.painel_fiscal_clientes;

create view public.painel_fiscal_clientes as
select
  c.id                                as cliente_id,
  c.razao_social,
  c.identificacao                     as cnpj,
  c.estado                            as uf,

  c.ultima_sincronizacao_nfe,
  c.ultima_sincronizacao_nfe_status,
  c.mensagem_ultima_sincronizacao_nfe,
  c.proxima_sincronizacao_nfe,
  c.ultimo_nsu_nfe_recebida,
  c.sincronizacao_nfe_ativa,

  c.ultima_sincronizacao_nfse,
  c.ultima_sincronizacao_nfse_status,
  c.mensagem_ultima_sincronizacao_nfse,
  c.proxima_sincronizacao_nfse,
  c.ultimo_nsu_nfse_recebida,
  c.sincronizacao_nfse_ativa,

  c.ultima_sincronizacao_cte,
  c.ultima_sincronizacao_cte_status,
  c.mensagem_ultima_sincronizacao_cte,
  c.proxima_sincronizacao_cte,
  c.ultimo_nsu_cte_recebida,
  c.sincronizacao_cte_ativa,

  c.ultima_sincronizacao_mdfe,
  c.ultima_sincronizacao_mdfe_status,
  c.mensagem_ultima_sincronizacao_mdfe,
  c.proxima_sincronizacao_mdfe,
  c.ultimo_nsu_mdfe_recebida,
  c.sincronizacao_mdfe_ativa,

  cert.certificado_nome,
  cert.certificado_validade,

  coalesce(doc.total, 0)              as total_documentos,
  coalesce(doc.completos, 0)          as documentos_completos,
  coalesce(doc.resumos, 0)            as documentos_resumo,
  coalesce(doc.eventos, 0)            as documentos_evento,
  coalesce(doc.recentes, 0)           as documentos_recentes,
  doc.ultima_emissao,
  doc.ultima_captura

from public.clientes c

left join lateral (
  select cc.nome as certificado_nome, cc.data_validade as certificado_validade
  from public.cliente_certificados cc
  where cc.cliente_id = c.id
    and cc.ativo is true
    and cc.deleted_at is null
  order by cc.principal desc nulls last, cc.data_validade desc nulls last
  limit 1
) cert on true

left join lateral (
  select
    count(*)                                                          as total,
    count(*) filter (where d.completude = 'completo')                 as completos,
    count(*) filter (where d.completude = 'resumo')                   as resumos,
    count(*) filter (where d.completude = 'evento')                   as eventos,
    count(*) filter (where d.created_at >= now() - interval '7 days') as recentes,
    max(d.data_emissao)                                               as ultima_emissao,
    max(d.created_at)                                                 as ultima_captura
  from public.documentos_fiscais d
  where d.cliente_id = c.id
    and d.deleted_at is null
    and (d.status_processamento is null or d.status_processamento <> 'Substituido')
) doc on true

where c.status = 'Ativo';

comment on view public.painel_fiscal_clientes is
  'Uma linha por cliente ativo com certificado, situacao das sincronizacoes de NF-e, NFS-e, CT-e e MDF-e e contagem de documentos. Alimenta o painel de documentos fiscais.';
