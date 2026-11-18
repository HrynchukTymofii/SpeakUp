import { FUNNEL_OPTIONS, type FunnelAnswers, type FunnelOption } from "@speakup/shared";

/**
 * Personalized copy for the funnel (SPEC §15.3): small pure functions of the answers, so they're
 * easy to unit-test and to change without touching components.
 * Copy rule: no invented statistics or promises of outcomes.
 */

const REFLECTION_BY_GOAL: Record<string, { title: string; body: string }> = {
  "job-interviews": {
    title: "Interviews reward clear, structured answers more than perfect English.",
    body: "That’s a trainable skill — and we’ll start training it today.",
  },
  presentations: {
    title: "Confident speakers aren’t born. They rehearse out loud.",
    body: "Pace and pauses matter more than fancy words, and both improve with practice.",
  },
  meetings: {
    title: "In meetings, being clear beats being loud.",
    body: "Short, structured points get heard. We’ll help you practice exactly that.",
  },
  conversations: {
    title: "Everyday conversations get easier with small, regular practice.",
    body: "A few minutes of speaking out loud each day builds real comfort.",
  },
  clarity: {
    title: "Being understood is about rhythm, not about losing your accent.",
    body: "Pace, pauses and clear word endings make the biggest difference.",
  },
};
const DEFAULT_REFLECTION_1 = {
  title: "Speaking with confidence is a skill, not a personality trait.",
  body: "Like any skill, it gets better with focused practice.",
};

/** Step `reflection-1`: reacts to the goal. */
export function goalReflection(answers: FunnelAnswers): { title: string; body: string } {
  return (answers.goal && REFLECTION_BY_GOAL[answers.goal]) ?? DEFAULT_REFLECTION_1;
}

const REFLECTION_BY_SYMPTOM: Record<string, { title: string; body: string }> = {
  "too-fast": {
    title: "Speeding up is a nerves habit, not a skill gap.",
    body: "Your first exercise will measure your pace, so we can work from real numbers.",
  },
  fillers: {
    title: "Filler words are your brain buying time. Everyone uses them.",
    body: "We’ll count yours, then help you swap them for short, confident pauses.",
  },
  "lose-thread": {
    title: "Losing your train of thought usually means too many ideas at once.",
    body: "Simple structures — point, example, point — make it much easier to stay on track.",
  },
  quiet: {
    title: "A quiet voice is often a sign of rushing to finish.",
    body: "Slowing down and pausing gives your voice room. We’ll practice both.",
  },
  repeat: {
    title: "When people ask you to repeat yourself, pace is usually the fix.",
    body: "Your first exercise will show how fast you speak and where words get unclear.",
  },
};
const DEFAULT_REFLECTION_2 = {
  title: "Nerves change how we speak — usually in a few predictable ways.",
  body: "Your first exercise will measure them, so we can work from real numbers.",
};

/** Step `reflection-2`: reacts to the FIRST selected symptom (SPEC §15.2). */
export function symptomReflection(answers: FunnelAnswers): { title: string; body: string } {
  const first = answers.symptoms?.[0];
  return (first && REFLECTION_BY_SYMPTOM[first]) ?? DEFAULT_REFLECTION_2;
}

/** Step `focus`: the result's top 2 issues + "Overall confidence" (SPEC §15.2). */
export function focusOptions(topIssues: string[]): FunnelOption[] {
  const all = FUNNEL_OPTIONS.focus;
  const fromResult = topIssues
    .map((category) => all.find((o) => o.value === category))
    .filter((o): o is (typeof all)[number] => o !== undefined)
    .slice(0, 2);
  const confidence = all.find((o) => o.value === "confidence");
  // No result issues (e.g. a great take): fall back to the most common areas.
  const base =
    fromResult.length > 0 ? fromResult : all.filter((o) => ["pace", "fillers"].includes(o.value));
  return [...base, ...(confidence ? [confidence] : [])];
}

const FOCUS_LABEL: Record<string, string> = {
  pace: "find a comfortable pace",
  pauses: "use pauses with purpose",
  fillers: "replace filler words with pauses",
  clarity: "speak clearly and finish your words",
  accuracy: "read and speak precisely",
  structure: "structure what you say",
  confidence: "build overall confidence",
};

const GOAL_LABEL: Record<string, string> = {
  "job-interviews": "job interviews",
  presentations: "presentations",
  meetings: "meetings and calls",
  conversations: "everyday conversations",
  clarity: "being clearly understood",
};

export interface PlanWeek {
  week: number;
  title: string;
  detail: string;
}

/**
 * Step `plan`: a 4-week plan from goal, focus and time. Deliberately no promised outcomes
 * ("you'll be 40% more confident") — only what they'll practice (SPEC §15.2).
 */
export function buildPlan(answers: FunnelAnswers): {
  headline: string;
  minutesPerDay: string;
  weeks: PlanWeek[];
} {
  const focus = answers.focus ?? "confidence";
  const goal = answers.goal ? GOAL_LABEL[answers.goal] : undefined;
  const minutes = answers.time === "20" ? "20+" : (answers.time ?? "10");
  return {
    headline: goal ? `Your 4-week plan for ${goal}` : "Your 4-week speaking plan",
    minutesPerDay: minutes,
    weeks: [
      {
        week: 1,
        title: `Focus: ${FOCUS_LABEL[focus] ?? FOCUS_LABEL.confidence}`,
        detail: "Short daily exercises on your weakest area from today’s check.",
      },
      {
        week: 2,
        title: "Pace and pauses",
        detail: "Find your comfortable speed and learn where pauses help listeners.",
      },
      {
        week: 3,
        title: "Fewer fillers, clearer structure",
        detail: "Replace “um” with silence and practice simple answer structures.",
      },
      {
        week: 4,
        title: goal ? `Put it together: ${goal}` : "Put it together",
        detail: "Realistic practice for your goal, then a new check to compare with today.",
      },
    ],
  };
}
