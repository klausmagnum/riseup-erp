-- Expõe o estado da sincronização de NFS-e na visão do painel por cliente.
--
-- O selo de situação do painel era decidido só pela coluna da NF-e. Com a
-- captura de NFS-e no ar, um cliente podia aparecer vermelho por causa da
-- NF-e enquanto a NFS-e estava em dia — e o contrário também.

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

-- Certificado ativo em uso. O principal tem precedência, mesmo critério que a
-- sincronização usa ao escolher qual carregar.
left join lateral (
  select cc.nome as certificado_nome, cc.data_validade as certificado_validade
  from public.cliente_certificados cc
  where cc.cliente_id = c.id
    and cc.ativo is true
    and cc.deleted_at is null
  order by cc.principal desc nulls last, cc.data_validade desc nulls last
  limit 1
) cert on true

-- Versões substituídas ficam de fora: são a mesma nota já contada.
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
  'Uma linha por cliente ativo com certificado, situacao das sincronizacoes de NF-e e NFS-e e contagem de documentos. Alimenta o painel de documentos fiscais.';
