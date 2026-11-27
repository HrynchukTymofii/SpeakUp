/**
 * Box breathing timing: in, hold, out, hold — 4 seconds each, 4 rounds. Kept pure so the
 * countdown can be tested without timers and shared by every screen that runs the exercise.
 */

export const BREATHING_PHASES = ["Breathe in", "Hold", "Breathe out", "Hold"] as const;
export type BreathingPhase = (typeof BREATHING_PHASES)[number];

export const PHASE_SECONDS = 4;
export const BREATHING_ROUNDS = 4;
/** One trip around the square. */
export const ROUND_SECONDS = PHASE_SECONDS * BREATHING_PHASES.length;
export const BREATHING_TOTAL_SEC = ROUND_SECONDS * BREATHING_ROUNDS;

export interface BreathingState {
  phase: BreathingPhase;
  /** Countdown shown in the square, from 4 down to 1. */
  secondsLeft: number;
  /** 1-based, capped at the last round once the exercise is over. */
  round: number;
  rounds: number;
  finished: boolean;
}

/** Where the exercise is after `elapsedSec` whole seconds. */
export function breathingState(elapsedSec: number): BreathingState {
  const phaseIndex = Math.floor(elapsedSec / PHASE_SECONDS) % BREATHING_PHASES.length;
  return {
    phase: BREATHING_PHASES[phaseIndex] ?? BREATHING_PHASES[0],
    secondsLeft: PHASE_SECONDS - (elapsedSec % PHASE_SECONDS),
    round: Math.min(Math.floor(elapsedSec / ROUND_SECONDS) + 1, BREATHING_ROUNDS),
    rounds: BREATHING_ROUNDS,
    finished: elapsedSec >= BREATHING_TOTAL_SEC,
  };
}
