import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Results are private: signed-in users only. Like /app, this guards the UI; the API checks
 * that the attempt belongs to the signed-in user on every request.
 * (M5.5 adds the funnel variant, which shows results right after sign-up.)
 */
export default async function ResultsLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return <>{children}</>;
}
