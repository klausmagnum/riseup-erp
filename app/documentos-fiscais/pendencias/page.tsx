import FiscalModulePage from "../FiscalModulePage";

export const dynamic = 'force-dynamic';

export default function PendenciasPage() {
  return <FiscalModulePage title="Pendências Fiscais" subtitle="Visualize documentos fiscais que precisam de classificação, correção, vínculo ou conferência." cards={[{ label: "Pendências totais", value: "0", tone: "text-amber-300" }, { label: "Sem classificação financeira", value: "0", tone: "text-sky-300" }, { label: "Sem centro de custo", value: "0", tone: "text-violet-300" }, { label: "Sem fornecedor vinculado", value: "0", tone: "text-blue-300" }, { label: "Com divergência de valor", value: "0", tone: "text-rose-300" }, { label: "Com erro de importação", value: "0", tone: "text-red-300" }]} tabs={["Cliente", "Tipo de documento", "Tipo de pendência", "Status", "Período"]} columns={["Cliente", "Documento", "Tipo", "Emitente/Prestador", "Data de emissão", "Valor", "Pendência", "Status", "Responsável", "Ações"]} emptyMessage="Nenhuma pendência fiscal encontrada." />;
}
