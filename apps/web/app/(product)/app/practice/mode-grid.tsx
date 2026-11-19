import { PRACTICE_MODES } from "@speakup/shared";
import Link from "next/link";
import { IconTile } from "@/components/icon-tile";
import { MODE_INFO } from "@/learn/practice";
import { TONE_SURFACE } from "@/learn/tone";

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
              className="flex h-full min-h-40 flex-col justify-between gap-3 rounded-[24px] bg-card p-4 shadow-soft-sm transition-transform active:scale-[0.98]"
            >
              <IconTile icon={info.icon} surface={TONE_SURFACE[info.tone]} />
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
