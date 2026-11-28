// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useFunnelStore } from "./store";

const STORAGE_KEY = "speakup-funnel";
const state = () => useFunnelStore.getState();

/** A visitor halfway through a funnel: answers, a guest token, a submitted attempt. */
function fillProgress() {
  state().setAnswers({ goal: "meetings" });
  state().markCompleted("lesson");
  state().setGuestToken("guest-token");
  state().setAttemptId("attempt-1");
  state().setClaimed();
  state().setResultSummary({ topIssues: ["pace"], score: 70 });
}

beforeEach(() => {
  localStorage.clear();
  state().reset();
});

describe("useFunnelStore", () => {
  it("entering a different funnel starts fresh (no answers or guest token carried over)", () => {
    state().enterFunnel("main", 1);
    fillProgress();
    state().captureAttribution({ utmSource: "google" });

    state().enterFunnel("spring-promo", 3);

    expect(state()).toMatchObject({
      funnelSlug: "spring-promo",
      funnelVersion: 3,
      answers: {},
      completed: [],
      guestToken: null,
      attemptId: null,
      claimed: false,
      topIssues: [],
      baselineScore: null,
      attribution: null,
    });
  });

  it("re-entering the same funnel keeps progress, even at a newer content revision", () => {
    state().enterFunnel("main", 1);
    fillProgress();

    state().enterFunnel("main", 2);

    expect(state()).toMatchObject({
      funnelSlug: "main",
      funnelVersion: 2,
      answers: { goal: "meetings" },
      completed: ["lesson"],
      guestToken: "guest-token",
      attemptId: "attempt-1",
    });
  });

  it("migrates a v1 saved state to funnelSlug main", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          answers: { goal: "meetings" },
          completed: ["lesson"],
          guestToken: "guest-token",
          attemptId: null,
          claimed: false,
          topIssues: [],
          baselineScore: null,
        },
      }),
    );

    await useFunnelStore.persist.rehydrate();

    expect(state()).toMatchObject({
      funnelSlug: "main",
      funnelVersion: null,
      attribution: null,
      answers: { goal: "meetings" },
      guestToken: "guest-token",
    });
    // The v1 visitor continues on /start or /f/main without losing anything.
    state().enterFunnel("main", 1);
    expect(state().guestToken).toBe("guest-token");
  });

  it("attribution is first-touch: a later visit with other UTMs doesn't overwrite it", () => {
    state().enterFunnel("main", 1);
    state().captureAttribution(null);
    expect(state().attribution).toBeNull();

    state().captureAttribution({ utmSource: "google", utmCampaign: "spring" });
    state().captureAttribution({ utmSource: "facebook" });

    expect(state().attribution).toEqual({ utmSource: "google", utmCampaign: "spring" });
  });
});
