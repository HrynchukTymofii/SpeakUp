import type { Metadata } from "next";
import { Suspense } from "react";
import { InstallView } from "./install-view";

export const metadata: Metadata = { title: "Install the app — SpeakUp" };

/** `/install?from=…&next=…` — see `lib/pwa/install-href.ts`. */
export default function InstallPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-10 pb-20">
      {/* The card's own heading is visible; this names the page for screen readers. */}
      <h1 className="sr-only">Install SpeakUp</h1>
      {/* useSearchParams needs a Suspense boundary to keep the rest of the page static. */}
      <Suspense>
        <InstallView />
      </Suspense>
    </main>
  );
}
