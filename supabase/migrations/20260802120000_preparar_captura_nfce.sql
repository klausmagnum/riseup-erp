-- Prepara o banco para a captura de NFC-e.
--
-- A NFC-e não ganha fila de NSU como a NF-e, a NFS-e e o CT-e ganharam: o
-- ambiente nacional não distribui o modelo 65. A venda a consumidor é
-- autorizada na SEFAZ estadual, e o caminho para o XML é a consulta por chave
-- de acesso (consChNFe, no mesmo NFeDistribuicaoDFe). Por isso aqui não há
-- colunas de sincronização — não há de onde paginar.
--
-- O que muda é a deduplicação, que até agora se apoiava só no NSU.

-- 1. Documento capturado por chave não tem NSU.
--
-- O NSU é o número da entrada na fila da origem. A consulta por chave não
-- passa por fila nenhuma, então grava nsu nulo — e o índice único existente,
-- que é parcial em "nsu is not null", não a alcança. Sem esta guarda, consultar
-- a mesma chave duas vezes gravaria a nota duas vezes, e ela apareceria em
-- dobro na contagem do painel.
--
-- Eventos ficam de fora porque uma nota tem vários, todos com a chave dela; o
-- que os separa é o tipo do evento, que mora em json_dados.
create unique index if not exists documentos_fiscais_cliente_chave_completude_idx
  on public.documentos_fiscais (cliente_id, chave_acesso, completude)
  where nsu is null and chave_acesso is not null and completude <> 'evento';

comment on index public.documentos_fiscais_cliente_chave_completude_idx is
  'Deduplica o que foi capturado por chave de acesso, que nao tem NSU para deduplicar.';

-- 2. A busca por chave passou a ser caminho quente.
--
-- Toda gravação agora confere se a mesma chave já existe, para que a nota
-- buscada por chave não duplique a que veio pela fila. Sem índice isso é uma
-- varredura da tabela inteira a cada documento capturado.
create index if not exists documentos_fiscais_cliente_chave_idx
  on public.documentos_fiscais (cliente_id, chave_acesso);
