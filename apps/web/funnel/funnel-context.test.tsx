// @vitest-environment jsdom
import { DEFAULT_FUNNEL_DEFINITION } from "@speakup/shared";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setEventContext } from "./analytics";
import { FunnelProvider } from "./funnel-context";

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
