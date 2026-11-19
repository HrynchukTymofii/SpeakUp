export interface LessonStep {
  /** The section heading ("Why it matters", "Example", "Try this"); empty for an intro. */
  title: string;
  /** Markdown of the section, without its heading. */
  body: string;
}

/**
 * Splits a lesson's markdown body into steps, one per `## ` section, so the lesson can be shown
 * one card at a time (explanation → example → try this) before the exercises.
 */
export function splitLessonBody(markdown: string): LessonStep[] {
  const steps: LessonStep[] = [];
  const parts = markdown.split(/^## /m);
  parts.forEach((part, index) => {
    if (index === 0) {
      const intro = part.trim();
      if (intro) steps.push({ title: "", body: intro });
      return;
    }
    const newline = part.indexOf("\n");
    const title = (newline === -1 ? part : part.slice(0, newline)).trim();
    const body = newline === -1 ? "" : part.slice(newline + 1).trim();
    steps.push({ title, body });
  });
  return steps;
}
