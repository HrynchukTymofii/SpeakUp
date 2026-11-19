import {
  ApiErrorSchema,
  AttemptDetailResponseSchema,
  AttemptResponseSchema,
  AttemptsListResponseSchema,
  BillingPlansResponseSchema,
  CheckoutResponseSchema,
  ClaimFunnelResponseSchema,
  CoursesResponseSchema,
  CreateAttemptResponseSchema,
  ExerciseResponseSchema,
  LessonResponseSchema,
  MeResponseSchema,
  PortalResponseSchema,
  PracticeExercisesResponseSchema,
  type AttemptDetailResponse,
  type AttemptResponse,
  type AttemptsListResponse,
  type BillingPlansResponse,
  type CheckoutResponse,
  type PortalResponse,
  type PracticeExercisesResponse,
  type ClaimFunnelResponse,
  type CoursesResponse,
  type CreateAttemptBody,
  type CreateAttemptResponse,
  type ExerciseResponse,
  type LessonResponse,
  type MeResponse,
  type SubmitAttemptBody,
  type UpdateOnboardingBody,
} from "@speakup/shared";
import type { z } from "zod";
import { publicEnv } from "./env";

/** Thrown for any non-2xx response. `code` comes from the API's standard error body. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

/** Returns the current Clerk session token, or null when signed out. */
export type GetToken = () => Promise<string | null>;

/**
 * Small typed client for apps/api (SPEC §11). Framework-agnostic on purpose: it takes a
 * `getToken` function instead of calling Clerk hooks, so the same code can later run in the
 * Expo app (which gets its token differently).
 *
 * Every response is parsed with the shared Zod schema: if the API and web ever disagree on
 * a shape, we get a clear error here instead of `undefined` deep inside a component.
 */
export function createApiClient(getToken: GetToken) {
  async function request<S extends z.ZodType>(
    path: string,
    schema: S,
    init: RequestInit = {},
  ): Promise<z.infer<S>> {
    const token = await getToken();
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body) headers.set("Content-Type", "application/json");

    const res = await fetch(`${publicEnv.NEXT_PUBLIC_API_URL}${path}`, { ...init, headers });
    const json: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const parsed = ApiErrorSchema.safeParse(json);
      if (parsed.success) {
        const { code, message, requestId } = parsed.data.error;
        throw new ApiClientError(res.status, code, message, requestId);
      }
      throw new ApiClientError(res.status, "UNKNOWN", `Request failed (${res.status})`);
    }
    return schema.parse(json);
  }

  return {
    getMe: (): Promise<MeResponse> => request("/v1/me", MeResponseSchema),
    saveOnboarding: (body: UpdateOnboardingBody): Promise<MeResponse> =>
      request("/v1/me/onboarding", MeResponseSchema, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    getCourses: (): Promise<CoursesResponse> => request("/v1/courses", CoursesResponseSchema),
    getLesson: (slug: string): Promise<LessonResponse> =>
      request(`/v1/lessons/${encodeURIComponent(slug)}`, LessonResponseSchema),
    getBaselineExercise: (): Promise<ExerciseResponse> =>
      request("/v1/exercises/baseline", ExerciseResponseSchema),
    getPracticeExercises: (): Promise<PracticeExercisesResponse> =>
      request("/v1/exercises/practice", PracticeExercisesResponseSchema),
    /** The user's practice history, newest first (progress, streak, profile, suggestions). */
    getAttempts: (limit = 100): Promise<AttemptsListResponse> =>
      request(`/v1/attempts?limit=${limit}`, AttemptsListResponseSchema),

    createAttempt: (body: CreateAttemptBody): Promise<CreateAttemptResponse> =>
      request("/v1/attempts", CreateAttemptResponseSchema, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    submitAttempt: (id: string, body: SubmitAttemptBody): Promise<AttemptResponse> =>
      request(`/v1/attempts/${encodeURIComponent(id)}/submit`, AttemptResponseSchema, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    /** Attach the anonymous funnel session + baseline to the signed-in user (idempotent). */
    claimFunnel: (guestToken: string): Promise<ClaimFunnelResponse> =>
      request("/v1/funnel/claim", ClaimFunnelResponseSchema, {
        method: "POST",
        body: JSON.stringify({ guestToken }),
      }),
    getBillingPlans: (): Promise<BillingPlansResponse> =>
      request("/v1/billing/plans", BillingPlansResponseSchema),
    startCheckout: (): Promise<CheckoutResponse> =>
      request("/v1/billing/checkout", CheckoutResponseSchema, {
        method: "POST",
        body: JSON.stringify({ plan: "pro_monthly" }),
      }),
    openPortal: (): Promise<PortalResponse> =>
      request("/v1/billing/portal", PortalResponseSchema, { method: "POST" }),
    getAttempt: (id: string): Promise<AttemptDetailResponse> =>
      request(`/v1/attempts/${encodeURIComponent(id)}`, AttemptDetailResponseSchema),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
