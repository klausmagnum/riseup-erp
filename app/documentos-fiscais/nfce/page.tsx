"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import ErpChrome from "@/app/components/ErpChrome";
import CapturarPorChaveModal from "@/app/components/CapturarPorChaveModal";
import DocumentosFiscaisTable from "../DocumentosFiscaisTable";

export const dynamic = "force-dynamic";

/** useSearchParams exige Suspense no App Router; isolado aqui para não
 *  suspender a página inteira. */
function TabelaComCliente({ versao }: { versao: number }) {
  const cliente = useSearchParams().get("cliente") ?? undefined;
  return (
    <DocumentosFiscaisTable
      key={`${versao}-${cliente ?? ""}`}
      familia="NFCe"
      clienteInicial={cliente}
    />
  );
}

export default function NfcePage() {
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
          <h1 className="mt-1 text-2xl font-black leading-tight">NFC-e</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Notas fiscais de consumidor (modelo 65). Diferente da NF-e e do
            CT-e, a NFC-e não é distribuída por fila pelo ambiente nacional — ela
            é autorizada na SEFAZ estadual. A captura é pela chave de acesso, que
            traz o XML integral e arquiva no Google Drive.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="min-h-9 rounded-lg bg-sky-300 px-3 text-xs font-black text-slate-950 transition hover:bg-sky-200"
            type="button"
            onClick={() => setModalAberto(true)}
          >
            Capturar por chave
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

      <Suspense fallback={<p className="mt-8 text-center text-sm text-sky-100">Carregando...</p>}>
        <TabelaComCliente versao={versao} />
      </Suspense>

      <CapturarPorChaveModal
        isOpen={modalAberto}
        onCancel={() => setModalAberto(false)}
        onCapturaCompleta={() => setVersao((v) => v + 1)}
      />
    </ErpChrome>
  );
}
