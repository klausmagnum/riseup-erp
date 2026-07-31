"use client";

import { useState } from "react";
import ErpChrome from "@/app/components/ErpChrome";
import SyncNFeModal from "@/app/components/SyncNFeModal";
import DocumentosFiscaisTable from "../DocumentosFiscaisTable";

export const dynamic = "force-dynamic";

export default function NfePage() {
  const [modalAberto, setModalAberto] = useState(false);
  // Trocar a chave remonta a tabela, que recarrega os dados ao montar.
  const [versao, setVersao] = useState(0);

  return (
    <ErpChrome>
      <header className="flex items-start justify-between gap-4 max-[760px]:flex-col">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">
            Documentos Fiscais
          </p>
          <h1 className="mt-1 text-2xl font-black leading-tight">NF-e</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Notas fiscais eletrônicas recebidas pelos clientes, capturadas
            automaticamente na SEFAZ e arquivadas no Google Drive.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="min-h-9 rounded-lg bg-sky-300 px-3 text-xs font-black text-slate-950 transition hover:bg-sky-200"
            type="button"
            onClick={() => setModalAberto(true)}
          >
            Sincronizar NF-e
          </button>
          <button
            className="min-h-9 rounded-lg border border-white/10 px-3 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
            type="button"
            onClick={() => setVersao((v) => v + 1)}
          >
            Recarregar
          </button>
        </div>
      </header>

      <DocumentosFiscaisTable key={versao} />

      <SyncNFeModal
        isOpen={modalAberto}
        onCancel={() => setModalAberto(false)}
        onSyncComplete={() => {
          setModalAberto(false);
          setVersao((v) => v + 1);
        }}
      />
    </ErpChrome>
  );
}
