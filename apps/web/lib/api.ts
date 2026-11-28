import {
  AdminFunnelDetailResponseSchema,
  AdminFunnelResponseSchema,
  AdminFunnelsResponseSchema,
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
  NextTopicResponseSchema,
  PracticeExercisesResponseSchema,
  type AdminFunnelDetailResponse,
  type AdminFunnelResponse,
  type FunnelDefinition,
  type AdminFunnelsResponse,
  type DuplicateFunnelBody,
  type FunnelStatus,
  type AttemptDetailResponse,
  type AttemptResponse,
  type AttemptsListResponse,
  type BillingPlansResponse,
  type CheckoutResponse,
  type PortalResponse,
  type NextTopicResponse,
  type PracticeMode,
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
    /** A practice mode's exercise and a topic the user hasn't answered (`skip` = pass on one). */
    getNextTopic: (mode: PracticeMode, skip?: string): Promise<NextTopicResponse> =>
      request(
        `/v1/practice/${mode}/next${skip ? `?skip=${encodeURIComponent(skip)}` : ""}`,
        NextTopicResponseSchema,
      ),
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
    /** `waitSeconds`: let the API hold the request until the worker changes the attempt. */
    getAttempt: (id: string, waitSeconds = 0): Promise<AttemptDetailResponse> =>
      request(
        `/v1/attempts/${encodeURIComponent(id)}${waitSeconds > 0 ? `?wait=${waitSeconds}` : ""}`,
        AttemptDetailResponseSchema,
      ),

    // Funnel admin (admins only: everyone else gets 403 FORBIDDEN).
    getAdminFunnels: (): Promise<AdminFunnelsResponse> =>
      request("/v1/admin/funnels", AdminFunnelsResponseSchema),
    setFunnelStatus: (slug: string, status: FunnelStatus): Promise<AdminFunnelResponse> =>
      request(`/v1/admin/funnels/${encodeURIComponent(slug)}/status`, AdminFunnelResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    duplicateFunnel: (slug: string, body: DuplicateFunnelBody): Promise<AdminFunnelResponse> =>
      request(
        `/v1/admin/funnels/${encodeURIComponent(slug)}/duplicate`,
        AdminFunnelResponseSchema,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      ),
    // Funnel editor: the draft is what the admin edits; publish makes it what visitors see.
    getAdminFunnel: (slug: string): Promise<AdminFunnelDetailResponse> =>
      request(`/v1/admin/funnels/${encodeURIComponent(slug)}`, AdminFunnelDetailResponseSchema),
    // `expectedUpdatedAt`: the funnel's updatedAt as loaded; a write made meanwhile → 409.
    saveFunnelDraft: (
      slug: string,
      definition: FunnelDefinition,
      expectedUpdatedAt: string,
    ): Promise<AdminFunnelDetailResponse> =>
      request(
        `/v1/admin/funnels/${encodeURIComponent(slug)}/draft`,
        AdminFunnelDetailResponseSchema,
        { method: "PUT", body: JSON.stringify({ definition, expectedUpdatedAt }) },
      ),
    discardFunnelDraft: (
      slug: string,
      expectedUpdatedAt: string,
    ): Promise<AdminFunnelDetailResponse> =>
      request(
        `/v1/admin/funnels/${encodeURIComponent(slug)}/draft?expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}`,
        AdminFunnelDetailResponseSchema,
        { method: "DELETE" },
      ),
    publishFunnel: (slug: string, expectedUpdatedAt: string): Promise<AdminFunnelDetailResponse> =>
      request(
        `/v1/admin/funnels/${encodeURIComponent(slug)}/publish`,
        AdminFunnelDetailResponseSchema,
        { method: "POST", body: JSON.stringify({ expectedUpdatedAt }) },
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
