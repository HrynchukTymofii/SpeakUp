"use client";

import { initializePaddle, type Paddle, type PaddleEventData } from "@paddle/paddle-js";
import { publicEnv } from "./env";

/**
 * Paddle.js (the checkout overlay) as a lazy singleton: it may only be initialized once per page,
 * and it's loaded only when a pricing UI actually mounts.
 *
 * Paddle.js takes one global `eventCallback`; we fan its events out to whoever is listening
 * (the upgrade button listens for `checkout.completed`).
 */
type Listener = (event: PaddleEventData) => void;
const listeners = new Set<Listener>();
let paddlePromise: Promise<Paddle | null> | null = null;

export function paddleConfigured(): boolean {
  return Boolean(publicEnv.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN);
}

export function getPaddle(): Promise<Paddle | null> {
  const token = publicEnv.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  if (!token) return Promise.resolve(null);
  paddlePromise ??= initializePaddle({
    environment: publicEnv.NEXT_PUBLIC_PADDLE_ENV,
    token,
    eventCallback: (event) => listeners.forEach((listener) => listener(event)),
  })
    .then((paddle) => paddle ?? null)
    .catch(() => {
      paddlePromise = null; // allow a retry on the next call
      return null;
    });
  return paddlePromise;
}

/** Subscribe to Paddle.js events; returns an unsubscribe function (use in an effect cleanup). */
export function onPaddleEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
