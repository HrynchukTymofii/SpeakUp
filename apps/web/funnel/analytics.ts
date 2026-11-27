import * as amplitude from "@amplitude/analytics-browser";

/**
 * Product analytics (Amplitude) for the whole web app: the landing page, the funnel and the
 * signed-in app. The event catalog and the funnel it builds are documented in docs/analytics.md.
 *
 * - Without `NEXT_PUBLIC_AMPLITUDE_API_KEY` (local dev, previews), nothing is sent. In development,
 *   events are logged to the console instead.
 * - Identity: the browser gets an anonymous device id. The cookie is set on the parent domain, so
 *   the landing host and the app host share it. After sign-up, `identifyUser(clerkUserId)` links
 *   that device to the account. The mobile app sets the same Clerk id, so web and app usage join up.
 * - Never send emails, names, guest tokens, transcripts or recordings.
 */
export type AnalyticsEvent =
  // Funnel (/start)
  | "funnel_step_viewed"
  | "funnel_answer"
  | "mic_permission_result"
  | "funnel_recording_submitted"
  | "funnel_signup_completed"
  | "funnel_results_viewed"
  | "funnel_free_plan_chosen"
  // Paywall and checkout (funnel, /pricing, locked lessons)
  | "paywall_viewed"
  | "checkout_started"
  | "checkout_closed"
  | "checkout_completed"
  | "pro_activated"
  // The signed-in app
  | "recording_submitted"
  | "results_viewed"
  | "lesson_completed";

type Value = string | number | boolean | string[] | null | undefined;
type Props = Record<string, Value>;

let initialized = false;
/** Properties added to every event, e.g. which funnel (and revision) the visitor is in. */
let eventContext: Props = {};
/** The Clerk id we last identified as; `undefined` = not decided yet (Clerk still loading). */
let currentUserId: string | null | undefined;

const devLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV === "development") console.info("[analytics]", ...args);
};

/** Starts Amplitude once per page load. Called by `AnalyticsProvider`; a missing key = off. */
export function initAnalytics(apiKey: string | undefined): void {
  if (initialized || !apiKey || typeof window === "undefined") return;
  initialized = true;
  amplitude.init(apiKey, {
    autocapture: {
      // "First screen, second screen…": one `[Amplitude] Page Viewed` per route change. Path only,
      // so query strings (?next=, ?step=) and Clerk's #/verify hash don't split pages apart.
      pageViews: { trackHistoryChanges: "pathOnly" },
      attribution: true, // UTM, referrer, click ids (gclid, fbclid…) for ad campaigns
      sessions: true,
      // Explicit events only: autocaptured clicks and form fields could leak typed text.
      elementInteractions: false,
      formInteractions: false,
      frustrationInteractions: false,
      fileDownloads: false,
      networkTracking: false,
      webVitals: false,
    },
  });
}

/**
 * Sets properties merged into every later `track()` call (explicit props win), or clears them with
 * `null`. The funnel sets `{ funnel_id, funnel_version }` while it is open, so events from shared
 * components (paywall, checkout) can be split by funnel without each caller passing it.
 */
export function setEventContext(props: Props | null): void {
  eventContext = props ?? {};
}

/**
 * Records one event. `revenue` turns it into an Amplitude revenue event (LTV and revenue charts).
 * The amount is what the browser saw at checkout; Paddle's webhook remains the source of truth.
 */
export function track(
  event: AnalyticsEvent,
  eventProps: Props = {},
  revenue?: { amount: number; currency?: string },
): void {
  const props = { ...eventContext, ...eventProps };
  devLog(event, props, revenue ?? "");
  if (!initialized) return;
  if (revenue) {
    amplitude.track(
      event,
      { ...props, currency: revenue.currency },
      { revenue: revenue.amount, price: revenue.amount, quantity: 1, revenueType: "subscription" },
    );
    return;
  }
  amplitude.track(event, props, undefined);
}

/** Links this browser to an account (Clerk user id), or forgets it after a sign-out. */
export function identifyUser(userId: string | null): void {
  if (userId === currentUserId) return;
  const previous = currentUserId;
  currentUserId = userId;
  devLog("identify", userId);
  if (!initialized) return;
  if (userId) amplitude.setUserId(userId);
  // Signed out after being signed in: a new anonymous device, so the next person on this
  // browser isn't counted as the previous account.
  else if (previous) amplitude.reset();
}

/** Properties on the user (funnel answers, plan) for splitting charts, e.g. retention by goal. */
export function setUserProperties(props: Props): void {
  devLog("user properties", props);
  if (!initialized) return;
  const identify = new amplitude.Identify();
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined && value !== null) identify.set(key, value);
  }
  amplitude.identify(identify);
}
