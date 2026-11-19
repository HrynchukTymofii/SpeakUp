import { ResultsView } from "./results-view";

export default async function ResultsPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <ResultsView attemptId={attemptId} />
    </main>
  );
}
