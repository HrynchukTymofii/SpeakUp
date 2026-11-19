import type { ExerciseType } from "@speakup/shared";

type ExerciseForAnalysis = { type: ExerciseType; prompt: string; referenceText: string | null };

/**
 * Practice modes use one exercise for many topics; the topic the user got is on the attempt.
 * Fold it into the exercise so scoring and feedback judge what was really asked: a free-speech
 * prompt gains the topic; a read-aloud (tongue twister) is compared against the topic's text.
 */
export function withTopic(
  exercise: ExerciseForAnalysis,
  topic: string | null,
): ExerciseForAnalysis {
  if (!topic) return exercise;
  if (exercise.type === "read_aloud") return { ...exercise, referenceText: topic };
  return { ...exercise, prompt: `${exercise.prompt}\nTopic: ${topic}` };
}
