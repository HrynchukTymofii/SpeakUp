"use client";

import { FUNNEL_SCREEN_LIBRARY, type FunnelStepDef, type FunnelStepType } from "@speakup/shared";
import { Icon } from "@/components/icons";
import { ScreenPreview } from "./screen-preview";
import { SCREEN_KINDS, screenName } from "./screens";

/** Gallery groups, in the order a funnel usually runs. */
export const GALLERY_GROUPS = [
  "Questions",
  "Reflections and lesson",
  "Speaking check",
  "Sign-up",
  "Plan and paywall",
] as const;

/** Every step type's group: a Record, so a new step type can't be left out of the gallery. */
const GROUP_OF: Record<FunnelStepType, (typeof GALLERY_GROUPS)[number]> = {
  single_choice: "Questions",
  multi_choice: "Questions",
  slider: "Questions",
  reflection: "Reflections and lesson",
  video_lesson: "Reflections and lesson",
  mic_permission: "Speaking check",
  recording: "Speaking check",
  results: "Speaking check",
  auth_gate: "Sign-up",
  loader_with_questions: "Plan and paywall",
  plan_summary: "Plan and paywall",
  paywall: "Plan and paywall",
};

/**
 * Every screen the editor can add (FUNNEL_SCREEN_LIBRARY), as small phone previews grouped by
 * kind. Screens the funnel already shows are marked; each screen can be in a funnel once.
 */
export function ScreenGallery({
  slug,
  inFunnel,
  onAdd,
}: {
  slug: string;
  /** Ids of the screens the funnel already shows. */
  inFunnel: ReadonlySet<string>;
  onAdd: (screen: FunnelStepDef) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {GALLERY_GROUPS.map((title) => {
        const screens = FUNNEL_SCREEN_LIBRARY.filter((s) => GROUP_OF[s.type] === title);
        if (screens.length === 0) return null;
        return (
          <section key={title} className="flex flex-col gap-3">
            <h3 className="font-bold">{title}</h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {screens.map((screen) => {
                const name = screenName(screen);
                const added = inFunnel.has(screen.id);
                return (
                  <li key={screen.id} className="card flex flex-col gap-2 p-2">
                    <ScreenPreview slug={slug} steps={[...FUNNEL_SCREEN_LIBRARY]} step={screen} />
                    <p className="text-sm leading-snug font-bold break-words">{name}</p>
                    <p className="text-xs text-muted">{SCREEN_KINDS[screen.type]}</p>
                    {added ? (
                      <p className="mt-auto flex min-h-11 items-center text-sm font-medium text-muted">
                        In this funnel
                      </p>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Add “${name}”`}
                        className="btn btn-sm mt-auto min-h-11 btn-secondary"
                        onClick={() => onAdd(screen)}
                      >
                        <Icon name="plus" className="size-4" /> Add
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
