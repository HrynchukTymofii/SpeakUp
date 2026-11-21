import { beforeAll, describe, expect, it, vi } from "vitest";

// env.ts parses process.env when it is imported, so the required API URL must exist first.
vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:4000");
let PublicEnvSchema: typeof import("./env").PublicEnvSchema;
beforeAll(async () => {
  ({ PublicEnvSchema } = await import("./env"));
});

const parseVideo = (value: string | undefined) =>
  PublicEnvSchema.parse({
    NEXT_PUBLIC_API_URL: "http://localhost:4000",
    NEXT_PUBLIC_FUNNEL_LESSON_VIDEO_URL: value,
  }).NEXT_PUBLIC_FUNNEL_LESSON_VIDEO_URL;

describe("NEXT_PUBLIC_FUNNEL_LESSON_VIDEO_URL", () => {
  it("has no default: unset or empty means the placeholder is shown", () => {
    // Regression: the default pointed at a bundled file; once it was deleted, an unset variable
    // would have rendered a broken video player.
    expect(parseVideo(undefined)).toBeUndefined();
    expect(parseVideo("")).toBeUndefined();
  });

  it("accepts a full URL (the S3 media bucket)", () => {
    const url = "https://bucket.s3.us-east-1.amazonaws.com/media/funnel-fillers-v1.mp4";
    expect(parseVideo(url)).toBe(url);
  });

  it("accepts a path under public/, and rejects anything else", () => {
    expect(parseVideo("/videos/intro.mp4")).toBe("/videos/intro.mp4");
    expect(() => parseVideo("videos/intro.mp4")).toThrow();
    expect(() => parseVideo("//evil.example/x.mp4")).toThrow();
  });
});

describe("NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APP_URL (domain split)", () => {
  const parseHosts = (site: string | undefined, app: string | undefined) =>
    PublicEnvSchema.parse({
      NEXT_PUBLIC_API_URL: "http://localhost:4000",
      NEXT_PUBLIC_SITE_URL: site,
      NEXT_PUBLIC_APP_URL: app,
    });

  it("is off when both are unset or empty", () => {
    const env = parseHosts("", undefined);
    expect(env.NEXT_PUBLIC_SITE_URL).toBeUndefined();
    expect(env.NEXT_PUBLIC_APP_URL).toBeUndefined();
  });

  it("accepts both as origins", () => {
    const env = parseHosts("https://speakup.fibipals.com", "https://app.speakup.fibipals.com");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://app.speakup.fibipals.com");
  });

  it("rejects only one of them: half a split would redirect into a host that isn't served", () => {
    expect(() => parseHosts("https://speakup.fibipals.com", undefined)).toThrow();
    expect(() => parseHosts(undefined, "https://app.speakup.fibipals.com")).toThrow();
  });

  it("rejects a URL with a path, since links are built from it", () => {
    expect(() =>
      parseHosts("https://speakup.fibipals.com/home", "https://app.speakup.fibipals.com"),
    ).toThrow();
  });
});

describe("NEXT_PUBLIC_AMPLITUDE_API_KEY", () => {
  const parseKey = (value: string | undefined) =>
    PublicEnvSchema.parse({
      NEXT_PUBLIC_API_URL: "http://localhost:4000",
      NEXT_PUBLIC_AMPLITUDE_API_KEY: value,
    }).NEXT_PUBLIC_AMPLITUDE_API_KEY;

  it("is optional: unset or empty turns analytics off", () => {
    expect(parseKey(undefined)).toBeUndefined();
    expect(parseKey("")).toBeUndefined();
    expect(parseKey("abc123")).toBe("abc123");
  });
});
