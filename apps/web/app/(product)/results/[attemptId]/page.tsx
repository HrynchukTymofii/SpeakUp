import { safeNextPath } from "@/learn/practice";
import { ResultsView } from "./results-view";

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ attemptId: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { attemptId } = await params;
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <ResultsView
        attemptId={attemptId}
        next={safeNextPath(typeof next === "string" ? next : undefined)}
      />
    </main>
  );
}
