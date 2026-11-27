// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { default: FunnelError } = await import("./error");

describe("/f error page", () => {
  it("explains the failure and retries on click", async () => {
    // The error came from a server component (the layout's load): reset() alone only re-renders
    // on the client, so the retry must also ask the server again.
    const reset = vi.fn();
    render(<FunnelError error={new Error("API 503")} reset={reset} />);

    expect(screen.getByRole("heading", { name: /couldn’t load/i })).toBeInTheDocument();
    // Internal details stay out of the page.
    expect(screen.queryByText(/503/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
