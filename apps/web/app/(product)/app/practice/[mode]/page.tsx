import { notFound } from "next/navigation";
import { parseMode } from "@/learn/practice";
import { ModeSession } from "./mode-session";

export default async function PracticeModePage({ params }: { params: Promise<{ mode: string }> }) {
  const mode = parseMode((await params).mode);
  if (!mode) notFound();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-4">
      <ModeSession mode={mode} />
    </main>
  );
}
