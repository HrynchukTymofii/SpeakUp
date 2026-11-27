// @vitest-environment jsdom
import { FUNNEL_OPTIONS } from "@speakup/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "../analytics";
import { FUNNEL_STEPS } from "../config";
import type { FunnelContext, FunnelStep } from "../types";
import type { StepProps } from "./props";
import { STEP_COMPONENTS } from "./index";

/**
 * Characterization tests for the step components: each renders through the public contract
 * (`step`, `ctx`, `onNext`) with the real config entries, so the wording and payloads users see
 * stay the same while the funnel definition moves from code to data.
 */

// `lib/env` validates the public env at import; the steps only need a valid API URL to load.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL ??= "http://localhost:4000";
});

vi.mock("../analytics", () => ({ track: vi.fn() }));

afterEach(() => vi.clearAllMocks());

function stepById(id: string): FunnelStep {
  const found = FUNNEL_STEPS.find((s) => s.id === id);
  if (!found) throw new Error(`no step ${id}`);
  return found;
}

function renderStep(id: string, ctx: Partial<FunnelContext> = {}) {
  const step = stepById(id);
  // The mapped type pairs each component with its own step type; the lookup by a runtime id
  // can't prove that pairing, so widen it here.
  const Component = STEP_COMPONENTS[step.type] as ComponentType<StepProps<FunnelStep["type"]>>;
  const onNext = vi.fn();
  const view = render(
    <Component step={step as never} ctx={{ answers: {}, topIssues: [], ...ctx }} onNext={onNext} />,
  );
  return { ...view, onNext };
}

describe("reflection steps", () => {
  it("reflection-1 shows the goal's wording, and the default without a goal", () => {
    const withGoal = renderStep("reflection-1", { answers: { goal: "job-interviews" } });
    expect(
      screen.getByRole("heading", {
        name: "Interviews reward clear, structured answers more than perfect English.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("That’s a trainable skill — and we’ll start training it today."),
    ).toBeInTheDocument();
    withGoal.unmount();

    renderStep("reflection-1");
    expect(
      screen.getByRole("heading", {
        name: "Speaking with confidence is a skill, not a personality trait.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Like any skill, it gets better with focused practice."),
    ).toBeInTheDocument();
  });

  it("reflection-2 follows the first selected symptom", async () => {
    const { onNext } = renderStep("reflection-2", {
      answers: { symptoms: ["too-fast", "fillers"] },
    });
    expect(
      screen.getByRole("heading", { name: "Speeding up is a nerves habit, not a skill gap." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your first exercise will measure your pace, so we can work from real numbers.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onNext).toHaveBeenCalledWith();
  });
});

describe("single choice steps", () => {
  it("focus offers the top 2 issues + Overall confidence, in order", async () => {
    const { onNext } = renderStep("focus", { topIssues: ["fillers", "pace", "pauses"] });
    expect(
      screen.getByRole("heading", { name: "What should we work on first?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Based on your speaking check.")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Filler words",
      "Pace",
      "Overall confidence",
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Filler words" }));
    expect(onNext).toHaveBeenCalledExactlyOnceWith({ focus: "fillers" });
    expect(track).toHaveBeenCalledExactlyOnceWith("funnel_answer", {
      step: "focus",
      value: "fillers",
    });
  });

  it("goal step renders every FUNNEL_OPTIONS.goal label as a button, title and no subtitle", () => {
    renderStep("goal");
    const heading = screen.getByRole("heading", { name: "What do you most want to improve?" });
    // StepHeading renders the subtitle as a <p> next to the title only when one is configured.
    expect(heading.parentElement?.querySelector("p")).toBeNull();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(
      FUNNEL_OPTIONS.goal.map((o) => o.label),
    );
  });
});

describe("multi choice steps", () => {
  it('situations (multi) shows title + "Choose all that apply." and Continue sends the picked array', async () => {
    const { onNext } = renderStep("situations");
    expect(
      screen.getByRole("heading", { name: "When do you feel least confident speaking?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Choose all that apply.")).toBeInTheDocument();
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "In meetings" }));
    await userEvent.click(screen.getByRole("button", { name: "Small talk with strangers" }));
    await userEvent.click(continueButton);

    expect(onNext).toHaveBeenCalledExactlyOnceWith({ situations: ["meetings", "small-talk"] });
    expect(track).toHaveBeenCalledExactlyOnceWith("funnel_answer", {
      step: "situations",
      value: ["meetings", "small-talk"],
    });
  });
});

describe("configured content", () => {
  it("self-rating, mini-lesson and plan-loader show their configured titles and labels", () => {
    const rating = renderStep("self-rating");
    expect(
      screen.getByRole("heading", { name: "How would you rate your speaking confidence today?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "How would you rate your speaking confidence today?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Not confident")).toBeInTheDocument();
    expect(screen.getByText("Very confident")).toBeInTheDocument();
    rating.unmount();

    const lesson = renderStep("mini-lesson");
    expect(
      screen.getByRole("heading", { name: "How we’ll measure your speaking" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "✓Pace and pauses — how fast you speak, and where you stop or hesitate",
      "✓Your voice — whether pitch and volume move, or stay flat",
      "✓Filler words and wording — “um”, “like”, “I think”, repeated phrases",
    ]);
    expect(screen.getByRole("button", { name: "Continue in 10s" })).toBeDisabled();
    lesson.unmount();

    renderStep("plan-loader");
    expect(
      screen.getByRole("heading", { name: "Building your personal plan" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Analyzing your recording",
      "Matching lessons to your goal",
      "Setting your daily practice",
    ]);
  });
});
