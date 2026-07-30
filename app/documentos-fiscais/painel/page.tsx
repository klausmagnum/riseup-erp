import FiscalModulePage from "../FiscalModulePage";

export const dynamic = 'force-dynamic';

export default function PainelFiscalPage() {
  return (
    <FiscalModulePage
      title="Painel Fiscal"
      subtitle="Acompanhe documentos fiscais capturados, pendências, sincronizações e integrações fiscais dos clientes."
      cards={[
        { label: "NF-e recebidas no mês", value: "0", tone: "text-sky-300" },
        { label: "NF-e emitidas no mês", value: "0", tone: "text-blue-300" },
        { label: "NFS-e tomadas", value: "0", tone: "text-violet-300" },
        { label: "NFS-e prestadas", value: "0", tone: "text-emerald-300" },
        { label: "CT-e recebidos", value: "0", tone: "text-cyan-300" },
        { label: "NFC-e importadas", value: "0", tone: "text-indigo-300" },
        { label: "Documentos pendentes", value: "0", tone: "text-amber-300" },
        { label: "Sincronizações com erro", value: "0", tone: "text-rose-300" },
      ]}
      columns={["Cliente", "Tipo de documento", "Data/hora", "Status", "Quantidade de documentos", "Mensagem"]}
      emptyMessage="Nenhuma sincronização registrada."
      secondaryTitle="Pendências recentes"
      secondaryColumns={["Cliente", "Documento", "Tipo", "Data de emissão", "Valor", "Pendência", "Status"]}
    />
  );
}
