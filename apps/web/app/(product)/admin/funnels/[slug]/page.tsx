import type { Metadata } from "next";
import { FunnelEditor } from "./funnel-editor";

export const metadata: Metadata = { title: "Edit funnel — SpeakUp admin" };

export default async function AdminFunnelEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pt-8 pb-16">
      <FunnelEditor slug={slug} />
    </main>
  );
}
