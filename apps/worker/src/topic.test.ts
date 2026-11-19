import { describe, expect, it } from "vitest";
import { withTopic } from "./topic.js";

describe("withTopic", () => {
  const speak = { type: "free_speech" as const, prompt: "Talk for a minute.", referenceText: null };
  const read = { type: "read_aloud" as const, prompt: "Read it.", referenceText: "Default." };

  it("leaves exercises without a topic unchanged", () => {
    expect(withTopic(speak, null)).toEqual(speak);
  });

  it("adds the topic to a free-speech prompt", () => {
    expect(withTopic(speak, "Your first job").prompt).toBe(
      "Talk for a minute.\nTopic: Your first job",
    );
  });

  it("makes the topic the reference text of a read-aloud (tongue twisters)", () => {
    expect(withTopic(read, "Toy boat.")).toEqual({ ...read, referenceText: "Toy boat." });
  });
});
