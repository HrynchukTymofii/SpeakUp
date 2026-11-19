"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Browser-only progress for the in-app lessons that have no recording (breathing, the "Yes!"
 * button, body-language tips) and the user's own story text. A convenience, not a record: it can
 * be empty (private window, cleared storage) and the app must still work — so every access is
 * wrapped in try/catch. Moving this to the API is a follow-up once the content is final.
 */

const DONE_KEY = "speakup.local-done";
const STORY_KEY = "speakup.my-story";
const EVENT = "speakup:local-progress";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the UI still works, it just won't remember.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// useSyncExternalStore needs a stable snapshot: compare the raw strings, not parsed arrays.
const rawDone = () => {
  try {
    return window.localStorage.getItem(DONE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
};

/** Slugs of in-app lessons the user finished, plus a function to mark one done. */
export function useLocalDone(): [Set<string>, (slug: string) => void] {
  const raw = useSyncExternalStore(subscribe, rawDone, () => "[]");
  const markDone = useCallback((slug: string) => {
    const done = new Set(readJson<string[]>(DONE_KEY, []));
    done.add(slug);
    write(DONE_KEY, JSON.stringify([...done]));
  }, []);
  let parsed: string[] = [];
  try {
    parsed = JSON.parse(raw) as string[];
  } catch {
    parsed = [];
  }
  return [new Set(parsed), markDone];
}

const rawStory = () => {
  try {
    return window.localStorage.getItem(STORY_KEY) ?? "";
  } catch {
    return "";
  }
};

/** The story the user wrote themselves (Build your story / 7-day challenge). */
export function useMyStory(): [string, (text: string) => void] {
  const story = useSyncExternalStore(subscribe, rawStory, () => "");
  const save = useCallback((text: string) => write(STORY_KEY, text), []);
  return [story, save];
}
