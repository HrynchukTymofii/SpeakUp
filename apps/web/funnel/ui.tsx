"use client";

import type { ReactNode } from "react";

/** Small shared building blocks for funnel steps (mobile-first, one column). */

export function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl leading-tight font-semibold text-balance">{title}</h1>
      {subtitle && <p className="text-slate-600">{subtitle}</p>}
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
      className={`funnel-option flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-4 text-left text-base font-medium transition-colors ${
        selected
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-900 hover:border-slate-400"
      }`}
    >
      <span>{label}</span>
      {multi && (
        <span
          aria-hidden
          className={`flex size-5 shrink-0 items-center justify-center rounded-md border text-xs ${
            selected ? "border-white bg-white text-slate-900" : "border-slate-300"
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
    <div className="sticky bottom-0 -mx-4 mt-auto bg-gradient-to-t from-white via-white to-white/0 px-4 pt-6 pb-4">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="w-full rounded-xl bg-slate-900 px-4 py-4 text-base font-semibold text-white transition-opacity hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {children}
      </button>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 p-5 ${className}`}>{children}</div>;
}
