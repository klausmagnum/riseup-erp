"use client";

import FiscalModulePage from "../FiscalModulePage";

export const dynamic = 'force-dynamic';

// Esta tela ainda é maquete. A captura de NFS-e já funciona, pelo ambiente
// nacional (app/lib/nfse/), e os documentos aparecem nos quadros da tela do
// cliente, em Documentos Fiscais › Painel por cliente.
export default function NfsePage() {
  return (
    <FiscalModulePage
      title="NFS-e"
      subtitle="Gerencie notas fiscais de serviço prestadas e tomadas pelos clientes."
      tabs={["Prestadas", "Tomadas", "Consulta por chave/número", "Importações"]}
      actions={["Importar XML", "Importar PDF", "Consultar nota"]}
      columns={["Cliente", "Número", "Município", "Prestador", "Tomador", "Data de emissão", "Valor do serviço", "ISS", "Status", "Origem", "Ações"]}
      emptyMessage="Nenhuma NFS-e encontrada. Importe um documento ou consulte uma nota."
    />
  );
}
