"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { InstallCard } from "@/components/pwa/install-card";
import { useInstall } from "@/lib/pwa/install-events";
import { parseInstallParams } from "@/lib/pwa/install-href";

/**
 * The install screen: the install offer for this browser, and a way past it to `next`. Opened
 * from the landing, after the funnel and after a purchase (`installHref`). Inside the installed
 * app there is nothing to offer, so it goes straight on to `next`.
 */
export function InstallView() {
  const router = useRouter();
  const { from, next } = parseInstallParams(useSearchParams());
  const { platform } = useInstall();
  const { isLoaded, isSignedIn } = useAuth();

  // `platform` is null until the browser has been asked; only a known "standalone" skips ahead.
  const standalone = platform === "standalone";
  useEffect(() => {
    if (standalone) router.replace(next);
  }, [standalone, next, router]);

  if (standalone) return null;

  // Visitors from the landing may not have an account yet; the funnel is where they start.
  const offerCheck = from === "landing" && isLoaded && !isSignedIn;

  return (
    <>
      <InstallCard placement={from} />
      <Link href={next} className="btn btn-secondary w-full">
        Not now, continue
      </Link>
      {offerCheck && (
        <p className="text-center text-muted">
          New here?{" "}
          <Link href="/start" className="link font-semibold">
            Take the 2-minute speaking check
          </Link>
        </p>
      )}
    </>
  );
}
