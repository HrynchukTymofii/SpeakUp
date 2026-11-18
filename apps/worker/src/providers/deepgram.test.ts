import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeepgramStt } from "./deepgram.js";

const okBody = {
  metadata: { duration: 7.5 },
  results: {
    channels: [
      {
        alternatives: [
          {
            transcript: "Um, hello there.",
            words: [
              { word: "um", start: 0.1, end: 0.3, confidence: 0.9, punctuated_word: "Um," },
              { word: "hello", start: 0.5, end: 0.9, confidence: 0.98, punctuated_word: "hello" },
              { word: "there", start: 1, end: 1.3, confidence: 0.97 },
            ],
          },
        ],
      },
    ],
  },
};

function mockFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("Deepgram STT", () => {
  it("sends the audio URL with filler words on, and normalizes the result", async () => {
    const fetchMock = mockFetch(Response.json(okBody));
    const result = await createDeepgramStt("dg-key").transcribe("https://s3/audio?sig");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("model=nova-3");
    expect(url).toContain("filler_words=true");
    expect(url).not.toContain("smart_format");
    expect(init.headers).toMatchObject({ Authorization: "Token dg-key" });
    expect(JSON.parse(init.body as string)).toEqual({ url: "https://s3/audio?sig" });

    expect(result.durationSec).toBe(7.5);
    expect(result.words[0]).toEqual({
      word: "um",
      punctuated: "Um,",
      start: 0.1,
      end: 0.3,
      confidence: 0.9,
    });
    expect(result.words[2]?.punctuated).toBe("there"); // falls back to the raw word
  });

  it("5xx and 429 are retryable", async () => {
    mockFetch(new Response("busy", { status: 503 }));
    await expect(createDeepgramStt("k").transcribe("u")).rejects.toMatchObject({
      code: "STT_FAILED",
      retryable: true,
    });
    mockFetch(new Response("slow down", { status: 429 }));
    await expect(createDeepgramStt("k").transcribe("u")).rejects.toMatchObject({ retryable: true });
  });

  it("other 4xx (bad key, unreadable audio) are not retryable", async () => {
    mockFetch(new Response("unauthorized", { status: 401 }));
    await expect(createDeepgramStt("k").transcribe("u")).rejects.toMatchObject({
      retryable: false,
    });
  });

  it("network errors are retryable", async () => {
    mockFetch(new TypeError("fetch failed"));
    await expect(createDeepgramStt("k").transcribe("u")).rejects.toMatchObject({ retryable: true });
  });

  it("rejects an unexpected response shape", async () => {
    mockFetch(Response.json({ results: {} }));
    await expect(createDeepgramStt("k").transcribe("u")).rejects.toMatchObject({
      code: "STT_FAILED",
      retryable: false,
    });
  });
});
