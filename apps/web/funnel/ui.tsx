"use client";

import type { ReactNode } from "react";

/** Small shared building blocks for funnel steps (mobile-first, one column). */

export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-[28px] leading-[1.12] font-bold tracking-[-0.025em] text-balance text-ink">
        {title}
      </h1>
      {subtitle && <p className="text-base leading-relaxed text-muted">{subtitle}</p>}
    </div>
  );
}

/** A big tappable answer. `index` staggers the fade-in (40 ms per option, like the reference). */
export function OptionButton({
  label,
  selected,
  onClick,
  index,
  multi,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  index: number;
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={multi ? selected : undefined}
      style={{ animationDelay: `${index * 40}ms` }}
      className={`funnel-option flex min-h-15 w-full items-center justify-between gap-3 rounded-[20px] border-[1.5px] px-5 py-4 text-left text-base font-bold transition-[background-color,border-color,transform] duration-150 active:scale-[0.99] ${
        selected
          ? "border-ink bg-card text-ink shadow-soft"
          : "border-transparent bg-card text-ink shadow-soft-sm hover:bg-card-2"
      }`}
    >
      <span>{label}</span>
      {multi && (
        <span
          aria-hidden
          className={`flex size-6 shrink-0 items-center justify-center rounded-lg border-[1.5px] text-xs font-extrabold ${
            selected ? "border-ink bg-ink text-page" : "border-line-2"
          }`}
        >
          {selected ? "✓" : ""}
        </span>
      )}
    </button>
  );
}

/** Full-width primary button pinned to the bottom on phones (thumb reach), inline on desktop. */
export function ContinueButton({
  onClick,
  disabled,
  children = "Continue",
}: {
  onClick: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-auto bg-gradient-to-t from-page via-page to-page/0 px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="btn btn-primary min-h-14 w-full text-[17px]"
      >
        {children}
      </button>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  // A caller's own background (e.g. a pastel) replaces the default card surface + border;
  // two bg-* utilities on one element would fight over CSS order.
  const surface = /(^|\s)bg-/.test(className) ? "" : "bg-card";
  return <div className={`rounded-3xl p-5 shadow-soft-sm ${surface} ${className}`}>{children}</div>;
}

/** Check mark bullet used in feature / takeaway lists. */
export function Tick({ tone = "sage" }: { tone?: "sage" | "peach" }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-on-pastel ${
        tone === "sage" ? "bg-sage" : "bg-peach"
      }`}
    >
      ✓
    </span>
  );
}
