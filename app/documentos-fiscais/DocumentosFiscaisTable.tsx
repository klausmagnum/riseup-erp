"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

interface Documento {
  id: string;
  cliente_nome: string;
  tipo_documento: string;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  emitente_nome: string | null;
  emitente_cnpj_cpf: string | null;
  uf: string | null;
  status_documento: string | null;
  completude: string | null;
  nsu: string | null;
  xml_storage_path: string | null;
}

interface Cliente {
  id: string;
  razao_social: string;
}

interface Resumo {
  notas: number;
  aguardandoManifestacao: number;
  eventos: number;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatarData(iso: string | null) {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDocumento(valor: string | null) {
  const limpo = (valor ?? "").replace(/\D/g, "");
  if (limpo.length === 14) {
    return limpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (limpo.length === 11) {
    return limpo.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return valor ?? "—";
}

/** O selo de completude é a informação mais importante da linha: define se o
 *  documento serve para escrituração ou apenas para conferência. */
function SeloCompletude({ completude }: { completude: string | null }) {
  const estilos: Record<string, { texto: string; classe: string; titulo: string }> = {
    completo: {
      texto: "XML completo",
      classe: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
      titulo: "XML integral da nota. Serve para escrituração.",
    },
    resumo: {
      texto: "Só resumo",
      classe: "border-amber-300/30 bg-amber-300/10 text-amber-200",
      titulo:
        "A SEFAZ só liberou o resumo. O XML integral exige manifestação do destinatário.",
    },
    evento: {
      texto: "Evento",
      classe: "border-slate-300/20 bg-slate-300/10 text-slate-300",
      titulo: "Cancelamento, carta de correção ou manifestação sobre a nota.",
    },
  };

  const estilo = estilos[completude ?? ""] ?? {
    texto: completude ?? "—",
    classe: "border-slate-300/20 bg-slate-300/10 text-slate-400",
    titulo: "",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-bold ${estilo.classe}`}
      title={estilo.titulo}
    >
      {estilo.texto}
    </span>
  );
}

export default function DocumentosFiscaisTable({
  tipo,
  clienteInicial,
}: {
  tipo?: string;
  /** Vem do link "ver todos" do painel, para a tela abrir já filtrada. */
  clienteInicial?: string;
}) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [filtroCliente, setFiltroCliente] = useState(clienteInicial ?? "");
  const [filtroCompletude, setFiltroCompletude] = useState("");
  const [filtroDe, setFiltroDe] = useState("");
  const [filtroAte, setFiltroAte] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [mostrarSubstituidos, setMostrarSubstituidos] = useState(false);

  async function pegarToken() {
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase nao configurado.");
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error("Sessao expirada. Entre novamente.");
    return token;
  }

  useEffect(() => {
    async function carregarClientes() {
      try {
        if (!supabaseUrl || !supabaseAnonKey) return;
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data } = await supabase
          .from("clientes")
          .select("id,razao_social")
          .eq("status", "Ativo")
          .order("razao_social");
        setClientes(data ?? []);
      } catch {
        // O filtro de cliente é conveniência; a listagem funciona sem ele.
      }
    }
    carregarClientes();
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");

    try {
      const token = await pegarToken();
      const params = new URLSearchParams({ pagina: String(pagina), tamanho: "50" });
      if (tipo) params.set("tipo", tipo);
      if (filtroCliente) params.set("clienteId", filtroCliente);
      if (filtroCompletude) params.set("completude", filtroCompletude);
      if (filtroDe) params.set("de", filtroDe);
      if (filtroAte) params.set("ate", filtroAte);
      if (buscaAplicada) params.set("busca", buscaAplicada);
      if (mostrarSubstituidos) params.set("incluirSubstituidos", "1");

      const resposta = await fetch(`/api/documentos-fiscais?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error || "Falha ao carregar documentos.");

      setDocumentos(dados.documentos ?? []);
      setTotal(dados.total ?? 0);
      setPaginas(dados.paginas ?? 1);
      setResumo(dados.resumo ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
      setDocumentos([]);
    } finally {
      setCarregando(false);
    }
  }, [
    pagina,
    tipo,
    filtroCliente,
    filtroCompletude,
    filtroDe,
    filtroAte,
    buscaAplicada,
    mostrarSubstituidos,
  ]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Trocar de filtro com a paginação avançada deixaria a tela numa página que
  // talvez nem exista no novo resultado.
  function aplicarFiltro(acao: () => void) {
    setPagina(1);
    acao();
  }

  const cartoes = resumo
    ? [
        { label: "Notas fiscais", valor: String(resumo.notas), cor: "text-sky-200" },
        {
          label: "Aguardando manifestação",
          valor: String(resumo.aguardandoManifestacao),
          cor: resumo.aguardandoManifestacao > 0 ? "text-amber-200" : "text-slate-200",
        },
        { label: "Eventos", valor: String(resumo.eventos), cor: "text-slate-200" },
        { label: "Nesta consulta", valor: String(total), cor: "text-slate-200" },
      ]
    : [];

  return (
    <>
      {cartoes.length > 0 && (
        <section className="mt-5 grid grid-cols-4 gap-3 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
          {cartoes.map((c) => (
            <article
              className="rounded-xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20"
              key={c.label}
            >
              <p className="text-[11px] text-slate-400">{c.label}</p>
              <strong className={`mt-2 block text-2xl font-black ${c.cor}`}>{c.valor}</strong>
            </article>
          ))}
        </section>
      )}

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
        <div className="grid grid-cols-5 gap-3 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Cliente
            </span>
            <select
              className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none"
              value={filtroCliente}
              onChange={(e) => aplicarFiltro(() => setFiltroCliente(e.target.value))}
            >
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razao_social}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Situação
            </span>
            <select
              className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none"
              value={filtroCompletude}
              onChange={(e) => aplicarFiltro(() => setFiltroCompletude(e.target.value))}
            >
              <option value="">Todas</option>
              <option value="completo">XML completo</option>
              <option value="resumo">Aguardando manifestação</option>
              <option value="evento">Eventos</option>
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Emissão de
            </span>
            <input
              type="date"
              className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none"
              value={filtroDe}
              onChange={(e) => aplicarFiltro(() => setFiltroDe(e.target.value))}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              até
            </span>
            <input
              type="date"
              className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none"
              value={filtroAte}
              onChange={(e) => aplicarFiltro(() => setFiltroAte(e.target.value))}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Emitente, nº ou chave
            </span>
            <input
              className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none"
              value={busca}
              placeholder="Buscar..."
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") aplicarFiltro(() => setBuscaAplicada(busca));
              }}
            />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            className="min-h-9 rounded-lg bg-sky-300 px-4 text-xs font-black text-slate-950 transition hover:bg-sky-200"
            type="button"
            onClick={() => aplicarFiltro(() => setBuscaAplicada(busca))}
          >
            Filtrar
          </button>
          <button
            className="min-h-9 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
            type="button"
            onClick={() =>
              aplicarFiltro(() => {
                setFiltroCliente("");
                setFiltroCompletude("");
                setFiltroDe("");
                setFiltroAte("");
                setBusca("");
                setBuscaAplicada("");
              })
            }
          >
            Limpar
          </button>

          <label
            className="ml-auto flex cursor-pointer items-center gap-2 text-[11px] text-slate-400"
            title="A nota chega primeiro como resumo e depois em XML completo. Marque para ver também as versões que foram superadas."
          >
            <input
              type="checkbox"
              className="size-3.5 accent-sky-300"
              checked={mostrarSubstituidos}
              onChange={(e) => aplicarFiltro(() => setMostrarSubstituidos(e.target.checked))}
            />
            Mostrar versões substituídas
          </label>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
        {erro && (
          <div className="mb-3 rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-3 text-xs text-rose-100">
            {erro}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[1040px] border-collapse text-left text-xs">
            <thead className="bg-slate-950/70 text-[11px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-3 py-3 font-black">Cliente</th>
                <th className="px-3 py-3 font-black">Emissão</th>
                <th className="px-3 py-3 font-black">Nº / Série</th>
                <th className="px-3 py-3 font-black">Emitente</th>
                <th className="px-3 py-3 font-black">UF</th>
                <th className="px-3 py-3 text-right font-black">Valor</th>
                <th className="px-3 py-3 font-black">Situação</th>
                <th className="px-3 py-3 font-black">XML</th>
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr>
                  <td className="px-3 py-8 text-center text-sky-100" colSpan={8}>
                    Carregando documentos...
                  </td>
                </tr>
              )}

              {!carregando && documentos.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-400" colSpan={8}>
                    Nenhum documento encontrado com esses filtros.
                  </td>
                </tr>
              )}

              {!carregando &&
                documentos.map((d) => (
                  <tr className="border-t border-white/5 hover:bg-white/[0.03]" key={d.id}>
                    <td className="px-3 py-3 text-slate-300">
                      {d.cliente_nome || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-300">
                      {formatarData(d.data_emissao)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-300">
                      {d.numero ?? "—"}
                      {d.serie ? ` / ${d.serie}` : ""}
                    </td>
                    <td className="px-3 py-3">
                      <span className="block text-slate-100">{d.emitente_nome || "—"}</span>
                      <span
                        className="block font-mono text-[10px] text-slate-500"
                        title={d.chave_acesso ?? ""}
                      >
                        {formatarDocumento(d.emitente_cnpj_cpf)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-400">{d.uf || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-slate-100">
                      {d.valor_total === null ? "—" : moeda.format(Number(d.valor_total))}
                    </td>
                    <td className="px-3 py-3">
                      <SeloCompletude completude={d.completude} />
                    </td>
                    <td className="px-3 py-3">
                      {d.xml_storage_path ? (
                        <a
                          className="font-bold text-sky-300 transition hover:text-sky-200"
                          href={d.xml_storage_path}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {paginas > 1 && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">
              Página {pagina} de {paginas} — {total} documentos
            </span>
            <div className="flex gap-2">
              <button
                className="min-h-9 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 disabled:opacity-40"
                type="button"
                disabled={pagina <= 1 || carregando}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <button
                className="min-h-9 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 disabled:opacity-40"
                type="button"
                disabled={pagina >= paginas || carregando}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
