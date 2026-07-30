import FiscalModulePage from "../FiscalModulePage";

export const dynamic = 'force-dynamic';

export default function SincronizacoesPage() {
  return <FiscalModulePage title="Sincronizações" subtitle="Acompanhe as execuções de busca, captura e atualização dos documentos fiscais." tabs={["Cliente", "Tipo de documento", "Status", "Período", "Origem"]} actions={["Nova sincronização", "Sincronizar todos", "Atualizar status"]} columns={["Cliente", "Tipo de documento", "Início", "Fim", "Status", "Quantidade encontrada", "Quantidade importada", "Quantidade com erro", "Mensagem", "Ações"]} emptyMessage="Nenhuma sincronização fiscal registrada." />;
}
