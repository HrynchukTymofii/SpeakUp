/**
 * Facts the legal pages need that only the owner can supply. One place, so they can't drift
 * between the privacy policy, terms and refund policy.
 * TODO(founder): replace every bracketed value and have the pages reviewed by a lawyer.
 */
export const LEGAL = {
  /** Who runs SpeakUp: the company or the individual entrepreneur, as registered with Paddle. */
  operator: "[operator legal name]",
  contactEmail: "[contact email]",
  /** Country whose law governs the terms. */
  governingLaw: "[country]",
  /** Days after a payment in which a refund can be requested. 14 is a common default. */
  refundWindowDays: 14,
  /** Bump when the text changes. */
  lastUpdated: "19 November 2026",
} as const;
