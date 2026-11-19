import { LessonView } from "./lesson-view";

// Next 16: route params arrive as a Promise in server components.
export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-8 pb-16">
      <LessonView slug={slug} />
    </main>
  );
}
