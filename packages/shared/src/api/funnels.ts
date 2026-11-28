import { z } from "zod";
import { FunnelDefinitionSchema } from "../funnel-definition.js";
import { FunnelSlugSchema } from "../funnel.js";

/** `Funnel.status` in the DB: only `live` funnels are served to visitors. */
export const FunnelStatusSchema = z.enum(["draft", "live"]);
export type FunnelStatus = z.infer<typeof FunnelStatusSchema>;

/**
 * GET /v1/funnels/:slug (public). `version` is the content revision (`Funnel.version`, bumped on
 * publish), not `definition.version` (the definition's schema format). The admin-only `name`
 * isn't sent.
 */
export const FunnelResponseSchema = z.object({
  funnel: z.object({
    slug: FunnelSlugSchema,
    version: z.number().int().min(1),
    definition: FunnelDefinitionSchema,
  }),
});
export type FunnelResponse = z.infer<typeof FunnelResponseSchema>;
