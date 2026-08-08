/**
 * Tarefas pessoais do My Desktop.
 *
 * Cada usuario cadastra as tarefas da propria rotina e so enxerga as suas. A
 * privacidade e garantida no servidor (/api/tarefas-pessoais filtra por
 * usuario_id); aqui ficam os tipos e a expansao das datas, compartilhados pelo
 * My Desktop e pela agenda do dashboard, para que uma tarefa recorrente caia
 * exatamente na mesma data nas duas telas.
 */

export const recorrenciasTarefaPessoal = [
  "Diária",
  "Semanal",
  "Quinzenal",
  "Mensal",
  "Bimestral",
  "Trimestral",
  "Semestral",
  "Anual",
] as const;

export const prioridadesTarefaPessoal = ["Baixa", "Media", "Alta", "Critica"] as const;

export const tiposTarefaPessoal = ["Única", "Recorrente"] as const;

export type RecorrenciaTarefaPessoal = (typeof recorrenciasTarefaPessoal)[number];
export type PrioridadeTarefaPessoal = (typeof prioridadesTarefaPessoal)[number];
export type TipoTarefaPessoal = (typeof tiposTarefaPessoal)[number];

/** Conclusao de um dia da tarefa; `clienteId` nulo e a tarefa sem cliente. */
export type ConclusaoTarefaPessoal = {
  data: string;
  clienteId: string | null;
};

/** O minimo do cadastro de clientes que a tarefa precisa para se resolver. */
export type ClienteDaTarefa = {
  id: string;
  razao_social: string;
  nome_fantasia?: string | null;
  identificacao?: string | null;
  regime_tributario?: string | null;
  status?: string | null;
};

export type TarefaPessoal = {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: TipoTarefaPessoal;
  recorrencia: RecorrenciaTarefaPessoal;
  data_inicio: string | null;
  prazo: string;
  prioridade: PrioridadeTarefaPessoal;
  /** Ids de clientes escolhidos a dedo. */
  clientes: string[];
  /** Regimes tributarios inteiros; os clientes saem deles na leitura. */
  regimes: string[];
  conclusoes: ConclusaoTarefaPessoal[];
};

export type OcorrenciaTarefaPessoal = {
  tarefa: TarefaPessoal;
  data: Date;
  dataChave: string;
  dataLabel: string;
  diasAteVencer: number;
  /** Identifica a ocorrencia (tarefa + dia), nao a tarefa. */
  chave: string;
  /** Clientes que ainda faltam finalizar neste dia. Vazio = tarefa sem cliente. */
  clientesPendentes: ClienteDaTarefa[];
  /** Quantos clientes a tarefa alcanca hoje. Zero = tarefa solta. */
  totalDeClientes: number;
};

export type TarefasPessoaisApiResponse = {
  tarefas?: TarefaPessoal[];
  clientes?: ClienteDaTarefa[];
  error?: string;
};

/** Meses adiante que a agenda enxerga, igual a janela das obrigacoes. */
const mesesDaJanela = 2;

/** Trava dos loops de recorrencia: uma tarefa diaria de anos atras nao pode travar a tela. */
const maximoDeVoltas = 800;

export function inicioDoDia(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

export function ultimoDiaDoMes(ano: number, mes: number) {
  return new Date(ano, mes + 1, 0).getDate();
}

export function somarMeses(data: Date, quantidade: number) {
  return new Date(data.getFullYear(), data.getMonth() + quantidade, 1);
}

export function fimDoMes(data: Date) {
  return new Date(data.getFullYear(), data.getMonth() + 1, 0);
}

/** Monta a data prendendo o dia ao tamanho do mes: dia 31 em fevereiro vira 28/29. */
export function montarData(ano: number, mes: number, dia: number) {
  return new Date(ano, mes, Math.min(Math.max(dia, 1), ultimoDiaDoMes(ano, mes)));
}

export function lerDataIso(valor: string | null | undefined) {
  const texto = (valor ?? "").trim();
  if (!texto) return null;

  const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!partes) return null;

  const [, ano, mes, dia] = partes;
  return new Date(Number(ano), Number(mes) - 1, Number(dia));
}

export function formatarChaveDeData(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function formatarDataBr(data: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(data);
}

export function diasEntre(de: Date, ate: Date) {
  return Math.ceil((inicioDoDia(ate).getTime() - inicioDoDia(de).getTime()) / 86400000);
}

function passoEmMeses(recorrencia: RecorrenciaTarefaPessoal) {
  if (recorrencia === "Bimestral") return 2;
  if (recorrencia === "Trimestral") return 3;
  if (recorrencia === "Semestral") return 6;
  if (recorrencia === "Anual") return 12;
  return 1;
}

function guardarData(datas: Date[], data: Date, inicioJanela: Date, fimJanela: Date, base: Date, vistas: Set<string>) {
  const tempo = inicioDoDia(data).getTime();
  if (tempo < inicioDoDia(base).getTime()) return;
  if (tempo < inicioDoDia(inicioJanela).getTime()) return;
  if (tempo > inicioDoDia(fimJanela).getTime()) return;

  const chave = formatarChaveDeData(data);
  if (vistas.has(chave)) return;

  vistas.add(chave);
  datas.push(data);
}

/**
 * Datas em que a tarefa cai dentro da janela da agenda.
 *
 * Tarefa unica atrasada nao tem piso: continua aparecendo mesmo que o prazo
 * tenha ficado em um mes anterior, senao ela sumiria justamente quando mais
 * precisa de atencao. Recorrente comeca no mes corrente para nao empilhar
 * ocorrencias antigas indefinidamente.
 */
export function gerarDatasDaTarefa(tarefa: TarefaPessoal, hoje: Date): Date[] {
  const base = lerDataIso(tarefa.prazo);
  if (!base) return [];

  const inicioJanela = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimJanela = fimDoMes(somarMeses(inicioJanela, mesesDaJanela));

  if (tarefa.tipo !== "Recorrente") {
    return inicioDoDia(base).getTime() <= inicioDoDia(fimJanela).getTime() ? [base] : [];
  }

  const datas: Date[] = [];
  const vistas = new Set<string>();

  if (tarefa.recorrencia === "Diária" || tarefa.recorrencia === "Semanal") {
    const passoEmDias = tarefa.recorrencia === "Diária" ? 1 : 7;
    const cursor = new Date(base);

    // Avanca em blocos ate alcancar a janela, para nao percorrer dia a dia
    // desde uma tarefa criada ha anos.
    const diasAtePular = Math.floor((inicioDoDia(inicioJanela).getTime() - inicioDoDia(cursor).getTime()) / 86400000);
    if (diasAtePular > 0) {
      cursor.setDate(cursor.getDate() + Math.floor(diasAtePular / passoEmDias) * passoEmDias);
    }

    for (let volta = 0; volta < maximoDeVoltas && inicioDoDia(cursor).getTime() <= inicioDoDia(fimJanela).getTime(); volta += 1) {
      guardarData(datas, new Date(cursor), inicioJanela, fimJanela, base, vistas);
      cursor.setDate(cursor.getDate() + passoEmDias);
    }

    return datas.sort((a, b) => a.getTime() - b.getTime());
  }

  const passo = passoEmMeses(tarefa.recorrencia);
  const dia = base.getDate();
  let cursor = new Date(base.getFullYear(), base.getMonth(), 1);

  // Mesmo salto em bloco do caso diario/semanal, agora em meses.
  const mesesAtePular = (inicioJanela.getFullYear() - cursor.getFullYear()) * 12 + (inicioJanela.getMonth() - cursor.getMonth());
  if (mesesAtePular > 0) {
    cursor = somarMeses(cursor, Math.floor(mesesAtePular / passo) * passo);
  }

  for (let volta = 0; volta < maximoDeVoltas && cursor.getTime() <= fimJanela.getTime(); volta += 1) {
    const ano = cursor.getFullYear();
    const mes = cursor.getMonth();

    guardarData(datas, montarData(ano, mes, dia), inicioJanela, fimJanela, base, vistas);

    // Quinzenal e a mesma tarefa duas vezes no mes: o dia escolhido e ele mais
    // quinze dias, quando ainda cabe no mes.
    if (tarefa.recorrencia === "Quinzenal" && dia + 15 <= ultimoDiaDoMes(ano, mes)) {
      guardarData(datas, montarData(ano, mes, dia + 15), inicioJanela, fimJanela, base, vistas);
    }

    cursor = somarMeses(cursor, passo);
  }

  return datas.sort((a, b) => a.getTime() - b.getTime());
}

function normalizarRegime(valor: string | null | undefined) {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function nomeDoCliente(cliente: ClienteDaTarefa) {
  return cliente.razao_social || cliente.nome_fantasia || cliente.id;
}

/**
 * Clientes que a tarefa alcanca hoje: os escolhidos a dedo mais todos os
 * clientes ativos dos regimes marcados. Como os regimes sao resolvidos aqui, e
 * nao gravados como lista de ids, um cliente novo do regime entra sozinho.
 */
export function resolverClientesDaTarefa(tarefa: TarefaPessoal, clientes: ClienteDaTarefa[]): ClienteDaTarefa[] {
  if (tarefa.clientes.length === 0 && tarefa.regimes.length === 0) return [];

  const regimesEscolhidos = new Set(tarefa.regimes.map(normalizarRegime));
  const idsEscolhidos = new Set(tarefa.clientes);

  return clientes
    .filter((cliente) => (cliente.status ?? "").toLowerCase() !== "inativo")
    .filter((cliente) => idsEscolhidos.has(cliente.id) || regimesEscolhidos.has(normalizarRegime(cliente.regime_tributario)))
    .sort((a, b) => nomeDoCliente(a).localeCompare(nomeDoCliente(b), "pt-BR"));
}

/**
 * Ocorrencias pendentes das tarefas, ordenadas por data — o formato que a
 * agenda e o My Desktop consomem.
 *
 * Some da lista o dia ja concluido: na tarefa sem cliente basta a conclusao do
 * dia; na tarefa com clientes, so quando o ultimo cliente for finalizado, do
 * mesmo jeito que a obrigacao some quando a ultima empresa e entregue.
 *
 * Tarefa que mira clientes mas nao alcanca nenhum hoje — regime ainda sem
 * cliente, ou cliente que saiu do cadastro — tambem fica de fora, como a
 * obrigacao sem empresa vinculada. Ela volta sozinha quando o cliente entrar.
 */
export function gerarAgendaPessoal(
  tarefas: TarefaPessoal[],
  clientes: ClienteDaTarefa[],
  hoje: Date
): OcorrenciaTarefaPessoal[] {
  const referencia = inicioDoDia(hoje);

  return tarefas
    .flatMap((tarefa) => {
      const clientesDaTarefa = resolverClientesDaTarefa(tarefa, clientes);
      const miraClientes = tarefa.clientes.length > 0 || tarefa.regimes.length > 0;

      return gerarDatasDaTarefa(tarefa, referencia)
        .map((data) => {
          const dataChave = formatarChaveDeData(data);
          const concluidosNoDia = tarefa.conclusoes.filter((conclusao) => conclusao.data === dataChave);
          const idsConcluidos = new Set(concluidosNoDia.map((conclusao) => conclusao.clienteId));

          return {
            tarefa,
            data,
            dataChave,
            dataLabel: formatarDataBr(data),
            diasAteVencer: diasEntre(referencia, data),
            chave: `${tarefa.id}:${dataChave}`,
            clientesPendentes: clientesDaTarefa.filter((cliente) => !idsConcluidos.has(cliente.id)),
            totalDeClientes: clientesDaTarefa.length,
          };
        })
        .filter((ocorrencia) =>
          miraClientes
            ? ocorrencia.clientesPendentes.length > 0
            : !tarefa.conclusoes.some((conclusao) => conclusao.data === ocorrencia.dataChave)
        );
    })
    .sort((a, b) => a.data.getTime() - b.data.getTime() || a.tarefa.titulo.localeCompare(b.tarefa.titulo, "pt-BR"));
}
