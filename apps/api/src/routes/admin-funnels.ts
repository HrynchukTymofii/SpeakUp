import { Prisma, type DbClient } from "@speakup/db";
import {
  AdminFunnelDetailResponseSchema,
  AdminFunnelResponseSchema,
  AdminFunnelsResponseSchema,
  CreateFunnelBodySchema,
  DEFAULT_FUNNEL_DEFINITION,
  DEFAULT_FUNNEL_SLUG,
  DuplicateFunnelBodySchema,
  EditableFunnelDefinitionSchema,
  ErrorCode,
  FunnelDefinitionSchema,
  FunnelSlugSchema,
  FunnelWriteGuardSchema,
  SaveFunnelDraftBodySchema,
  UpdateFunnelStatusBodySchema,
  type AdminFunnel,
  type FunnelDefinition,
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

  /** What visitors see, checked: the editor can't work on a funnel whose live copy is broken. */
  function publishedDefinition(row: { definition: unknown }) {
    const definition = FunnelDefinitionSchema.safeParse(row.definition);
    if (!definition.success) {
      throw new AppError(409, ErrorCode.WRONG_STATE, "This funnel's definition is invalid");
    }
    return definition.data;
  }

  /** The editor's view of a funnel: what visitors see and the unpublished draft. */
  async function toDetail(row: FunnelRow & { definition: unknown }) {
    // A stored draft that today's schema rejects isn't sent (the response schema would make it a
    // 500); the editor is told, so it can still be discarded or replaced.
    const draft =
      row.draftDefinition === null ? null : FunnelDefinitionSchema.safeParse(row.draftDefinition);
    return {
      funnel: await toAdminFunnel(row),
      definition: publishedDefinition(row),
      draft: draft?.success ? draft.data : null,
      draftInvalid: draft !== null && !draft.success,
    };
  }

  /**
   * Writes only if the funnel is still as the admin loaded it (`updatedAt`, which every write
   * changes), then answers with the new editor view. Refuses instead of overwriting a draft saved
   * meanwhile or publishing changes this admin hasn't seen.
   */
  async function writeIfUnchanged(
    slug: string,
    expectedUpdatedAt: string,
    data: Parameters<DbClient["funnel"]["updateMany"]>[0]["data"],
  ) {
    const { count } = await db.funnel.updateMany({
      where: { slug, updatedAt: new Date(expectedUpdatedAt) },
      data,
    });
    if (count === 0) {
      throw new AppError(
        409,
        ErrorCode.WRONG_STATE,
        "This funnel was changed somewhere else. Reload to see the latest version.",
      );
    }
    return toDetail(await findFunnel(slug));
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

  /**
   * A new draft at version 1. Drafts can't be opened by visitors, so it's safe to create before
   * anyone has reviewed it. 409 when the slug is taken, including by a create racing this one.
   */
  async function createDraft(slug: string, name: string, definition: FunnelDefinition) {
    const slugTaken = () => new AppError(409, ErrorCode.WRONG_STATE, `"${slug}" is already used`);
    if (await db.funnel.findUnique({ where: { slug }, select: { id: true } })) throw slugTaken();
    try {
      const created = await db.funnel.create({
        data: { slug, name, status: "draft", version: 1, definition },
        select: FUNNEL_SELECT,
      });
      return { funnel: await toAdminFunnel(created) };
    } catch (err) {
      if (isUniqueViolation(err)) throw slugTaken();
      throw err;
    }
  }

  app.post(
    "/admin/funnels",
    { schema: { body: CreateFunnelBodySchema, response: { 201: AdminFunnelResponseSchema } } },
    async (request, reply) => {
      const { slug, name } = request.body;
      // Starts from the default funnel's screens: an empty funnel would fail the flow checks,
      // and removing screens is quicker than adding them.
      const created = await createDraft(slug, name, DEFAULT_FUNNEL_DEFINITION);
      request.log.info({ slug }, "funnel created");
      return reply.code(201).send(created);
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
      const created = await createDraft(slug, name, definition.data);
      request.log.info({ slug, from: source.slug }, "funnel duplicated");
      return reply.code(201).send(created);
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
      const { definition, expectedUpdatedAt } = request.body;
      publishedDefinition(await findFunnel(slug));
      const detail = await writeIfUnchanged(slug, expectedUpdatedAt, {
        draftDefinition: definition,
      });
      request.log.info({ slug }, "funnel draft saved");
      return detail;
    },
  );

  app.delete(
    "/admin/funnels/:slug/draft",
    {
      schema: {
        params: slugParams,
        querystring: FunnelWriteGuardSchema,
        response: { 200: AdminFunnelDetailResponseSchema },
      },
    },
    async (request) => {
      const { slug } = request.params;
      publishedDefinition(await findFunnel(slug));
      const detail = await writeIfUnchanged(slug, request.query.expectedUpdatedAt, {
        draftDefinition: Prisma.DbNull,
      });
      request.log.info({ slug }, "funnel draft discarded");
      return detail;
    },
  );

  app.post(
    "/admin/funnels/:slug/publish",
    {
      schema: {
        params: slugParams,
        body: FunnelWriteGuardSchema,
        response: { 200: AdminFunnelDetailResponseSchema },
      },
    },
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
      // Publishes exactly the draft this admin saw; two publishes at once bump the version once.
      const detail = await writeIfUnchanged(slug, request.body.expectedUpdatedAt, {
        definition: draft.data,
        draftDefinition: Prisma.DbNull,
        version: { increment: 1 },
      });
      request.log.info({ slug, version: detail.funnel.version }, "funnel published");
      return detail;
    },
  );
};
