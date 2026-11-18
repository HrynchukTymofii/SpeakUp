"use client";

import type { FunnelAnswers } from "@speakup/shared";
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
}

const initial = {
  answers: {},
  completed: [],
  guestToken: null,
  attemptId: null,
  claimed: false,
  topIssues: [],
  baselineScore: null,
};

export const useFunnelStore = create<FunnelState>()(
  persist(
    (set) => ({
      ...initial,
      setAnswers: (patch) => set((s) => ({ answers: { ...s.answers, ...patch } })),
      markCompleted: (stepId) =>
        set((s) => (s.completed.includes(stepId) ? s : { completed: [...s.completed, stepId] })),
      setGuestToken: (guestToken) => set({ guestToken }),
      setAttemptId: (attemptId) => set({ attemptId }),
      setClaimed: () => set({ claimed: true }),
      setResultSummary: ({ topIssues, score }) => set({ topIssues, baselineScore: score }),
      reset: () => set(initial),
    }),
    {
      name: "speakup-funnel",
      version: 1,
      // localStorage can throw (private mode, blocked storage); Zustand then just keeps state
      // in memory for this tab — the funnel still works, it only won't survive a reload.
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
