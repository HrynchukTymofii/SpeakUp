import type { Feedback } from "@speakup/shared";
import { orderedSubscores, scoreSurface, SKILL_LABEL } from "@/lib/report";

/**
 * The per-skill scores the overall score is built from, as labelled bars. Shows at a glance
 * WHERE the points were lost, which a single number can't. Renders nothing for older analyses
 * without subscores.
 */
export function SkillBars({ feedback }: { feedback: Feedback }) {
  const scores = orderedSubscores(feedback);
  if (scores.length === 0) return null;
  return (
    <ul aria-label="Skill scores" className="flex flex-col gap-2.5">
      {scores.map(({ skill, score }) => (
        <li key={skill} className="grid grid-cols-[7.5rem_1fr_2.25rem] items-center gap-3">
          <span className="text-sm font-bold text-ink">{SKILL_LABEL[skill]}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-card-2" aria-hidden>
            <span
              className={`block h-full rounded-full ${scoreSurface(score)}`}
              style={{ width: `${Math.max(4, score)}%` }}
            />
          </span>
          <span className="text-right text-sm font-bold text-ink tabular-nums">
            {score}
            <span className="sr-only"> out of 100</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
