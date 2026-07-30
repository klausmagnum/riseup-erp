import ErpChrome from "@/app/components/ErpChrome";

type Column = string;

type FiscalModulePageProps = {
  title: string;
  subtitle: string;
  cards?: Array<{ label: string; value: string; tone: string }>;
  tabs?: string[];
  actions?: string[];
  columns?: Column[];
  emptyMessage?: string;
  secondaryTitle?: string;
  secondaryColumns?: Column[];
  onSyncClick?: () => void;
};

export default function FiscalModulePage({
  title,
  subtitle,
  cards = [],
  tabs = [],
  actions = [],
  columns = [],
  emptyMessage = "Nenhum registro encontrado.",
  secondaryTitle,
  secondaryColumns = [],
  onSyncClick,
}: FiscalModulePageProps) {
  return (
    <ErpChrome>
      <header className="flex items-start justify-between gap-4 max-[760px]:flex-col">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">Documentos Fiscais</p>
          <h1 className="mt-1 text-2xl font-black leading-tight">{title}</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">{subtitle}</p>
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {actions.map((action, index) => (
              <button
                className={index === 0 ? "min-h-9 rounded-lg bg-sky-300 px-3 text-xs font-black text-slate-950" : "min-h-9 rounded-lg border border-white/10 px-3 text-xs font-bold text-slate-200 transition hover:border-sky-300/40 hover:text-sky-100"}
                key={action}
                type="button"
                onClick={() => {
                  if ((action === "Sincronizar NF-e" || action === "Sincronizar NFS-e") && onSyncClick) {
                    onSyncClick();
                  }
                }}
              >
                {action}
              </button>
            ))}
          </div>
        )}
      </header>

      {cards.length > 0 && (
        <section className="mt-5 grid grid-cols-4 gap-3 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
          {cards.map((card) => (
            <article className="rounded-xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20" key={card.label}>
              <p className="text-[11px] text-slate-400">{card.label}</p>
              <strong className={`mt-2 block text-2xl font-black ${card.tone}`}>{card.value}</strong>
            </article>
          ))}
        </section>
      )}

      {tabs.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-[#061020]/88 p-2 shadow-2xl shadow-black/20 backdrop-blur-xl">
          {tabs.map((tab, index) => (
            <button
              className={`min-h-10 rounded-xl px-4 text-xs font-black transition ${index === 0 ? "bg-sky-300 text-slate-950 shadow-[0_16px_34px_rgba(56,189,248,0.20)]" : "text-slate-300 hover:bg-white/[0.06] hover:text-sky-100"}`}
              key={tab}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[920px] border-collapse text-left text-xs">
            <thead className="bg-slate-950/70 text-[11px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th className="px-3 py-3 font-black" key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-8 text-center text-slate-400" colSpan={Math.max(columns.length, 1)}>{emptyMessage}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {secondaryTitle && (
        <section className="mt-5 rounded-2xl border border-white/10 bg-[#061020]/88 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <h2 className="text-sm font-black text-slate-100">{secondaryTitle}</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[760px] border-collapse text-left text-xs">
              <thead className="bg-slate-950/70 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  {secondaryColumns.map((column) => <th className="px-3 py-3 font-black" key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-6 text-center text-slate-400" colSpan={Math.max(secondaryColumns.length, 1)}>Nenhum registro encontrado.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </ErpChrome>
  );
}
