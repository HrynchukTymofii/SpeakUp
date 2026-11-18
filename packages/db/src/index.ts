// Public entry point of @speakup/db.
export { createDbClient, type DbClient } from "./client.js";
// Re-export generated model types and enums (e.g. `Attempt`, `AttemptStatus`) and the
// `Prisma` namespace (input types, error classes) so apps never import from generated paths.
export * from "./generated/prisma/client.js";
