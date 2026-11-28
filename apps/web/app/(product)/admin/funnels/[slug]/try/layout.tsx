import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TryFunnel } from "./try-funnel";

export const metadata: Metadata = { title: "Test run — SpeakUp admin" };

/** `/admin/funnels/<slug>/try/<step>`: an admin goes through the real funnel before launch. */
export default async function TryFunnelLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: ReactNode;
}) {
  const { slug } = await params;
  return <TryFunnel slug={slug}>{children}</TryFunnel>;
}
