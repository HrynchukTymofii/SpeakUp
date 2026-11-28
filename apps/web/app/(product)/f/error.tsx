"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Icon } from "@/components/icons";
import { Mascot } from "@/components/mascot";

/**
 * `/f/<slug>` when the funnel couldn't be loaded (API down or an invalid definition; `main` never
 * gets here, it falls back to the bundled copy). It sits at `f/`, not `f/[slug]/`, on purpose: a
 * segment's error.tsx renders inside that segment's layout, so it can't catch errors thrown BY the
 * layout, and `f/[slug]/layout.tsx` is where the funnel loads. Details stay in the server logs.
 */
export default function FunnelError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  // The failure happened in a server component, so re-rendering on the client (reset alone)
  // would just show the same error: refetch from the server, then clear the boundary.
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  return (
    // Same mobile column as the funnel itself (start/layout.tsx).
    <main className="mx-auto flex min-h-[calc(100dvh-57px)] w-full max-w-md flex-col items-center justify-center gap-5 px-4 pb-10 text-center">
      <Mascot mood="thinking" size={96} />
      <div>
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-ink">
          We couldn’t load this page
        </h1>
        <p className="mt-2 text-muted">It’s on our side. Give it another try in a moment.</p>
      </div>
      <button type="button" className="btn btn-primary w-full" onClick={retry}>
        <Icon name="retry" className="size-5" />
        Try again
      </button>
    </main>
  );
}
