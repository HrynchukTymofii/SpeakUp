import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Next.js 16 "proxy" (formerly middleware.ts): runs before matching requests.
 * clerkMiddleware() only attaches the session to the request so `auth()` works in pages.
 * It does NOT protect routes — per Clerk's current guidance, protection lives next to the
 * resource (e.g. `await auth()` + redirect in app/app/layout.tsx), because path matching in
 * middleware can drift from how Next actually routes requests.
 */
export default clerkMiddleware();

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
