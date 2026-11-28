import type { Metadata } from "next";
import { FunnelsView } from "./funnels-view";

export const metadata: Metadata = { title: "Funnels — SpeakUp admin" };

export default function AdminFunnelsPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pt-8 pb-16">
      <FunnelsView />
    </main>
  );
}
