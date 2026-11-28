import type { DbClient } from "@speakup/db";
import {
  ErrorCode,
  FunnelDefinitionSchema,
  FunnelResponseSchema,
  FunnelSlugSchema,
} from "@speakup/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError } from "../plugins/error-handler.js";

/**
 * Short shared cache: ad traffic lands on the same few funnels, and a published change should
 * still show up within a minute or so.
 */
const LIVE_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

/** Public funnel definitions (SPEC §7): anonymous visitors load them before any session exists. */
export const funnelPublicRoutes: FastifyPluginAsyncZod<{ db: DbClient }> = async (app, { db }) => {
  app.get(
    "/funnels/:slug",
    {
      schema: {
        params: z.object({ slug: FunnelSlugSchema }),
        response: { 200: FunnelResponseSchema },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const funnel = await db.funnel.findUnique({
        where: { slug },
        select: { slug: true, status: true, version: true, definition: true },
      });
      // Drafts look exactly like unknown slugs. no-store: a funnel published a minute later
      // must not stay hidden behind a cached 404.
      if (!funnel || funnel.status !== "live") {
        throw new AppError(404, ErrorCode.NOT_FOUND, "Funnel not found", {
          "cache-control": "no-store",
        });
      }

      // The column is untyped JSON; never hand visitors (or the cache) something the web app
      // can't render. Log the slug only — the definition can be large.
      const definition = FunnelDefinitionSchema.safeParse(funnel.definition);
      if (!definition.success) {
        request.log.error({ slug }, "stored funnel definition is invalid");
        throw new Error(`Funnel "${slug}" has an invalid definition`);
      }

      reply.header("cache-control", LIVE_CACHE_CONTROL);
      return {
        funnel: { slug: funnel.slug, version: funnel.version, definition: definition.data },
      };
    },
  );
};
