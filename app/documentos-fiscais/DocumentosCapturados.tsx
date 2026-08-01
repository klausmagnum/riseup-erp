"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  DIRECOES,
  FAMILIAS,
  SITUACOES,
  familiaPorChave,
  rotuloDoQuadro,
  situacoesDaFamilia,
  type Direcao,
} from "@/app/lib/documentosFiscais/classificacao";

interface LinhaResumo {
  familia: string;
  direcao: string;
  situacao: string;
  quantidade: number;
}

interface Documento {
  id: string;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  emitente_nome: string | null;
  emitente_cnpj_cpf: string | null;
  destinatario_nome: string | null;
  uf: string | null;
  status_documento: string | null;
  completude: string | null;
  xml_storage_path: string | null;
}

interface Quadro {
  familia: string;
  direcao: Direcao;
  rotulo: string;
  descricao: string;
  total: number;
  porSituacao: Record<string, number>;
}

const TAMANHO_PAGINA = 25;

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

async function comToken(url: string) {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase nao configurado.");
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Sessao expirada. Entre novamente.");

  const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.error || "Falha na consulta.");
  return dados;
}

function SeloSituacao({ completude }: { completude: string | null }) {
  const situacao =
    SITUACOES.find((s) => s.chave === (completude || "indefinido")) ??
    SITUACOES[SITUACOES.length - 1];

  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-bold ${situacao.classe}`}
      title={situacao.explicacao}
    >
      {situacao.rotulo}
    </span>
  );
}

/**
 * Os documentos capturados de um cliente, num quadro por tipo e direção.
 *
 * A pergunta que a tela responde não é "quantos documentos existem", e sim
 * "quantas NF-e de entrada já chegaram, e quantas ainda estão travadas
 * esperando manifestação". Por isso o quadro é a unidade da tela, e a lista só
 * aparece quando alguém abre um deles.
 */
export default function DocumentosCapturados({ clienteId }: { clienteId: string }) {
  const [linhas, setLinhas] = useState<LinhaResumo[]>([]);
  const [carregandoResumo, setCarregandoResumo] = useState(true);
  const [erroResumo, setErroResumo] = useState("");

  const [aberto, setAberto] = useState<{ familia: string; direcao: Direcao } | null>(null);
  const [situacao, setSituacao] = useState("");

  // O período vale para os quadros e para a lista: filtrar só a lista faria o
  // quadro prometer 33 notas e a lista mostrar 5.
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const periodoAtivo = Boolean(de || ate);

  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [erroLista, setErroLista] = useState("");

  useEffect(() => {
    if (!clienteId) return;
    let ativo = true;

    (async () => {
      try {
        const params = new URLSearchParams({ clienteId });
        if (de) params.set("de", de);
        if (ate) params.set("ate", ate);

        const dados = await comToken(`/api/documentos-fiscais/resumo?${params}`);
        if (!ativo) return;
        setLinhas(dados.linhas ?? []);
        setErroResumo("");
      } catch (e) {
        if (ativo) setErroResumo(e instanceof Error ? e.message : "Erro desconhecido.");
      } finally {
        if (ativo) setCarregandoResumo(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, [clienteId, de, ate]);

  // Um quadro por família e direção, inclusive os zerados: a ausência de nota
  // é informação — mostra que aquele tipo ainda não está sendo capturado.
  const quadros = useMemo<Quadro[]>(() => {
    const conhecidas = FAMILIAS.map((f) => f.chave);
    const extras = [...new Set(linhas.map((l) => l.familia))].filter(
      (f) => !conhecidas.includes(f)
    );

    return [...conhecidas, ...extras].flatMap((familia) =>
      DIRECOES.map(({ chave: direcao, explicacao }) => {
        const doQuadro = linhas.filter(
          (l) => l.familia === familia && l.direcao === direcao
        );

        const porSituacao: Record<string, number> = {};
        for (const l of doQuadro) {
          porSituacao[l.situacao] = (porSituacao[l.situacao] ?? 0) + l.quantidade;
        }

        return {
          familia,
          direcao,
          rotulo: rotuloDoQuadro(familia, direcao),
          descricao: familia === "Evento" ? familiaPorChave(familia).descricao : explicacao,
          total: doQuadro.reduce((soma, l) => soma + l.quantidade, 0),
          porSituacao,
        };
      })
    );
  }, [linhas]);

  const quadroAberto = aberto
    ? (quadros.find((q) => q.familia === aberto.familia && q.direcao === aberto.direcao) ??
      null)
    : null;

  const abrir = useCallback(
    (familia: string, direcao: Direcao, situacaoInicial = "") => {
      const mesmoQuadro = aberto?.familia === familia && aberto?.direcao === direcao;

      // Clicar de novo no mesmo quadro fecha; clicar num selo de situação de um
      // quadro já aberto apenas troca o filtro.
      if (mesmoQuadro && situacaoInicial === situacao) {
        setAberto(null);
        return;
      }

      setAberto({ familia, direcao });
      setSituacao(situacaoInicial);
      setPagina(1);
      setDocumentos([]);
      setCarregandoLista(true);
    },
    [aberto, situacao]
  );

  useEffect(() => {
    if (!aberto) return;
    let ativo = true;

    (async () => {
      try {
        const params = new URLSearchParams({
          clienteId,
          familia: aberto.familia,
          direcao: aberto.direcao,
          pagina: String(pagina),
          tamanho: String(TAMANHO_PAGINA),
        });
        if (situacao) params.set("completude", situacao);
        if (de) params.set("de", de);
        if (ate) params.set("ate", ate);

        const dados = await comToken(`/api/documentos-fiscais?${params}`);
        if (!ativo) return;

        setDocumentos(dados.documentos ?? []);
        setTotal(dados.total ?? 0);
        setPaginas(dados.paginas ?? 1);
        setErroLista("");
      } catch (e) {
        if (!ativo) return;
        setErroLista(e instanceof Error ? e.message : "Erro desconhecido.");
        setDocumentos([]);
      } finally {
        if (ativo) setCarregandoLista(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, [clienteId, aberto, situacao, pagina, de, ate]);

  const capturadoNoTotal = quadros.reduce((soma, q) => soma + q.total, 0);

  /** Quem dispara a busca é que liga o indicador: mexer no estado dentro do
   *  corpo do efeito provoca renderização em cascata. */
  function trocarPeriodo(acao: () => void) {
    setCarregandoResumo(true);
    if (aberto) setCarregandoLista(true);
    setPagina(1);
    acao();
  }

  return (
    <>
      <section className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20">
        <label className="grid gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Emissão de
          </span>
          <input
            type="date"
            className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none"
            value={de}
            onChange={(e) => trocarPeriodo(() => setDe(e.target.value))}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            até
          </span>
          <input
            type="date"
            className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none"
            value={ate}
            onChange={(e) => trocarPeriodo(() => setAte(e.target.value))}
          />
        </label>

        {periodoAtivo && (
          <button
            className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
            type="button"
            onClick={() =>
              trocarPeriodo(() => {
                setDe("");
                setAte("");
              })
            }
          >
            Limpar período
          </button>
        )}

        <p className="ml-auto max-w-md text-[11px] leading-4 text-slate-500">
          {periodoAtivo
            ? "Os quadros abaixo contam só as notas emitidas no período escolhido."
            : "Sem período escolhido, os quadros contam tudo que já foi capturado."}
        </p>
      </section>

      {erroResumo && (
        <div className="mt-3 rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-3 text-xs text-rose-100">
          {erroResumo}
        </div>
      )}

      {carregandoResumo && (
        <p className="mt-4 text-center text-sm text-sky-100">Contando documentos...</p>
      )}

      {!carregandoResumo && !erroResumo && (
        <>
          <p className="mt-4 text-xs text-slate-400">
            {capturadoNoTotal > 0
              ? "Clique em um quadro para ver as notas daquele tipo."
              : periodoAtivo
                ? "Nenhum documento com emissão no período escolhido."
                : "Nenhum documento capturado para este cliente até agora."}
          </p>

          <section className="mt-4 grid grid-cols-4 gap-3 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
            {quadros.map((q) => {
              const selecionado =
                aberto?.familia === q.familia && aberto?.direcao === q.direcao;
              const vazio = q.total === 0;

              return (
                <article
                  className={`rounded-xl border p-4 text-left shadow-2xl shadow-black/20 transition ${
                    selecionado
                      ? "border-sky-300/60 bg-sky-300/[0.07]"
                      : "border-white/10 bg-[#061020]/88 hover:border-sky-300/30"
                  } ${vazio ? "opacity-70" : ""}`}
                  key={`${q.familia}-${q.direcao}`}
                >
                  <button
                    className="block w-full text-left"
                    type="button"
                    onClick={() => abrir(q.familia, q.direcao)}
                    title={q.descricao}
                  >
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      {q.rotulo}
                    </p>
                    <strong
                      className={`mt-2 block text-3xl font-black ${
                        vazio ? "text-slate-600" : "text-slate-100"
                      }`}
                    >
                      {q.total}
                    </strong>
                  </button>

                  {vazio ? (
                    <p className="mt-2 text-[11px] leading-4 text-slate-500">
                      {periodoAtivo ? "Nenhuma nota no período." : "Nenhuma nota capturada."}
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {situacoesDaFamilia(q.familia).map((s) => {
                        const quantidade = q.porSituacao[s.chave] ?? 0;
                        if (quantidade === 0) return null;

                        return (
                          <button
                            className={`rounded-md border px-2 py-1 text-[10px] font-bold transition hover:brightness-125 ${s.classe}`}
                            key={s.chave}
                            type="button"
                            title={s.explicacao}
                            onClick={() => abrir(q.familia, q.direcao, s.chave)}
                          >
                            {s.rotulo} <span className="opacity-80">{quantidade}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </>
      )}

      {quadroAberto && (
        <section className="mt-5 rounded-2xl border border-sky-300/25 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-100">
                {quadroAberto.rotulo}
                <span className="ml-2 text-xs font-bold text-slate-500">
                  {quadroAberto.total} capturado{quadroAberto.total === 1 ? "" : "s"}
                </span>
              </h3>
              <p className="mt-1 text-[11px] text-slate-500">{quadroAberto.descricao}</p>
            </div>
            <button
              className="min-h-9 rounded-lg border border-white/10 px-3 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
              type="button"
              onClick={() => setAberto(null)}
            >
              Fechar
            </button>
          </header>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className={`min-h-8 rounded-lg px-3 text-[11px] font-black transition ${
                situacao === ""
                  ? "bg-sky-300 text-slate-950"
                  : "border border-white/10 text-slate-300 hover:border-sky-300/40 hover:text-sky-100"
              }`}
              type="button"
              onClick={() => {
                setCarregandoLista(true);
                setPagina(1);
                setSituacao("");
              }}
            >
              Todas <span className="ml-1 opacity-70">{quadroAberto.total}</span>
            </button>

            {situacoesDaFamilia(quadroAberto.familia).map((s) => {
              const quantidade = quadroAberto.porSituacao[s.chave] ?? 0;
              if (quantidade === 0 && situacao !== s.chave) return null;

              return (
                <button
                  className={`min-h-8 rounded-lg px-3 text-[11px] font-black transition ${
                    situacao === s.chave
                      ? "bg-sky-300 text-slate-950"
                      : "border border-white/10 text-slate-300 hover:border-sky-300/40 hover:text-sky-100"
                  }`}
                  key={s.chave}
                  type="button"
                  title={s.explicacao}
                  onClick={() => {
                    setCarregandoLista(true);
                    setPagina(1);
                    setSituacao(s.chave);
                  }}
                >
                  {s.rotulo} <span className="ml-1 opacity-70">{quantidade}</span>
                </button>
              );
            })}
          </div>

          {erroLista && (
            <div className="mt-3 rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-3 text-xs text-rose-100">
              {erroLista}
            </div>
          )}

          <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[900px] border-collapse text-left text-xs">
              <thead className="bg-slate-950/70 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-3 font-black">Emissão</th>
                  <th className="px-3 py-3 font-black">Nº / Série</th>
                  <th className="px-3 py-3 font-black">
                    {quadroAberto.direcao === "saida" ? "Destinatário" : "Emitente"}
                  </th>
                  <th className="px-3 py-3 font-black">UF</th>
                  <th className="px-3 py-3 text-right font-black">Valor</th>
                  <th className="px-3 py-3 font-black">Situação</th>
                  <th className="px-3 py-3 font-black">XML</th>
                </tr>
              </thead>
              <tbody>
                {carregandoLista && (
                  <tr>
                    <td className="px-3 py-8 text-center text-sky-100" colSpan={7}>
                      Carregando documentos...
                    </td>
                  </tr>
                )}

                {!carregandoLista && documentos.length === 0 && !erroLista && (
                  <tr>
                    <td className="px-3 py-8 text-center text-slate-400" colSpan={7}>
                      Nenhuma nota fiscal capturada em {quadroAberto.rotulo.toLowerCase()}
                      {situacao
                        ? ` com a situação "${
                            SITUACOES.find((s) => s.chave === situacao)?.rotulo ?? situacao
                          }"`
                        : ""}
                      {periodoAtivo ? " no período escolhido" : ""}.
                    </td>
                  </tr>
                )}

                {!carregandoLista &&
                  documentos.map((d) => {
                    const contraparte =
                      quadroAberto.direcao === "saida"
                        ? { nome: d.destinatario_nome, doc: null }
                        : { nome: d.emitente_nome, doc: d.emitente_cnpj_cpf };

                    return (
                      <tr className="border-t border-white/5 hover:bg-white/[0.03]" key={d.id}>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-300">
                          {formatarData(d.data_emissao)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-300">
                          {d.numero ?? "—"}
                          {d.serie ? ` / ${d.serie}` : ""}
                        </td>
                        <td className="px-3 py-3">
                          <span className="block text-slate-100">{contraparte.nome || "—"}</span>
                          <span
                            className="block font-mono text-[10px] text-slate-500"
                            title={d.chave_acesso ?? ""}
                          >
                            {contraparte.doc
                              ? formatarDocumento(contraparte.doc)
                              : (d.chave_acesso ?? "—")}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-400">{d.uf || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right text-slate-100">
                          {d.valor_total === null ? "—" : moeda.format(Number(d.valor_total))}
                        </td>
                        <td className="px-3 py-3">
                          <SeloSituacao completude={d.completude} />
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
                    );
                  })}
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
                  disabled={pagina <= 1 || carregandoLista}
                  onClick={() => {
                    setCarregandoLista(true);
                    setPagina((p) => Math.max(1, p - 1));
                  }}
                >
                  Anterior
                </button>
                <button
                  className="min-h-9 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 disabled:opacity-40"
                  type="button"
                  disabled={pagina >= paginas || carregandoLista}
                  onClick={() => {
                    setCarregandoLista(true);
                    setPagina((p) => p + 1);
                  }}
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
