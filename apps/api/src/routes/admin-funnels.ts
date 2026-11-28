import type { DbClient } from "@speakup/db";
import {
  AdminFunnelResponseSchema,
  AdminFunnelsResponseSchema,
  DEFAULT_FUNNEL_SLUG,
  DuplicateFunnelBodySchema,
  ErrorCode,
  FunnelDefinitionSchema,
  FunnelSlugSchema,
  UpdateFunnelStatusBodySchema,
  type AdminFunnel,
} from "@speakup/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError } from "../plugins/error-handler.js";

const STATS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const FUNNEL_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
  version: true,
  updatedAt: true,
} as const;

type FunnelRow = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "live";
  version: number;
  updatedAt: Date;
};

const notFound = () => new AppError(404, ErrorCode.NOT_FOUND, "Funnel not found");
const isUniqueViolation = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && err.code === "P2002";

const slugParams = z.object({ slug: FunnelSlugSchema });

/**
 * Funnel admin (funnel builder part 3): list funnels, take them live/offline, duplicate one as a
 * new draft. Must be registered inside a `requireAdmin` scope. Editing a definition and
 * publishing a new version come with the editor (part 4).
 */
export const adminFunnelRoutes: FastifyPluginAsyncZod<{ db: DbClient }> = async (app, { db }) => {
  // Admin data changes with every click; never let a browser or proxy reuse it.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

  /** Sessions started in the last 30 days per funnel, and how many of them signed up. */
  async function sessionStats(funnelIds: string[]) {
    const where = {
      funnelId: { in: funnelIds },
      createdAt: { gte: new Date(Date.now() - STATS_DAYS * DAY_MS) },
    };
    const [started, signedUp] = await Promise.all([
      db.funnelSession.groupBy({ by: ["funnelId"], where, _count: { _all: true } }),
      db.funnelSession.groupBy({
        by: ["funnelId"],
        where: { ...where, claimedAt: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const count = (rows: typeof started, id: string) =>
      rows.find((row) => row.funnelId === id)?._count._all ?? 0;
    return (id: string) => ({ started: count(started, id), signedUp: count(signedUp, id) });
  }

  async function toAdminFunnels(rows: FunnelRow[]): Promise<AdminFunnel[]> {
    const stats = await sessionStats(rows.map((row) => row.id));
    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      status: row.status,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
      sessions30d: stats(row.id),
    }));
  }

  async function toAdminFunnel(row: FunnelRow): Promise<AdminFunnel> {
    const [funnel] = await toAdminFunnels([row]);
    if (!funnel) throw new Error("unreachable: one row in, one funnel out");
    return funnel;
  }

  async function findFunnel(slug: string) {
    const funnel = await db.funnel.findUnique({
      where: { slug },
      select: { ...FUNNEL_SELECT, definition: true },
    });
    if (!funnel) throw notFound();
    return funnel;
  }

  app.get(
    "/admin/funnels",
    { schema: { response: { 200: AdminFunnelsResponseSchema } } },
    async () => {
      const rows = await db.funnel.findMany({
        select: FUNNEL_SELECT,
        orderBy: { createdAt: "asc" },
      });
      return { funnels: await toAdminFunnels(rows) };
    },
  );

  app.patch(
    "/admin/funnels/:slug/status",
    {
      schema: {
        params: slugParams,
        body: UpdateFunnelStatusBodySchema,
        response: { 200: AdminFunnelResponseSchema },
      },
    },
    async (request) => {
      const { slug } = request.params;
      const { status } = request.body;
      const funnel = await findFunnel(slug);

      // `main` backs the default funnel links and /f/main; taking it offline would break them.
      if (status === "draft" && slug === DEFAULT_FUNNEL_SLUG) {
        throw new AppError(409, ErrorCode.WRONG_STATE, `"${slug}" can't be taken offline`);
      }
      // A live funnel the API can't serve would answer every visitor with a 500.
      if (status === "live" && !FunnelDefinitionSchema.safeParse(funnel.definition).success) {
        throw new AppError(409, ErrorCode.WRONG_STATE, "This funnel's definition is invalid");
      }

      const updated = await db.funnel.update({
        where: { slug },
        data: { status },
        select: FUNNEL_SELECT,
      });
      request.log.info({ slug, status }, "funnel status changed");
      return { funnel: await toAdminFunnel(updated) };
    },
  );

  app.post(
    "/admin/funnels/:slug/duplicate",
    {
      schema: {
        params: slugParams,
        body: DuplicateFunnelBodySchema,
        response: { 201: AdminFunnelResponseSchema },
      },
    },
    async (request, reply) => {
      const source = await findFunnel(request.params.slug);
      const definition = FunnelDefinitionSchema.safeParse(source.definition);
      if (!definition.success) {
        throw new AppError(409, ErrorCode.WRONG_STATE, "This funnel's definition is invalid");
      }

      const { slug, name } = request.body;
      const slugTaken = () => new AppError(409, ErrorCode.WRONG_STATE, `"${slug}" is already used`);
      if (await db.funnel.findUnique({ where: { slug }, select: { id: true } })) throw slugTaken();

      try {
        const created = await db.funnel.create({
          // Drafts can't be opened by visitors, so a copy is safe to make before it's reviewed.
          data: { slug, name, status: "draft", version: 1, definition: definition.data },
          select: FUNNEL_SELECT,
        });
        request.log.info({ slug, from: source.slug }, "funnel duplicated");
        return reply.code(201).send({ funnel: await toAdminFunnel(created) });
      } catch (err) {
        // Two admins (or two clicks) creating the same slug at once.
        if (isUniqueViolation(err)) throw slugTaken();
        throw err;
      }
    },
  );
};
