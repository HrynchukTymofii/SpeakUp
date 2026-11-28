import { z } from "zod";
import { FunnelSlugSchema } from "../funnel.js";
import { FunnelStatusSchema } from "./funnels.js";

/** One funnel as the admin list shows it (`/v1/admin/funnels`, admins only). */
export const AdminFunnelSchema = z.object({
  slug: FunnelSlugSchema,
  name: z.string(),
  status: FunnelStatusSchema,
  /** Content revision (`Funnel.version`). */
  version: z.number().int().min(1),
  updatedAt: z.iso.datetime(),
  /** Funnel sessions started in the last 30 days, and how many of them signed up (claimed). */
  sessions30d: z.object({
    started: z.number().int().min(0),
    signedUp: z.number().int().min(0),
  }),
});
export type AdminFunnel = z.infer<typeof AdminFunnelSchema>;

/** GET /v1/admin/funnels */
export const AdminFunnelsResponseSchema = z.object({ funnels: z.array(AdminFunnelSchema) });
export type AdminFunnelsResponse = z.infer<typeof AdminFunnelsResponseSchema>;

/** PATCH …/status and POST …/duplicate answer with the changed or new funnel. */
export const AdminFunnelResponseSchema = z.object({ funnel: AdminFunnelSchema });
export type AdminFunnelResponse = z.infer<typeof AdminFunnelResponseSchema>;

/** PATCH /v1/admin/funnels/:slug/status */
export const UpdateFunnelStatusBodySchema = z.strictObject({ status: FunnelStatusSchema });
export type UpdateFunnelStatusBody = z.infer<typeof UpdateFunnelStatusBodySchema>;

/** POST /v1/admin/funnels/:slug/duplicate — the copy starts as a draft at version 1. */
export const DuplicateFunnelBodySchema = z.strictObject({
  slug: FunnelSlugSchema,
  name: z.string().trim().min(1).max(80),
});
export type DuplicateFunnelBody = z.infer<typeof DuplicateFunnelBodySchema>;
