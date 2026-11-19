import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Manrope, Outfit } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

// Body: Manrope. Headings: Outfit (same pair as the Holy Hush kit, minus its serif).
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

export const metadata: Metadata = {
  title: "SpeakUp — speaking skills trainer",
  description:
    "Record yourself speaking and get feedback on pace, pauses, filler words and clarity.",
};

/**
 * Clerk's widgets (sign-in/up, user menu) themed with the same tokens as the rest of the app.
 * CSS variables resolve at runtime, so the palette stays defined in one place (globals.css).
 */
const clerkAppearance = {
  variables: {
    colorPrimary: "var(--peach)",
    colorPrimaryForeground: "var(--on-pastel)",
    colorBackground: "var(--card)",
    colorForeground: "var(--ink)", // Clerk 7's name for `colorText`
    colorMutedForeground: "var(--muted)",
    colorNeutral: "var(--ink)",
    colorInput: "var(--card-2)",
    colorInputForeground: "var(--ink)",
    colorBorder: "var(--line-2)",
    colorDanger: "var(--danger)",
    colorSuccess: "var(--sage)",
    colorShadow: "#000000",
    colorModalBackdrop: "rgba(0, 0, 0, 0.7)",
    fontFamily: "var(--font-manrope), system-ui, sans-serif",
    fontFamilyButtons: "var(--font-manrope), system-ui, sans-serif",
    borderRadius: "1rem",
  },
  elements: {
    cardBox: { borderRadius: "28px", border: "1px solid var(--line)", boxShadow: "var(--shadow)" },
    headerTitle: { fontFamily: "var(--font-outfit), system-ui, sans-serif", fontSize: "1.5rem" },
    formButtonPrimary: { borderRadius: "999px", fontWeight: 800, minHeight: "44px" },
    // Clerk draws these borders as ~7%-alpha box-shadows (invisible on black) from a more
    // specific selector, hence !important — only when unfocused, so Clerk's focus ring still shows.
    socialButtonsBlockButton: {
      borderRadius: "999px",
      "&:not(:focus-visible)": { boxShadow: "0 0 0 1.5px var(--line-2) !important" },
    },
    formFieldInput: {
      minHeight: "44px",
      "&:not(:focus)": { boxShadow: "0 0 0 1.5px var(--line-2) !important" },
    },
    dividerLine: { backgroundColor: "var(--line-2)" },
  },
};

/**
 * The shell shared by both hosts (fonts, Clerk, query cache). Each route group brings its own
 * header: (marketing) for the landing and legal pages, (product) for everything signed-in or funnel.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${outfit.variable}`}>
      <body className="min-h-dvh bg-page font-sans text-ink antialiased">
        {/* Clerk Core 3: ClerkProvider goes inside <body>, not around <html>. */}
        {/* Themed via `clerkAppearance` above. */}
        <ClerkProvider appearance={clerkAppearance}>
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
