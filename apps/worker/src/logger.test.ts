import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

describe("worker logger redaction (SPEC §9)", () => {
  it("redacts transcripts, emails and audio URLs but keeps ids", () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const log = createLogger("test", stream);
    log.info(
      {
        attemptId: "att_9",
        transcript: "private words",
        audioUrl: "https://s3/presigned?sig=abc",
        user: { email: "x@example.com" },
      },
      "debug",
    );
    const text = lines.join("");
    expect(text).toContain("att_9");
    expect(text).not.toContain("private words");
    expect(text).not.toContain("presigned");
    expect(text).not.toContain("x@example.com");
  });
});
