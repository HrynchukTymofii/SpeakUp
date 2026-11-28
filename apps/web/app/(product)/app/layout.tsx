import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppTabBar } from "@/components/app-tab-bar";

/**
 * Everything under /app requires a signed-in user. The check lives here, next to the
 * protected pages (Clerk's recommended approach), not in proxy.ts.
 *
 * This only guards the *UI*. The real security boundary is the API, which verifies the
 * token on every request — a page check alone protects nothing.
 *
 * The bottom tab bar (Learn · Practice · Challenges · Profile) is fixed, so pages leave room
 * for it with bottom padding — plus the home-indicator inset the bar adds in the installed app.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return (
    <>
      <div className="pb-[calc(6rem+env(safe-area-inset-bottom))]">{children}</div>
      <AppTabBar />
    </>
  );
}
