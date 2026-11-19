import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { publicEnv } from "./lib/env";
import { routeForHost } from "./lib/hosts";

/**
 * Next.js 16 "proxy" (formerly middleware.ts): runs before matching requests.
 * clerkMiddleware() only attaches the session to the request so `auth()` works in pages.
 * It does NOT protect routes — per Clerk's current guidance, protection lives next to the
 * resource (e.g. `await auth()` + redirect in app/(product)/app/layout.tsx), because path matching
 * in middleware can drift from how Next actually routes requests.
 *
 * It also routes between the two hosts (marketing site vs product app): a page asked for on the
 * wrong host is redirected to the right one. The rules and why live in lib/hosts.ts.
 */
export default clerkMiddleware((_auth, request) => {
  const decision = routeForHost(
    {
      host: request.headers.get("host"),
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
    },
    { siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL, appUrl: publicEnv.NEXT_PUBLIC_APP_URL },
  );
  if (decision.kind === "redirect") return NextResponse.redirect(decision.url, decision.status);
  if (decision.noindex) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex");
    return response;
  }
  return undefined;
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/(.*)",
  ],
};
