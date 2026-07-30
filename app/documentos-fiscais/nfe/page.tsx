"use client";

import { useState } from "react";
import FiscalModulePage from "../FiscalModulePage";
import SyncNFeModal from "@/app/components/SyncNFeModal";

export const dynamic = 'force-dynamic';

export default function NfePage() {
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  return (
    <>
      <FiscalModulePage
        title="NF-e"
        subtitle="Consulte, importe e acompanhe notas fiscais eletrônicas vinculadas aos clientes."
        tabs={["Recebidas", "Emitidas", "Eventos", "Manifestação do Destinatário", "Consulta por Chave"]}
        actions={["Sincronizar NF-e", "Importar XML", "Consultar por chave"]}
        columns={["Cliente", "Número", "Série", "Chave de acesso", "Emitente", "Destinatário", "Data de emissão", "Valor total", "Status", "Origem", "Ações"]}
        emptyMessage="Nenhuma NF-e encontrada. Sincronize, importe um XML ou consulte por chave de acesso."
        onSyncClick={() => setIsSyncModalOpen(true)}
      />
      <SyncNFeModal
        isOpen={isSyncModalOpen}
        onCancel={() => setIsSyncModalOpen(false)}
        onSyncComplete={() => setIsSyncModalOpen(false)}
      />
    </>
  );
}
