"use client";

import Link from "next/link";
import { useState } from "react";
import { BoxBreathing } from "@/components/box-breathing";
import { Mascot } from "@/components/mascot";

/**
 * A minute of box breathing right before a pitch. Deliberately not a lesson: it writes no
 * progress, XP or streak, so someone who is already nervous can use it (or skip it) freely.
 */
export function WarmUpView() {
  const [done, setDone] = useState(false);

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="eyebrow">Pitch warm-up</p>
          <h1 className="font-display text-[30px] leading-[1.05] font-semibold tracking-tight">
            Calm down in 1 minute
          </h1>
        </div>
        <Link href="/app" className="link px-1 py-2 font-semibold">
          Skip
        </Link>
      </header>
      {done ? (
        <section className="card flex flex-col items-center gap-5 text-center">
          <Mascot mood="happy" size={96} />
          {/* The breathing card's live region unmounts here, so announce the end from this one. */}
          <p role="status" className="font-display text-2xl font-semibold">
            You’re ready. Go get them.
          </p>
          <Link href="/app" className="btn btn-primary w-full">
            Done
          </Link>
        </section>
      ) : (
        <BoxBreathing onDone={() => setDone(true)} />
      )}
    </>
  );
}
