import { PRACTICE_MODES } from "@speakup/shared";
import Link from "next/link";
import { MODE_INFO } from "@/learn/practice";

/** One card per mode. Tapping starts the mode with a random topic: no list of drills to scan. */
export function ModeGrid() {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {PRACTICE_MODES.map((mode) => {
        const info = MODE_INFO[mode];
        return (
          <li key={mode}>
            <Link
              href={`/app/practice/${mode}`}
              className="flex h-full min-h-40 flex-col justify-between gap-3 rounded-[24px] border border-line bg-card p-4 transition-colors hover:border-peach active:scale-[0.98]"
            >
              <span aria-hidden className="text-3xl">
                {info.icon}
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-display text-lg leading-tight font-semibold">
                  {info.label}
                </span>
                <span className="text-xs font-semibold text-muted">{info.short}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
