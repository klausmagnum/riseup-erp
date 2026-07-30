import { getDriveFile } from "../googleDriveServer";
import { decryptSecret } from "../certificateCrypto";
import type { CertificadoA1 } from "./distribuicaoDFe";

export interface RegistroCertificado {
  id: string;
  cliente_id: string;
  nome: string;
  drive_file_id: string | null;
  senha_criptografada: string | null;
  data_validade: string | null;
  ativo: boolean | null;
}

/**
 * Carrega o .pfx do Google Drive direto para memória.
 *
 * A versão anterior gravava em os.tmpdir() e passava o caminho adiante. Em
 * função serverless isso é frágil: o disco é efêmero, compartilhado entre
 * invocações e deixa a chave privada do cliente em arquivo. Aqui o certificado
 * só existe como Buffer durante a requisição.
 */
export async function carregarCertificado(
  registro: RegistroCertificado
): Promise<CertificadoA1> {
  if (!registro.drive_file_id) {
    throw new Error(
      `Certificado "${registro.nome}" nao possui arquivo vinculado no Drive.`
    );
  }

  if (!registro.senha_criptografada) {
    throw new Error(`Certificado "${registro.nome}" nao possui senha cadastrada.`);
  }

  if (registro.ativo === false) {
    throw new Error(`Certificado "${registro.nome}" esta inativo.`);
  }

  if (registro.data_validade) {
    const validade = new Date(registro.data_validade);
    if (Number.isFinite(validade.getTime()) && validade < new Date()) {
      throw new Error(
        `Certificado "${registro.nome}" venceu em ${validade.toLocaleDateString("pt-BR")}.`
      );
    }
  }

  const pfx = await getDriveFile(registro.drive_file_id);

  if (!pfx || pfx.length === 0) {
    throw new Error(`Arquivo do certificado "${registro.nome}" veio vazio do Drive.`);
  }

  return {
    pfx,
    senha: decryptSecret(registro.senha_criptografada),
  };
}

/** Dias restantes até o vencimento; negativo se já venceu. */
export function diasParaVencer(dataValidade: string | null): number | null {
  if (!dataValidade) return null;
  const validade = new Date(dataValidade);
  if (!Number.isFinite(validade.getTime())) return null;

  const msPorDia = 24 * 60 * 60 * 1000;
  return Math.ceil((validade.getTime() - Date.now()) / msPorDia);
}
