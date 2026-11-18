import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Your 2-minute speaking check — SpeakUp",
  // Ad landing flow: keep it out of search results.
  robots: { index: false },
};

/** Mobile-first column: the funnel is mostly opened on phones from ads (SPEC §15.3). */
export default function FunnelLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-57px)] w-full max-w-md flex-col px-4 pt-4">
      {children}
    </main>
  );
}
