import { LessonView } from "./lesson-view";

// Next 16: route params arrive as a Promise in server components.
export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /** `?step=N`: where to resume, e.g. coming back from an exercise's results. */
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const { slug } = await params;
  const { step } = await searchParams;
  const startStep = Number.parseInt(typeof step === "string" ? step : "", 10);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-8 pb-16">
      <LessonView slug={slug} startStep={Number.isNaN(startStep) ? 0 : startStep} />
    </main>
  );
}
