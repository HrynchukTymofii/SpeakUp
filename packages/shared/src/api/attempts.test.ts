import { describe, expect, it } from "vitest";
import { AudioMimeTypeSchema, CreateAttemptBodySchema } from "./attempts.js";

describe("AudioMimeTypeSchema", () => {
  it.each([
    ["audio/webm;codecs=opus", "audio/webm"],
    ["audio/mp4", "audio/mp4"],
    ["Audio/MP4; codecs=mp4a.40.2", "audio/mp4"],
    ["audio/ogg;codecs=opus", "audio/ogg"],
  ])("%s → %s", (input, expected) => {
    expect(AudioMimeTypeSchema.parse(input)).toBe(expected);
  });

  it.each(["video/webm", "audio/wav", "text/html", ""])("rejects %j", (input) => {
    expect(() => AudioMimeTypeSchema.parse(input)).toThrow();
  });
});

describe("CreateAttemptBodySchema", () => {
  it("rejects unknown fields such as a userId", () => {
    expect(() =>
      CreateAttemptBodySchema.parse({ exerciseId: "ex_1", mimeType: "audio/webm", userId: "x" }),
    ).toThrow();
  });
});
