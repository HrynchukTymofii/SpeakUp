import type { ReactNode } from "react";
import { LEGAL } from "@/lib/legal";

/** Readable long-form layout for the privacy policy, terms and refund policy. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-10 pb-20 sm:pt-16">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-[40px] leading-[1.05] font-semibold tracking-tight">
          {title}
        </h1>
        <p className="text-sm text-muted">Last updated: {LEGAL.lastUpdated}</p>
      </header>
      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-muted [&_a]:font-bold [&_a]:text-ink [&_a]:underline [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_strong]:text-ink [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
        {children}
      </div>
    </main>
  );
}

/** mailto link to the contact address. */
export function ContactEmail() {
  return <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;
}
