// @vitest-environment jsdom
import { DEFAULT_FUNNEL_DEFINITION } from "@speakup/shared";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setEventContext } from "./analytics";
import { FunnelProvider } from "./funnel-context";
import { useFunnelStore } from "./store";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL ??= "http://localhost:4000";
});
vi.mock("./analytics", () => ({ setEventContext: vi.fn(), track: vi.fn() }));

afterEach(() => vi.clearAllMocks());

const renderProvider = (testRun?: boolean) =>
  render(
    <FunnelProvider
      slug="spring"
      version={3}
      definition={DEFAULT_FUNNEL_DEFINITION}
      basePath="/f/spring"
      testRun={testRun}
    >
      <p>step</p>
    </FunnelProvider>,
  );

describe("FunnelProvider analytics context", () => {
  it("tags a visitor's events with the funnel only", () => {
    renderProvider();
    expect(setEventContext).toHaveBeenLastCalledWith({ funnel_id: "spring", funnel_version: 3 });
  });

  it("marks an admin's test run, so charts can leave it out", () => {
    renderProvider(true);
    expect(setEventContext).toHaveBeenLastCalledWith({
      funnel_id: "spring",
      funnel_version: 3,
      test_run: true,
    });
  });
});

describe("a test run's saved progress", () => {
  const VISIT = { answers: { goal: "job-interviews" as const }, attemptId: "att_1", claimed: true };

  it("doesn't resume a real visit of the same funnel", () => {
    useFunnelStore.setState({ funnelSlug: "spring", ...VISIT });
    renderProvider(true);
    expect(useFunnelStore.getState()).toMatchObject({
      funnelSlug: "test:spring",
      answers: {},
      attemptId: null,
      claimed: false,
    });
  });

  it("isn't resumed by a real visit afterwards", () => {
    useFunnelStore.setState({ funnelSlug: "test:spring", ...VISIT });
    renderProvider();
    expect(useFunnelStore.getState()).toMatchObject({
      funnelSlug: "spring",
      answers: {},
      attemptId: null,
    });
  });
});
