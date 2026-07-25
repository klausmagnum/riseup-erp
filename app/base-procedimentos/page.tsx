"use client";

import Link from "next/link";
import { useState } from "react";
import ErpSidebar from "@/app/components/ErpSidebar";
import { LogoffLink } from "@/app/components/TopbarUser";

const categorias = [
  { label: "Contábil", href: "#contabil", color: "bg-blue-300" },
  { label: "Fiscal", href: "#fiscal", color: "bg-violet-300" },
  { label: "Trabalhista/Pessoal", href: "#trabalhista", color: "bg-amber-300" },
  { label: "Legalização", href: "#legalizacao", color: "bg-emerald-300" },
  { label: "Financeiro", href: "#financeiro", color: "bg-sky-300" },
  { label: "Atendimento", href: "#atendimento", color: "bg-rose-300" },
];

const procedimentos = [
  {
    id: 1,
    titulo: "Como transmitir DCTFWeb",
    setor: "Fiscal",
    passoAPasso: "PASSO 1 - PREPARAÇÃO INICIAL\nAntes de começar, tenha em mãos:\n• CNPJ da empresa (com ou sem formatação)\n• Certificado digital A1 ou A3 instalado no computador\n• Acesso ao e-mail da empresa para confirmações\n\nPASSO 2 - ACESSAR O PORTAL DA RECEITA FEDERAL\n• Abra o navegador (Chrome, Firefox ou Edge recomendado)\n• Digite na barra de endereço: www1.receita.fazenda.gov.br\n• Clique em \"Acesso Identificado\" (canto superior direito)\n• Selecione \"Certificado Digital\" como forma de autenticação\n\nPASSO 3 - AUTENTICAÇÃO COM CERTIFICADO\n• Selecione seu certificado digital na janela de popup\n• Clique em \"OK\" para confirmar\n• Aguarde o redirecionamento para o portal autenticado\n• Você verá seu nome/CNPJ no topo da página confirmando acesso\n\nPASSO 4 - LOCALIZAR A OPÇÃO DCTFWEB\n• No menu lateral esquerdo, procure por \"Declarações\"\n• Clique em \"Declarações\" > \"DCTFWeb\"\n• Se não encontrar, use a busca no topo da página digitando \"DCTF\"\n\nPASSO 5 - IMPORTAR/PREPARAR DADOS\n• Escolha o período (mês/ano) desejado\n• Se já tem arquivo, clique em \"Importar Arquivo\" e selecione arquivo .dct\n• Se vai digitar, comece preenchendo os dados da empresa (aba CONTROLE)\n\nPASSO 6 - PREENCHIMENTO DOS DADOS\n• Seção de Controle: Valide CNPJ, razão social e período\n• Seção de Movimentação: Digite as operações conforme documentação\n• Use o Guia de Preenchimento (disponível no site) para campos específicos\n• Revise cada campo antes de prosseguir\n\nPASSO 7 - VALIDAÇÃO DO ARQUIVO\n• Clique em \"Validar\" após terminar o preenchimento\n• O sistema checará erros automáticos\n• Corrija todos os erros indicados (marcados em vermelho)\n• Continue validando até não haver mais erros críticos\n\nPASSO 8 - ASSINATURA DIGITAL\n• Clique em \"Assinar\"\n• Uma janela de assinatura aparecerá\n• Digite a senha do certificado digital quando solicitado\n• Aguarde a confirmação \"Arquivo assinado com sucesso\"\n\nPASSO 9 - TRANSMISSÃO AO FISCO\n• Clique em \"Transmitir\"\n• Selecione o ambiente: PRODUÇÃO (para situação real) ou TESTE (para treino)\n• Clique em \"Transmitir\" novamente para confirmar\n• Aguarde mensagem \"Transmissão realizada com sucesso\"\n\nPASSO 10 - CONFIRMAR ENTREGA E GUARDAR RECIBO\n• Um número de recibo será gerado - COPIE E GUARDE\n• Clique em \"Baixar Recibo\" para salvar arquivo .xml\n• Guarde o recibo por mínimo 5 anos para auditoria\n• Fotografe ou salve a tela com os dados de confirmação\n\nDICAS IMPORTANTES:\n• Transmita sempre no ambiente PRODUÇÃO (não é teste)\n• Se der erro, leia a mensagem cuidadosamente - ela indica a solução\n• Nunca feche a janela durante transmissão\n• Pode transmitir retificações - o fisco aceita atualizações\n• Em horários de pico (noites/fins de semana), pode demorar mais",
    linksUteis: ["https://www1.receita.fazenda.gov.br/", "https://www1.receita.fazenda.gov.br/irpf", "https://www1.receita.fazenda.gov.br/dctfweb", "https://www.gov.br/receitafederal/pt-br/servicos/declaracoes-e-demonstrativos", "https://www.gov.br/receitafederal/pt-br/acesso-informacao/guias", "https://cav.receita.fazenda.gov.br/", "https://www.gov.br/cidadania/pt-br/acesso-a-informacao/guias-de-servicos/e-certificados"],
    arquivosModelo: ["Checklist_DCTFWEB_Preenchimento.xlsx", "Guia_Campos_DCTF.pdf", "Modelo_Arquivo_DCTF.dct", "Erros_Comuns_Solucoes.pdf", "Certificado_Digital_Guia.pdf", "Pasta_Recibos_DCTF"],
    responsavel: "Setor Fiscal",
    ultimaAtualizacao: "2026-07-22",
  },
  {
    id: 2,
    titulo: "Como gerar DAS",
    setor: "Fiscal",
    passoAPasso: "1. Acessar portal do SIMPLES Nacional\n2. Calcular faturamento\n3. Gerar guia DAS\n4. Imprimir ou enviar cliente\n5. Registrar na contabilidade",
    linksUteis: ["https://www.gov.br/simplesnacional"],
    arquivosModelo: ["Formulario_DAS.pdf"],
    responsavel: "Setor Fiscal",
    ultimaAtualizacao: "2026-07-10",
  },
  {
    id: 3,
    titulo: "Como conferir notas de entrada",
    setor: "Contábil",
    passoAPasso: "1. Receber notas do cliente\n2. Validar dados fiscais\n3. Conferir com faturamento\n4. Registrar no SPED\n5. Arquivar cópia",
    linksUteis: [],
    arquivosModelo: ["Checklist_Conferencia_NF.xlsx"],
    responsavel: "Setor Contábil",
    ultimaAtualizacao: "2026-07-18",
  },
  {
    id: 4,
    titulo: "Como fechar folha mensal",
    setor: "Trabalhista/Pessoal",
    passoAPasso: "1. Compilar horas e faltas\n2. Calcular salários e descontos\n3. Gerar folha de pagamento\n4. Validar impostos retidos\n5. Enviar ao cliente para pagamento",
    linksUteis: ["https://www.esocial.gov.br"],
    arquivosModelo: ["Modelo_Folha_Pagamento.xlsx"],
    responsavel: "Departamento Pessoal",
    ultimaAtualizacao: "2026-07-12",
  },
  {
    id: 5,
    titulo: "Como lançar rescisão",
    setor: "Trabalhista/Pessoal",
    passoAPasso: "1. Preparar documentação rescisória\n2. Calcular saldo de salário e 13º\n3. Gerar FGTS e aviso prévio\n4. Registrar no eSocial\n5. Arquivar contratualmente",
    linksUteis: ["https://www.gov.br/fgts"],
    arquivosModelo: ["Termo_Rescisao.docx"],
    responsavel: "Departamento Pessoal",
    ultimaAtualizacao: "2026-07-08",
  },
  {
    id: 6,
    titulo: "Como fazer alteração contratual",
    setor: "Legalização",
    passoAPasso: "1. Preparar novo contrato social\n2. Reunir com sócios\n3. Protocolar na junta comercial\n4. Solicitar extrato\n5. Comunicar ao contador",
    linksUteis: ["https://www.juntacomercial.sp.gov.br"],
    arquivosModelo: ["Contrato_Social_Alteracao.docx"],
    responsavel: "Setor Jurídico",
    ultimaAtualizacao: "2026-06-25",
  },
  {
    id: 7,
    titulo: "Como enviar guias ao cliente",
    setor: "Atendimento",
    passoAPasso: "1. Compilar guias vencidas\n2. Preparar planilha resumida\n3. Enviar por e-mail com prazos\n4. Agendar cobrança se necessário\n5. Registrar envio no sistema",
    linksUteis: [],
    arquivosModelo: ["Email_Template_Guias.html"],
    responsavel: "Atendimento",
    ultimaAtualizacao: "2026-07-20",
  },
  {
    id: 8,
    titulo: "Como conferir balancete",
    setor: "Contábil",
    passoAPasso: "1. Exportar balancete do sistema\n2. Validar somas de débito/crédito\n3. Conferir contas de resultado\n4. Analisar variações\n5. Gerar relatório para gerência",
    linksUteis: [],
    arquivosModelo: ["Checklist_Balancete.xlsx", "Modelo_Relatorio_Balancete.pdf"],
    responsavel: "Setor Contábil",
    ultimaAtualizacao: "2026-07-14",
  },
];

const cadastroItems = [
  "Obrigações",
  "Tarefas",
  "Clientes",
  "Grupo de clientes",
  "Setores",
  "Usuários",
];

const configuracaoItems = [
  { label: "Dashboard", href: "/" },
  { label: "Dados da empresa", href: "/configuracoes/dados-empresa" },
];

const vinculoItems = [
  { label: "Clientes", href: "/cadastros/clientes" },
  { label: "Grupo de clientes", href: "/cadastros/grupo-clientes" },
];

const relatorioItems = [
  { label: "Obrigações finalizadas", href: "/relatorios/obrigacoes-finalizadas" },
];

export default function BaseProcedimentos() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("Todas");
  const [procedimentosList, setProcedimentosList] = useState(procedimentos);
  const [formData, setFormData] = useState({
    titulo: "",
    setor: "Contábil",
    passoAPasso: "",
    linksUteis: "",
    arquivosModelo: "",
    responsavel: "",
  });
  const [editFormData, setEditFormData] = useState({
    titulo: "",
    setor: "Contábil",
    passoAPasso: "",
    linksUteis: "",
    arquivosModelo: "",
    responsavel: "",
  });

  const procedimentosFiltrados = procedimentosList.filter((p) => {
    const matchesBusca = p.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         p.responsavel.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSetor = filtroSetor === "Todas" || p.setor === filtroSetor;
    return matchesBusca && matchesSetor;
  });

  const procedimentosPorSetor = categorias.map((categoria) => ({
    ...categoria,
    procedimentos: procedimentosFiltrados.filter((p) => p.setor === categoria.label),
  }));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Novo procedimento:", formData);
    setIsModalOpen(false);
    setFormData({
      titulo: "",
      setor: "Contábil",
      passoAPasso: "",
      linksUteis: "",
      arquivosModelo: "",
      responsavel: "",
    });
  };

  const handleDeleteProcedimento = (id: number) => {
    setProcedimentosList(procedimentosList.filter((p) => p.id !== id));
  };

  const handleViewClick = (proc: typeof procedimentos[0]) => {
    setViewingId(proc.id);
    setIsViewModalOpen(true);
  };

  const handleEditClick = (proc: typeof procedimentos[0]) => {
    setEditingId(proc.id);
    setEditFormData({
      titulo: proc.titulo,
      setor: proc.setor,
      passoAPasso: proc.passoAPasso,
      linksUteis: proc.linksUteis.join("\n"),
      arquivosModelo: proc.arquivosModelo.join("\n"),
      responsavel: proc.responsavel,
    });
    setIsEditModalOpen(true);
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdateProcedimento = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId === null) return;

    setProcedimentosList(
      procedimentosList.map((p) =>
        p.id === editingId
          ? {
              ...p,
              titulo: editFormData.titulo,
              setor: editFormData.setor,
              passoAPasso: editFormData.passoAPasso,
              linksUteis: editFormData.linksUteis.split("\n").filter((link) => link.trim()),
              arquivosModelo: editFormData.arquivosModelo.split("\n").filter((arquivo) => arquivo.trim()),
              responsavel: editFormData.responsavel,
              ultimaAtualizacao: new Date().toISOString().split("T")[0],
            }
          : p
      )
    );
    setIsEditModalOpen(false);
    setEditingId(null);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#070b16] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.26),transparent_30%),radial-gradient(circle_at_84%_8%,rgba(167,139,250,0.28),transparent_32%),radial-gradient(circle_at_62%_78%,rgba(56,189,248,0.14),transparent_34%),linear-gradient(135deg,#061020_0%,#080b18_48%,#12091f_100%)]" />
      <div className="relative grid min-h-screen grid-cols-[236px_minmax(0,1fr)] max-[980px]:grid-cols-1">
        <ErpSidebar />

        <section className="min-w-0 px-6 pb-5 pt-3 max-[640px]:px-4">
          <div className="relative z-30 mb-4 flex min-h-9 items-center justify-end rounded-xl border border-white/10 bg-[#061020]/88 px-2.5 backdrop-blur-xl max-[640px]:py-2">
            <div className="flex flex-row-reverse items-center gap-2">
              <LogoffLink />

              <div className="group relative after:absolute after:left-0 after:right-0 after:top-8 after:h-3 after:content-['']">
                <button
                  className="flex min-h-8 items-center gap-1.5 px-1.5 text-[15px] font-normal text-slate-300 transition hover:text-sky-100"
                  type="button"
                >
                  <svg
                    className="size-4 text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.75)]"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5" />
                    <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.65V21a2 2 0 1 1-4 0v-.1a1.8 1.8 0 0 0-1.1-1.65 1.8 1.8 0 0 0-1.98.36l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.1H3a2 2 0 1 1 0-4h.1A1.8 1.8 0 0 0 4.75 8.8a1.8 1.8 0 0 0-.36-1.98l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 10.3 2.7V2a2 2 0 1 1 4 0v.1a1.8 1.8 0 0 0 1.1 1.65 1.8 1.8 0 0 0 1.98-.36l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.1H21a2 2 0 1 1 0 4h-.1A1.8 1.8 0 0 0 19.4 15" />
                  </svg>
                  <span>Configurações</span>
                  <svg className="size-3 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div className="invisible absolute right-0 top-9 w-52 rounded-xl border border-white/10 bg-[#061020]/96 p-2 opacity-0 shadow-2xl shadow-black/35 backdrop-blur-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  {configuracaoItems.map((item) => (
                    <Link
                      className="flex min-h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[15px] font-normal text-slate-300 transition hover:bg-white/[0.06] hover:text-sky-100"
                      href={item.href}
                      key={item.label}
                    >
                      <span>{item.label}</span>
                      <span className="text-sky-300">+</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="group relative after:absolute after:left-0 after:right-0 after:top-8 after:h-3 after:content-['']">
                <button
                  className="flex min-h-8 items-center gap-1.5 px-1.5 text-[15px] font-normal text-slate-300 transition hover:text-sky-100"
                  type="button"
                >
                  <svg
                    className="size-4 text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.75)]"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z" />
                    <path d="M8 7h8" />
                    <path d="M8 11h8" />
                    <path d="M8 15h5" />
                  </svg>
                  <span>Relatórios</span>
                  <svg className="size-3 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div className="invisible absolute right-0 top-9 w-64 rounded-xl border border-white/10 bg-[#061020]/96 p-2 opacity-0 shadow-2xl shadow-black/35 backdrop-blur-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  {relatorioItems.map((item) => (
                    <Link
                      className="flex min-h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[15px] font-normal text-slate-300 transition hover:bg-white/[0.06] hover:text-sky-100"
                      href={item.href}
                      key={item.label}
                    >
                      <span>{item.label}</span>
                      <span className="text-sky-300">+</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="group relative after:absolute after:left-0 after:right-0 after:top-8 after:h-3 after:content-['']">
                <button
                  className="flex min-h-8 items-center gap-1.5 px-1.5 text-[15px] font-normal text-slate-300 transition hover:text-sky-100"
                  type="button"
                >
                  <svg
                    className="size-4 text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.75)]"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M10 13a5 5 0 0 0 7.1 0l2.1-2.1a5 5 0 0 0-7.1-7.1L11 4.9" />
                    <path d="M14 11a5 5 0 0 0-7.1 0l-2.1 2.1a5 5 0 0 0 7.1 7.1l1.1-1.1" />
                  </svg>
                  <span>Vínculos</span>
                  <svg className="size-3 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div className="invisible absolute right-0 top-9 w-60 rounded-xl border border-white/10 bg-[#061020]/96 p-2 opacity-0 shadow-2xl shadow-black/35 backdrop-blur-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  {vinculoItems.map((item) => (
                    <Link
                      className="flex min-h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[15px] font-normal text-slate-300 transition hover:bg-white/[0.06] hover:text-sky-100"
                      href={item.href}
                      key={item.label}
                    >
                      <span>{item.label}</span>
                      <span className="text-sky-300">+</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="group relative after:absolute after:left-0 after:right-0 after:top-8 after:h-3 after:content-['']">
                <button
                  className="flex min-h-8 items-center gap-1.5 px-1.5 text-[15px] font-normal text-slate-300 transition hover:text-sky-100"
                  type="button"
                >
                  <svg
                    className="size-4 text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.75)]"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path d="M4 5h16" />
                    <path d="M4 12h16" />
                    <path d="M4 19h16" />
                  </svg>
                  <span>Cadastro</span>
                  <svg className="size-3 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div className="invisible absolute right-0 top-9 w-60 rounded-xl border border-white/10 bg-[#061020]/96 p-2 opacity-0 shadow-2xl shadow-black/35 backdrop-blur-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  {cadastroItems.map((item) => (
                    <Link
                      className="flex min-h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[15px] font-normal text-slate-300 transition hover:bg-white/[0.06] hover:text-sky-100"
                      href="#"
                      key={item}
                    >
                      <span>{item}</span>
                      <span className="text-sky-300">+</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <header className="flex items-center justify-between gap-4 max-[760px]:items-start max-[760px]:flex-col">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Base de conhecimento</p>
              <h1 className="mt-2 max-w-3xl text-2xl font-black leading-tight tracking-normal max-[760px]:text-xl">
                Base de Procedimentos Internos
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
                Biblioteca centralizada com passo a passo de todas as rotinas do escritório. Evita dúvidas repetidas e padroniza o trabalho.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="min-h-9 rounded-lg bg-sky-300 px-4 text-xs font-black text-slate-950 transition hover:bg-sky-200"
            >
              + Novo Procedimento
            </button>
          </header>

          <div className="mt-6 flex gap-3 max-[640px]:flex-col">
            <div className="flex-1 flex gap-3 max-[640px]:flex-col">
              <input
                type="text"
                placeholder="Buscar procedimento ou responsável..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-h-10 flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-4 text-xs text-white outline-none placeholder:text-slate-600 transition hover:border-white/20 focus:border-sky-300/50"
              />
              <select
                value={filtroSetor}
                onChange={(e) => setFiltroSetor(e.target.value)}
                className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-4 text-xs text-white outline-none transition hover:border-white/20 focus:border-sky-300/50 min-w-[160px]"
              >
                <option>Todas</option>
                {categorias.map((cat) => (
                  <option key={cat.label} value={cat.label}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-6 gap-2 max-[1280px]:grid-cols-3 max-[640px]:grid-cols-2">
            {categorias.map((categoria) => (
              <a
                href={categoria.href}
                key={categoria.label}
                className="group rounded-xl border border-white/10 bg-slate-950/45 p-3 text-center transition hover:border-white/20 hover:bg-slate-950/60"
              >
                <div className={`mx-auto mb-2 size-8 rounded-lg ${categoria.color} opacity-20 group-hover:opacity-30 transition`} />
                <p className="text-xs font-bold text-slate-200">{categoria.label}</p>
              </a>
            ))}
          </div>

          <div className="mt-8 space-y-8">
            {procedimentosPorSetor.map((setor) => (
              setor.procedimentos.length > 0 && (
                <section key={setor.label} id={setor.label.toLowerCase().replace(/\/| /g, "")}>
                  <h2 className="mb-4 text-lg font-black text-slate-100">{setor.label}</h2>
                  <div className="grid gap-3">
                    {setor.procedimentos.map((proc) => (
                      <article key={proc.id} className="rounded-xl border border-white/10 bg-slate-950/45 p-4 transition hover:border-white/20 hover:bg-slate-950/60">
                        <div className="flex items-start justify-between gap-3 max-[640px]:flex-col">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-black text-sky-100">{proc.titulo}</h3>
                            <p className="mt-2 text-xs text-slate-400 line-clamp-2">{proc.passoAPasso.substring(0, 150)}...</p>

                            {proc.linksUteis.length > 0 && (
                              <div className="mt-3">
                                <p className="text-[11px] font-bold text-slate-500">Links úteis:</p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {proc.linksUteis.map((link, idx) => (
                                    <a
                                      key={idx}
                                      href={link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[11px] text-sky-300 hover:text-sky-200"
                                    >
                                      Link {idx + 1} ↗
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {proc.arquivosModelo.length > 0 && (
                              <div className="mt-3">
                                <p className="text-[11px] font-bold text-slate-500">Arquivos modelo:</p>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {proc.arquivosModelo.map((arquivo, idx) => (
                                    <span key={idx} className="rounded bg-slate-950/60 px-2 py-1 text-[11px] text-slate-300">
                                      📎 {arquivo}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
                              <span>👤 {proc.responsavel}</span>
                              <span>📅 {new Date(proc.ultimaAtualizacao).toLocaleDateString("pt-BR")}</span>
                            </div>
                          </div>

                          <div className="flex-shrink-0 flex gap-2">
                            <button
                              onClick={() => handleViewClick(proc)}
                              className="flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-300/10 text-violet-300 transition hover:border-violet-300/40 hover:bg-violet-300/20 hover:text-violet-200"
                              title="Visualizar procedimento completo"
                            >
                              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>

                            <button
                              onClick={() => handleEditClick(proc)}
                              className="flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-sky-300/20 bg-sky-300/10 text-sky-300 transition hover:border-sky-300/40 hover:bg-sky-300/20 hover:text-sky-200"
                              title="Editar procedimento"
                            >
                              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>

                            <button
                              onClick={() => handleDeleteProcedimento(proc.id)}
                              className="flex min-h-8 min-w-8 items-center justify-center rounded-lg border border-rose-300/20 bg-rose-300/10 text-rose-300 transition hover:border-rose-300/40 hover:bg-rose-300/20 hover:text-rose-200"
                              title="Excluir procedimento"
                            >
                              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )
            ))}
          </div>
        </section>

        {isViewModalOpen && viewingId && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/78 backdrop-blur-sm">
            <div className="rounded-2xl border border-white/10 bg-[#061020] p-6 shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              {procedimentosList.find(p => p.id === viewingId) && (
                <>
                  <h2 className="text-lg font-black text-slate-100">{procedimentosList.find(p => p.id === viewingId)?.titulo}</h2>

                  <div className="mt-4 space-y-4">
                    <div className="flex gap-4 flex-wrap">
                      <div>
                        <p className="text-[11px] font-bold text-slate-400">SETOR</p>
                        <p className="mt-1 text-sm text-slate-200">{procedimentosList.find(p => p.id === viewingId)?.setor}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-400">RESPONSÁVEL</p>
                        <p className="mt-1 text-sm text-slate-200">{procedimentosList.find(p => p.id === viewingId)?.responsavel}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-400">ÚLTIMA ATUALIZAÇÃO</p>
                        <p className="mt-1 text-sm text-slate-200">{new Date(procedimentosList.find(p => p.id === viewingId)?.ultimaAtualizacao || '').toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>

                    <div className="border-t border-white/10 pt-4">
                      <h3 className="text-sm font-black text-slate-100">PASSO A PASSO</h3>
                      <div className="mt-3 whitespace-pre-wrap text-xs text-slate-300 leading-6">
                        {procedimentosList.find(p => p.id === viewingId)?.passoAPasso}
                      </div>
                    </div>

                    {(procedimentosList.find(p => p.id === viewingId)?.linksUteis.length ?? 0) > 0 && (
                      <div className="border-t border-white/10 pt-4">
                        <h3 className="text-sm font-black text-slate-100">LINKS ÚTEIS</h3>
                        <div className="mt-3 space-y-2">
                          {procedimentosList.find(p => p.id === viewingId)?.linksUteis.map((link, idx) => (
                            <a
                              key={idx}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs text-sky-300 hover:text-sky-200 break-all"
                            >
                              🔗 {link}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {(procedimentosList.find(p => p.id === viewingId)?.arquivosModelo.length ?? 0) > 0 && (
                      <div className="border-t border-white/10 pt-4">
                        <h3 className="text-sm font-black text-slate-100">ARQUIVOS MODELO</h3>
                        <div className="mt-3 space-y-2">
                          {procedimentosList.find(p => p.id === viewingId)?.arquivosModelo.map((arquivo, idx) => (
                            <div key={idx} className="flex items-center gap-2 rounded-lg bg-slate-950/60 p-2">
                              <span>📎</span>
                              <span className="text-xs text-slate-300">{arquivo}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => setIsViewModalOpen(false)}
                      className="min-h-10 rounded-lg bg-sky-300 px-4 text-xs font-black text-slate-950 transition hover:bg-sky-200"
                    >
                      Fechar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {isEditModalOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/78 backdrop-blur-sm">
            <div className="rounded-2xl border border-white/10 bg-[#061020] p-6 shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-black text-slate-100">Editar Procedimento</h2>

              <form onSubmit={handleUpdateProcedimento} className="mt-4 grid gap-4">
                <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-400">Título</label>
                    <input
                      type="text"
                      name="titulo"
                      value={editFormData.titulo}
                      onChange={handleEditInputChange}
                      placeholder="Ex: Como transmitir DCTFWeb"
                      className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400">Setor</label>
                    <select
                      name="setor"
                      value={editFormData.setor}
                      onChange={handleEditInputChange}
                      className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none"
                    >
                      <option>Contábil</option>
                      <option>Fiscal</option>
                      <option>Trabalhista/Pessoal</option>
                      <option>Legalização</option>
                      <option>Financeiro</option>
                      <option>Atendimento</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400">Passo a Passo</label>
                  <textarea
                    name="passoAPasso"
                    value={editFormData.passoAPasso}
                    onChange={handleEditInputChange}
                    placeholder="1. Primeiro passo&#10;2. Segundo passo&#10;3. Terceiro passo"
                    rows={6}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400">Links Úteis (separados por quebra de linha)</label>
                  <textarea
                    name="linksUteis"
                    value={editFormData.linksUteis}
                    onChange={handleEditInputChange}
                    placeholder="https://www.gov.br/&#10;https://exemplo.com/"
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400">Arquivos Modelo (separados por quebra de linha)</label>
                  <textarea
                    name="arquivosModelo"
                    value={editFormData.arquivosModelo}
                    onChange={handleEditInputChange}
                    placeholder="Modelo_Documento.pdf&#10;Checklist_Tarefas.xlsx"
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400">Responsável pelo Procedimento</label>
                  <input
                    type="text"
                    name="responsavel"
                    value={editFormData.responsavel}
                    onChange={handleEditInputChange}
                    placeholder="Ex: Setor Fiscal"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600"
                    required
                  />
                </div>

                <div className="mt-4 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="min-h-10 rounded-lg bg-sky-300 px-4 text-xs font-black text-slate-950 transition hover:bg-sky-200"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isModalOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/78 backdrop-blur-sm">
            <div className="rounded-2xl border border-white/10 bg-[#061020] p-6 shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-black text-slate-100">Novo Procedimento</h2>

              <form onSubmit={handleSubmit} className="mt-4 grid gap-4">
                <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-400">Título</label>
                    <input
                      type="text"
                      name="titulo"
                      value={formData.titulo}
                      onChange={handleInputChange}
                      placeholder="Ex: Como transmitir DCTFWeb"
                      className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400">Setor</label>
                    <select
                      name="setor"
                      value={formData.setor}
                      onChange={handleInputChange}
                      className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none"
                    >
                      <option>Contábil</option>
                      <option>Fiscal</option>
                      <option>Trabalhista/Pessoal</option>
                      <option>Legalização</option>
                      <option>Financeiro</option>
                      <option>Atendimento</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400">Passo a Passo</label>
                  <textarea
                    name="passoAPasso"
                    value={formData.passoAPasso}
                    onChange={handleInputChange}
                    placeholder="1. Primeiro passo&#10;2. Segundo passo&#10;3. Terceiro passo"
                    rows={6}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400">Links Úteis (separados por quebra de linha)</label>
                  <textarea
                    name="linksUteis"
                    value={formData.linksUteis}
                    onChange={handleInputChange}
                    placeholder="https://www.gov.br/&#10;https://exemplo.com/"
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400">Arquivos Modelo (separados por quebra de linha)</label>
                  <textarea
                    name="arquivosModelo"
                    value={formData.arquivosModelo}
                    onChange={handleInputChange}
                    placeholder="Modelo_Documento.pdf&#10;Checklist_Tarefas.xlsx"
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400">Responsável pelo Procedimento</label>
                  <input
                    type="text"
                    name="responsavel"
                    value={formData.responsavel}
                    onChange={handleInputChange}
                    placeholder="Ex: Setor Fiscal"
                    className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600"
                    required
                  />
                </div>

                <div className="mt-4 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="min-h-10 rounded-lg bg-sky-300 px-4 text-xs font-black text-slate-950 transition hover:bg-sky-200"
                  >
                    Cadastrar Procedimento
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
