"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import ConfirmDeleteModal from "@/app/components/ConfirmDeleteModal";
import ErpChrome from "@/app/components/ErpChrome";
import { supabase } from "@/app/lib/supabaseClient";

type UsuarioSistema = {
  id: string;
  nome: string;
  email: string | null;
  setor: string | null;
  setores: string[] | null;
  perfil: string;
  status: string;
  permissoes?: Record<string, boolean> | null;
};

type SetorOption = {
  id: string;
  nome: string;
};

type UsuariosApiResponse = {
  usuarios?: UsuarioSistema[];
  setores?: SetorOption[];
  usuario?: UsuarioSistema;
  error?: string;
};

const perfis = ["Administrador", "Gestor", "Operador", "Consulta"];

const permissionGroups = [
  {
    title: "Dashboard",
    permissions: [
      { key: "dashboard.visualizar", label: "Visualizar dashboard" },
      { key: "dashboard.finalizar_obrigacoes", label: "Finalizar obrigações por cliente" },
      { key: "dashboard.finalizar_tarefas", label: "Finalizar tarefas por cliente" },
      { key: "dashboard.ver_todos_setores", label: "Visualizar tarefas de todos os setores" },
    ],
  },
  {
    title: "Obrigações",
    permissions: [
      { key: "obrigacoes.visualizar", label: "Visualizar obrigações" },
      { key: "obrigacoes.cadastrar", label: "Cadastrar obrigação" },
      { key: "obrigacoes.editar", label: "Editar obrigação" },
      { key: "obrigacoes.excluir", label: "Excluir obrigação" },
      { key: "obrigacoes.detalhes", label: "Ver detalhes da obrigação" },
    ],
  },
  {
    title: "Tarefas",
    permissions: [
      { key: "tarefas.visualizar", label: "Visualizar tarefas" },
      { key: "tarefas.cadastrar", label: "Cadastrar tarefa" },
      { key: "tarefas.editar", label: "Editar tarefa" },
      { key: "tarefas.excluir", label: "Excluir tarefa" },
      { key: "tarefas.detalhes", label: "Ver detalhes da tarefa" },
    ],
  },
  {
    title: "Clientes",
    permissions: [
      { key: "clientes.visualizar", label: "Visualizar clientes" },
      { key: "clientes.cadastrar", label: "Cadastrar cliente" },
      { key: "clientes.editar", label: "Editar cliente" },
      { key: "clientes.excluir", label: "Excluir cliente" },
      { key: "clientes.vincular_obrigacoes", label: "Vincular obrigações no cliente" },
    ],
  },
  {
    title: "Certificados digitais",
    permissions: [
      { key: "certificados.visualizar", label: "Visualizar certificados" },
      { key: "certificados.cadastrar", label: "Cadastrar certificado" },
      { key: "certificados.editar", label: "Editar certificado" },
      { key: "certificados.testar", label: "Testar certificado" },
      { key: "certificados.excluir", label: "Excluir certificado" },
      { key: "certificados.usar", label: "Usar certificado em sincronizações" },
    ],
  },
  {
    title: "Documentos fiscais",
    permissions: [
      { key: "documentos_fiscais.visualizar", label: "Visualizar documentos fiscais" },
      { key: "documentos_fiscais.sincronizar", label: "Executar sincronizações" },
      { key: "documentos_fiscais.importar", label: "Importar XML/PDF/ZIP" },
      { key: "documentos_fiscais.consultar_chave", label: "Consultar por chave de acesso" },
      { key: "documentos_fiscais.resolver_pendencias", label: "Resolver pendências fiscais" },
      { key: "documentos_fiscais.gerar_financeiro", label: "Gerar lançamento financeiro" },
    ],
  },
  {
    title: "Cadastros auxiliares",
    permissions: [
      { key: "grupos_clientes.visualizar", label: "Visualizar grupo de clientes" },
      { key: "grupos_clientes.gerenciar", label: "Gerenciar grupo de clientes" },
      { key: "setores.visualizar", label: "Visualizar setores" },
      { key: "setores.gerenciar", label: "Gerenciar setores" },
    ],
  },
  {
    title: "Usuários e segurança",
    permissions: [
      { key: "usuarios.visualizar", label: "Visualizar usuários" },
      { key: "usuarios.cadastrar", label: "Cadastrar usuário" },
      { key: "usuarios.editar", label: "Editar usuário" },
      { key: "usuarios.excluir", label: "Excluir usuário" },
      { key: "usuarios.alterar_senha", label: "Alterar senha de usuário" },
      { key: "usuarios.permissoes", label: "Gerenciar permissões" },
    ],
  },
  {
    title: "Relatórios",
    permissions: [
      { key: "relatorios.obrigacoes_finalizadas", label: "Visualizar obrigações finalizadas" },
      { key: "relatorios.exportar", label: "Exportar relatórios" },
    ],
  },
];

const allPermissionKeys = permissionGroups.flatMap((group) => group.permissions.map((permission) => permission.key));

const emptyForm = {
  nome: "",
  email: "",
  setores: [] as string[],
  perfil: "Operador",
  senhaTemporaria: "",
};

function ActionIcon({ type }: { type: "password" | "permissions" | "edit" | "delete" }) {
  const paths = {
    password: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.8 12.2 7-7" /><path d="m15.5 5.5 3 3" /><path d="m13.5 7.5 3 3" /></>,
    permissions: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-5" /></>,
    edit: <><path d="M12 20h9" /><path d="m16.5 3.5 4 4L8 20H4v-4z" /></>,
    delete: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  };

  return (
    <svg
      className={`size-4 ${type === "delete" ? "text-rose-400" : "text-slate-300"} transition hover:text-sky-300`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {paths[type]}
    </svg>
  );
}

function ActionButton({
  label,
  type,
  onClick,
}: {
  label: string;
  type: "password" | "permissions" | "edit" | "delete";
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="group relative flex size-7 items-center justify-center rounded-lg transition hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none"
      onClick={onClick}
      type="button"
    >
      <ActionIcon type={type} />
      <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 whitespace-nowrap rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-[10px] font-bold text-slate-100 opacity-0 shadow-xl shadow-black/30 transition group-hover:opacity-100 group-focus:opacity-100">
        {label}
      </span>
    </button>
  );
}

async function criarUsuarioNoAuth(email: string, senha: string, nome: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { error: "Faça login como Administrador ou Gestor para cadastrar usuários.", alreadyExists: false };
  }

  const response = await fetch("/api/auth/create-user", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      email,
      password: senha,
      nome,
    }),
  });

  const result = await response.json().catch(() => ({} as { error?: string; alreadyExists?: boolean }));

  if (response.ok) {
    return { error: "", alreadyExists: result.alreadyExists ?? false };
  }

  return { error: result.error || "Não foi possível criar o usuário no Supabase Auth.", alreadyExists: false };
}

async function requestUsuariosApi(path = "/api/usuarios-sistema", init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      response: null,
      result: { error: "Sessão não encontrada. Entre novamente no sistema." } as UsuariosApiResponse,
    };
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...init, headers });
  const result = await response.json().catch(() => ({} as UsuariosApiResponse));
  return { response, result };
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>([]);
  const [setores, setSetores] = useState<SetorOption[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [passwordId, setPasswordId] = useState<string | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<UsuarioSistema | null>(null);
  const [permissionsDraft, setPermissionsDraft] = useState<Record<string, boolean>>({});
  const [newPassword, setNewPassword] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setFeedback("");

      const { response, result } = await requestUsuariosApi();

      if (!response?.ok) {
        setFeedback(result.error || "Erro ao buscar usuários.");
        setIsLoading(false);
        return;
      }

      setUsuarios(result.usuarios ?? []);
      setSetores(result.setores ?? []);

      setIsLoading(false);
    }

    loadData();
  }, []);

  const filteredUsuarios = useMemo(() => {
    return usuarios.filter((usuario) =>
      `${usuario.nome} ${usuario.email ?? ""} ${getUsuarioSetores(usuario).join(" ")} ${usuario.perfil}`.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, usuarios]);

  function getUsuarioSetores(usuario: UsuarioSistema) {
    return usuario.setores && usuario.setores.length > 0 ? usuario.setores : usuario.setor ? [usuario.setor] : [];
  }

  function getUsuarioPermissoes(usuario: UsuarioSistema) {
    return allPermissionKeys.reduce<Record<string, boolean>>((permissions, key) => {
      permissions[key] = Boolean(usuario.permissoes?.[key]);
      return permissions;
    }, {});
  }

  function abrirPermissoes(usuario: UsuarioSistema) {
    setPermissionsUser(usuario);
    setPermissionsDraft(getUsuarioPermissoes(usuario));
  }

  function togglePermissao(key: string) {
    setPermissionsDraft((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function marcarTodasPermissoes(checked: boolean) {
    setPermissionsDraft(allPermissionKeys.reduce<Record<string, boolean>>((permissions, key) => {
      permissions[key] = checked;
      return permissions;
    }, {}));
  }

  async function salvarPermissoes() {
    if (!permissionsUser) return;

    setFeedback("");
    const { response, result } = await requestUsuariosApi("/api/usuarios-sistema", {
      method: "PATCH",
      body: JSON.stringify({
        id: permissionsUser.id,
        payload: {
          permissoes: permissionsDraft,
          updated_at: new Date().toISOString(),
        },
      }),
    });

    if (!response?.ok || !result.usuario) {
      setFeedback(result.error || "Erro ao salvar permissões.");
      return;
    }

    setUsuarios((current) => current.map((usuario) => (usuario.id === permissionsUser.id ? result.usuario as UsuarioSistema : usuario)));
    setPermissionsUser(null);
    setPermissionsDraft({});
    setFeedback("Permissões atualizadas com sucesso.");
  }

  function toggleSetor(setor: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      setores: checked
        ? [...current.setores, setor]
        : current.setores.filter((item) => item !== setor),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    if (!form.nome.trim()) {
      setFeedback("Informe o nome do usuário.");
      return;
    }

    if (form.setores.length === 0) {
      setFeedback("Selecione pelo menos um setor do usuário.");
      return;
    }

    if (!editingId && !form.email.trim()) {
      setFeedback("Informe o e-mail do usuário para criar o acesso no Supabase Auth.");
      return;
    }

    if (!editingId && !form.senhaTemporaria.trim()) {
      setFeedback("Informe a senha temporária para criar o acesso no Supabase Auth.");
      return;
    }

    const payload = {
      nome: form.nome.trim(),
      email: form.email.trim() || null,
      setor: form.setores[0],
      setores: form.setores,
      perfil: form.perfil,
      status: "Ativo",
      updated_at: new Date().toISOString(),
      // A senha não é gravada aqui. Ela vai para o Supabase Auth, que é quem
      // guarda credencial; a coluna senha_temporaria mantinha uma cópia legível
      // do mesmo segredo, e foi ela que vazou por /api/dev/users-list.
    };

    if (editingId) {
      const { response, result } = await requestUsuariosApi("/api/usuarios-sistema", {
        method: "PATCH",
        body: JSON.stringify({ id: editingId, payload }),
      });

      if (!response?.ok || !result.usuario) {
        setFeedback(result.error || "Erro ao atualizar usuário.");
        return;
      }

      // O campo de senha na edição é opcional. Preenchido, vai para o Auth pela
      // mesma rota do botão de alterar senha — antes ele caía na coluna em texto
      // claro, e agora seria ignorado em silêncio se não passasse por aqui.
      if (form.senhaTemporaria.trim()) {
        if (form.senhaTemporaria.trim().length < 8) {
          setFeedback("Usuário atualizado, mas a senha não mudou: precisa de ao menos 8 caracteres.");
          setEditingId(null);
          setForm(emptyForm);
          return;
        }

        const senhaResposta = await requestUsuariosApi("/api/auth/definir-senha", {
          method: "POST",
          body: JSON.stringify({ id: editingId, password: form.senhaTemporaria.trim() }),
        });

        if (!senhaResposta.response?.ok) {
          setFeedback(
            `Usuário atualizado, mas a senha não mudou: ${senhaResposta.result.error || "erro ao falar com o Supabase Auth."}`
          );
          setEditingId(null);
          setForm(emptyForm);
          return;
        }
      }

      setUsuarios((current) => current.map((usuario) => (usuario.id === editingId ? result.usuario as UsuarioSistema : usuario)));
      setFeedback(
        form.senhaTemporaria.trim()
          ? "Usuário atualizado e senha alterada no Supabase Auth."
          : "Usuário atualizado com sucesso."
      );
      setEditingId(null);
      setForm(emptyForm);
      return;
    }

    const authResult = await criarUsuarioNoAuth(form.email.trim(), form.senhaTemporaria.trim(), form.nome.trim());
    if (authResult.error) {
      setFeedback(`Usuário não foi salvo porque o Supabase Auth retornou: ${authResult.error}`);
      return;
    }

    const { response, result } = await requestUsuariosApi("/api/usuarios-sistema", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!response?.ok || !result.usuario) {
      setFeedback(result.error || "Erro ao salvar usuário.");
      return;
    }

    setUsuarios((current) => [...current, result.usuario as UsuarioSistema].sort((a, b) => a.nome.localeCompare(b.nome)));

    setFeedback(authResult.alreadyExists ? "Usuário cadastrado com sucesso. O acesso no Supabase Auth já existia." : "Usuário cadastrado com sucesso. Acesso no Supabase Auth criado.");
    setForm(emptyForm);
  }

  function editarUsuario(usuario: UsuarioSistema) {
    setEditingId(usuario.id);
    setPasswordId(null);
    setNewPassword("");
    setForm({
      nome: usuario.nome,
      email: usuario.email ?? "",
      setores: getUsuarioSetores(usuario),
      perfil: usuario.perfil,
      senhaTemporaria: "",
    });
  }

  async function excluirUsuario(id: string) {
    setFeedback("");
    setIsDeleting(true);
    const { response, result } = await requestUsuariosApi(`/api/usuarios-sistema?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setIsDeleting(false);

    if (!response?.ok) {
      setFeedback(result.error || "Erro ao excluir usuário.");
      return;
    }

    setUsuarios((current) => current.filter((usuario) => usuario.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyForm);
    }
    if (passwordId === id) {
      setPasswordId(null);
      setNewPassword("");
    }

    setDeleteTargetId(null);
    setFeedback("Usuário excluído com sucesso.");
  }

  /**
   * Troca a senha do usuário no Supabase Auth.
   *
   * Antes isto gravava a senha em texto claro na coluna senha_temporaria e não
   * falava com o Auth: a tela dizia que tinha dado certo e a senha de login do
   * usuário continuava a mesma. Quem guarda a credencial é o Auth.
   */
  async function alterarSenha(id: string) {
    setFeedback("");

    if (newPassword.trim().length < 8) {
      setFeedback("A nova senha precisa ter ao menos 8 caracteres.");
      return;
    }

    const { response, result } = await requestUsuariosApi("/api/auth/definir-senha", {
      method: "POST",
      body: JSON.stringify({ id, password: newPassword.trim() }),
    });

    if (!response?.ok) {
      setFeedback(result.error || "Erro ao alterar senha.");
      return;
    }

    setPasswordId(null);
    setNewPassword("");
    setFeedback("Senha alterada no Supabase Auth. O usuario ja entra com ela.");
  }

  return (
    <ErpChrome>
      <header>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Cadastro</p>
          <h1 className="mt-1 text-2xl font-black leading-tight">Usuários</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
            Cadastre os usuários do sistema, vincule cada pessoa ao setor correto e defina o perfil de acesso.
          </p>
        </div>
      </header>

      <section className="mt-5 grid grid-cols-[minmax(0,1fr)_340px] gap-4 max-[1100px]:grid-cols-1">
        <article className="rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-slate-950/60 px-3">
            <svg className="size-4 text-sky-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              <path d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14" />
            </svg>
            <input
              className="w-full bg-transparent text-xs text-white outline-none placeholder:text-slate-600"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar usuário, setor ou perfil"
              type="search"
              value={search}
            />
          </label>

          <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
            <div className="grid grid-cols-[minmax(180px,1.4fr)_minmax(130px,1fr)_130px_150px] bg-white/[0.06] text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 max-[760px]:hidden">
              <span className="px-3 py-3">Nome</span>
              <span className="px-3 py-3">Setor</span>
              <span className="px-3 py-3">Perfil</span>
              <span className="px-3 py-3 text-right">Acoes</span>
            </div>

            {isLoading && (
              <div className="p-5 text-center text-xs text-slate-400">Carregando usuários do Supabase...</div>
            )}

            {!isLoading && filteredUsuarios.length === 0 && (
              <div className="p-5 text-center text-xs text-slate-400">Nenhum usuário encontrado.</div>
            )}

            {!isLoading && filteredUsuarios.map((usuario) => (
              <section className="border-t border-white/10" key={usuario.id}>
                <div className="grid grid-cols-[minmax(180px,1.4fr)_minmax(130px,1fr)_130px_150px] items-center text-xs text-slate-300 max-[760px]:grid-cols-1 max-[760px]:gap-2 max-[760px]:p-3">
                  <div className="px-3 py-3 max-[760px]:px-0 max-[760px]:py-0">
                    <strong className="block text-sm text-slate-100">{usuario.nome}</strong>
                    <span className="mt-1 block text-[11px] text-slate-500">{usuario.email || "Sem e-mail cadastrado"}</span>
                  </div>
                  <span className="flex flex-wrap gap-1.5 px-3 py-3 max-[760px]:px-0 max-[760px]:py-0">
                    {getUsuarioSetores(usuario).map((setor) => (
                      <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[10px] font-bold text-slate-200" key={setor}>
                        {setor}
                      </span>
                    ))}
                  </span>
                  <span className="px-3 py-3 max-[760px]:px-0 max-[760px]:py-0">
                    <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-1 text-[10px] font-bold text-sky-100">
                      {usuario.perfil}
                    </span>
                  </span>
                  <div className="flex items-center justify-end gap-3 px-3 py-3 max-[760px]:justify-start max-[760px]:px-0 max-[760px]:py-0">
                    <ActionButton label="Alterar senha" onClick={() => { setPasswordId(usuario.id); setNewPassword(""); }} type="password" />
                    <ActionButton label="Permissões" onClick={() => abrirPermissoes(usuario)} type="permissions" />
                    <ActionButton label="Editar" onClick={() => editarUsuario(usuario)} type="edit" />
                    <ActionButton label="Excluir" onClick={() => setDeleteTargetId(usuario.id)} type="delete" />
                  </div>
                </div>

                {passwordId === usuario.id && (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-t border-white/10 bg-slate-950/40 p-3 max-[640px]:grid-cols-1">
                    <input
                      className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600"
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder={`Nova senha temporaria para ${usuario.nome}`}
                      type="password"
                      value={newPassword}
                    />
                    <button className="min-h-10 rounded-lg bg-sky-300 px-4 text-xs font-black text-slate-950" onClick={() => alterarSenha(usuario.id)} type="button">
                      Alterar senha
                    </button>
                    <button className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-300 transition hover:border-sky-300/30 hover:text-sky-100" onClick={() => setPasswordId(null)} type="button">
                      Cancelar
                    </button>
                  </div>
                )}
              </section>
            ))}
          </div>
        </article>

        <aside className="rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <h2 className="text-sm font-black text-slate-100">{editingId ? "Editar usuário" : "Cadastrar usuário"}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {editingId
              ? "Altere os dados do usuário selecionado e salve para atualizar a lista."
              : "Defina nome, setor, perfil e senha temporária de acesso."}
          </p>

          {feedback && (
            <p className="mt-3 rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs text-sky-100">
              {feedback}
            </p>
          )}

          <form className="mt-4 grid gap-3" onSubmit={handleSubmit}>
            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Nome</span>
              <input
                className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600"
                onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                placeholder="Nome do usuário"
                value={form.nome}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">E-mail</span>
              <input
                className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600"
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="email@empresa.com.br"
                type="email"
                value={form.email}
              />
            </label>

            <fieldset className="grid gap-1.5">
              <legend className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Setores</legend>
              <div className="grid max-h-44 gap-2 overflow-y-auto rounded-lg border border-white/10 bg-slate-950/60 p-2">
                {setores.length === 0 && (
                  <p className="px-1 py-2 text-xs text-slate-500">Nenhum setor cadastrado.</p>
                )}
                {setores.map((setor) => (
                  <label className="flex min-h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-xs text-slate-300" key={setor.id}>
                    <input
                      checked={form.setores.includes(setor.nome)}
                      className="accent-sky-300"
                      onChange={(event) => toggleSetor(setor.nome, event.target.checked)}
                      type="checkbox"
                    />
                    {setor.nome}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Perfil</span>
              <select
                className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none"
                onChange={(event) => setForm((current) => ({ ...current, perfil: event.target.value }))}
                value={form.perfil}
              >
                {perfis.map((perfil) => <option key={perfil}>{perfil}</option>)}
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Senha temporária</span>
              <input
                className="min-h-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600"
                onChange={(event) => setForm((current) => ({ ...current, senhaTemporaria: event.target.value }))}
                placeholder={editingId ? "Preencha apenas se quiser trocar" : "Senha inicial"}
                type="password"
                value={form.senhaTemporaria}
              />
            </label>

            <div className="mt-1 grid gap-2">
              <button className="min-h-10 rounded-lg bg-sky-300 px-4 text-xs font-black text-slate-950 shadow-[0_18px_42px_rgba(56,189,248,0.20)]" type="submit">
                {editingId ? "Atualizar usuário" : "Salvar usuário"}
              </button>
              {editingId && (
                <button
                  className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-300 transition hover:border-sky-300/30 hover:text-sky-100"
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                  }}
                  type="button"
                >
                  Cancelar edição
                </button>
              )}
            </div>
          </form>
        </aside>
      </section>

      {permissionsUser && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <section className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#061020] shadow-2xl shadow-black/40">
            <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5 max-[640px]:grid">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Permissões</p>
                <h2 className="mt-1 text-xl font-black text-slate-100">{permissionsUser.nome}</h2>
                <p className="mt-1 text-xs text-slate-500">Marque o check verde para permitir e deixe o X vermelho para bloquear.</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  className="min-h-9 rounded-lg border border-emerald-300/30 px-3 text-xs font-bold text-emerald-100 transition hover:bg-emerald-300/10"
                  onClick={() => marcarTodasPermissoes(true)}
                  type="button"
                >
                  Marcar todos
                </button>
                <button
                  className="min-h-9 rounded-lg border border-rose-300/30 px-3 text-xs font-bold text-rose-100 transition hover:bg-rose-300/10"
                  onClick={() => marcarTodasPermissoes(false)}
                  type="button"
                >
                  Desmarcar todos
                </button>
                <button
                  className="min-h-9 rounded-lg border border-white/10 px-3 text-xs font-bold text-slate-300 transition hover:border-sky-300/30 hover:text-sky-100"
                  onClick={() => setPermissionsUser(null)}
                  type="button"
                >
                  Fechar
                </button>
              </div>
            </header>

            <div className="max-h-[calc(90vh-156px)] overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-4 max-[900px]:grid-cols-1">
                {permissionGroups.map((group) => (
                  <section className="rounded-xl border border-white/10 bg-white/[0.04] p-4" key={group.title}>
                    <h3 className="text-sm font-black text-slate-100">{group.title}</h3>
                    <div className="mt-3 grid gap-2">
                      {group.permissions.map((permission) => {
                        const isAllowed = Boolean(permissionsDraft[permission.key]);

                        return (
                          <button
                            className={`grid min-h-10 grid-cols-[24px_minmax(0,1fr)] items-center gap-3 rounded-lg border px-3 text-left text-xs transition ${
                              isAllowed
                                ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-50"
                                : "border-rose-300/30 bg-rose-300/10 text-rose-50"
                            }`}
                            key={permission.key}
                            onClick={() => togglePermissao(permission.key)}
                            type="button"
                          >
                            <span className={`grid size-6 place-items-center rounded-full text-[11px] font-black ${isAllowed ? "bg-emerald-300 text-slate-950" : "bg-rose-300 text-slate-950"}`}>
                              {isAllowed ? "✓" : "×"}
                            </span>
                            <span>{permission.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <footer className="flex justify-end gap-2 border-t border-white/10 p-4 max-[560px]:grid">
              <button
                className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-bold text-slate-300 transition hover:border-sky-300/30 hover:text-sky-100"
                onClick={() => setPermissionsUser(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="min-h-10 rounded-lg bg-sky-300 px-5 text-xs font-black text-slate-950 shadow-[0_18px_42px_rgba(56,189,248,0.20)]"
                onClick={salvarPermissoes}
                type="button"
              >
                Salvar permissões
              </button>
            </footer>
          </section>
        </div>
      )}

      <ConfirmDeleteModal
        isDeleting={isDeleting}
        isOpen={Boolean(deleteTargetId)}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) void excluirUsuario(deleteTargetId);
        }}
      />
    </ErpChrome>
  );
}
