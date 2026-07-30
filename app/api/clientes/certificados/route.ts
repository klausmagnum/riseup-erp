import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/app/lib/certificateCrypto";
import { deleteDriveFile, getDriveFile, getDriveRootFolderId, uploadDriveFile } from "@/app/lib/googleDriveServer";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const maxFileSize = 10 * 1024 * 1024;
const allowedExtensions = [".pfx", ".p12"];

function getCertificadosFolderId() {
  return process.env.GOOGLE_DRIVE_CERTIFICADOS_FOLDER_ID || getDriveRootFolderId();
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [type, token] = authorization.split(" ");
  return type?.toLowerCase() === "bearer" ? token : "";
}

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function createClients() {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) return null;

  return {
    authClient: createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    adminClient: createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

async function authorize(request: Request) {
  const clients = createClients();
  if (!clients) {
    return {
      error: NextResponse.json(
        { error: "Supabase Auth do servidor nao esta configurado. Configure SUPABASE_SERVICE_ROLE_KEY no .env.local." },
        { status: 500 }
      ),
    };
  }

  const token = getBearerToken(request);
  if (!token) return { error: NextResponse.json({ error: "Sessao nao encontrada. Entre novamente no sistema." }, { status: 401 }) };

  const {
    data: { user },
    error: authError,
  } = await clients.authClient.auth.getUser(token);

  if (authError || !user?.email) {
    return { error: NextResponse.json({ error: "Sessao invalida. Entre novamente no sistema." }, { status: 401 }) };
  }

  const { data: usuario, error: usuarioError } = await clients.adminClient
    .from("usuarios_sistema")
    .select("id,nome,email,perfil,status,permissoes")
    .ilike("email", user.email)
    .maybeSingle();

  if (usuarioError) {
    return { error: NextResponse.json({ error: `Nao foi possivel validar o usuario: ${usuarioError.message}` }, { status: 500 }) };
  }

  if (!usuario || normalize(usuario.status) === "inativo") {
    return { error: NextResponse.json({ error: "Usuario nao encontrado ou inativo no Cadastro / Usuarios." }, { status: 403 }) };
  }

  return { adminClient: clients.adminClient, usuario };
}

function canUseCertificados(usuario: { perfil?: string | null; permissoes?: Record<string, boolean> | null }, action: string) {
  const perfil = normalize(usuario.perfil);
  if (["administrador", "gestor"].includes(perfil)) return true;
  return Boolean(usuario.permissoes?.[`certificados.${action}`]);
}

function sanitizeCertificado(row: Record<string, unknown>) {
  const safe = { ...row };
  delete safe.senha_criptografada;
  delete safe.drive_file_id;
  delete safe.arquivo_storage_path;
  return safe;
}

function getStatusByDate(dataValidade: string | null | undefined, fallback = "Não testado") {
  if (!dataValidade) return fallback;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const validade = new Date(`${dataValidade}T00:00:00`);
  const days = Math.ceil((validade.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "Vencido";
  if (days <= 30) return "A vencer";
  return fallback;
}

async function audit(adminClient: unknown, payload: Record<string, unknown>) {
  const client = adminClient as unknown as {
    from: (table: string) => { insert: (value: Record<string, unknown>) => Promise<unknown> };
  };
  await client.from("cliente_certificados_auditoria").insert(payload);
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (!canUseCertificados(auth.usuario, "visualizar")) return NextResponse.json({ error: "Permissao insuficiente para visualizar certificados." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const clienteId = searchParams.get("clienteId");
  if (!clienteId) return NextResponse.json({ error: "Informe o cliente para listar certificados." }, { status: 400 });

  const { data, error } = await auth.adminClient
    .from("cliente_certificados")
    .select("id,cliente_id,nome,tipo_certificado,finalidade,principal,arquivo_nome_original,cnpj_cpf_titular,razao_social_titular,emissor,numero_serie,data_emissao,data_validade,status,ativo,observacoes,ultimo_teste_em,ultimo_uso_em,mensagem_ultimo_erro,criado_por,atualizado_por,created_at,updated_at")
    .eq("cliente_id", clienteId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: `Nao foi possivel listar certificados: ${error.message}` }, { status: 500 });
  return NextResponse.json({ certificados: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (!canUseCertificados(auth.usuario, "cadastrar")) return NextResponse.json({ error: "Permissao insuficiente para cadastrar certificados." }, { status: 403 });

  const formData = await request.formData();
  const clienteId = String(formData.get("clienteId") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const tipoCertificado = String(formData.get("tipoCertificado") ?? "A1");
  const finalidade = String(formData.get("finalidade") ?? "Geral");
  const principal = String(formData.get("principal") ?? "false") === "true";
  const senha = String(formData.get("senha") ?? "");
  const confirmarSenha = String(formData.get("confirmarSenha") ?? "");
  const dataValidade = String(formData.get("dataValidade") ?? "");
  const file = formData.get("file");

  if (!clienteId || !nome || !tipoCertificado) return NextResponse.json({ error: "Preencha os campos obrigatorios do certificado." }, { status: 400 });
  if (tipoCertificado === "A1" && !(file instanceof File)) return NextResponse.json({ error: "Arquivo obrigatório para certificado A1." }, { status: 400 });
  if (tipoCertificado === "A1" && !senha) return NextResponse.json({ error: "Senha obrigatória para certificado A1." }, { status: 400 });
  if (senha !== confirmarSenha) return NextResponse.json({ error: "A confirmação da senha não confere." }, { status: 400 });
  if (!dataValidade) return NextResponse.json({ error: "Informe a data de validade do certificado." }, { status: 400 });

  let driveFileId: string | null = null;
  let arquivoNomeOriginal: string | null = null;
  if (file instanceof File) {
    const lowerName = file.name.toLowerCase();
    if (!allowedExtensions.some((extension) => lowerName.endsWith(extension))) {
      return NextResponse.json({ error: "Envie apenas arquivos .pfx ou .p12." }, { status: 400 });
    }
    if (file.size <= 0) return NextResponse.json({ error: "Arquivo do certificado vazio." }, { status: 400 });
    if (file.size > maxFileSize) return NextResponse.json({ error: "Arquivo acima do limite de 10 MB." }, { status: 400 });

    const driveFile = await uploadDriveFile(file, getCertificadosFolderId());
    driveFileId = driveFile.id;
    arquivoNomeOriginal = file.name;
  }

  if (principal) {
    await auth.adminClient
      .from("cliente_certificados")
      .update({ principal: false, updated_at: new Date().toISOString() })
      .eq("cliente_id", clienteId)
      .eq("principal", true)
      .eq("ativo", true)
      .is("deleted_at", null);
  }

  const status = getStatusByDate(dataValidade);
  const { data, error } = await auth.adminClient
    .from("cliente_certificados")
    .insert({
      cliente_id: clienteId,
      nome,
      tipo_certificado: tipoCertificado,
      finalidade,
      principal,
      arquivo_nome_original: arquivoNomeOriginal,
      arquivo_storage_path: driveFileId ? `google-drive:${driveFileId}` : null,
      drive_file_id: driveFileId,
      senha_criptografada: senha ? encryptSecret(senha) : null,
      cnpj_cpf_titular: String(formData.get("cnpjCpfTitular") ?? "").trim() || null,
      razao_social_titular: String(formData.get("razaoSocialTitular") ?? "").trim() || null,
      emissor: String(formData.get("emissor") ?? "").trim() || null,
      numero_serie: String(formData.get("numeroSerie") ?? "").trim() || null,
      data_emissao: String(formData.get("dataEmissao") ?? "") || null,
      data_validade: dataValidade,
      status,
      ativo: true,
      observacoes: String(formData.get("observacoes") ?? "").trim() || null,
      criado_por: auth.usuario.nome || auth.usuario.email,
      atualizado_por: auth.usuario.nome || auth.usuario.email,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: `Nao foi possivel salvar o certificado: ${error.message}` }, { status: 500 });
  await audit(auth.adminClient, { certificado_id: data.id, cliente_id: clienteId, evento: "certificado_cadastrado", usuario: auth.usuario.nome || auth.usuario.email });
  return NextResponse.json({ certificado: sanitizeCertificado(data) });
}

export async function PATCH(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;

  const body = await request.json();
  const id = String(body.id ?? "");
  const action = String(body.action ?? "editar");
  if (!id) return NextResponse.json({ error: "Informe o certificado." }, { status: 400 });
  if (!canUseCertificados(auth.usuario, action === "testar" ? "testar" : "editar")) return NextResponse.json({ error: "Permissao insuficiente para alterar certificados." }, { status: 403 });

  const { data: current, error: currentError } = await auth.adminClient
    .from("cliente_certificados")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (currentError || !current) return NextResponse.json({ error: currentError?.message || "Certificado nao encontrado." }, { status: 404 });

  if (action === "testar") {
    let status = getStatusByDate(current.data_validade, "Ativo");
    let mensagem = "Certificado validado com sucesso.";

    try {
      if (!current.drive_file_id) throw new Error("Arquivo do certificado não localizado. Refaça o upload do certificado.");
      if (!current.senha_criptografada) throw new Error("Não foi possível validar o certificado. Verifique se a senha foi cadastrada.");
      decryptSecret(current.senha_criptografada);
      const driveFile = await getDriveFile(current.drive_file_id);
      if (!driveFile || driveFile.length === 0) throw new Error("Arquivo do certificado não localizado. Refaça o upload do certificado.");
      if (status === "Vencido") mensagem = "O certificado digital está vencido. Cadastre um novo certificado para continuar as sincronizações fiscais.";
    } catch (error) {
      status = "Inválido";
      mensagem = error instanceof Error ? error.message : "Não foi possível validar o certificado.";
    }

    const { data, error } = await auth.adminClient
      .from("cliente_certificados")
      .update({
        status,
        ultimo_teste_em: new Date().toISOString(),
        mensagem_ultimo_erro: status === "Ativo" || status === "A vencer" ? null : mensagem,
        atualizado_por: auth.usuario.nome || auth.usuario.email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: `Nao foi possivel testar o certificado: ${error.message}` }, { status: 500 });
    await audit(auth.adminClient, { certificado_id: id, cliente_id: current.cliente_id, evento: "certificado_testado", mensagem, usuario: auth.usuario.nome || auth.usuario.email });
    return NextResponse.json({ certificado: sanitizeCertificado(data), mensagem });
  }

  const payload = body.payload ?? {};
  if (payload.principal === true) {
    await auth.adminClient
      .from("cliente_certificados")
      .update({ principal: false, updated_at: new Date().toISOString() })
      .eq("cliente_id", current.cliente_id)
      .eq("principal", true)
      .eq("ativo", true)
      .is("deleted_at", null);
  }

  const updatePayload = {
    nome: payload.nome ?? current.nome,
    finalidade: payload.finalidade ?? current.finalidade,
    principal: Boolean(payload.principal),
    cnpj_cpf_titular: payload.cnpjCpfTitular ?? current.cnpj_cpf_titular,
    razao_social_titular: payload.razaoSocialTitular ?? current.razao_social_titular,
    emissor: payload.emissor ?? current.emissor,
    numero_serie: payload.numeroSerie ?? current.numero_serie,
    data_emissao: payload.dataEmissao || current.data_emissao,
    data_validade: payload.dataValidade || current.data_validade,
    observacoes: payload.observacoes ?? current.observacoes,
    ativo: typeof payload.ativo === "boolean" ? payload.ativo : current.ativo,
    status: payload.status || getStatusByDate(payload.dataValidade || current.data_validade, current.status),
    atualizado_por: auth.usuario.nome || auth.usuario.email,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await auth.adminClient
    .from("cliente_certificados")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: `Nao foi possivel atualizar o certificado: ${error.message}` }, { status: 500 });
  await audit(auth.adminClient, { certificado_id: id, cliente_id: current.cliente_id, evento: "certificado_editado", usuario: auth.usuario.nome || auth.usuario.email });
  return NextResponse.json({ certificado: sanitizeCertificado(data) });
}

export async function DELETE(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (!canUseCertificados(auth.usuario, "excluir")) return NextResponse.json({ error: "Permissao insuficiente para excluir certificados." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Informe o certificado para excluir." }, { status: 400 });

  const { data: current, error: currentError } = await auth.adminClient
    .from("cliente_certificados")
    .select("id,cliente_id,drive_file_id,arquivo_storage_path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (currentError || !current) return NextResponse.json({ error: currentError?.message || "Certificado nao encontrado." }, { status: 404 });

  const driveFileId =
    current.drive_file_id ||
    (typeof current.arquivo_storage_path === "string" && current.arquivo_storage_path.startsWith("google-drive:")
      ? current.arquivo_storage_path.replace("google-drive:", "")
      : "");

  if (driveFileId) {
    try {
      await deleteDriveFile(driveFileId);
    } catch (driveError) {
      await audit(auth.adminClient, {
        certificado_id: id,
        cliente_id: current.cliente_id,
        evento: "certificado_exclusao_drive_erro",
        mensagem: driveError instanceof Error ? driveError.message : "Nao foi possivel excluir o arquivo do Google Drive.",
        usuario: auth.usuario.nome || auth.usuario.email,
      });

      return NextResponse.json(
        { error: "Nao foi possivel excluir o arquivo no Google Drive. O certificado nao foi removido do ERP para evitar divergencia." },
        { status: 500 }
      );
    }
  }

  const { data, error } = await auth.adminClient
    .from("cliente_certificados")
    .update({ ativo: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), atualizado_por: auth.usuario.nome || auth.usuario.email })
    .eq("id", id)
    .select("id,cliente_id")
    .single();

  if (error) return NextResponse.json({ error: `Nao foi possivel excluir o certificado: ${error.message}` }, { status: 500 });
  await audit(auth.adminClient, { certificado_id: id, cliente_id: data.cliente_id, evento: "certificado_excluido", usuario: auth.usuario.nome || auth.usuario.email });
  return NextResponse.json({ ok: true });
}
