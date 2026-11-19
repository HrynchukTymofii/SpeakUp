/**
 * React Query key for the speaking check. It includes the goal because the server picks the
 * check by goal: a question cached for another goal would be shown while the attempt is
 * recorded against the new goal's exercise.
 */
export const funnelExerciseKey = (goal: string | undefined) =>
  ["funnel-exercise", goal ?? null] as const;
