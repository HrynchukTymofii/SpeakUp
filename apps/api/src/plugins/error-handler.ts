import { ErrorCode, type ApiError } from "@speakup/shared";
import type { FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";

/**
 * Throw this from routes/services for expected failures ("not signed in", "not yours").
 * The error handler turns it into the standard error body with the given status.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    /** Extra response headers, e.g. `Retry-After` on a 429. */
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Fastify's own client errors carry internal codes ("FST_ERR_CTP_INVALID_MEDIA_TYPE"). Clients
 * get our stable codes instead, chosen by HTTP status; the internal one stays in our logs.
 */
const CODE_BY_STATUS: Record<number, string> = {
  400: ErrorCode.BAD_REQUEST,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  415: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  429: ErrorCode.RATE_LIMITED,
};

function body(code: string, message: string, requestId: string): ApiError {
  return { error: { code, message, requestId } };
}

/**
 * One place that decides what clients see when something goes wrong (SPEC §7):
 * - AppError          → its own status + code
 * - schema validation → 400 VALIDATION_ERROR (with which field failed)
 * - anything else     → 500 INTERNAL, generic message; details only in our logs,
 *                       never leaked to the client (stack traces reveal internals).
 *
 * Called directly on the root instance (not registered as a plugin) so it applies to every route.
 */
export function setupErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.error({ err: error }, error.message);
      return reply
        .code(error.statusCode)
        .headers(error.headers)
        .send(body(error.code, error.message, request.id));
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const first = error.validation[0];
      const field = first?.instancePath ?? "";
      const message = `Invalid ${error.validationContext ?? "request"}${field ? ` at ${field}` : ""}: ${first?.message ?? "validation failed"}`;
      return reply.code(400).send(body(ErrorCode.VALIDATION_ERROR, message, request.id));
    }

    // Fastify's own 4xx errors (e.g. malformed JSON body, payload too large, wrong content type).
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      request.log.info({ fastifyCode: (error as { code?: string }).code }, "client error");
      const code = CODE_BY_STATUS[statusCode] ?? ErrorCode.BAD_REQUEST;
      return reply.code(statusCode).send(body(code, (error as Error).message, request.id));
    }

    request.log.error({ err: error }, "unhandled error");
    return reply
      .code(500)
      .send(body(ErrorCode.INTERNAL, "Something went wrong. Please try again.", request.id));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send(body(ErrorCode.NOT_FOUND, "Route not found", request.id));
  });
}
