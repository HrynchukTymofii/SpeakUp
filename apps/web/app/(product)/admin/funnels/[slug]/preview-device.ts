"use client";

import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";
import type { Device } from "./device-frame";

/*
 * The device a funnel preview draws (phone or desktop), remembered in this browser so the test
 * run and the editor preview open the way the admin last left them. A convenience, not a record:
 * storage can be blocked or cleared, so every access is wrapped and falls back to the phone.
 */

const KEY = "speakup.funnel-preview-device";
const EVENT = "speakup:funnel-preview-device";
const DEFAULT: Device = "phone";
const deviceSchema = z.enum(["phone", "web"]);
// Used when storage throws (blocked site data), so the switch still works on this page.
let unsaved: Device = DEFAULT;

function read(): Device {
  try {
    const parsed = deviceSchema.safeParse(window.localStorage.getItem(KEY));
    return parsed.success ? parsed.data : DEFAULT;
  } catch {
    return unsaved;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The remembered preview device and a setter. The server snapshot is the phone, so the server
 * render and hydration agree; the stored choice applies right after.
 */
export function useFunnelPreviewDevice(): [Device, (device: Device) => void] {
  const device = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const setDevice = useCallback((next: Device) => {
    unsaved = next;
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Storage blocked: `unsaved` keeps the choice for this page; it just isn't remembered.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [device, setDevice];
}
