import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The admin area needs a signed-in user. Whether that user is an admin is decided only by the
 * API (ADMIN_CLERK_USER_IDS): this check just sends signed-out visitors to sign in, and the
 * screens show "This page is for admins" when the API answers 403.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=%2Fadmin%2Ffunnels");
  return children;
}
