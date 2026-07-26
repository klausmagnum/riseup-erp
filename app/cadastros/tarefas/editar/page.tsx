import TarefaForm from "../TarefaForm";

type EditarTarefaPageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function EditarTarefaPage({ searchParams }: EditarTarefaPageProps) {
  const params = await searchParams;
  return <TarefaForm editingId={params.id ?? null} mode="editar" />;
}
