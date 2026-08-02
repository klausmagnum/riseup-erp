"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/**
 * Captura de documentos pela chave de acesso.
 *
 * É a única entrada da NFC-e: o modelo 65 não tem fila de NSU no ambiente
 * nacional, então quem traz a nota para dentro é a chave — do cupom, do PDV ou
 * do relatório do portal estadual. Aceita a lista inteira de uma vez porque é
 * assim que ela chega ao escritório: um bloco de chaves colado de uma planilha.
 */

interface Cliente {
  id: string;
  razao_social: string;
  identificacao: string | null;
}

interface ResultadoChave {
  chave: string;
  ok: boolean;
  cStat: string;
  gravados: number;
  duplicados: number;
  mensagem: string;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Mesma leitura do servidor: qualquer separador serve, o que vale é o bloco
 *  de 44 dígitos. Aqui só para contar antes de enviar. */
function contarChaves(texto: string) {
  return new Set(texto.match(/\d{44}/g) ?? []).size;
}

export default function CapturarPorChaveModal({
  isOpen,
  onCancel,
  onCapturaCompleta,
}: {
  isOpen: boolean;
  onCancel: () => void;
  onCapturaCompleta?: () => void;
}) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [texto, setTexto] = useState("");
  const [ambiente, setAmbiente] = useState<"producao" | "homologacao">("producao");
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultados, setResultados] = useState<ResultadoChave[] | null>(null);
  const [resumo, setResumo] = useState("");

  const quantidade = contarChaves(texto);

  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      try {
        if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase nao configurado.");
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data } = await supabase
          .from("clientes")
          .select("id,razao_social,identificacao")
          .eq("status", "Ativo")
          .order("razao_social");
        setClientes(data ?? []);
      } catch {
        // Sem a lista o campo fica vazio, e a chave ainda identifica o cliente
        // pelo CNPJ do emitente.
      }
    })();
  }, [isOpen]);

  /** Limpar ao fechar, e não ao abrir: o resultado da rodada anterior não pode
   *  reaparecer junto de uma lista de chaves nova. */
  function fechar() {
    setErro("");
    setResumo("");
    setResultados(null);
    setTexto("");
    onCancel();
  }

  async function capturar() {
    setExecutando(true);
    setErro("");
    setResultados(null);

    try {
      if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase nao configurado.");

      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("Sessao expirada. Entre novamente.");

      const resposta = await fetch("/api/documentos-fiscais/consultar-chave", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId: clienteId || undefined, chaves: texto, ambiente }),
      });

      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error || "Falha na consulta.");

      setResultados(dados.resultados ?? []);
      setResumo(
        `${dados.cliente}: ${dados.mensagem}` +
          (dados.naoAlcancadas?.length
            ? ` ${dados.naoAlcancadas.length} chave(s) nao alcancada(s) no tempo da execucao — envie de novo.`
            : "")
      );

      if (dados.gravados > 0) onCapturaCompleta?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setExecutando(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/78 px-4 py-6 backdrop-blur-sm">
      <section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#061020] p-5 shadow-2xl shadow-black/40">
        <h2 className="text-base font-black text-slate-100">Capturar por chave de acesso</h2>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          A SEFAZ não distribui NFC-e por fila, como faz com NF-e e CT-e: o
          modelo 65 é autorizado na SEFAZ estadual e só se chega a ele pela
          chave. Cole as chaves — uma por linha, ou coladas de uma planilha — e o
          sistema busca o XML integral de cada uma, arquiva no Drive e grava.
        </p>

        <div className="mt-4 space-y-3">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Cliente
            </span>
            <select
              className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none disabled:opacity-60"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              disabled={executando}
            >
              <option value="">Identificar pelo CNPJ do emitente na chave</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razao_social}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-500">
              A consulta usa o certificado do cliente. Para nota de entrada —
              emitida por terceiro contra o cliente — é preciso escolher o
              cliente, porque a chave só nomeia quem emitiu.
            </span>
          </label>

          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Chaves de acesso
            </span>
            <textarea
              className="min-h-32 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-[11px] text-slate-100 outline-none disabled:opacity-60"
              value={texto}
              placeholder="35260712345678000199650010000012341123456789"
              onChange={(e) => setTexto(e.target.value)}
              disabled={executando}
            />
            <span className="text-[10px] text-slate-500">
              {quantidade === 0
                ? "Nenhuma chave de 44 dígitos reconhecida ainda."
                : `${quantidade} chave(s) reconhecida(s).`}
            </span>
          </label>

          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Ambiente
            </span>
            <select
              className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none disabled:opacity-60"
              value={ambiente}
              onChange={(e) => setAmbiente(e.target.value as "producao" | "homologacao")}
              disabled={executando}
            >
              <option value="producao">Produção</option>
              <option value="homologacao">Homologação (testes)</option>
            </select>
          </label>

          {erro && (
            <div className="rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-3 text-xs text-rose-100">
              {erro}
            </div>
          )}

          {resumo && (
            <div className="rounded-lg border border-sky-300/25 bg-sky-300/10 px-3 py-3 text-xs text-sky-100">
              {resumo}
            </div>
          )}

          {resultados && resultados.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead className="bg-slate-950/70 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-black">Chave</th>
                    <th className="px-2 py-2 font-black">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r) => (
                    <tr className="border-t border-white/5" key={r.chave}>
                      <td className="px-2 py-2 font-mono text-[10px] text-slate-400">
                        {r.chave.slice(0, 8)}…{r.chave.slice(-8)}
                      </td>
                      <td
                        className={`px-2 py-2 ${
                          r.gravados > 0
                            ? "text-emerald-200"
                            : r.ok
                              ? "text-slate-300"
                              : "text-amber-200"
                        }`}
                      >
                        {r.mensagem}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="min-h-9 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100 disabled:opacity-60"
            onClick={fechar}
            disabled={executando}
            type="button"
          >
            Fechar
          </button>
          <button
            className="min-h-9 rounded-lg bg-sky-300 px-4 text-xs font-black text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={capturar}
            disabled={executando || quantidade === 0}
            type="button"
          >
            {executando ? "Consultando a SEFAZ..." : `Capturar ${quantidade || ""}`.trim()}
          </button>
        </div>
      </section>
    </div>
  );
}
