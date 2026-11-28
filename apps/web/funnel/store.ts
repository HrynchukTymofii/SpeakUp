"use client";

import type { FunnelAnswers, FunnelAttribution } from "@speakup/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Funnel state (SPEC §15.3): a Zustand store persisted to localStorage, so a reload — or coming
 * back tomorrow from the same browser — resumes where the visitor left off.
 *
 * The guest token lives only here (localStorage) and in the Authorization header. It is never
 * put in URLs (they end up in history, logs and analytics) and never logged.
 */
export interface FunnelState {
  answers: FunnelAnswers;
  /** Ids of non-question steps that are done (reflections viewed, recording submitted…). */
  completed: string[];
  guestToken: string | null;
  /** The anonymous baseline attempt, once submitted. */
  attemptId: string | null;
  /** True after POST /v1/funnel/claim succeeded for the signed-in user. */
  claimed: boolean;
  /** From the results step: drives the "focus" options and the plan. */
  topIssues: string[];
  baselineScore: number | null;

  setAnswers: (patch: FunnelAnswers) => void;
  markCompleted: (stepId: string) => void;
  setGuestToken: (token: string) => void;
  setAttemptId: (id: string) => void;
  setClaimed: () => void;
  setResultSummary: (summary: { topIssues: string[]; score: number }) => void;
  reset: () => void;

  /** The funnel this state belongs to. The store holds ONE funnel at a time (see enterFunnel). */
  funnelSlug: string | null;
  /** The funnel's content revision (`Funnel.version`) the visitor was last shown. */
  funnelVersion: number | null;
  /** First-touch UTM + referrer host, sent when the guest session is created. */
  attribution: FunnelAttribution | null;

  /**
   * Called when a funnel page opens. A different funnel starts fresh — answers, guest token,
   * attempt and claim all belong to the previous funnel's session. The same funnel at a newer
   * revision keeps the visitor's progress.
   */
  enterFunnel: (slug: string, version: number) => void;
  /** Keeps the first attribution seen; later visits (other ads, reloads) don't overwrite it. */
  captureAttribution: (attribution: FunnelAttribution | null) => void;
}

/** The persisted part of the state (everything but the actions). */
type FunnelData = Pick<
  FunnelState,
  | "answers"
  | "completed"
  | "guestToken"
  | "attemptId"
  | "claimed"
  | "topIssues"
  | "baselineScore"
  | "funnelSlug"
  | "funnelVersion"
  | "attribution"
>;

const initial: FunnelData = {
  answers: {},
  completed: [],
  guestToken: null,
  attemptId: null,
  claimed: false,
  topIssues: [],
  baselineScore: null,
  funnelSlug: null,
  funnelVersion: null,
  attribution: null,
};

/**
 * v1 (before funnels lived in the database) only ever held the `/start` funnel, which is the
 * funnel `main` now: keep that visitor's progress instead of resetting it on their next visit.
 */
function migrate(persisted: unknown, version: number): FunnelData {
  const state = (persisted ?? {}) as Partial<FunnelData>;
  if (version < 2)
    return { ...initial, ...state, funnelSlug: "main", funnelVersion: null, attribution: null };
  return { ...initial, ...state };
}

export const useFunnelStore = create<FunnelState>()(
  persist(
    (set, get) => ({
      ...initial,
      setAnswers: (patch) => set((s) => ({ answers: { ...s.answers, ...patch } })),
      markCompleted: (stepId) =>
        set((s) => (s.completed.includes(stepId) ? s : { completed: [...s.completed, stepId] })),
      setGuestToken: (guestToken) => set({ guestToken }),
      setAttemptId: (attemptId) => set({ attemptId }),
      setClaimed: () => set({ claimed: true }),
      setResultSummary: ({ topIssues, score }) => set({ topIssues, baselineScore: score }),
      reset: () => set(initial),
      // One update, so no subscriber ever sees the old funnel's answers under the new slug.
      enterFunnel: (slug, version) => {
        const entered = { funnelSlug: slug, funnelVersion: version };
        set(get().funnelSlug === slug ? entered : { ...initial, ...entered });
      },
      captureAttribution: (attribution) =>
        set((s) => (s.attribution || !attribution ? s : { attribution })),
    }),
    {
      name: "speakup-funnel",
      version: 2,
      migrate,
      // localStorage can throw (private mode, blocked storage); Zustand then just keeps state
      // in memory for this tab — the funnel still works, it only won't survive a reload.
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
