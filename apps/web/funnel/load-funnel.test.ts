import {
  DEFAULT_FUNNEL_DEFINITION,
  DEFAULT_FUNNEL_REVISION,
  type FunnelDefinition,
} from "@speakup/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFunnel } from "./load-funnel";

// `lib/env` validates the public env at import; the loader builds its URL from the API URL.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
});

/** A one-step funnel: valid, and clearly not the bundled default. */
const ADS_DEFINITION: FunnelDefinition = {
  version: 1,
  steps: DEFAULT_FUNNEL_DEFINITION.steps.slice(0, 1),
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const fetchReturning = (response: Response | Error) =>
  vi.fn<typeof fetch>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );

const bundledMain = {
  kind: "ok",
  funnel: { slug: "main", version: DEFAULT_FUNNEL_REVISION, definition: DEFAULT_FUNNEL_DEFINITION },
};

afterEach(() => vi.restoreAllMocks());

describe("loadFunnel", () => {
  it("returns the API definition for a live slug", async () => {
    const fetchImpl = fetchReturning(
      json(200, { funnel: { slug: "ads-tiktok", version: 3, definition: ADS_DEFINITION } }),
    );

    const result = await loadFunnel("ads-tiktok", fetchImpl);

    expect(result).toEqual({
      kind: "ok",
      funnel: { slug: "ads-tiktok", version: 3, definition: ADS_DEFINITION },
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://api.test/v1/funnels/ads-tiktok");
    // Cached for a minute by Next, and never left hanging when the API is slow.
    expect(init).toMatchObject({ next: { revalidate: 60 } });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["the API is down", new TypeError("fetch failed")],
    ["the request times out", new DOMException("The operation timed out.", "TimeoutError")],
    ["the API answers 404", json(404, { error: { code: "NOT_FOUND" } })],
    ["the API answers 500", json(500, { error: { code: "INTERNAL" } })],
    [
      "the definition is invalid",
      json(200, { funnel: { slug: "main", version: 2, definition: {} } }),
    ],
  ])("main falls back to the bundled definition when %s", async (_case, response) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await loadFunnel("main", fetchReturning(response))).toEqual(bundledMain);
  });

  it("other slugs: 404 → not_found, 5xx → throws", async () => {
    expect(await loadFunnel("ads-tiktok", fetchReturning(json(404, {})))).toEqual({
      kind: "not_found",
    });
    await expect(loadFunnel("ads-tiktok", fetchReturning(json(503, {})))).rejects.toThrow();
    await expect(
      loadFunnel("ads-tiktok", fetchReturning(new TypeError("fetch failed"))),
    ).rejects.toThrow();
  });

  it.each(["Main", "a b", "../admin", "x".repeat(65)])(
    "an invalid slug (%s) never hits the network",
    async (slug) => {
      const fetchImpl = fetchReturning(json(200, {}));

      expect(await loadFunnel(slug, fetchImpl)).toEqual({ kind: "not_found" });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("rejects a response whose definition fails FunnelDefinitionSchema", async () => {
    const fetchImpl = fetchReturning(
      json(200, {
        funnel: { slug: "ads-tiktok", version: 1, definition: { version: 1, steps: [] } },
      }),
    );

    await expect(loadFunnel("ads-tiktok", fetchImpl)).rejects.toThrow();
  });
});
