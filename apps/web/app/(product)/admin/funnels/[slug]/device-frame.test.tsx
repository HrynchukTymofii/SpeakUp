// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEVICES, DeviceFrame } from "./device-frame";

/** The scroll container: the element marked with the device it draws. */
function viewport(container: HTMLElement) {
  const el = container.querySelector<HTMLElement>("[data-device]");
  if (!el) throw new Error("no viewport");
  return el;
}

describe("DeviceFrame", () => {
  it("gives the phone a 390 px wide viewport", () => {
    const { container } = render(<DeviceFrame device="phone">screen</DeviceFrame>);
    const el = viewport(container);
    expect(el).toHaveAttribute("data-device", "phone");
    expect(DEVICES.phone.width).toBe(390);
    expect(el.className).toContain(`sm:w-[${DEVICES.phone.width}px]`);
  });

  it("draws a browser bar with the address for the web", () => {
    const { container } = render(
      <DeviceFrame device="web" address="/f/spring">
        page
      </DeviceFrame>,
    );
    expect(viewport(container)).toHaveAttribute("data-device", "web");
    expect(screen.getByText("/f/spring")).toBeInTheDocument();
    expect(container.querySelector("[data-testid='browser-bar']")).not.toBeNull();
  });

  it("renders the children inside the viewport", () => {
    const { container } = render(
      <DeviceFrame device="phone">
        <p>Hello visitor</p>
      </DeviceFrame>,
    );
    expect(viewport(container)).toContainElement(screen.getByText("Hello visitor"));
  });

  it("scrolls back to the top when scrollResetKey changes", () => {
    const { container, rerender } = render(
      <DeviceFrame device="phone" scrollResetKey="/a">
        screen
      </DeviceFrame>,
    );
    const el = viewport(container);
    el.scrollTop = 200;
    rerender(
      <DeviceFrame device="phone" scrollResetKey="/b">
        screen
      </DeviceFrame>,
    );
    expect(el.scrollTop).toBe(0);
  });

  it("hides the frame decorations from screen readers", () => {
    const { container } = render(
      <DeviceFrame device="web" address="/f/spring">
        page
      </DeviceFrame>,
    );
    expect(container.querySelector("[data-testid='browser-bar']")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
