import { describe, expect, it } from "vitest";
import { installHref, parseInstallParams } from "./install-href";

const params = (query: string) => new URLSearchParams(query);

describe("installHref", () => {
  it("links to /install with where it came from and the app as the next page", () => {
    expect(installHref("landing")).toBe("/install?from=landing&next=%2Fapp");
  });

  it("carries a custom next page", () => {
    expect(installHref("purchase", "/app/billing")).toBe(
      "/install?from=purchase&next=%2Fapp%2Fbilling",
    );
  });
});

describe("parseInstallParams", () => {
  it("reads from and next from the query", () => {
    expect(parseInstallParams(params("from=funnel&next=/app/practice"))).toEqual({
      from: "funnel",
      next: "/app/practice",
    });
  });

  it("round-trips installHref", () => {
    const href = new URL(installHref("purchase", "/app/billing?tab=plan"), "https://app.test");
    expect(href.pathname).toBe("/install");
    expect(parseInstallParams(href.searchParams)).toEqual({
      from: "purchase",
      next: "/app/billing?tab=plan",
    });
  });

  it("defaults from to direct", () => {
    expect(parseInstallParams(params("")).from).toBe("direct");
    expect(parseInstallParams(params("from=newsletter")).from).toBe("direct");
  });

  it("defaults next to the app", () => {
    expect(parseInstallParams(params("from=landing")).next).toBe("/app");
  });

  it.each([
    "https://evil.example/app",
    "//evil.example/app",
    "/\\evil.example",
    // Browsers drop tabs and newlines from URLs, which would turn this into "//evil.example".
    "/\t/evil.example",
    "javascript:alert(1)",
    "app",
    "",
  ])("rejects external and protocol-relative next URLs (%s)", (next) => {
    const query = new URLSearchParams({ from: "landing", next });
    expect(parseInstallParams(query).next).toBe("/app");
  });
});
