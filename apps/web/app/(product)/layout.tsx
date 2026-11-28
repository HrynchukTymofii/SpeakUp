import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { PwaSetup } from "@/components/pwa/pwa-setup";
import { SiteHeader } from "@/components/site-header";

/**
 * Only the app host is installable: the manifest, the iOS home-screen tags and the service worker
 * live here, not in the root layout, so the marketing pages stay a plain website.
 */
export const metadata: Metadata = {
  manifest: "/speakup.webmanifest",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "SpeakUp", statusBarStyle: "default" },
  // Next only emits the standard `mobile-web-app-capable`; older iOS still reads the Apple name.
  other: { "apple-mobile-web-app-capable": "yes" },
};

// Lets the installed app draw under the notch and home indicator; fixed and sticky UI pads itself
// with env(safe-area-inset-*).
export const viewport: Viewport = { viewportFit: "cover" };

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
      <PwaSetup />
    </div>
  );
}
