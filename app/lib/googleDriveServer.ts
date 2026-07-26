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
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: serviceAccount.token_uri || "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const base64Url = (input: string) =>
    Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  const signature = signer.sign(serviceAccount.private_key);
  const jwt = `${unsignedJwt}.${base64Url(signature.toString("base64"))}`;

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

export async function deleteDriveFile(fileId: string): Promise<void> {
  const accessToken = await getGoogleAccessTokenCached();

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Erro ao deletar arquivo: ${response.statusText}`);
  }
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
