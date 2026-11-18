import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpeakUp — speaking skills trainer",
  description:
    "Record yourself speaking and get feedback on pace, pauses, filler words and clarity.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-slate-900 antialiased">
        {/* Clerk Core 3: ClerkProvider goes inside <body>, not around <html>. */}
        <ClerkProvider>
          <Providers>
            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <Link href="/" className="font-semibold">
                SpeakUp
              </Link>
              <nav className="flex items-center gap-3 text-sm">
                {/* <Show> reads the request, so it must sit inside <Suspense>. */}
                <Suspense>
                  <Show when="signed-out">
                    <SignInButton />
                    <SignUpButton>
                      <button className="rounded-md bg-slate-900 px-3 py-1.5 text-white">
                        Sign up
                      </button>
                    </SignUpButton>
                  </Show>
                  <Show when="signed-in">
                    <Link href="/app" className="underline-offset-4 hover:underline">
                      Dashboard
                    </Link>
                    <UserButton />
                  </Show>
                </Suspense>
              </nav>
            </header>
            {children}
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
