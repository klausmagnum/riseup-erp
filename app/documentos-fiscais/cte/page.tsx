import FiscalModulePage from "../FiscalModulePage";

export const dynamic = 'force-dynamic';

export default function CtePage() {
  return <FiscalModulePage title="CT-e" subtitle="Consulte e importe conhecimentos de transporte eletrônico vinculados aos clientes." tabs={["Recebidos", "Emitidos", "Eventos", "Consulta por chave"]} actions={["Sincronizar CT-e", "Importar XML", "Consultar por chave"]} columns={["Cliente", "Número", "Série", "Chave de acesso", "Emitente", "Tomador", "Data de emissão", "Valor do frete", "Status", "Origem", "Ações"]} emptyMessage="Nenhum CT-e encontrado. Sincronize, importe um XML ou consulte por chave de acesso." />;
}
