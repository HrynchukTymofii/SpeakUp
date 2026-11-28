"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import type { Device } from "../device-frame";

const DEVICE_BUTTONS = [
  { device: "phone", label: "Phone", icon: "phone" },
  { device: "web", label: "Desktop", icon: "monitor" },
] as const satisfies readonly { device: Device; label: string; icon: IconName }[];

/**
 * The test run's controls, floating in the bottom-right corner instead of a banner over the
 * funnel, so the screens look the way a visitor sees them. A vertical pill clears the phone frame
 * on any window wide enough to show it. DOM order is the tab order.
 *
 * The notes the old banner carried (which version runs, that checkout is real) are the dot's
 * tooltip and screen-reader text; the dot turns red when the saved draft fails the checks.
 */
export function TryDock({
  slug,
  name,
  hasDraft,
  draftInvalid,
  device,
  onDeviceChange,
  onStartOver,
}: {
  slug: string;
  name: string;
  hasDraft: boolean;
  draftInvalid: boolean;
  device: Device;
  onDeviceChange: (device: Device) => void;
  onStartOver: () => void;
}) {
  const note = [
    `Test run of ${name}${hasDraft ? " with the unpublished changes" : ""}.`,
    draftInvalid
      ? "The saved changes no longer pass the checks, so this runs what visitors see."
      : null,
    "Checkout is real: pick the free plan.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside
      aria-label="Test run"
      className="surface fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-1 rounded-full border border-line bg-card p-1 shadow-soft-sm"
    >
      {/* Below 640 px the funnel is full-bleed with no frame, so there's nothing to switch. */}
      <div role="group" aria-label="Preview device" className="hidden flex-col gap-1 sm:flex">
        {DEVICE_BUTTONS.map((b) => (
          <button
            key={b.device}
            type="button"
            aria-label={b.label}
            aria-pressed={device === b.device}
            onClick={() => onDeviceChange(b.device)}
            className={`btn btn-sm size-11 min-h-11 px-0 ${device === b.device ? "btn-primary" : "btn-secondary"}`}
          >
            <Icon name={b.icon} className="size-5" />
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label="Start over"
        onClick={onStartOver}
        className="btn btn-sm size-11 min-h-11 btn-secondary px-0"
      >
        <Icon name="refresh" className="size-5" />
      </button>
      <Link
        href={`/admin/funnels/${slug}`}
        aria-label="Back to the editor"
        className="btn btn-sm size-11 min-h-11 btn-secondary px-0"
      >
        <Icon name="arrowLeft" className="size-5" />
      </Link>
      {/* Padding + bg-clip-content: an 8 px dot with a larger area that shows the tooltip. */}
      <span
        data-testid="test-run-marker"
        title={note}
        aria-hidden="true"
        className={`box-content size-2 rounded-full bg-clip-content p-1.5 ${draftInvalid ? "bg-danger" : "bg-brand"}`}
      />
      <span className="sr-only">{note}</span>
    </aside>
  );
}
