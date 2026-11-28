// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaSetup } from "./pwa-setup";

const register = vi.fn(() => Promise.resolve({}));

function stubServiceWorker() {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register },
  });
}

describe("PwaSetup", () => {
  beforeEach(() => {
    register.mockClear();
    vi.stubGlobal("isSecureContext", true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    // jsdom has no service worker support; remove the stub so tests stay independent.
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it("registers /sw.js with scope / in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    stubServiceWorker();
    const { container } = render(<PwaSetup />);
    expect(container).toBeEmptyDOMElement();
    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("does nothing in development or without serviceWorker support", () => {
    vi.stubEnv("NODE_ENV", "development");
    stubServiceWorker();
    render(<PwaSetup />);
    expect(register).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "production");
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    render(<PwaSetup />);
    expect(register).not.toHaveBeenCalled();
  });

  it("does nothing outside a secure context", () => {
    vi.stubEnv("NODE_ENV", "production");
    stubServiceWorker();
    vi.stubGlobal("isSecureContext", false);
    render(<PwaSetup />);
    expect(register).not.toHaveBeenCalled();
  });
});
