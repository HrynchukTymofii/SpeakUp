// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LessonVideo } from "./lesson-video";
import { FunnelPreviewContext } from "./preview";

// jsdom has no media playback: stub play() and record whether the video was muted at each call.
function stubPlay(results: Array<"ok" | "blocked">) {
  const calls: boolean[] = [];
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    calls.push(this.muted);
    const result = results[calls.length - 1] ?? "ok";
    return result === "ok"
      ? Promise.resolve()
      : Promise.reject(new DOMException("autoplay blocked", "NotAllowedError"));
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe("LessonVideo", () => {
  it("starts playing with sound as soon as the step opens", async () => {
    const calls = stubPlay(["ok"]);
    render(<LessonVideo src="/lesson.mp4" onEnded={() => {}} />);
    await waitFor(() => expect(calls).toEqual([false]));
    expect(screen.queryByRole("button", { name: /sound/i })).not.toBeInTheDocument();
  });

  it("falls back to muted playback when the browser blocks sound, and offers to unmute", async () => {
    // Regression: the video waited for a tap on play when autoplay with sound was refused.
    const calls = stubPlay(["blocked", "ok", "ok"]);
    render(<LessonVideo src="/lesson.mp4" onEnded={() => {}} />);
    const unmute = await screen.findByRole("button", { name: /tap for sound/i });
    expect(calls).toEqual([false, true]);

    await userEvent.click(unmute);
    expect(calls).toEqual([false, true, false]);
    expect(screen.queryByRole("button", { name: /tap for sound/i })).not.toBeInTheDocument();
  });

  it("doesn't start on its own inside the funnel editor's preview", async () => {
    const calls = stubPlay(["ok"]);
    render(
      <FunnelPreviewContext.Provider value>
        <LessonVideo src="/lesson.mp4" onEnded={() => {}} />
      </FunnelPreviewContext.Provider>,
    );
    // Give a would-be autoplay effect time to run.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toEqual([]);
  });
});
