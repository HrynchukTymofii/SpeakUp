/*
 * SpeakUp service worker. Hand-written and served as-is from /sw.js (scope "/").
 *
 * Its only job is the offline screen: SpeakUp is online-only (recording and analysis need the
 * server), so instead of the browser's "no internet" page an installed app shows /offline.
 *
 * Safety rules (tested in lib/pwa/sw.test.ts):
 * - Navigations always go to the network and are never stored, so a signed-in page can't go stale
 *   or leak to the next person who uses the device.
 * - Cross-origin requests (the API, Clerk, Paddle, Amplitude, Turnstile), non-GET requests and
 *   Clerk's same-origin /__clerk/* routes are never intercepted.
 * - Only /offline and the CSS and font files it references are cached, once, at install.
 *
 * Changing the offline page or its styles? Bump CACHE so installed apps fetch the new version.
 */
const CACHE = "speakup-offline-v1";
const CACHE_PREFIX = "speakup-";
const OFFLINE_PATH = "/offline";
// The hashed CSS and font files the offline page links to. Scripts are left out on purpose: the
// page works without JS, and a cached old bundle could run against a newer server. A query string
// (e.g. Vercel's `?dpl=` deployment id) is kept, because the browser requests the file with it.
const STATIC_ASSET =
  /\/_next\/static\/[^"'\s\\()<>?#]+\.(?:css|woff2)(?:\?[^"'\s\\()<>#]*)?(?=["'\s\\)#])/g;

const sameOriginUrl = (path) => new URL(path, self.location.origin).href;

async function precacheOfflinePage() {
  // `reload` skips the HTTP cache; `omit` keeps cookies off, so the page is the signed-out build.
  const response = await fetch(OFFLINE_PATH, { cache: "reload", credentials: "omit" });
  if (!response.ok || response.redirected) {
    throw new Error(`Offline page not cached: ${response.status}`);
  }
  const html = await response.clone().text();
  const assets = [
    ...new Set((html.match(STATIC_ASSET) ?? []).map((url) => url.replaceAll("&amp;", "&"))),
  ];
  const assetResponses = await Promise.all(
    assets.map(async (path) => {
      const asset = await fetch(path);
      if (!asset.ok) throw new Error(`Offline asset not cached: ${path} ${asset.status}`);
      return [path, asset];
    }),
  );
  // Store only once everything has downloaded, so a failed install leaves no half-filled cache.
  const cache = await caches.open(CACHE);
  await Promise.all(assetResponses.map(([path, asset]) => cache.put(sameOriginUrl(path), asset)));
  await cache.put(sameOriginUrl(OFFLINE_PATH), response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheOfflinePage().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      // Lets the browser start navigation requests while the worker boots (no added latency).
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

async function navigate(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    // Only a network failure lands here; server errors (4xx/5xx) are shown as they are.
    const cache = await caches.open(CACHE);
    return (await cache.match(sameOriginUrl(OFFLINE_PATH))) ?? Response.error();
  }
}

async function staticAsset(request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request)) ?? fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/__clerk/")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigate(event));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticAsset(request));
  }
  // Everything else (RSC payloads, route handlers, images) goes to the network untouched.
});
