import { describe, expect, it } from "vitest";
import { AnalyzeJobDataSchema } from "./queue.js";

describe("AnalyzeJobDataSchema", () => {
  it("accepts a payload with an attemptId", () => {
    expect(AnalyzeJobDataSchema.parse({ attemptId: "att_123" })).toEqual({ attemptId: "att_123" });
  });

  it("rejects unknown fields so nothing extra leaks into Redis", () => {
    expect(() => AnalyzeJobDataSchema.parse({ attemptId: "a", transcript: "hi" })).toThrow();
  });

  it("rejects an empty attemptId", () => {
    expect(() => AnalyzeJobDataSchema.parse({ attemptId: "" })).toThrow();
  });
});

describe("AnalyzeJobDataSchema requestId", () => {
  it("accepts an optional request id for log correlation", () => {
    expect(AnalyzeJobDataSchema.parse({ attemptId: "a", requestId: "req-1" })).toEqual({
      attemptId: "a",
      requestId: "req-1",
    });
  });
});
