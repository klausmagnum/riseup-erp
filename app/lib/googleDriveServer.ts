let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getGoogleAccessTokenCached(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.token;
  }

  const token = await getGoogleAccessToken();
  cachedAccessToken = {
    token,
    expiresAt: Date.now() + 3500 * 1000,
  };
  return token;
}

async function getGoogleAccessToken(): Promise<string> {
  const { createSign } = await import("crypto");

  const base64Credentials = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_B64;
  if (!base64Credentials) {
    throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_B64 nao configurado");
  }

  const decodedJson = Buffer.from(base64Credentials, "base64").toString("utf-8");
  const serviceAccount = JSON.parse(decodedJson);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    // Escopo completo, e não drive.file: a conta de serviço precisa ler
    // certificados que foram enviados manualmente ao Drive, e não apenas os
    // arquivos que ela própria criou. O alcance real fica limitado ao que for
    // compartilhado com o e-mail da conta de serviço.
    scope: "https://www.googleapis.com/auth/drive",
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  // Aceita Buffer para que a assinatura não seja codificada duas vezes: a
  // versão anterior fazia base64Url(signature.toString("base64")), gerando
  // base64 de base64. O Google rejeitava com "Invalid JWT Signature" sempre.
  const base64Url = (input: string | Buffer) =>
    (Buffer.isBuffer(input) ? input : Buffer.from(input))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  const signature = signer.sign(serviceAccount.private_key);
  const jwt = `${unsignedJwt}.${base64Url(signature)}`;

  const response = await fetch(serviceAccount.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error || "Nao foi possivel autenticar no Google Drive");
  }

  return data.access_token;
}

export function getDriveRootFolderId(): string {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) {
    throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID nao configurado");
  }
  return rootFolderId;
}

export async function uploadDriveFile(
  file: File,
  parentFolderId: string
): Promise<{ id: string; mimeType: string; webViewLink: string }> {
  const accessToken = await getGoogleAccessTokenCached();
  const formData = new FormData();

  formData.append(
    "metadata",
    new Blob(
      [JSON.stringify({ name: file.name, parents: [parentFolderId] })],
      { type: "application/json" }
    )
  );
  formData.append("file", file);

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Erro ao fazer upload: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    mimeType: data.mimeType,
    webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
  };
}

/**
 * Remove um arquivo do Drive.
 *
 * Em Drive Compartilhado, exclusão definitiva exige o papel "Gerente"; com
 * "Gerenciador de conteúdo" a API responde 404 — o mesmo código de arquivo
 * inexistente. A versão anterior tratava 404 como sucesso, então excluir um
 * certificado apagava o registro no banco e deixava o .pfx no Drive sem
 * nenhum aviso. Aqui o 404 deixa de ser presumido como sucesso: confirmamos
 * o desfecho e, quando a exclusão não é permitida, mandamos para a lixeira.
 */
export async function deleteDriveFile(fileId: string): Promise<void> {
  const accessToken = await getGoogleAccessTokenCached();
  const cabecalho = { Authorization: `Bearer ${accessToken}` };

  const exclusao = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
    { method: "DELETE", headers: cabecalho }
  );

  if (exclusao.ok) return;

  // Some o arquivo de fato ou apenas falta permissão? Uma leitura decide.
  const verificacao = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,trashed,capabilities(canTrash)&supportsAllDrives=true`,
    { headers: cabecalho }
  );

  // Já não existe: nada a fazer.
  if (verificacao.status === 404) return;

  if (!verificacao.ok) {
    throw new Error(
      `Nao foi possivel remover o arquivo ${fileId} do Drive (HTTP ${exclusao.status}).`
    );
  }

  const info = await verificacao.json();
  if (info.trashed) return;

  if (!info.capabilities?.canTrash) {
    throw new Error(
      `Sem permissao para remover o arquivo ${fileId} do Drive. ` +
        `Conceda o papel "Gerente" a conta de servico no Drive Compartilhado.`
    );
  }

  const lixeira = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { ...cabecalho, "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    }
  );

  if (!lixeira.ok) {
    throw new Error(`Falha ao mover o arquivo ${fileId} para a lixeira do Drive.`);
  }
}

// Pastas do Drive não mudam de id. Sem este cache, arquivar um lote de 50
// documentos do mesmo cliente/mês dispara 200 buscas para resolver as mesmas
// quatro pastas — foi o que fez a primeira sincronização levar 3,4 minutos.
const cacheDePastas = new Map<string, string>();

/**
 * Devolve o id da subpasta com esse nome, criando-a se ainda não existir.
 * Idempotente: a sincronização roda várias vezes por dia sobre as mesmas pastas.
 */
export async function ensureDriveFolder(
  name: string,
  parentFolderId: string
): Promise<string> {
  const chaveCache = `${parentFolderId}/${name}`;
  const emCache = cacheDePastas.get(chaveCache);
  if (emCache) return emCache;

  const accessToken = await getGoogleAccessTokenCached();
  const nomeEscapado = name.replace(/'/g, "\\'");

  const query = [
    `name='${nomeEscapado}'`,
    `'${parentFolderId}' in parents`,
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
  ].join(" and ");

  const busca = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}` +
      `&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (busca.ok) {
    const data = await busca.json();
    if (data.files?.length > 0) {
      cacheDePastas.set(chaveCache, data.files[0].id);
      return data.files[0].id;
    }
  }

  const criacao = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId],
      }),
    }
  );

  if (!criacao.ok) {
    throw new Error(`Erro ao criar pasta "${name}": ${criacao.statusText}`);
  }

  const data = await criacao.json();
  cacheDePastas.set(chaveCache, data.id);
  return data.id;
}

/**
 * Estrutura de arquivamento: <raiz>/<cliente>/<tipo>/<ano>/<mês>.
 * Devolve o id da pasta folha, onde o XML deve ser gravado.
 */
export async function ensureDocumentoFolder(params: {
  nomeCliente: string;
  tipoDocumento: string;
  ano: string;
  mes: string;
}): Promise<string> {
  const raiz = getDriveRootFolderId();
  const cliente = await ensureDriveFolder(params.nomeCliente, raiz);
  const tipo = await ensureDriveFolder(params.tipoDocumento, cliente);
  const ano = await ensureDriveFolder(params.ano, tipo);
  return ensureDriveFolder(params.mes, ano);
}

/** Sobe conteúdo de texto (XML) sem precisar de um objeto File. */
export async function uploadTextFile(params: {
  nome: string;
  conteudo: string;
  parentFolderId: string;
  mimeType?: string;
}): Promise<{ id: string; webViewLink: string }> {
  const accessToken = await getGoogleAccessTokenCached();
  const mimeType = params.mimeType ?? "application/xml";

  const formData = new FormData();
  formData.append(
    "metadata",
    new Blob(
      [JSON.stringify({ name: params.nome, parents: [params.parentFolderId] })],
      { type: "application/json" }
    )
  );
  formData.append("file", new Blob([params.conteudo], { type: mimeType }));

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error(`Erro ao subir "${params.nome}": ${response.statusText}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
  };
}

export async function getDriveFile(fileId: string): Promise<Buffer> {
  const accessToken = await getGoogleAccessTokenCached();

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Erro ao fazer download: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
