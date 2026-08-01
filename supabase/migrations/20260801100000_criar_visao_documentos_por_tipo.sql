-- Contagem dos documentos capturados por família, direção e situação.
--
-- A tela do cliente mostra um quadro para cada tipo de documento — NF-e de
-- entrada, NF-e de saída, CT-e de entrada e assim por diante. Montar esses
-- quadros com uma consulta de contagem cada seriam dezenas de idas ao banco a
-- cada abertura da tela; aqui sai tudo numa consulta só.
--
-- A mesma classificação está em app/lib/documentosFiscais/classificacao.ts,
-- que monta os filtros da listagem. As duas precisam andar juntas: uma diz o
-- número do quadro, a outra diz quais linhas aparecem ao abrir o quadro.
--
-- A data de emissão entra no agrupamento para que o filtro de período da tela
-- valha também para os quadros — senão o quadro diria 33 notas e a lista
-- mostraria as 5 do mês escolhido.

-- O drop vem antes porque "create or replace" não troca a ordem nem o nome
-- das colunas de uma visão já existente — ele falha com 42P16. Derrubar é
-- seguro: a visão não guarda dado, só lê documentos_fiscais.
drop view if exists public.painel_fiscal_documentos_por_tipo;

create view public.painel_fiscal_documentos_por_tipo as
select
  d.cliente_id,

  -- O evento carrega a chave da nota a que se refere, então pelo modelo ele
  -- seria uma NF-e. Por isso a completude decide antes da chave.
  case
    when d.completude = 'evento'                        then 'Evento'
    when substring(d.chave_acesso from 21 for 2) = '55' then 'NFe'
    when substring(d.chave_acesso from 21 for 2) = '65' then 'NFCe'
    when substring(d.chave_acesso from 21 for 2) = '57' then 'CTe'
    when substring(d.chave_acesso from 21 for 2) = '67' then 'CTeOS'
    when substring(d.chave_acesso from 21 for 2) = '58' then 'MDFe'
    -- NFS-e é municipal e não tem chave de 44 dígitos.
    else coalesce(nullif(d.tipo_documento, ''), 'Outros')
  end as familia,

  -- Saída é o que o próprio cliente emitiu. Sem CNPJ no cadastro não há como
  -- dizer o lado, e tudo fica como entrada.
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

-- Versões substituídas ficam de fora: são a mesma nota já contada, no mesmo
-- critério da visão painel_fiscal_clientes.
where d.deleted_at is null
  and (d.status_processamento is null or d.status_processamento <> 'Substituido')

group by 1, 2, 3, 4, 5;

comment on view public.painel_fiscal_documentos_por_tipo is
  'Quantidade de documentos capturados por cliente, família (NFe, NFCe, CTe...), direção (entrada/saída), situação (completo, resumo, evento) e data de emissão. Alimenta os quadros da tela do cliente.';
