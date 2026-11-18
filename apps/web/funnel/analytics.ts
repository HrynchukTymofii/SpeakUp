/**
 * Analytics hook (SPEC §15.3). No vendor yet: events are logged in development only.
 * Plugging in PostHog/GA later = changing this one function; call sites stay the same.
 * Never pass the guest token, emails or recordings as props.
 */
export type FunnelEvent =
  | "funnel_step_viewed"
  | "funnel_answer"
  | "funnel_recording_submitted"
  | "funnel_signup_completed"
  | "funnel_results_viewed"
  | "paywall_viewed"
  | "checkout_started";

type Props = Record<string, string | number | boolean | string[] | null | undefined>;

export function track(event: FunnelEvent, props: Props = {}): void {
  if (process.env.NODE_ENV === "development") {
    console.info(`[analytics] ${event}`, props);
  }
}
