import type { SupabaseClient } from "@supabase/supabase-js";
import {
  consultarChaveDFe,
  CSTAT,
  type CertificadoA1,
  type SefazEnvironment,
  type ServicoDistribuicao,
} from "./distribuicaoDFe";
import { destrincharChave, normalizarDocumento } from "./parseDocumento";
import { normalizarDocumentoCTe } from "./parseCTe";
import { gravarDocumentoCapturado } from "./gravarDocumento";
import { carregarCertificado, type RegistroCertificado } from "./certificado";

/**
 * Captura de documento avulso pela chave de acesso.
 *
 * É por aqui que a NFC-e entra no sistema. Os outros documentos chegam pela
 * fila de NSU da origem, que se pagina até esvaziar; o modelo 65 não tem fila —
 * a venda a consumidor é autorizada na SEFAZ estadual e o ambiente nacional não
 * a distribui. Quem tem a chave (do PDV, do portal estadual, do cupom) chega ao
 * XML integral por este caminho, e é o mesmo caminho que resgata uma NF-e ou um
 * CT-e específico que se perdeu.
 *
 * A origem gravada é própria justamente porque não há NSU: é ela que mantém a
 * deduplicação separada das três filas.
 */

export const ORIGEM_CONSULTA_CHAVE = "SEFAZ/ConsultaChave";

export interface ClienteConsultante {
  id: string;
  razao_social: string;
  identificacao: string | null;
  estado: string | null;
}

export interface ResultadoConsultaChave {
  chave: string;
  /** Falso quando a SEFAZ recusou ou não achou; a mensagem explica. */
  ok: boolean;
  cStat: string;
  gravados: number;
  duplicados: number;
  mensagem: string;
}

/**
 * Confere o dígito verificador da chave, módulo 11 sobre os 43 primeiros.
 *
 * Vale a conta local: chave é copiada à mão do cupom e erra-se um dígito com
 * facilidade. Cada consulta ao ambiente nacional conta na cota do CNPJ, e uma
 * sequência de chaves digitadas errado derrubaria o cliente por uma hora sem
 * ter trazido nada.
 */
export function chaveValida(chave: string) {
  const digitos = chave.replace(/\D/g, "");
  if (digitos.length !== 44) return false;

  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;

  for (let i = 42; i >= 0; i -= 1) {
    soma += Number(digitos[i]) * pesos[(42 - i) % 8];
  }

  const resto = soma % 11;
  const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;

  return dv === Number(digitos[43]);
}

/** O modelo na chave escolhe o serviço: 57 e 67 são do CT-e, o resto da NF-e. */
function servicoDoModelo(modelo: string): ServicoDistribuicao {
  return modelo === "57" || modelo === "67" ? "cte" : "nfe";
}

/**
 * A MDF-e é o único documento sem consulta por chave.
 *
 * O schema do pedido de distribuição dela (distDFeInt_v1.00.xsd, pacote PRMDF
 * da SVRS) só aceita a fila por NSU. Sem esta guarda, o modelo 58 cairia no
 * serviço da NF-e, que responderia que não achou a chave — e quem digitou
 * concluiria que o manifesto não existe.
 */
const MODELO_MDFE = "58";

/**
 * Busca uma chave e grava o que a SEFAZ devolver.
 *
 * Nunca lança por recusa da SEFAZ: "chave não é de interesse do CNPJ" e
 * "documento não localizado" são respostas legítimas de uma consulta, e quem
 * digitou a chave precisa ler o motivo, não um erro genérico.
 */
export async function capturarChave(params: {
  supabase: SupabaseClient;
  cliente: ClienteConsultante;
  certificado: CertificadoA1;
  chave: string;
  ambiente?: SefazEnvironment;
}): Promise<ResultadoConsultaChave> {
  const chave = params.chave.replace(/\D/g, "");
  const base = { chave, ok: false, cStat: "", gravados: 0, duplicados: 0 };

  if (!chaveValida(chave)) {
    return {
      ...base,
      mensagem:
        chave.length === 44
          ? "Chave com digito verificador invalido. Confira a digitacao."
          : `Chave deve ter 44 digitos; esta tem ${chave.length}.`,
    };
  }

  const cnpj = (params.cliente.identificacao ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) {
    return { ...base, mensagem: "Cliente sem CNPJ valido: a SEFAZ exige CNPJ no consultante." };
  }

  const { modelo } = destrincharChave(chave);

  if (modelo === MODELO_MDFE) {
    return {
      ...base,
      mensagem:
        "MDF-e nao tem consulta por chave: a distribuicao dela so entrega pela fila de NSU, " +
        "que a sincronizacao automatica ja percorre.",
    };
  }

  const servico = servicoDoModelo(modelo);

  const resultado = await consultarChaveDFe({
    cnpj,
    uf: params.cliente.estado ?? "",
    chave,
    certificado: params.certificado,
    ambiente: params.ambiente ?? "producao",
    servico,
  });

  const motivo = `${resultado.cStat} - ${resultado.xMotivo}`;

  if (resultado.cStat !== CSTAT.LOTE_ENCONTRADO || !resultado.documentos.length) {
    return {
      ...base,
      cStat: resultado.cStat,
      mensagem:
        resultado.cStat === CSTAT.CONSUMO_INDEVIDO
          ? `SEFAZ pediu intervalo antes da proxima consulta. ${resultado.xMotivo}`
          : `SEFAZ respondeu ${motivo}`,
    };
  }

  let gravados = 0;
  let duplicados = 0;

  for (const doc of resultado.documentos) {
    const normalizado =
      servico === "cte"
        ? await normalizarDocumentoCTe(doc, { cnpjCliente: cnpj, nomeCliente: params.cliente.razao_social })
        : await normalizarDocumento(doc, { cnpjCliente: cnpj, nomeCliente: params.cliente.razao_social });

    // Schema fora do que o módulo entende; nada a gravar.
    if (!normalizado) continue;

    const novo = await gravarDocumentoCapturado({
      supabase: params.supabase,
      cliente: params.cliente,
      documento: normalizado,
      xml: doc.xml,
      origem: ORIGEM_CONSULTA_CHAVE,
      // O NSU vem zerado quando o documento nunca passou pela fila do CNPJ —
      // o caso normal da NFC-e emitida pelo próprio cliente.
      nsu: doc.nsu && Number(doc.nsu) > 0 ? doc.nsu : null,
      registrarPendenciaDeManifestacao: servico === "nfe",
    });

    if (novo) gravados += 1;
    else duplicados += 1;
  }

  return {
    chave,
    ok: true,
    cStat: resultado.cStat,
    gravados,
    duplicados,
    mensagem:
      gravados > 0
        ? `${gravados} documento(s) capturado(s).`
        : duplicados > 0
          ? "Documento ja estava no sistema."
          : `SEFAZ respondeu ${motivo}, mas sem documento aproveitavel.`,
  };
}

/**
 * Captura uma lista de chaves, uma a uma.
 *
 * Em série de propósito: são chamadas autenticadas pelo mesmo certificado, e o
 * ambiente nacional trata rajada do mesmo CNPJ como consumo indevido. O
 * `deadline` existe porque a função serverless tem limite de execução — as
 * chaves não alcançadas voltam na resposta para quem chamou tentar de novo.
 */
export async function capturarChaves(params: {
  supabase: SupabaseClient;
  cliente: ClienteConsultante;
  certificado: RegistroCertificado;
  chaves: string[];
  ambiente?: SefazEnvironment;
  deadline: number;
}): Promise<{ resultados: ResultadoConsultaChave[]; naoAlcancadas: string[] }> {
  const credenciais = await carregarCertificado(params.certificado);
  const resultados: ResultadoConsultaChave[] = [];
  const naoAlcancadas: string[] = [];

  for (const [indice, chave] of params.chaves.entries()) {
    if (Date.now() > params.deadline) {
      naoAlcancadas.push(...params.chaves.slice(indice));
      break;
    }

    try {
      resultados.push(
        await capturarChave({
          supabase: params.supabase,
          cliente: params.cliente,
          certificado: credenciais,
          chave,
          ambiente: params.ambiente,
        })
      );
    } catch (error) {
      resultados.push({
        chave: chave.replace(/\D/g, ""),
        ok: false,
        cStat: "",
        gravados: 0,
        duplicados: 0,
        mensagem: error instanceof Error ? error.message : "Erro desconhecido na consulta.",
      });
    }
  }

  return { resultados, naoAlcancadas };
}
