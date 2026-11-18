import {
  ApiErrorSchema,
  CreateAttemptResponseSchema,
  CreateFunnelSessionResponseSchema,
  ExerciseResponseSchema,
  FunnelAttemptStatusResponseSchema,
  type CreateAttemptResponse,
  type CreateFunnelAttemptBody,
  type FunnelAttemptStatusResponse,
  type UpdateFunnelSessionBody,
} from "@speakup/shared";
import type { z } from "zod";
import { ApiClientError } from "@/lib/api";
import { publicEnv } from "@/lib/env";

/**
 * The funnel's anonymous API calls, authenticated with `Authorization: Guest <token>`.
 * (The claim call needs the Clerk token and lives in lib/api.ts.)
 */
async function guestRequest<S extends z.ZodType | null>(
  path: string,
  schema: S,
  init: RequestInit & { token?: string } = {},
): Promise<S extends z.ZodType ? z.infer<S> : void> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("Authorization", `Guest ${init.token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const res = await fetch(`${publicEnv.NEXT_PUBLIC_API_URL}${path}`, { ...init, headers });
  const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(json);
    if (parsed.success) {
      const { code, message, requestId } = parsed.data.error;
      throw new ApiClientError(res.status, code, message, requestId);
    }
    throw new ApiClientError(res.status, "UNKNOWN", `Request failed (${res.status})`);
  }
  return (schema ? schema.parse(json) : undefined) as S extends z.ZodType ? z.infer<S> : void;
}

export const funnelApi = {
  createSession: () =>
    guestRequest("/v1/funnel/sessions", CreateFunnelSessionResponseSchema, { method: "POST" }),

  updateSession: (token: string, body: UpdateFunnelSessionBody) =>
    guestRequest("/v1/funnel/sessions/current", null, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),

  createAttempt: (token: string, body: CreateFunnelAttemptBody): Promise<CreateAttemptResponse> =>
    guestRequest("/v1/funnel/attempts", CreateAttemptResponseSchema, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),

  getExercise: (token: string) =>
    guestRequest("/v1/funnel/exercise", ExerciseResponseSchema, { token }),

  submitAttempt: (token: string, id: string, durationMs: number) =>
    guestRequest(
      `/v1/funnel/attempts/${encodeURIComponent(id)}/submit`,
      FunnelAttemptStatusResponseSchema,
      { method: "POST", token, body: JSON.stringify({ durationMs }) },
    ),

  getAttemptStatus: (token: string, id: string): Promise<FunnelAttemptStatusResponse> =>
    guestRequest(
      `/v1/funnel/attempts/${encodeURIComponent(id)}`,
      FunnelAttemptStatusResponseSchema,
      {
        token,
      },
    ),
};
