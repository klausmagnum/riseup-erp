import FiscalModulePage from "../FiscalModulePage";

export const dynamic = 'force-dynamic';

export default function ImportacoesPage() {
  return <FiscalModulePage title="Importações" subtitle="Importe XMLs, PDFs e arquivos fiscais para leitura e processamento no ERP." tabs={["Importar XML", "Importar múltiplos XMLs", "Importar ZIP com XMLs", "Importar PDF", "Histórico de importações"]} actions={["Importar arquivo"]} columns={["Cliente", "Arquivo", "Tipo", "Data de importação", "Usuário", "Status", "Quantidade de documentos", "Quantidade com erro", "Ações"]} emptyMessage="Nenhuma importação realizada. Importe XMLs ou arquivos fiscais para iniciar." />;
}
