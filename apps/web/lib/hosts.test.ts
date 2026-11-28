import { describe, expect, it } from "vitest";
import { hrefOn, routeForHost, type HostConfig } from "./hosts";

const config: HostConfig = {
  siteUrl: "https://speakup.fibipals.com",
  appUrl: "https://app.speakup.fibipals.com",
};
const SITE = "speakup.fibipals.com";
const APP = "app.speakup.fibipals.com";

const route = (host: string | null, pathname: string, search = "") =>
  routeForHost({ host, pathname, search }, config);

describe("routeForHost on the marketing host", () => {
  it.each([
    "/start",
    "/start/goal",
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/app",
    "/app/lessons/x",
    "/results/abc",
    "/pricing",
  ])("sends product route %s to the app host, keeping path and query", (path) => {
    expect(route(SITE, path, "?redirect_url=%2Fapp")).toEqual({
      kind: "redirect",
      url: `https://app.speakup.fibipals.com${path}?redirect_url=%2Fapp`,
      status: 308,
    });
  });

  it.each(["/", "/privacy", "/terms", "/refund"])("serves marketing route %s", (path) => {
    expect(route(SITE, path)).toEqual({ kind: "next", noindex: false });
  });

  it("matches whole path segments only (/apple is not /app)", () => {
    expect(route(SITE, "/apple")).toEqual({ kind: "next", noindex: false });
    expect(route(SITE, "/starter")).toEqual({ kind: "next", noindex: false });
  });

  it("/f/main?utm_source=x on the site host redirects to the app host, keeping the query", () => {
    // Ad links point at /f/<slug>; the UTM tags must survive the hop for first-touch attribution.
    expect(route(SITE, "/f/main/goal", "?utm_source=x&utm_campaign=spring")).toEqual({
      kind: "redirect",
      url: "https://app.speakup.fibipals.com/f/main/goal?utm_source=x&utm_campaign=spring",
      status: 308,
    });
    expect(route(SITE, "/f/main", "?utm_source=x")).toEqual({
      kind: "redirect",
      url: "https://app.speakup.fibipals.com/f/main?utm_source=x",
      status: 308,
    });
    // Whole segments only: a marketing page named /faq stays on the site.
    expect(route(SITE, "/faq")).toEqual({ kind: "next", noindex: false });
  });

  it("leaves Clerk's and Next's internal paths alone", () => {
    expect(route(SITE, "/__clerk/v1/client")).toEqual({ kind: "next", noindex: false });
  });
});

describe("routeForHost on the app host", () => {
  it("sends the bare root to the dashboard", () => {
    expect(route(APP, "/")).toEqual({
      kind: "redirect",
      url: "https://app.speakup.fibipals.com/app",
      status: 307,
    });
  });

  it.each(["/privacy", "/terms", "/refund"])("sends %s to the marketing host", (path) => {
    expect(route(APP, path)).toEqual({
      kind: "redirect",
      url: `https://speakup.fibipals.com${path}`,
      status: 308,
    });
  });

  it("serves product routes and marks them noindex", () => {
    expect(route(APP, "/start/goal")).toEqual({ kind: "next", noindex: true });
    expect(route(APP, "/app")).toEqual({ kind: "next", noindex: true });
  });

  it("ignores the port and letter case of the Host header", () => {
    expect(route("APP.speakup.fibipals.com:443", "/app")).toEqual({ kind: "next", noindex: true });
  });
});

describe("routeForHost with ports in the configured URLs (local testing)", () => {
  it("matches hosts by name, so http://localhost:3000 works as a site URL", () => {
    const local = { siteUrl: "http://localhost:3000", appUrl: "http://127.0.0.1:3000" };
    expect(routeForHost({ host: "localhost:3000", pathname: "/start", search: "" }, local)).toEqual(
      { kind: "redirect", url: "http://127.0.0.1:3000/start", status: 308 },
    );
  });
});

describe("routeForHost without a split", () => {
  it("does nothing when the hosts are not configured (local dev, previews)", () => {
    expect(routeForHost({ host: "localhost:3000", pathname: "/start", search: "" }, {})).toEqual({
      kind: "next",
      noindex: false,
    });
  });

  it("does nothing on other hosts, e.g. a Vercel preview URL", () => {
    expect(route("speakup-git-x.vercel.app", "/start")).toEqual({ kind: "next", noindex: false });
    expect(route(null, "/start")).toEqual({ kind: "next", noindex: false });
  });
});

describe("hrefOn", () => {
  it("builds an absolute URL when that host is configured", () => {
    expect(hrefOn(config.appUrl, "/start")).toBe("https://app.speakup.fibipals.com/start");
  });

  it("falls back to a relative path when it is not (one host serves everything)", () => {
    expect(hrefOn(undefined, "/start")).toBe("/start");
  });
});
