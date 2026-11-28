import { WPM_TARGET, type AttemptResult, type Exercise } from "@speakup/shared";

/**
 * Sample data for the funnel editor's preview (`FunnelPreviewContext`): the screens that
 * normally load a visitor's own exercise, result or plan show these instead. Never sent to the API.
 */

export const PREVIEW_EXERCISE: Exercise = {
  id: "preview",
  slug: "check-preview",
  type: "free_speech",
  prompt: "Tell me about yourself: what you do, and what you’d like to get better at.",
  referenceText: null,
  maxDurationSec: 45,
};

/** A baseline score in the middle of the range, like most first checks. */
export const PREVIEW_SCORE = 64;

export const PREVIEW_RESULT: AttemptResult = {
  overallScore: PREVIEW_SCORE,
  transcript: { text: "", words: [] },
  metrics: {
    durationSec: 38,
    totalSec: 41,
    wordCount: 92,
    wpm: 145,
    wpmTarget: { ...WPM_TARGET },
    pauses: {
      count: 14,
      longCount: 2,
      longestSec: 1.9,
      list: [],
      source: "audio",
      hesitationCount: 4,
      longestRunSec: 9,
    },
    fillers: { count: 6, perMinute: 9.5, list: [] },
    lowConfidenceWords: [],
    readAloud: null,
    voice: null,
    language: null,
  },
  feedback: {
    overallScore: PREVIEW_SCORE,
    summary: "A clear answer at a good pace; fillers and a few searching pauses get in the way.",
    strengths: ["Your pace was easy to follow, right in the conversational sweet spot."],
    issues: [
      {
        category: "fillers",
        severity: "medium",
        evidence: "“Um, so I, like, work in marketing…”",
        tip: "Pause silently instead of saying “um”: a short silence sounds confident.",
      },
      {
        category: "pauses",
        severity: "low",
        evidence: "You stopped mid-sentence four times, searching for words.",
        tip: "Finish the thought first, then pause at the end of the sentence.",
      },
    ],
    nextStep: "Practice a 30-second introduction with no fillers.",
    subscores: [
      { skill: "pace", score: 82 },
      { skill: "pauses", score: 58 },
      { skill: "fillers", score: 49 },
      { skill: "content", score: 70 },
    ],
  },
};
