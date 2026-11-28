import type { Metadata } from "next";
import { Mascot } from "@/components/mascot";

/**
 * The screen the service worker (public/sw.js) shows when a navigation fails for lack of a
 * connection. It sits outside both route groups, so it gets only the root shell (no header, no
 * Clerk UI, no auth), and it is built once at build time so the worker can cache plain HTML.
 * It must work with JavaScript failing to load: everything here is server-rendered markup.
 */
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "You're offline — SpeakUp",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <Mascot mood="thinking" size={96} />
      <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em]">
        You&apos;re offline
      </h1>
      <p className="text-muted">SpeakUp needs a connection to record and analyze your speaking.</p>
      {/* A plain link, not next/link: the client router would fetch a payload that can't arrive.
          "?" reloads the path the visitor asked for (the worker served this page in its place),
          so once the connection is back they land where they meant to go. (React drops an empty
          href, so "" isn't an option; only the query string is lost.) */}
      <a href="?" className="btn btn-primary mt-2 w-full">
        Try again
      </a>
    </main>
  );
}
