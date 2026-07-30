import FiscalModulePage from "../FiscalModulePage";

export const dynamic = 'force-dynamic';

export default function NfcePage() {
  return <FiscalModulePage title="NFC-e" subtitle="Importe e acompanhe notas fiscais de consumidor eletrônicas quando aplicável." tabs={["Emitidas", "Importadas", "Consulta por chave"]} actions={["Importar XML", "Consultar por chave", "Sincronizar NFC-e"]} columns={["Cliente", "Número", "Série", "Chave de acesso", "Data de emissão", "Valor total", "UF", "Status", "Origem", "Ações"]} emptyMessage="Nenhuma NFC-e encontrada. Importe um XML ou consulte por chave de acesso." />;
}
