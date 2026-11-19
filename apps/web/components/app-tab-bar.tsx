"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface Tab {
  href: string;
  label: string;
  icon: ReactNode;
  /** Which paths light this tab up. */
  match: (path: string) => boolean;
}

const icon = (d: string) => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2">
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TABS: Tab[] = [
  {
    href: "/app",
    label: "Learn",
    icon: icon("M4 19V6a2 2 0 0 1 2-2h12v13H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h12"),
    match: (p) => p === "/app" || p.startsWith("/app/lessons") || p.startsWith("/app/courses"),
  },
  {
    href: "/app/practice",
    label: "Practice",
    icon: icon(
      "M12 3v10m0 0a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3Zm-6-3a6 6 0 0 0 12 0M12 16v5",
    ),
    match: (p) => p.startsWith("/app/practice"),
  },
  {
    href: "/app/challenges",
    label: "Challenges",
    icon: icon(
      "M8 21h8m-4-4v4m-6-17h12v4a6 6 0 0 1-12 0V4Zm0 2H3v1a3 3 0 0 0 3 3m12-4h3v1a3 3 0 0 1-3 3",
    ),
    match: (p) => p.startsWith("/app/challenges"),
  },
  {
    href: "/app/profile",
    label: "Profile",
    icon: icon("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0"),
    match: (p) => p.startsWith("/app/profile") || p.startsWith("/app/billing"),
  },
];

/**
 * Bottom navigation of the signed-in app: a floating black pill with icons (SAT Learner style),
 * the active tab in a light circle. Thumb-reachable on phones; labels are for screen readers.
 */
export function AppTabBar() {
  const path = usePathname();
  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(16px,env(safe-area-inset-bottom))]"
    >
      <ul className="flex items-center gap-1 rounded-full bg-ink p-1.5 shadow-soft">
        {TABS.map((tab) => {
          const active = tab.match(path);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                aria-label={tab.label}
                title={tab.label}
                className={`flex size-13 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-page text-ink" : "text-page/65 hover:text-page"
                }`}
              >
                {tab.icon}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
