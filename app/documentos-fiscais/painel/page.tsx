"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import ErpChrome from "@/app/components/ErpChrome";

export const dynamic = "force-dynamic";

type Situacao =
  | "ok"
  | "erro"
  | "sem_certificado"
  | "certificado_vencendo"
  | "certificado_vencido"
  | "nunca_sincronizado";

interface ClientePainel {
  cliente_id: string;
  razao_social: string;
  cnpj: string | null;
  uf: string | null;
  situacao: Situacao;
  ultima_sincronizacao_nfe: string | null;
  ultima_sincronizacao_nfe_status: string | null;
  mensagem_ultima_sincronizacao_nfe: string | null;
  certificado_nome: string | null;
  certificado_validade: string | null;
  total_documentos: number;
  documentos_completos: number;
  documentos_resumo: number;
  documentos_evento: number;
  documentos_recentes: number;
  ultima_emissao: string | null;
}

interface Resumo {
  totalClientes: number;
  comCertificado: number;
  semCertificado: number;
  comErro: number;
  certificadoVencendo: number;
  nuncaSincronizado: number;
  documentosTotal: number;
  documentosRecentes: number;
  aguardandoManifestacao: number;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const SITUACOES: Record<Situacao, { rotulo: string; classe: string }> = {
  ok: { rotulo: "Em dia", classe: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" },
  erro: { rotulo: "Com erro", classe: "border-rose-300/30 bg-rose-300/10 text-rose-200" },
  sem_certificado: {
    rotulo: "Sem certificado",
    classe: "border-slate-300/20 bg-slate-300/10 text-slate-300",
  },
  certificado_vencendo: {
    rotulo: "Certificado vencendo",
    classe: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  },
  certificado_vencido: {
    rotulo: "Certificado vencido",
    classe: "border-rose-300/30 bg-rose-300/10 text-rose-200",
  },
  nunca_sincronizado: {
    rotulo: "Nunca sincronizado",
    classe: "border-sky-300/30 bg-sky-300/10 text-sky-200",
  },
};

function data(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function momento(iso: string | null) {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function comToken(url: string) {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase nao configurado.");
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao?.session?.access_token;
  if (!token) throw new Error("Sessao expirada. Entre novamente.");

  const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.error || "Falha na consulta.");
  return dados;
}
export default function PainelFiscalPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClientePainel[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [situacao, setSituacao] = useState("");

  // O indicador de carregamento é ligado por quem dispara a busca (filtro,
  // botão), e não dentro do efeito: alterar estado de forma síncrona no corpo
  // do efeito provoca renderização em cascata.
  const [recarga, setRecarga] = useState(0);

  const recarregar = useCallback(() => {
    setCarregando(true);
    setRecarga((n) => n + 1);
  }, []);

  useEffect(() => {
    let ativo = true;

    (async () => {
      try {
        const params = new URLSearchParams();
        if (buscaAplicada) params.set("busca", buscaAplicada);
        if (situacao) params.set("situacao", situacao);

        const dados = await comToken(`/api/documentos-fiscais/painel?${params}`);
        if (!ativo) return;

        setClientes(dados.clientes ?? []);
        setResumo(dados.resumo ?? null);
        setErro("");
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : "Erro desconhecido.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, [buscaAplicada, situacao, recarga]);

  // Os filtros existem para responder "o que precisa de mim agora?" — por isso
  // são os problemas que aparecem primeiro, e não a lista inteira.
  const filtros: Array<{ chave: string; rotulo: string; quantidade: number }> = resumo
    ? [
        { chave: "", rotulo: "Todos", quantidade: resumo.totalClientes },
        { chave: "erro", rotulo: "Com erro", quantidade: resumo.comErro },
        {
          chave: "certificado_vencendo",
          rotulo: "Certificado vencendo",
          quantidade: resumo.certificadoVencendo,
        },
        {
          chave: "nunca_sincronizado",
          rotulo: "Nunca sincronizado",
          quantidade: resumo.nuncaSincronizado,
        },
        {
          chave: "sem_certificado",
          rotulo: "Sem certificado",
          quantidade: resumo.semCertificado,
        },
        { chave: "ok", rotulo: "Em dia", quantidade: resumo.comCertificado - resumo.comErro },
      ]
    : [];

  return (
    <ErpChrome>
      <header className="flex items-start justify-between gap-4 max-[760px]:flex-col">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">
            Documentos Fiscais
          </p>
          <h1 className="mt-1 text-2xl font-black leading-tight">Painel por cliente</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Cada linha é um cliente. Clique para abrir a tela dele, com os
            documentos capturados e o histórico de sincronização.
          </p>
        </div>
        <button
          className="min-h-9 rounded-lg border border-white/10 px-3 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
          type="button"
          onClick={recarregar}
          disabled={carregando}
        >
          {carregando ? "Atualizando..." : "Atualizar"}
        </button>
      </header>

      {erro && (
        <div className="mt-5 rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-3 text-xs text-rose-100">
          {erro}
        </div>
      )}

      {resumo && (
        <section className="mt-5 grid grid-cols-4 gap-3 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
          {[
            {
              t: "Clientes cobertos",
              v: `${resumo.comCertificado} de ${resumo.totalClientes}`,
              e: "Têm certificado cadastrado e entram na captura automática.",
            },
            {
              t: "Capturados em 7 dias",
              v: resumo.documentosRecentes,
              e: "Documentos que entraram na última semana.",
            },
            {
              t: "Documentos no total",
              v: resumo.documentosTotal,
              e: "Tudo que já foi capturado, de todos os clientes.",
            },
            {
              t: "Aguardando manifestação",
              v: resumo.aguardandoManifestacao,
              e: "Notas em que a SEFAZ só liberou o resumo.",
            },
          ].map((c) => (
            <article
              className="rounded-xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20"
              key={c.t}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                {c.t}
              </p>
              <strong className="mt-2 block text-2xl font-black text-slate-100">{c.v}</strong>
              <p className="mt-1.5 text-[11px] leading-4 text-slate-500">{c.e}</p>
            </article>
          ))}
        </section>
      )}

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-center gap-2">
          {filtros.map((f) => (
            <button
              className={`min-h-9 rounded-lg px-3 text-xs font-black transition ${
                situacao === f.chave
                  ? "bg-sky-300 text-slate-950"
                  : "border border-white/10 text-slate-300 hover:border-sky-300/40 hover:text-sky-100"
              }`}
              key={f.chave || "todos"}
              type="button"
              onClick={() => { setCarregando(true); setSituacao(f.chave); }}
            >
              {f.rotulo}
              <span className="ml-1.5 opacity-70">{f.quantidade}</span>
            </button>
          ))}

          <input
            className="ml-auto min-h-9 min-w-[220px] rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none"
            placeholder="Buscar cliente ou CNPJ..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setCarregando(true); setBuscaAplicada(busca); }
            }}
          />
          <button
            className="min-h-9 rounded-lg bg-sky-300 px-4 text-xs font-black text-slate-950 transition hover:bg-sky-200"
            type="button"
            onClick={() => { setCarregando(true); setBuscaAplicada(busca); }}
          >
            Buscar
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-950/70 text-[11px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-3 py-3 font-black">Cliente</th>
                <th className="px-3 py-3 font-black">Situação</th>
                <th className="px-3 py-3 font-black">Certificado</th>
                <th className="px-3 py-3 font-black">Última sincronização</th>
                <th className="px-3 py-3 text-right font-black">Documentos</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr>
                  <td className="px-3 py-8 text-center text-sky-100" colSpan={6}>
                    Carregando clientes...
                  </td>
                </tr>
              )}

              {!carregando && clientes.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-slate-400" colSpan={6}>
                    Nenhum cliente encontrado com esse filtro.
                  </td>
                </tr>
              )}

              {!carregando &&
                clientes.map((c) => {
                  const selo = SITUACOES[c.situacao] ?? SITUACOES.ok;
                  const destino = `/documentos-fiscais/cliente/${c.cliente_id}`;

                  return (
                    <tr
                      className="cursor-pointer border-t border-white/5 transition hover:bg-white/[0.04]"
                      key={c.cliente_id}
                      onClick={() => router.push(destino)}
                    >
                      <td className="px-3 py-3">
                        {/* O link real fica no nome para o navegador tratar como
                            link — abrir em nova aba, copiar endereço. O clique
                            na linha inteira é atalho, não a única forma. */}
                        <Link
                          className="block font-bold text-slate-100 transition hover:text-sky-200"
                          href={destino}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.razao_social}
                        </Link>
                        <span className="block text-[10px] text-slate-500">
                          {c.cnpj ?? "—"} {c.uf ? `· ${c.uf}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-block whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-bold ${selo.classe}`}
                        >
                          {selo.rotulo}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-400">
                        {c.certificado_nome ? (
                          <>
                            <span className="block text-slate-300">{c.certificado_nome}</span>
                            <span className="block text-[10px] text-slate-500">
                              vence {data(c.certificado_validade)}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-600">não cadastrado</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-400">
                        {momento(c.ultima_sincronizacao_nfe)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <span className="font-black text-slate-100">{c.total_documentos}</span>
                        {c.documentos_recentes > 0 && (
                          <span className="ml-1.5 text-[10px] text-emerald-300">
                            +{c.documentos_recentes}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-500">›</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </ErpChrome>
  );
}
