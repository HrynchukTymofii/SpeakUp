"use client";

import { useId } from "react";
import { useMyStory } from "@/learn/local-progress";

const PROMPTS = [
  "Hook: what’s the one sentence that makes people want to hear more?",
  "What happened? Keep only the details the story needs.",
  "Why does it matter to you? End on that.",
];

/** Rough speaking time at a calm conversational pace (~140 words per minute). */
const secondsFor = (words: number) => Math.round((words / 140) * 60);

/**
 * The user writes their own story — on purpose, never generated: a story you can tell well is
 * one you lived and phrased yourself. Saved on this device and reused by the 7-day challenge.
 */
export function StoryWriter() {
  const [story, setStory] = useMyStory();
  const id = useId();
  const words = story.trim() ? story.trim().split(/\s+/).length : 0;

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="pill w-fit bg-peach text-on-pastel uppercase">Write it yourself</span>
        <label htmlFor={id} className="font-display text-lg leading-snug font-semibold">
          Write your story in your own words
        </label>
      </div>
      <ul className="flex flex-col gap-1.5 text-sm text-muted">
        {PROMPTS.map((p) => (
          <li key={p} className="flex gap-2">
            <span aria-hidden className="text-peach">
              •
            </span>
            {p}
          </li>
        ))}
      </ul>
      <textarea
        id={id}
        value={story}
        onChange={(e) => setStory(e.target.value)}
        rows={7}
        maxLength={2000}
        placeholder="Last year I…"
        className="w-full rounded-[18px] border-[1.5px] border-line-2 bg-card-2 p-4 text-[16px] leading-relaxed text-ink placeholder:text-muted focus:border-peach focus:outline-none"
      />
      <p className="text-xs font-semibold text-muted" aria-live="polite">
        {words} words · about {secondsFor(words)} s out loud
        {secondsFor(words) > 60 && " — try to get it under a minute"} · saved on this device
      </p>
    </div>
  );
}
