"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ErpChrome from "@/app/components/ErpChrome";
import { supabase } from "@/app/lib/supabaseClient";

type GrupoCliente = {
  id: string;
  nome: string;
};

type Obrigacao = {
  id: string;
  nome: string;
  regime: string | null;
  periodicidade: string | null;
  setor: string | null;
  status: string | null;
};

type ClienteAnexo = {
  id: string;
  nome: string;
  mime_type: string | null;
  tamanho: number | null;
  drive_web_view_link: string | null;
  categoria: string | null;
  criado_por: string | null;
  criado_em: string | null;
};


type ClienteFormProps = {
  mode?: "create" | "edit";
};

const tipos = ["Juridica", "Fisica", "Outro"];
const matrizFilialOptions = ["Matriz", "Filial"];
const estados = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const regimesTributarios = [
  "CEI",
  "Empresa rural",
  "Imune - Isenta",
  "Inativas",
  "Lucro presumido",
  "Lucro real",
  "MEI",
  "Pessoa fisica",
  "RET",
  "Simples nacional",
  "Simples nacional - Sublimite ICMS e ISS",
];

const categoriasAnexo = ["Documento", "Contrato", "Procuração", "Comprovante", "Outros"];

const emptyForm = {
  razaoSocial: "",
  dataAbertura: "",
  nomeFantasia: "",
  tipo: "Juridica",
  matrizFilial: "Matriz",
  identificacao: "",
  inscricaoEstadual: "",
  inscricaoMunicipal: "",
  cei: "",
  cep: "",
  logradouro: "",
  regimeTributario: "Simples nacional",
  numero: "",
  complemento: "",
  grupoClientes: "",
  bairro: "",
  estado: "",
  municipio: "",
  email: "",
  contato: "",
  dataInicioControleObrigacoes: "",
  observacao: "",
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{children}</span>;
}

function ObrigacaoStatusIcon({ checked }: { checked: boolean }) {
  return (
    <svg
      className={`size-4 ${checked ? "text-emerald-300" : "text-rose-300"}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
    >
      {checked ? <path d="m20 6-11 11-5-5" /> : <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>}
    </svg>
  );
}

export default function ClienteForm({ mode = "create" }: ClienteFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingId = searchParams.get("id");
  const [form, setForm] = useState(emptyForm);
  const [grupos, setGrupos] = useState<GrupoCliente[]>([]);
  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([]);
  const [anexos, setAnexos] = useState<ClienteAnexo[]>([]);
  const [selectedObrigacaoIds, setSelectedObrigacaoIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"dados" | "obrigacoes" | "anexos">("dados");
  const [anexoCategoria, setAnexoCategoria] = useState("Documento");
  const [feedback, setFeedback] = useState("");
  const [anexosFeedback, setAnexosFeedback] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAnexo, setIsUploadingAnexo] = useState(false);
  const [isLoadingCliente, setIsLoadingCliente] = useState(mode === "edit");
  const [isLoadingObrigacoes, setIsLoadingObrigacoes] = useState(true);
  const [isLoadingAnexos, setIsLoadingAnexos] = useState(mode === "edit");

  useEffect(() => {
    async function loadBaseData() {
      setIsLoadingObrigacoes(true);
      const [{ data: gruposData }, { data: obrigacoesData, error: obrigacoesError }] = await Promise.all([
        supabase.from("grupos_clientes").select("id,nome").order("nome", { ascending: true }),
        supabase
          .from("obrigacoes")
          .select("id,nome,regime,periodicidade,setor,status")
          .order("nome", { ascending: true }),
      ]);

      setGrupos(gruposData ?? []);
      if (obrigacoesError) {
        setFeedback(`Erro ao buscar obrigacoes: ${obrigacoesError.message}`);
      } else {
        setObrigacoes(obrigacoesData ?? []);
      }
      setIsLoadingObrigacoes(false);
    }

    loadBaseData();
  }, []);

  useEffect(() => {
    async function loadCliente() {
      if (mode !== "edit") return;

      if (!editingId) {
        setFeedback("Cliente nao informado para edicao.");
        setIsLoadingCliente(false);
        return;
      }

      setIsLoadingCliente(true);
      const { data, error } = await supabase
        .from("clientes")
        .select("razao_social,data_abertura,nome_fantasia,tipo,matriz_filial,identificacao,inscricao_estadual,inscricao_municipal,cei,cep,logradouro,regime_tributario,numero,complemento,grupo_clientes,bairro,estado,municipio,email,contato,data_inicio_controle_obrigacoes,observacao,obrigacoes_vinculadas")
        .eq("id", editingId)
        .single();

      if (error) {
        setFeedback(`Erro ao buscar cliente: ${error.message}`);
        setIsLoadingCliente(false);
        return;
      }

      setForm({
        razaoSocial: data.razao_social || "",
        dataAbertura: data.data_abertura || "",
        nomeFantasia: data.nome_fantasia || "",
        tipo: data.tipo || "Juridica",
        matrizFilial: data.matriz_filial || "Matriz",
        identificacao: data.identificacao || "",
        inscricaoEstadual: data.inscricao_estadual || "",
        inscricaoMunicipal: data.inscricao_municipal || "",
        cei: data.cei || "",
        cep: data.cep || "",
        logradouro: data.logradouro || "",
        regimeTributario: data.regime_tributario || "Simples nacional",
        numero: data.numero || "",
        complemento: data.complemento || "",
        grupoClientes: data.grupo_clientes || "",
        bairro: data.bairro || "",
        estado: data.estado || "",
        municipio: data.municipio || "",
        email: data.email || "",
        contato: data.contato || "",
        dataInicioControleObrigacoes: data.data_inicio_controle_obrigacoes || "",
        observacao: data.observacao || "",
      });
      setSelectedObrigacaoIds(new Set((data.obrigacoes_vinculadas as string[] | null) ?? []));

      setIsLoadingCliente(false);
    }

    loadCliente();
  }, [editingId, mode]);

  function updateField(field: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleObrigacao(obrigacaoId: string) {
    setSelectedObrigacaoIds((current) => {
      const next = new Set(current);
      if (next.has(obrigacaoId)) {
        next.delete(obrigacaoId);
      } else {
        next.add(obrigacaoId);
      }
      return next;
    });
  }

  function formatFileSize(size: number | null) {
    if (!size) return "Tamanho nao informado";
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  const getAuthHeaders = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Sessao nao encontrada. Entre novamente no sistema.");
    }

    return { Authorization: `Bearer ${session.access_token}` };
  }, []);

  const loadAnexos = useCallback(async (clienteId: string) => {
    setIsLoadingAnexos(true);
    setAnexosFeedback("");

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/clientes/anexos?clienteId=${clienteId}`, { headers });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel carregar os anexos.");
      }

      setAnexos(data.anexos ?? []);
    } catch (error) {
      setAnexosFeedback(error instanceof Error ? error.message : "Nao foi possivel carregar os anexos.");
    } finally {
      setIsLoadingAnexos(false);
    }
  }, [getAuthHeaders]);


  async function handleUploadAnexo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setAnexosFeedback("");

    if (!file) return;
    if (mode !== "edit" || !editingId) {
      setAnexosFeedback("Salve o cliente antes de anexar arquivos.");
      return;
    }

    setIsUploadingAnexo(true);
    try {
      const headers = await getAuthHeaders();
      const body = new FormData();
      body.append("clienteId", editingId);
      body.append("categoria", anexoCategoria);
      body.append("file", file);

      const response = await fetch("/api/clientes/anexos", {
        method: "POST",
        headers,
        body,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel anexar o arquivo.");
      }

      setAnexos((current) => [data.anexo, ...current]);
      setAnexosFeedback("Arquivo anexado com sucesso.");
    } catch (error) {
      setAnexosFeedback(error instanceof Error ? error.message : "Nao foi possivel anexar o arquivo.");
    } finally {
      setIsUploadingAnexo(false);
    }
  }

  async function deleteAnexo(anexoId: string) {
    if (!window.confirm("Deseja mesmo fazer essa exclusão?")) return;
    setAnexosFeedback("");

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/clientes/anexos?id=${anexoId}`, {
        method: "DELETE",
        headers,
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel excluir o anexo.");
      }

      setAnexos((current) => current.filter((anexo) => anexo.id !== anexoId));
      setAnexosFeedback("Anexo excluido com sucesso.");
    } catch (error) {
      setAnexosFeedback(error instanceof Error ? error.message : "Nao foi possivel excluir o anexo.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    if (!form.razaoSocial.trim()) {
      setFeedback("Informe a razao social.");
      return;
    }

    if (!form.identificacao.trim()) {
      setFeedback("Informe o CNPJ, CPF ou identificacao.");
      return;
    }

    setIsSaving(true);
    const payload = {
      razao_social: form.razaoSocial.trim(),
      data_abertura: form.dataAbertura || null,
      nome_fantasia: form.nomeFantasia.trim() || null,
      tipo: form.tipo,
      matriz_filial: form.matrizFilial,
      identificacao: form.identificacao.trim(),
      inscricao_estadual: form.inscricaoEstadual.trim() || null,
      inscricao_municipal: form.inscricaoMunicipal.trim() || null,
      cei: form.cei.trim() || null,
      cep: form.cep.trim() || null,
      logradouro: form.logradouro.trim() || null,
      regime_tributario: form.regimeTributario,
      numero: form.numero.trim() || null,
      complemento: form.complemento.trim() || null,
      grupo_clientes: form.grupoClientes.trim() || null,
      bairro: form.bairro.trim() || null,
      estado: form.estado || null,
      municipio: form.municipio.trim() || null,
      email: form.email.trim() || null,
      contato: form.contato.trim() || null,
      data_inicio_controle_obrigacoes: form.dataInicioControleObrigacoes || null,
      observacao: form.observacao.trim() || null,
      obrigacoes_vinculadas: Array.from(selectedObrigacaoIds),
      status: "Ativo",
    };

    const savedCliente =
      mode === "edit" && editingId
        ? await supabase.from("clientes").update(payload).eq("id", editingId).select("id").single()
        : await supabase.from("clientes").insert(payload).select("id").single();

    if (savedCliente.error) {
      setIsSaving(false);
      setFeedback(`Erro ao ${mode === "edit" ? "atualizar" : "salvar"} cliente: ${savedCliente.error.message}`);
      return;
    }

    setIsSaving(false);
    router.push("/cadastros/clientes");
  }

  return (
    <ErpChrome>
      <header className="flex items-start justify-between gap-4 max-[760px]:flex-col">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Cadastro de clientes</p>
          <h1 className="mt-1 text-2xl font-black leading-tight">{mode === "edit" ? "Editar cliente" : "Novo cliente"}</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Cadastre os dados cadastrais, tributarios, endereco, contato e a competencia inicial de controle das obrigacoes.
          </p>
        </div>
        <Link className="flex min-h-9 items-center justify-center rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100" href="/cadastros/clientes">
          Voltar
        </Link>
      </header>

      {feedback && <p className="mt-4 rounded-lg border border-rose-300/25 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{feedback}</p>}
      {isLoadingCliente && <p className="mt-4 rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs text-sky-100">Carregando dados do cliente...</p>}

      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-[#061020]/88 p-2 shadow-2xl shadow-black/20 backdrop-blur-xl">
          {[
            { id: "dados", label: "Dados do cliente" },
            { id: "obrigacoes", label: "Obrigacoes" },
            { id: "anexos", label: "Anexos" },
          ].map((tab) => (
            <button
              className={`min-h-10 rounded-xl px-4 text-xs font-black transition ${
                activeTab === tab.id
                  ? "bg-sky-300 text-slate-950 shadow-[0_16px_34px_rgba(56,189,248,0.20)]"
                  : "text-slate-300 hover:bg-white/[0.06] hover:text-sky-100"
              }`}
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as "dados" | "obrigacoes" | "anexos");
                if (tab.id === "anexos" && mode === "edit" && editingId && anexos.length === 0) {
                  loadAnexos(editingId);
                }
              }}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "dados" ? (
          <>
            <section className="rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <h2 className="text-sm font-black text-slate-100">Identificacao</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 max-[980px]:grid-cols-2 max-[640px]:grid-cols-1">
            <label className="grid gap-1.5">
              <FieldLabel>Razao social</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("razaoSocial", event.target.value)} placeholder="Razao social completa" value={form.razaoSocial} />
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Data de abertura</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none" onChange={(event) => updateField("dataAbertura", event.target.value)} type="date" value={form.dataAbertura} />
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Nome fantasia</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("nomeFantasia", event.target.value)} placeholder="Nome comercial" value={form.nomeFantasia} />
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Tipo</FieldLabel>
              <select className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none" onChange={(event) => updateField("tipo", event.target.value)} value={form.tipo}>
                {tipos.map((tipo) => <option key={tipo}>{tipo}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Matriz/Filial</FieldLabel>
              <select className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none" onChange={(event) => updateField("matrizFilial", event.target.value)} value={form.matrizFilial}>
                {matrizFilialOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>CNPJ/CPF/Identificacao</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("identificacao", event.target.value)} placeholder="Documento ou codigo interno" value={form.identificacao} />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <h2 className="text-sm font-black text-slate-100">Dados fiscais</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 max-[980px]:grid-cols-2 max-[640px]:grid-cols-1">
            <label className="grid gap-1.5">
              <FieldLabel>Inscricao Estadual</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("inscricaoEstadual", event.target.value)} value={form.inscricaoEstadual} />
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Inscricao Municipal</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("inscricaoMunicipal", event.target.value)} value={form.inscricaoMunicipal} />
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>CEI</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("cei", event.target.value)} value={form.cei} />
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Regime tributario</FieldLabel>
              <select className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none" onChange={(event) => updateField("regimeTributario", event.target.value)} value={form.regimeTributario}>
                {regimesTributarios.map((regime) => <option key={regime}>{regime}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Grupo de clientes</FieldLabel>
              <select className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none" onChange={(event) => updateField("grupoClientes", event.target.value)} value={form.grupoClientes}>
                <option value="">Sem grupo</option>
                {grupos.map((grupo) => <option key={grupo.id}>{grupo.nome}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Data inicio controle das obrigacoes</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none" onChange={(event) => updateField("dataInicioControleObrigacoes", event.target.value)} type="month" value={form.dataInicioControleObrigacoes} />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <h2 className="text-sm font-black text-slate-100">Endereco e contato</h2>
          <div className="mt-4 grid grid-cols-4 gap-3 max-[1120px]:grid-cols-2 max-[640px]:grid-cols-1">
            <label className="grid gap-1.5">
              <FieldLabel>CEP</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("cep", event.target.value)} value={form.cep} />
            </label>
            <label className="grid gap-1.5 max-[1120px]:col-span-1 min-[1121px]:col-span-2">
              <FieldLabel>Logradouro</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("logradouro", event.target.value)} value={form.logradouro} />
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Numero</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("numero", event.target.value)} value={form.numero} />
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Complemento</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("complemento", event.target.value)} value={form.complemento} />
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Bairro</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("bairro", event.target.value)} value={form.bairro} />
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Estado</FieldLabel>
              <select className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none" onChange={(event) => updateField("estado", event.target.value)} value={form.estado}>
                <option value="">UF</option>
                {estados.map((estado) => <option key={estado}>{estado}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Municipio</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("municipio", event.target.value)} value={form.municipio} />
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Email</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("email", event.target.value)} type="email" value={form.email} />
            </label>
            <label className="grid gap-1.5">
              <FieldLabel>Contato</FieldLabel>
              <input className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("contato", event.target.value)} value={form.contato} />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <label className="grid gap-1.5">
            <FieldLabel>Observacao</FieldLabel>
            <textarea className="min-h-28 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600" onChange={(event) => updateField("observacao", event.target.value)} placeholder="Observacoes internas sobre o cliente" value={form.observacao} />
          </label>
        </section>
          </>
        ) : activeTab === "obrigacoes" ? (
          <section className="rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3 max-[640px]:flex-col">
              <div>
                <h2 className="text-sm font-black text-slate-100">Obrigacoes</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Marque com check verde as obrigacoes que devem ficar vinculadas a este cliente.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-[11px] font-bold text-slate-300">
                {selectedObrigacaoIds.size} vinculada(s)
              </span>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                <thead className="bg-slate-950/70 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-black">Status</th>
                    <th className="px-3 py-3 font-black">Obrigacao</th>
                    <th className="px-3 py-3 font-black">Regime</th>
                    <th className="px-3 py-3 font-black">Periodicidade</th>
                    <th className="px-3 py-3 font-black">Setor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {isLoadingObrigacoes && (
                    <tr>
                      <td className="px-3 py-4 text-center text-slate-400" colSpan={5}>Carregando obrigacoes...</td>
                    </tr>
                  )}

                  {!isLoadingObrigacoes && obrigacoes.map((obrigacao) => {
                    const checked = selectedObrigacaoIds.has(obrigacao.id);

                    return (
                      <tr className="bg-white/[0.015] transition hover:bg-white/[0.04]" key={obrigacao.id}>
                        <td className="px-3 py-2">
                          <button
                            aria-label={checked ? "Remover obrigacao" : "Vincular obrigacao"}
                            className={`flex size-9 items-center justify-center rounded-lg border transition ${
                              checked
                                ? "border-emerald-300/35 bg-emerald-300/10 hover:bg-emerald-300/15"
                                : "border-rose-300/30 bg-rose-300/10 hover:bg-rose-300/15"
                            }`}
                            onClick={() => toggleObrigacao(obrigacao.id)}
                            title={checked ? "Vinculada" : "Nao vinculada"}
                            type="button"
                          >
                            <ObrigacaoStatusIcon checked={checked} />
                          </button>
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-100">{obrigacao.nome}</td>
                        <td className="px-3 py-2 text-slate-400">{obrigacao.regime || "Sem regime"}</td>
                        <td className="px-3 py-2 text-slate-400">{obrigacao.periodicidade || "Sem periodicidade"}</td>
                        <td className="px-3 py-2 text-slate-400">{obrigacao.setor || "Sem setor"}</td>
                      </tr>
                    );
                  })}

                  {!isLoadingObrigacoes && obrigacoes.length === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-center text-slate-400" colSpan={5}>Nenhuma obrigacao cadastrada.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3 max-[760px]:flex-col">
              <div>
                <h2 className="text-sm font-black text-slate-100">Anexos do cliente</h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                  Arquivos enviados para o Google Drive do escritorio e vinculados ao cadastro deste cliente.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-[11px] font-bold text-slate-300">
                {anexos.length} anexo(s)
              </span>
            </div>

            {anexosFeedback && (
              <p className="mt-4 rounded-lg border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-xs text-sky-100">{anexosFeedback}</p>
            )}

            {mode !== "edit" ? (
              <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-xs leading-5 text-amber-100">
                Salve o cliente primeiro. Depois disso, a aba de anexos ficará disponível para envio ao Google Drive.
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-[220px_1fr] gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-3 max-[720px]:grid-cols-1">
                  <label className="grid gap-1.5">
                    <FieldLabel>Categoria</FieldLabel>
                    <select className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none" onChange={(event) => setAnexoCategoria(event.target.value)} value={anexoCategoria}>
                      {categoriasAnexo.map((categoria) => <option key={categoria}>{categoria}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5">
                    <FieldLabel>Enviar arquivo</FieldLabel>
                    <input
                      className="min-h-10 rounded-lg border border-dashed border-sky-300/30 bg-slate-950/60 px-3 py-2 text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-sky-300 file:px-3 file:py-1.5 file:text-xs file:font-black file:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isUploadingAnexo}
                      onChange={handleUploadAnexo}
                      type="file"
                    />
                    <span className="text-[11px] text-slate-500">Limite por arquivo: 25 MB.</span>
                  </label>
                </div>

                <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                    <thead className="bg-slate-950/70 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <th className="px-3 py-3 font-black">Arquivo</th>
                        <th className="px-3 py-3 font-black">Categoria</th>
                        <th className="px-3 py-3 font-black">Tamanho</th>
                        <th className="px-3 py-3 font-black">Enviado por</th>
                        <th className="px-3 py-3 font-black">Acoes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {isLoadingAnexos && (
                        <tr>
                          <td className="px-3 py-4 text-center text-slate-400" colSpan={5}>Carregando anexos...</td>
                        </tr>
                      )}

                      {!isLoadingAnexos && anexos.map((anexo) => (
                        <tr className="bg-white/[0.015] transition hover:bg-white/[0.04]" key={anexo.id}>
                          <td className="px-3 py-2 font-bold text-slate-100">{anexo.nome}</td>
                          <td className="px-3 py-2 text-slate-400">{anexo.categoria || "Documento"}</td>
                          <td className="px-3 py-2 text-slate-400">{formatFileSize(anexo.tamanho)}</td>
                          <td className="px-3 py-2 text-slate-400">{anexo.criado_por || "Nao informado"}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              {anexo.drive_web_view_link && (
                                <a className="rounded-lg border border-white/10 px-3 py-2 text-[11px] font-bold text-sky-100 transition hover:border-sky-300/40" href={anexo.drive_web_view_link} rel="noreferrer" target="_blank">
                                  Abrir
                                </a>
                              )}
                              <button className="rounded-lg border border-rose-300/30 px-3 py-2 text-[11px] font-bold text-rose-100 transition hover:bg-rose-300/10" onClick={() => deleteAnexo(anexo.id)} type="button">
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {!isLoadingAnexos && anexos.length === 0 && (
                        <tr>
                          <td className="px-3 py-4 text-center text-slate-400" colSpan={5}>Nenhum anexo cadastrado.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        <footer className="flex justify-end gap-2 max-[640px]:grid">
          <Link className="flex min-h-10 items-center justify-center rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100" href="/cadastros/clientes">
            Cancelar
          </Link>
          <button className="min-h-10 rounded-lg bg-sky-300 px-5 text-xs font-black text-slate-950 shadow-[0_18px_42px_rgba(56,189,248,0.20)] disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving} type="submit">
            {isSaving ? "Salvando..." : mode === "edit" ? "Atualizar cliente" : "Salvar cliente"}
          </button>
        </footer>
      </form>
    </ErpChrome>
  );
}
