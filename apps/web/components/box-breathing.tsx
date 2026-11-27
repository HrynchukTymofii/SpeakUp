"use client";

import { useEffect, useRef, useState } from "react";
import { ROUND_SECONDS, breathingState } from "@/learn/breathing";

/**
 * Box breathing: in, hold, out, hold — 4 seconds each, 4 rounds (about a minute). A dot travels
 * around a square, one side per phase; with reduced motion only the text and countdown change.
 */
export function BoxBreathing({ onDone }: { onDone: () => void }) {
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0); // seconds since start

  // Latest onDone without restarting the timer when the parent re-renders.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!running) return;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += 1;
      setTick(elapsed);
      if (breathingState(elapsed).finished) {
        clearInterval(timer);
        setRunning(false);
        onDoneRef.current();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const state = breathingState(tick);

  return (
    <div className="card flex flex-col items-center gap-5 text-center">
      <p className="text-sm text-muted">
        Slows your heart rate and steadies your voice. Breathe low, into your belly.
      </p>
      <div className="relative size-56" aria-hidden>
        <div className="absolute inset-4 rounded-[28px] border-4 border-sky" />
        {running && (
          <span
            className="breath-dot absolute size-6 rounded-full bg-peach shadow-peach"
            style={{ animationDuration: `${ROUND_SECONDS}s` }}
          />
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-5xl font-semibold tabular-nums">
            {running ? state.secondsLeft : "4·4·4·4"}
          </span>
        </div>
      </div>
      <p aria-live="polite" className="font-display text-2xl font-semibold">
        {running ? state.phase : "Ready when you are"}
      </p>
      {running && (
        <p className="text-sm font-semibold text-muted">
          Round {state.round} of {state.rounds}
        </p>
      )}
      {!running && (
        <button
          type="button"
          onClick={() => {
            setTick(0);
            setRunning(true);
          }}
          className="btn btn-primary w-full"
        >
          Start (about 1 minute)
        </button>
      )}
      {running && (
        <button
          type="button"
          onClick={() => {
            // Stop the timer first so a parent that stays mounted doesn't get onDone again at 64 s.
            setRunning(false);
            onDoneRef.current();
          }}
          className="link text-sm font-bold"
        >
          I’m calm — finish now
        </button>
      )}
    </div>
  );
}
