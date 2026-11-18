"use client";

import type { ComponentType } from "react";
import type { StepType } from "../types";
import { AuthStep } from "./auth-step";
import { LoaderStep } from "./loader-step";
import { PaywallStep, PlanStep } from "./plan-paywall-steps";
import type { StepProps } from "./props";
import {
  MicPermissionStep,
  MultiChoiceStep,
  ReflectionStep,
  SingleChoiceStep,
  SliderStep,
  VideoLessonStep,
} from "./question-steps";
import { RecordingStep } from "./recording-step";
import { ResultsStep } from "./results-step";

/**
 * Step type → component (SPEC §15.3). The mapped type makes TypeScript check that every step type
 * in `types.ts` has a component, and that each component accepts its own step's config.
 */
export const STEP_COMPONENTS: { [T in StepType]: ComponentType<StepProps<T>> } = {
  single_choice: SingleChoiceStep,
  multi_choice: MultiChoiceStep,
  slider: SliderStep,
  reflection: ReflectionStep,
  video_lesson: VideoLessonStep,
  mic_permission: MicPermissionStep,
  recording: RecordingStep,
  auth_gate: AuthStep,
  results: ResultsStep,
  loader_with_questions: LoaderStep,
  plan_summary: PlanStep,
  paywall: PaywallStep,
};
