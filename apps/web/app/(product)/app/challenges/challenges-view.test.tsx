// @vitest-environment jsdom
import type { AttemptSummary, Exercise } from "@speakup/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORY_CHALLENGE_SLUG } from "@/learn/progress";
import { ChallengesView } from "./challenges-view";

// `lib/env` validates the public env at import; the view only needs a valid API URL to load.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL ??= "http://localhost:4000";
});

const learn = vi.hoisted(() => ({ history: [] as AttemptSummary[] }));

vi.mock("@/lib/use-api", () => ({
  useApi: () => ({
    getPracticeExercises: () => {
      const story: Exercise = {
        id: "ex-story",
        slug: STORY_CHALLENGE_SLUG,
        type: "free_speech",
        prompt: "Tell your story.",
        referenceText: null,
        maxDurationSec: 90,
      };
      return Promise.resolve({ exercises: [story] });
    },
  }),
}));

vi.mock("@/learn/use-learn-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/learn/use-learn-data")>()),
  useLearnData: () => ({ history: learn.history }),
}));

vi.mock("@/components/exercise-recorder", () => ({ ExerciseRecorder: () => null }));

afterEach(() => {
  learn.history = [];
});

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChallengesView />
    </QueryClientProvider>,
  );
}

describe("ChallengesView story challenge", () => {
  it("Record day button uses the black primary pill, not brand text on ink", async () => {
    renderView();
    const button = await screen.findByRole("button", { name: "Record day 1" });
    expect(button).toHaveClass("btn", "btn-primary");
    expect(button).not.toHaveClass("text-brand");
  });

  it("a finished day shows a check icon and light text, no ✓ glyph", async () => {
    // A completed attempt on a past day: day 1 is done, today is still open.
    learn.history = [
      {
        id: "a1",
        exerciseSlug: STORY_CHALLENGE_SLUG,
        status: "completed",
        createdAt: "2026-01-05T10:00:00.000Z",
        overallScore: 72,
        subscores: null,
        problems: [],
      },
    ];
    renderView();
    const days = await screen.findByRole("list", { name: "1 of 7 days done" });
    const doneTile = days.querySelector("li");
    if (!doneTile) throw new Error("no day tiles");
    expect(doneTile.querySelector("svg")).not.toBeNull();
    expect(doneTile).not.toHaveTextContent("✓");
    expect(doneTile).not.toHaveClass("text-brand");
    expect(doneTile).toHaveClass("text-page");
    expect(doneTile).toHaveTextContent("72");
  });
});
