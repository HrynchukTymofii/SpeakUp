"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type Device = "phone" | "web";

/**
 * The viewports a preview draws, in CSS pixels. Phone: iPhone 12–16, the most common size.
 * Web: a common laptop window; the frame fills its column up to this width.
 */
export const DEVICES = {
  phone: { width: 390, height: 844 },
  web: { width: 1280, height: 800 },
} as const satisfies Record<Device, { width: number; height: number }>;

/*
 * Frame heights fit the browser window: 7rem leaves room for the admin header (3.5rem) and the
 * page's margins, then the phone bezel (2 × 12 px) or the window bar (2.5rem) comes off too.
 * Tailwind needs these as whole literal class names, so they repeat DEVICES' numbers.
 */
const VIEWPORT = {
  phone: "sm:w-[390px] sm:h-[min(844px,calc(100dvh_-_7rem_-_24px))] sm:rounded-[40px]",
  web: "sm:w-full sm:h-[min(800px,calc(100dvh_-_7rem_-_2.5rem))]",
} as const satisfies Record<Device, string>;

/**
 * The chrome around a funnel preview: a phone (black bezel, 390 px screen) or a desktop browser
 * window (bar with an address pill, up to 1280 px wide). It knows nothing about funnels and never
 * scales; callers that need a smaller picture scale the whole frame.
 *
 * The viewport is the scroll container, and `translateZ(0)` makes it the containing block for
 * `position: fixed` children (the loader's question sheet, sticky Continue), so they stay inside
 * the frame instead of covering the admin page.
 *
 * Below `sm` there is no room for chrome: the content goes full-bleed and scrolls with the page,
 * like the real funnel on a phone. All of this is CSS (`sm:` utilities), so the server and the
 * first client render agree.
 */
export function DeviceFrame({
  device,
  address,
  scrollResetKey,
  children,
}: {
  device: Device;
  /** Shown in the web frame's address pill, e.g. `/f/spring`. */
  address?: string;
  /** When this changes (a new screen), the viewport scrolls back to the top, like a page load. */
  scrollResetKey?: string;
  children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = 0;
  }, [scrollResetKey]);

  const isPhone = device === "phone";
  return (
    <div
      className={
        isPhone
          ? "sm:mx-auto sm:w-fit sm:rounded-[52px] sm:bg-ink sm:p-3 sm:shadow-soft"
          : "sm:mx-auto sm:w-full sm:max-w-[1280px] sm:overflow-hidden sm:rounded-3xl sm:border sm:border-line sm:bg-card sm:shadow-soft"
      }
    >
      {!isPhone && (
        <div
          aria-hidden="true"
          data-testid="browser-bar"
          className="hidden h-10 items-center gap-3 border-b border-line bg-card-2 px-4 sm:flex"
        >
          <span className="flex shrink-0 gap-1.5">
            <span className="size-3 rounded-full bg-line-2" />
            <span className="size-3 rounded-full bg-line-2" />
            <span className="size-3 rounded-full bg-line-2" />
          </span>
          {address !== undefined && (
            <span className="mx-auto max-w-md min-w-0 truncate rounded-full bg-page px-4 py-1 text-xs font-semibold text-muted">
              {address}
            </span>
          )}
        </div>
      )}
      <div
        ref={viewport}
        data-device={device}
        className={`flex flex-col bg-page text-ink sm:overflow-x-hidden sm:overflow-y-auto sm:[transform:translateZ(0)] ${VIEWPORT[device]}`}
      >
        {children}
      </div>
    </div>
  );
}
