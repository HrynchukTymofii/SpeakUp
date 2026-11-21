// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const amplitude = vi.hoisted(() => ({
  init: vi.fn(),
  track: vi.fn(),
  setUserId: vi.fn(),
  reset: vi.fn(),
  identify: vi.fn(),
  Identify: class {
    ops: Array<[string, unknown]> = [];
    set(key: string, value: unknown) {
      this.ops.push([key, value]);
      return this;
    }
  },
}));
vi.mock("@amplitude/analytics-browser", () => amplitude);

// The module keeps "initialized" and the current user in module state: load a fresh copy per test.
async function load() {
  vi.resetModules();
  return import("./analytics");
}

beforeEach(() => vi.clearAllMocks());

describe("analytics without an API key", () => {
  it("never loads Amplitude, so local dev and previews send nothing", async () => {
    const a = await load();
    a.initAnalytics(undefined);
    a.track("paywall_viewed", { placement: "funnel" });
    a.identifyUser("user_123");
    expect(amplitude.init).not.toHaveBeenCalled();
    expect(amplitude.track).not.toHaveBeenCalled();
    expect(amplitude.setUserId).not.toHaveBeenCalled();
  });
});

describe("analytics with an API key", () => {
  it("initializes once, with page views and attribution but no click capture", async () => {
    const a = await load();
    a.initAnalytics("key");
    a.initAnalytics("key");
    expect(amplitude.init).toHaveBeenCalledOnce();
    const [key, options] = amplitude.init.mock.calls[0]!;
    expect(key).toBe("key");
    expect(options.autocapture).toMatchObject({
      pageViews: { trackHistoryChanges: "pathOnly" },
      attribution: true,
      sessions: true,
      elementInteractions: false,
      formInteractions: false,
    });
  });

  it("sends events with their properties, and revenue as Amplitude revenue fields", async () => {
    const a = await load();
    a.initAnalytics("key");
    a.track("funnel_answer", { step: "goal", value: "interviews" });
    a.track("checkout_completed", { placement: "funnel" }, { amount: 9.99, currency: "USD" });
    expect(amplitude.track).toHaveBeenNthCalledWith(
      1,
      "funnel_answer",
      { step: "goal", value: "interviews" },
      undefined,
    );
    expect(amplitude.track).toHaveBeenNthCalledWith(
      2,
      "checkout_completed",
      { placement: "funnel", currency: "USD" },
      { revenue: 9.99, price: 9.99, quantity: 1, revenueType: "subscription" },
    );
  });

  it("ties events to the account id on sign-in and starts a fresh device on sign-out", async () => {
    const a = await load();
    a.initAnalytics("key");
    a.identifyUser(null); // signed out from the start: nothing to forget
    expect(amplitude.reset).not.toHaveBeenCalled();

    a.identifyUser("user_123");
    a.identifyUser("user_123"); // re-renders don't repeat the call
    expect(amplitude.setUserId).toHaveBeenCalledExactlyOnceWith("user_123");

    a.identifyUser(null);
    expect(amplitude.reset).toHaveBeenCalledOnce();
  });

  it("stores funnel answers as user properties, so app usage can be split by goal", async () => {
    const a = await load();
    a.initAnalytics("key");
    a.setUserProperties({ funnel_goal: "interviews", funnel_situations: ["meetings", "calls"] });
    const identify = amplitude.identify.mock.calls[0]![0] as InstanceType<
      typeof amplitude.Identify
    >;
    expect(identify.ops).toEqual([
      ["funnel_goal", "interviews"],
      ["funnel_situations", ["meetings", "calls"]],
    ]);
  });
});
