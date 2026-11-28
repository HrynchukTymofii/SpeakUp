import Link from "next/link";
import type { ReactNode } from "react";
import { Mascot } from "@/components/mascot";

/**
 * The sticky top bar both hosts share: logo on the left, host-specific actions on the right.
 * The safe-area insets keep it clear of the status bar and, in landscape, the notch when the
 * installed app draws edge to edge (viewport-fit=cover, product pages only); elsewhere they are 0.
 */
export function SiteHeader({ homeHref, children }: { homeHref: string; children: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-page/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
        <Link
          href={homeHref}
          className="flex items-center gap-2 font-display text-[22px] font-semibold tracking-tight text-ink"
        >
          <Mascot size={30} />
          speakup
        </Link>
        <nav className="flex items-center gap-2 text-sm">{children}</nav>
      </div>
    </header>
  );
}
