"use client";

import FiscalModulePage from "../FiscalModulePage";

export const dynamic = 'force-dynamic';

// A sincronização automática de NFS-e ainda não está disponível: não existe
// webservice nacional único e cada município (Natal, Parnamirim, Macaíba)
// precisa de tratamento próprio. A listagem e a importação manual seguem ativas.
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
