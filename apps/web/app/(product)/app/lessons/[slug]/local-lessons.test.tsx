// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { findLocalLesson } from "@/learn/catalog";
import { LocalLessonView } from "./local-lessons";

const lesson = (slug: string) => {
  const found = findLocalLesson(slug);
  if (!found) throw new Error(`no local lesson ${slug}`);
  return found;
};

const doneSlugs = () => JSON.parse(localStorage.getItem("speakup.local-done") ?? "[]") as string[];

beforeEach(() => localStorage.clear());

describe("LocalLessonView", () => {
  it("body-language tips: steps through every tip, then marks the lesson done", async () => {
    const user = userEvent.setup();
    render(<LocalLessonView lesson={lesson("body-language")} />);
    expect(screen.getByText("Tip 1 of 4")).toBeInTheDocument();
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole("button", { name: "Next tip" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(screen.getByRole("heading", { name: "Done!" })).toBeInTheDocument();
    expect(doneSlugs()).toEqual(["body-language"]);
  });

  it("“Yes!” button: each press shows the next phrase and counts", async () => {
    const user = userEvent.setup();
    render(<LocalLessonView lesson={lesson("yes-button")} />);
    expect(screen.getByText("0 / 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "YES!" }));
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByText(/Finally — my turn!/)).toBeInTheDocument();
  });

  it("square breathing: can be finished early and is remembered", async () => {
    const user = userEvent.setup();
    render(<LocalLessonView lesson={lesson("square-breathing")} />);
    await user.click(screen.getByRole("button", { name: /Start/ }));
    expect(screen.getByText("Breathe in")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /finish now/ }));
    expect(doneSlugs()).toEqual(["square-breathing"]);
  });
});
