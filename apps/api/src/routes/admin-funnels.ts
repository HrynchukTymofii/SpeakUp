import { Prisma, type DbClient } from "@speakup/db";
import {
  AdminFunnelDetailResponseSchema,
  AdminFunnelResponseSchema,
  AdminFunnelsResponseSchema,
  DEFAULT_FUNNEL_SLUG,
  DuplicateFunnelBodySchema,
  EditableFunnelDefinitionSchema,
  ErrorCode,
  FunnelDefinitionSchema,
  FunnelSlugSchema,
  SaveFunnelDraftBodySchema,
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
  draftDefinition: true,
} as const;

type FunnelRow = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "live";
  version: number;
  updatedAt: Date;
  draftDefinition: unknown;
};

const notFound = () => new AppError(404, ErrorCode.NOT_FOUND, "Funnel not found");
const isUniqueViolation = (err: unknown) =>
  typeof err === "object" && err !== null && "code" in err && err.code === "P2002";

const slugParams = z.object({ slug: FunnelSlugSchema });

/**
 * Funnel admin (funnel builder parts 3–4): list funnels, take them live/offline, duplicate one as
 * a new draft, and edit a funnel's screens as a draft that visitors see only once it's published.
 * Must be registered inside a `requireAdmin` scope.
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
      hasDraft: row.draftDefinition !== null,
      sessions30d: stats(row.id),
    }));
  }

  async function toAdminFunnel(row: FunnelRow): Promise<AdminFunnel> {
    const [funnel] = await toAdminFunnels([row]);
    if (!funnel) throw new Error("unreachable: one row in, one funnel out");
    return funnel;
  }

  /** The editor's view of a funnel: what visitors see and the unpublished draft. */
  async function toDetail(row: FunnelRow & { definition: unknown }) {
    // Both were checked before they were stored; a row edited by hand that no longer passes
    // can't be shown in the editor (the response schema would turn it into a 500).
    const definition = FunnelDefinitionSchema.safeParse(row.definition);
    const draft =
      row.draftDefinition === null ? null : FunnelDefinitionSchema.safeParse(row.draftDefinition);
    if (!definition.success || (draft && !draft.success)) {
      throw new AppError(409, ErrorCode.WRONG_STATE, "This funnel's definition is invalid");
    }
    return {
      funnel: await toAdminFunnel(row),
      definition: definition.data,
      draft: draft ? draft.data : null,
    };
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

  app.get(
    "/admin/funnels/:slug",
    { schema: { params: slugParams, response: { 200: AdminFunnelDetailResponseSchema } } },
    async (request) => toDetail(await findFunnel(request.params.slug)),
  );

  app.put(
    "/admin/funnels/:slug/draft",
    {
      schema: {
        params: slugParams,
        body: SaveFunnelDraftBodySchema,
        response: { 200: AdminFunnelDetailResponseSchema },
      },
    },
    async (request) => {
      const { slug } = request.params;
      await findFunnel(slug);
      const updated = await db.funnel.update({
        where: { slug },
        data: { draftDefinition: request.body.definition },
        select: { ...FUNNEL_SELECT, definition: true },
      });
      request.log.info({ slug }, "funnel draft saved");
      return toDetail(updated);
    },
  );

  app.delete(
    "/admin/funnels/:slug/draft",
    { schema: { params: slugParams, response: { 200: AdminFunnelDetailResponseSchema } } },
    async (request) => {
      const { slug } = request.params;
      await findFunnel(slug);
      const updated = await db.funnel.update({
        where: { slug },
        data: { draftDefinition: Prisma.DbNull },
        select: { ...FUNNEL_SELECT, definition: true },
      });
      request.log.info({ slug }, "funnel draft discarded");
      return toDetail(updated);
    },
  );

  app.post(
    "/admin/funnels/:slug/publish",
    { schema: { params: slugParams, response: { 200: AdminFunnelDetailResponseSchema } } },
    async (request) => {
      const { slug } = request.params;
      const funnel = await findFunnel(slug);
      if (funnel.draftDefinition === null) {
        throw new AppError(409, ErrorCode.WRONG_STATE, "There are no changes to publish");
      }
      // Re-checked here: what goes live must pass today's rules, not the ones it was saved under.
      const draft = EditableFunnelDefinitionSchema.safeParse(funnel.draftDefinition);
      if (!draft.success) {
        throw new AppError(409, ErrorCode.WRONG_STATE, "The saved changes are invalid");
      }
      // Matching on the version makes two publishes at once bump it once, not twice.
      const { count } = await db.funnel.updateMany({
        where: { slug, version: funnel.version },
        data: {
          definition: draft.data,
          draftDefinition: Prisma.DbNull,
          version: { increment: 1 },
        },
      });
      if (count === 0) {
        throw new AppError(409, ErrorCode.WRONG_STATE, "The funnel changed meanwhile; reload it");
      }
      request.log.info({ slug, version: funnel.version + 1 }, "funnel published");
      return toDetail(await findFunnel(slug));
    },
  );
};
