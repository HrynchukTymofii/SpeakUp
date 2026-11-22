import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { appHref } from "@/lib/links";

/**
 * Marketing pages (the main host): landing and legal pages. No session-aware UI here — every
 * action links across to the app host, which owns sign-in. The footer carries the legal links
 * Paddle's domain review looks for.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader homeHref="/">
        {/* Section links only fit from tablet up; on phones the page is one short scroll. */}
        <Link href="/#how" className="link hidden px-2 py-2 font-semibold md:inline">
          How it works
        </Link>
        <Link href="/#feedback" className="link hidden px-2 py-2 font-semibold md:inline">
          Feedback
        </Link>
        <Link href="/#lessons" className="link hidden px-2 py-2 font-semibold md:inline">
          Lessons
        </Link>
        <a href={appHref("/sign-in")} className="link px-1 py-2 font-semibold whitespace-nowrap">
          Sign in
        </a>
        <a href={appHref("/start")} className="btn btn-ink btn-sm whitespace-nowrap">
          Start the check
        </a>
      </SiteHeader>
      {children}
      <footer className="border-t border-line bg-card/60">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} SpeakUp</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacy" className="link py-1">
              Privacy
            </Link>
            <Link href="/terms" className="link py-1">
              Terms
            </Link>
            <Link href="/refund" className="link py-1">
              Refunds
            </Link>
            <a href={appHref("/pricing")} className="link py-1">
              Pricing
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}
