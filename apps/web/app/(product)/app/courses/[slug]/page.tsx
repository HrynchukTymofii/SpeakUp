import { CourseView } from "./course-view";

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-4 pb-16">
      <CourseView slug={slug} />
    </main>
  );
}
