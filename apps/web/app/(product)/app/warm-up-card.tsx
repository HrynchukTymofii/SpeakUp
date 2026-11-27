import Link from "next/link";
import { IconTile } from "@/components/icon-tile";
import { TONE_SURFACE } from "@/learn/tone";

/** Entry to the one-minute breathing warm-up, for the moment just before someone has to speak. */
export function WarmUpCard() {
  return (
    <Link
      href="/app/warm-up"
      className="surface flex items-center gap-3 rounded-[22px] p-3 shadow-soft transition-transform active:scale-[0.98]"
    >
      <IconTile icon="breath" surface={TONE_SURFACE.sky} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-bold">Pitch coming up?</span>
        <span className="text-xs font-semibold text-muted">Calm down in 1 minute</span>
      </span>
    </Link>
  );
}
