"use client";

import type { FunnelAnswers } from "@speakup/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { create } from "zustand";
import { setUserProperties, track } from "./analytics";
import { funnelApi } from "./api";
import { NO_BACK_STEP_TYPES, PROGRESS_STEP_TYPES } from "./config";
import { useFunnel } from "./funnel-context";
import { furthestAllowedIndex, progressOf, visibleSteps, type EngineState } from "./engine";
import { STEP_COMPONENTS } from "./steps";
import type { StepProps } from "./steps/props";
import { useFunnelStore, type FunnelState } from "./store";
import type { FunnelStep } from "./types";

const engineState = (s: FunnelState): EngineState => ({
  answers: s.answers,
  topIssues: s.topIssues,
  completed: s.completed,
  attemptId: s.attemptId,
  claimed: s.claimed,
});

const currentSteps = (all: FunnelStep[], s: FunnelState) => visibleSteps(all, engineState(s));

/**
 * Which way the last navigation went, so the next step slides in from the right (forward) or the
 * left (back). Set in the click handlers; not persisted (it only matters for the next animation).
 */
const useSlideDirection = create<{
  dir: "forward" | "back";
  set: (dir: "forward" | "back") => void;
}>((set) => ({ dir: "forward", set: (dir) => set({ dir }) }));

/**
 * Creates the guest session on the first visit (SPEC §15.3: "create the funnel session on step 1"),
 * tagged with the funnel shown and the first-touch attribution the FunnelProvider captured.
 * One request even if several components mount at once; retried a few times if the API is down,
 * without ever blocking the questions.
 */
let creatingSession: Promise<void> | null = null;
function useGuestSession() {
  const { slug, version } = useFunnel();
  const token = useFunnelStore((s) => s.guestToken);
  const [failures, setFailures] = useState(0);
  useEffect(() => {
    if (token || failures > 5) return;
    const retry = setTimeout(
      () => {
        const { attribution } = useFunnelStore.getState();
        creatingSession ??= funnelApi
          .createSession({ funnel: { slug, version }, ...(attribution ? { attribution } : {}) })
          .then(({ token: t }) => useFunnelStore.getState().setGuestToken(t))
          .catch(() => setFailures((f) => f + 1))
          .finally(() => {
            creatingSession = null;
          });
      },
      failures === 0 ? 0 : 2_000 * failures,
    );
    return () => clearTimeout(retry);
  }, [token, failures, slug, version]);
}

/** PATCH answers + current step to the server, debounced; failures never block the UI. */
function useAnswerSync(stepId: string) {
  const token = useFunnelStore((s) => s.guestToken);
  const answers = useFunnelStore((s) => s.answers);
  const claimed = useFunnelStore((s) => s.claimed);
  useEffect(() => {
    if (!token || claimed) return;
    const timer = setTimeout(() => {
      funnelApi.updateSession(token, { answers, currentStep: stepId }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [token, answers, stepId, claimed]);
}

/**
 * Renders one funnel step (`<basePath>/<stepId>`): progress bar, back button, guarded navigation
 * and the slide transition. Steps come from the FunnelProvider's definition; each step type maps
 * to a component (`steps/index.tsx`).
 */
export function FunnelShell({ stepId }: { stepId: string }) {
  const router = useRouter();
  const { steps: allSteps, basePath } = useFunnel();
  const state = useFunnelStore();
  const slide = useSlideDirection((s) => s.dir);
  const setDirection = useSlideDirection((s) => s.set);
  useGuestSession();
  useAnswerSync(stepId);

  const steps = currentSteps(allSteps, state);
  const index = steps.findIndex((s) => s.id === stepId);
  const allowed = furthestAllowedIndex(steps, engineState(state));
  // Guard: unknown step, or a step whose prerequisites aren't met → the furthest allowed one.
  const redirectTo = index === -1 || index > allowed ? steps[allowed]?.id : undefined;

  useEffect(() => {
    if (redirectTo) router.replace(`${basePath}/${redirectTo}`);
  }, [redirectTo, router, basePath]);

  useEffect(() => {
    if (redirectTo || index === -1) return;
    track("funnel_step_viewed", { step: stepId, index });
  }, [stepId, index, redirectTo]);

  const goNext = useCallback(
    (patch?: FunnelAnswers) => {
      const store = useFunnelStore.getState();
      if (patch) {
        store.setAnswers(patch);
        // Answers become user properties (funnel_goal…), so app usage can be split by them.
        setUserProperties(
          Object.fromEntries(Object.entries(patch).map(([key, value]) => [`funnel_${key}`, value])),
        );
      }
      // Re-read: the answer just given may change which steps apply.
      const fresh = currentSteps(allSteps, useFunnelStore.getState());
      const next = fresh[fresh.findIndex((s) => s.id === stepId) + 1];
      useSlideDirection.getState().set("forward");
      if (next) router.push(`${basePath}/${next.id}`);
      window.scrollTo({ top: 0 });
    },
    [router, stepId, allSteps, basePath],
  );

  const goBack = () => {
    // Walk back over loaders (never re-enter one), like the reference funnel.
    for (let i = index - 1; i >= 0; i--) {
      const prev = steps[i];
      if (prev && prev.type !== "loader_with_questions") {
        setDirection("back");
        router.push(`${basePath}/${prev.id}`);
        return;
      }
    }
  };

  const step = steps[index];
  if (redirectTo || !step) return <div className="flex-1" aria-busy />;

  const direction = slide === "forward" ? "funnel-forward" : "funnel-back";
  const showProgress = PROGRESS_STEP_TYPES.has(step.type);
  const canGoBack = index > 0 && !NO_BACK_STEP_TYPES.has(step.type) && step.type !== "paywall";

  return (
    <div className="flex flex-1 flex-col gap-5">
      {showProgress && (
        <FunnelProgressBar value={progressOf(steps, step)} canGoBack={canGoBack} onBack={goBack} />
      )}
      {/* key: a new step re-mounts → the CSS slide/fade animation plays again. */}
      <div key={step.id} className={`flex flex-1 flex-col ${direction}`}>
        <StepView step={step} state={state} onNext={goNext} />
      </div>
    </div>
  );
}

function StepView({
  step,
  state,
  onNext,
}: {
  step: FunnelStep;
  state: FunnelState;
  onNext: (patch?: FunnelAnswers) => void;
}) {
  // The map is typed per step type; TypeScript can't correlate `step.type` with the component
  // through the union, so we widen once here (the map's own type guarantees the pairing).
  const Component = STEP_COMPONENTS[step.type] as ComponentType<StepProps<typeof step.type>>;
  return (
    <Component
      step={step as never}
      ctx={{ answers: state.answers, topIssues: state.topIssues }}
      onNext={onNext}
    />
  );
}

/** `<basePath>` without a step: resume where the visitor left off. */
export function FunnelResume() {
  const router = useRouter();
  const { steps: allSteps, basePath } = useFunnel();
  useEffect(() => {
    const state = useFunnelStore.getState();
    const steps = currentSteps(allSteps, state);
    const target = steps[furthestAllowedIndex(steps, engineState(state))] ?? steps[0];
    if (target) router.replace(`${basePath}/${target.id}`);
  }, [router, allSteps, basePath]);
  return <div className="flex-1" aria-busy />;
}

/** Back button and progress bar above a step. Also drawn by the funnel editor's preview. */
export function FunnelProgressBar({
  value,
  canGoBack,
  onBack,
}: {
  /** 0..1 */
  value: number;
  canGoBack: boolean;
  onBack: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        disabled={!canGoBack}
        aria-label="Back"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-card text-lg text-ink transition-colors hover:bg-card-2 disabled:invisible"
      >
        ←
      </button>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-card-2"
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
      >
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-500 ease-out"
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}
