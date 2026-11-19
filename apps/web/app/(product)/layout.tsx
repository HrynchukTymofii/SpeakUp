import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Suspense, type ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";

/**
 * Product pages (served on the app host once the domain split is on — see lib/hosts.ts):
 * funnel, sign-in/up, dashboard, lessons, results, pricing. The header knows who is signed in.
 */
export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    // `.app-theme` switches the whole document to the app palette (globals.css, `:has`).
    <div className="app-theme contents">
      {/* "/" on the app host leads to the dashboard (or sign-in); without the split, to the landing. */}
      <SiteHeader homeHref="/">
        {/* <Show> reads the request, so it must sit inside <Suspense>. */}
        <Suspense>
          <Show when="signed-out">
            <SignInButton>
              <button className="btn btn-sm px-3 text-ink hover:bg-card">Sign in</button>
            </SignInButton>
            <SignUpButton>
              <button className="btn btn-primary btn-sm">Sign up</button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </Suspense>
      </SiteHeader>
      {children}
    </div>
  );
}
