/**
 * The web app is one Next.js project served on two hosts:
 *   - the marketing site (landing, legal pages)    → NEXT_PUBLIC_SITE_URL, e.g. speakup.fibipals.com
 *   - the product (funnel, auth, dashboard, billing) → NEXT_PUBLIC_APP_URL,  e.g. app.speakup.fibipals.com
 * proxy.ts calls `routeForHost` on every request and redirects a route that was asked for on the
 * wrong host. With neither URL configured (local dev, Vercel previews) one host serves everything,
 * so the split can be switched on in production without touching any other environment.
 */
export interface HostConfig {
  siteUrl?: string;
  appUrl?: string;
}

export type HostDecision =
  { kind: "next"; noindex: boolean } | { kind: "redirect"; url: string; status: 307 | 308 };

/**
 * Routes that belong to the product. Prefix match on whole path segments.
 * `/install` and `/offline` are pages of the installable app, so they must live on the app origin
 * the manifest and service worker belong to. The PWA's static assets (`/sw.js`,
 * `/speakup.webmanifest`, `/icons/*`) never reach `routeForHost`: the proxy matcher skips static
 * file extensions, so both hosts serve them as they are.
 */
const APP_ROUTES = [
  "/start",
  "/sign-in",
  "/sign-up",
  "/app",
  "/results",
  "/pricing",
  "/install",
  "/offline",
];
/** Routes that belong to the marketing site ("/" is handled separately). */
const SITE_ROUTES = ["/privacy", "/terms", "/refund"];

const matches = (pathname: string, routes: string[]) =>
  routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

/** Hosts are compared by name only: "APP.example.com:443" → "app.example.com". */
const normalizeHost = (host: string) => host.toLowerCase().replace(/:\d+$/, "");
const hostOf = (url: string) => new URL(url).hostname.toLowerCase();

export function routeForHost(
  request: { host: string | null; pathname: string; search: string },
  config: HostConfig,
): HostDecision {
  const { siteUrl, appUrl } = config;
  if (!siteUrl || !appUrl || !request.host) return { kind: "next", noindex: false };

  const host = normalizeHost(request.host);
  const { pathname, search } = request;

  if (host === hostOf(siteUrl)) {
    if (matches(pathname, APP_ROUTES)) {
      // 308: these routes moved for good; search engines and old links follow it.
      return { kind: "redirect", url: hrefOn(appUrl, pathname + search), status: 308 };
    }
    return { kind: "next", noindex: false };
  }

  if (host === hostOf(appUrl)) {
    if (pathname === "/") {
      // 307: what the app's front door shows is a product choice that may change.
      return { kind: "redirect", url: hrefOn(appUrl, "/app"), status: 307 };
    }
    if (matches(pathname, SITE_ROUTES)) {
      return { kind: "redirect", url: hrefOn(siteUrl, pathname + search), status: 308 };
    }
    // Only the marketing site should show up in search results.
    return { kind: "next", noindex: true };
  }

  return { kind: "next", noindex: false };
}

/**
 * A link to `path` on the given host: absolute when the host is configured, otherwise relative
 * (one host serves everything). Use it for every link that crosses between site and app.
 */
export function hrefOn(baseUrl: string | undefined, path: string): string {
  return baseUrl ? new URL(path, baseUrl).toString() : path;
}
