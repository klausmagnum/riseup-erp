/**
 * Classificação dos documentos capturados em família (NF-e, NFC-e, CT-e...),
 * direção (entrada/saída) e situação (XML completo, aguardando manifestação).
 *
 * A mesma regra existe em SQL na visão painel_fiscal_documentos_por_tipo, que
 * alimenta a contagem dos quadros. As duas precisam andar juntas: uma diz o
 * número que aparece no quadro, a outra diz quais linhas aparecem quando o
 * quadro é aberto. Se divergirem, o quadro promete doze notas e a lista
 * mostra oito.
 */

export type Direcao = "entrada" | "saida";

export interface Familia {
  chave: string;
  rotulo: string;
  /** Modelo do documento nas posições 21-22 da chave de acesso. */
  modelo?: string;
  /** Famílias sem chave de 44 dígitos (NFS-e é municipal) caem no tipo. */
  descricao: string;
}

/** Ordem em que os quadros aparecem na tela. */
export const FAMILIAS: Familia[] = [
  {
    chave: "NFe",
    rotulo: "NF-e",
    modelo: "55",
    descricao: "Nota fiscal eletrônica de mercadoria (modelo 55).",
  },
  {
    chave: "NFCe",
    rotulo: "NFC-e",
    modelo: "65",
    descricao: "Nota fiscal de consumidor eletrônica (modelo 65).",
  },
  {
    chave: "NFSe",
    rotulo: "NFS-e",
    descricao: "Nota fiscal de serviço, emitida pela prefeitura.",
  },
  {
    chave: "CTe",
    rotulo: "CT-e",
    modelo: "57",
    descricao: "Conhecimento de transporte eletrônico (modelo 57).",
  },
  {
    chave: "CTeOS",
    rotulo: "CT-e OS",
    modelo: "67",
    descricao: "Conhecimento de transporte para outros serviços (modelo 67).",
  },
  {
    chave: "MDFe",
    rotulo: "MDF-e",
    modelo: "58",
    descricao: "Manifesto eletrônico de documentos fiscais (modelo 58).",
  },
  {
    chave: "Evento",
    rotulo: "Eventos",
    descricao: "Cancelamentos, cartas de correção e manifestações.",
  },
];

export const DIRECOES: Array<{ chave: Direcao; rotulo: string; explicacao: string }> = [
  {
    chave: "entrada",
    rotulo: "entrada",
    explicacao: "Documentos emitidos por terceiros contra o cliente.",
  },
  {
    chave: "saida",
    rotulo: "saída",
    explicacao: "Documentos emitidos pelo próprio cliente.",
  },
];

export interface Situacao {
  chave: string;
  rotulo: string;
  explicacao: string;
  classe: string;
}

export const SITUACOES: Situacao[] = [
  {
    chave: "completo",
    rotulo: "XML completo",
    explicacao: "XML integral da nota. Serve para escrituração.",
    classe: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  },
  {
    chave: "resumo",
    rotulo: "Aguardando manifestação",
    explicacao:
      "A SEFAZ liberou só o resumo. O XML integral exige manifestação do destinatário.",
    classe: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  },
  {
    chave: "evento",
    rotulo: "Evento",
    explicacao: "Cancelamento, carta de correção ou manifestação sobre a nota.",
    classe: "border-slate-300/20 bg-slate-300/10 text-slate-300",
  },
  {
    chave: "indefinido",
    rotulo: "Sem classificação",
    explicacao: "Documento gravado antes do controle de completude.",
    classe: "border-slate-300/20 bg-slate-300/10 text-slate-400",
  },
];

/** Situações que fazem sentido dentro de cada família. */
export function situacoesDaFamilia(familia: string) {
  return familia === "Evento"
    ? SITUACOES.filter((s) => s.chave === "evento" || s.chave === "indefinido")
    : SITUACOES.filter((s) => s.chave !== "evento");
}

export function familiaPorChave(chave: string): Familia {
  return (
    FAMILIAS.find((f) => f.chave === chave) ?? {
      chave,
      rotulo: chave,
      descricao: "Documento fora das famílias conhecidas.",
    }
  );
}

export function rotuloDoQuadro(familia: string, direcao: Direcao) {
  const f = familiaPorChave(familia);
  if (familia === "Evento") {
    return direcao === "saida" ? "Eventos do cliente" : "Eventos de terceiros";
  }
  return `${f.rotulo} de ${direcao === "saida" ? "saída" : "entrada"}`;
}

/** Sem CNPJ no cadastro, nenhum emitente é o próprio cliente: tudo é entrada.
 *  O sentinela abaixo nunca casa com um CNPJ, que é só dígitos. */
const CNPJ_IMPOSSIVEL = "-";

export function cnpjComparavel(identificacao: string | null | undefined) {
  return (identificacao ?? "").replace(/\D/g, "") || CNPJ_IMPOSSIVEL;
}

/** O suficiente do construtor de consultas do Supabase para montar o filtro
 *  sem depender dos tipos internos dele. */
interface Filtravel<T> {
  eq(coluna: string, valor: string): T;
  or(filtro: string): T;
  like(coluna: string, padrao: string): T;
}

/** Eventos são separados pela completude, e não pelo modelo: o evento carrega
 *  a chave da nota a que se refere, então pelo modelo ele seria uma NF-e. */
const NAO_E_EVENTO = "completude.is.null,completude.neq.evento";

export function filtrarPorFamilia<T extends Filtravel<T>>(query: T, familia: string): T {
  if (familia === "Evento") return query.eq("completude", "evento");

  const f = familiaPorChave(familia);
  const semEventos = query.or(NAO_E_EVENTO);

  // Modelo nas posições 21-22 de uma chave de 44 dígitos. O padrão tem
  // exatamente 44 caracteres e nenhum curinga de tamanho livre, o que exclui a
  // chave da NFS-e — ela tem 50 dígitos, e as posições 21-22 dela não são o
  // modelo do documento. Sem isso uma NFS-e cairia no quadro de NF-e por
  // coincidência de dígitos.
  return f.modelo
    ? semEventos.like("chave_acesso", `${"_".repeat(20)}${f.modelo}${"_".repeat(22)}`)
    : semEventos.eq("tipo_documento", familia);
}

export function filtrarPorDirecao<T extends Filtravel<T>>(
  query: T,
  direcao: string,
  identificacaoCliente: string | null | undefined
): T {
  const cnpj = cnpjComparavel(identificacaoCliente);

  return direcao === "saida"
    ? query.eq("emitente_cnpj_cpf", cnpj)
    : query.or(`emitente_cnpj_cpf.is.null,emitente_cnpj_cpf.neq.${cnpj}`);
}
