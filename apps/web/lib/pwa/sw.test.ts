import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

/**
 * `public/sw.js` is plain browser JS (it's served as-is, never bundled), so the test loads its
 * source into a function and hands it fake service-worker globals: `self`, `caches` and `fetch`.
 * What matters is what the worker stores and which requests it answers, so the fakes record that.
 */
const SOURCE = readFileSync(fileURLToPath(new URL("../../public/sw.js", import.meta.url)), "utf8");
const ORIGIN = "https://app.speakup.test";
const abs = (path: string) => new URL(path, ORIGIN).href;

const OFFLINE_HTML = `<!DOCTYPE html><html><head>
<link rel="preload" href="/_next/static/media/manrope-latin.woff2" as="font" crossorigin="" type="font/woff2"/>
<link rel="stylesheet" href="/_next/static/css/app.css" data-precedence="next"/>
<link rel="stylesheet" href="/_next/static/css/route.css?dpl=dpl_123" data-precedence="next"/>
<link rel="stylesheet" href="https://cdn.example.com/other.css"/>
<script src="/_next/static/chunks/main.js" async=""></script>
</head><body><h1>You're offline</h1>
<script>self.__next_f.push([1,"0:[\\"/_next/static/css/app.css\\",\\"/_next/static/chunks/page.js\\"]"])</script>
</body></html>`;

type Req = { url: string; method: string; mode: string };
type Listener = (event: unknown) => void;

function fakeCaches(initial: Record<string, Record<string, string>> = {}) {
  const store = new Map<string, Map<string, Response>>();
  for (const [name, entries] of Object.entries(initial)) {
    store.set(name, new Map(Object.entries(entries).map(([k, v]) => [abs(k), new Response(v)])));
  }
  const keyOf = (request: string | Req) =>
    typeof request === "string" ? abs(request) : request.url;
  const cacheApi = (entries: Map<string, Response>) => ({
    put: async (request: string | Req, response: Response) => {
      entries.set(keyOf(request), response);
    },
    match: async (request: string | Req) => entries.get(keyOf(request))?.clone(),
  });
  return {
    store,
    /** Every URL stored in each cache, for assertions. */
    snapshot: () => Object.fromEntries([...store].map(([name, map]) => [name, [...map.keys()]])),
    api: {
      open: async (name: string) => {
        if (!store.has(name)) store.set(name, new Map());
        return cacheApi(store.get(name)!);
      },
      keys: async () => [...store.keys()],
      delete: async (name: string) => store.delete(name),
      match: async (request: string | Req) => {
        for (const entries of store.values()) {
          const hit = entries.get(keyOf(request));
          if (hit) return hit.clone();
        }
        return undefined;
      },
    },
  };
}

function loadWorker({
  fetch = vi.fn(async () => new Response("network")),
  caches = fakeCaches(),
}: {
  fetch?: ReturnType<typeof vi.fn>;
  caches?: ReturnType<typeof fakeCaches>;
} = {}) {
  const listeners = new Map<string, Listener>();
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
    registration: { navigationPreload: { enable: vi.fn(async () => undefined) } },
  };
  new Function("self", "caches", "fetch", SOURCE)(self, caches.api, fetch);

  /** Fires a lifecycle event and waits for everything passed to `waitUntil`. */
  async function lifecycle(type: "install" | "activate") {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)!({ waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
  }

  /** Fires a fetch event; returns the response the worker answered with, or undefined if it let it through. */
  async function request(
    url: string,
    {
      method = "GET",
      mode = "cors",
      preloadResponse = Promise.resolve<Response | undefined>(undefined),
    }: { method?: string; mode?: string; preloadResponse?: Promise<Response | undefined> } = {},
  ) {
    let answered: Promise<Response> | undefined;
    const event = {
      request: { url: new URL(url, ORIGIN).href, method, mode } satisfies Req,
      preloadResponse,
      respondWith: (p: Promise<Response>) => {
        answered = p;
      },
      waitUntil: () => undefined,
    };
    listeners.get("fetch")!(event);
    return answered ? await answered : undefined;
  }

  return { self, lifecycle, request, caches, fetch };
}

/** A fetch that serves the offline page and its assets, and fails for everything else. */
function offlineSiteFetch() {
  return vi.fn(async (input: string | Req) => {
    const url = typeof input === "string" ? abs(input) : input.url;
    if (url === abs("/offline")) return new Response(OFFLINE_HTML, { status: 200 });
    if (url.startsWith(abs("/_next/static/"))) return new Response(`asset ${url}`);
    throw new TypeError("Failed to fetch");
  });
}

const CACHE = "speakup-offline-v1";

describe("service worker (public/sw.js)", () => {
  it("precaches /offline and only the CSS and fonts it references", async () => {
    const fetch = offlineSiteFetch();
    const worker = loadWorker({ fetch });

    await worker.lifecycle("install");

    expect(fetch).toHaveBeenCalledWith("/offline", { cache: "reload", credentials: "omit" });
    expect(worker.caches.snapshot()).toEqual({
      [CACHE]: expect.arrayContaining([
        abs("/offline"),
        abs("/_next/static/css/app.css"),
        abs("/_next/static/css/route.css?dpl=dpl_123"),
        abs("/_next/static/media/manrope-latin.woff2"),
      ]),
    });
    expect(worker.caches.snapshot()[CACHE]).toHaveLength(4); // no JS, nothing cross-origin
    expect(worker.self.skipWaiting).toHaveBeenCalled();
  });

  it("fails the install when the offline page can't be fetched", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 500 }));
    const worker = loadWorker({ fetch });

    await expect(worker.lifecycle("install")).rejects.toThrow();
    expect(worker.caches.snapshot()[CACHE] ?? []).toEqual([]);
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it("fails the install when /offline was redirected", async () => {
    // e.g. a Vercel preview's deployment protection sends the credential-less fetch to a login
    // page: that page must not be cached as the offline screen.
    const fetch = vi.fn(async () => {
      const response = new Response("<html>Log in</html>", { status: 200 });
      Object.defineProperty(response, "redirected", { value: true });
      return response;
    });
    const worker = loadWorker({ fetch });

    await expect(worker.lifecycle("install")).rejects.toThrow();
    expect(worker.caches.snapshot()[CACHE] ?? []).toEqual([]);
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it("serves navigations from the network and never stores them", async () => {
    const fetch = offlineSiteFetch();
    fetch.mockImplementation(async (input: string | Req) =>
      typeof input !== "string" && input.url === abs("/app/practice")
        ? new Response("practice page")
        : offlineSiteFetch()(input),
    );
    const worker = loadWorker({ fetch });
    await worker.lifecycle("install");
    const before = worker.caches.snapshot();

    const response = await worker.request("/app/practice", { mode: "navigate" });

    expect(await response?.text()).toBe("practice page");
    expect(worker.caches.snapshot()).toEqual(before);
  });

  it("uses the navigation preload response when the browser made one", async () => {
    const fetch = offlineSiteFetch();
    const worker = loadWorker({ fetch });
    await worker.lifecycle("install");
    fetch.mockClear();
    const before = worker.caches.snapshot();

    const response = await worker.request("/app", {
      mode: "navigate",
      preloadResponse: Promise.resolve(new Response("preloaded")),
    });

    expect(await response?.text()).toBe("preloaded");
    expect(fetch).not.toHaveBeenCalled();
    expect(worker.caches.snapshot()).toEqual(before);
  });

  it("falls back to the offline page when a navigation fails", async () => {
    const worker = loadWorker({ fetch: offlineSiteFetch() });
    await worker.lifecycle("install");

    const response = await worker.request("/app/practice", { mode: "navigate" });

    expect(await response?.text()).toBe(OFFLINE_HTML);
  });

  it("shows a server error page as is instead of the offline page", async () => {
    const fetch = offlineSiteFetch();
    const worker = loadWorker({ fetch });
    await worker.lifecycle("install");
    fetch.mockImplementation(async () => new Response("server error", { status: 500 }));

    const response = await worker.request("/app", { mode: "navigate" });

    expect(response?.status).toBe(500);
    expect(await response?.text()).toBe("server error");
  });

  it("leaves API and Clerk requests alone", async () => {
    const fetch = offlineSiteFetch();
    const worker = loadWorker({ fetch });
    await worker.lifecycle("install");
    fetch.mockClear();

    // Cross-origin: the API, Clerk's frontend API, Paddle, Amplitude, Turnstile.
    expect(await worker.request("https://api.speakup.test/v1/me")).toBeUndefined();
    expect(await worker.request("https://clerk.speakup.test/v1/client")).toBeUndefined();
    expect(
      await worker.request("https://checkout.paddle.com/", { mode: "navigate" }),
    ).toBeUndefined();
    // Clerk's same-origin proxy and handshake.
    expect(await worker.request("/__clerk/v1/client")).toBeUndefined();
    expect(
      await worker.request("/__clerk/v1/client/handshake", { mode: "navigate" }),
    ).toBeUndefined();
    // Anything that isn't a GET, even same-origin.
    expect(await worker.request("/app", { method: "POST", mode: "navigate" })).toBeUndefined();
    expect(await worker.request("/_next/static/css/app.css", { method: "POST" })).toBeUndefined();
    // Same-origin non-navigation, non-static requests (RSC payloads, route handlers, images).
    expect(await worker.request("/app?_rsc=abc")).toBeUndefined();
    expect(await worker.request("/icons/icon-192.png")).toBeUndefined();

    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves precached static assets from the cache", async () => {
    const fetch = offlineSiteFetch();
    const worker = loadWorker({ fetch });
    await worker.lifecycle("install");
    fetch.mockClear();

    const cached = await worker.request("/_next/static/css/app.css");
    expect(await cached?.text()).toBe(`asset ${abs("/_next/static/css/app.css")}`);
    expect(fetch).not.toHaveBeenCalled();

    // Other static files go to the network and are not stored.
    const before = worker.caches.snapshot();
    const chunk = await worker.request("/_next/static/chunks/main.js");
    expect(await chunk?.text()).toBe(`asset ${abs("/_next/static/chunks/main.js")}`);
    expect(worker.caches.snapshot()).toEqual(before);
  });

  it("deletes old caches on activate and takes control", async () => {
    const caches = fakeCaches({
      "speakup-offline-v0": { "/offline": "old" },
      [CACHE]: { "/offline": "current" },
      "someone-elses-cache": { "/x": "keep" },
    });
    const worker = loadWorker({ caches });

    await worker.lifecycle("activate");

    expect(Object.keys(caches.snapshot()).sort()).toEqual(["someone-elses-cache", CACHE]);
    expect(worker.self.registration.navigationPreload.enable).toHaveBeenCalled();
    expect(worker.self.clients.claim).toHaveBeenCalled();
  });
});
