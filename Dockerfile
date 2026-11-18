# One Dockerfile for the API, the worker and the migration task (pnpm monorepo).
#
#   docker build --build-arg APP=api    --target runtime -t speakup-api .
#   docker build --build-arg APP=worker --target runtime -t speakup-worker .
#   docker build --build-arg APP=db     --target migrate -t speakup-migrate .
#
# Stages: prune (keep only the packages APP needs) → build (all deps + tsc) →
# prod-deps (runtime deps only) → runtime (small image: node_modules + compiled JS, no sources).
# The AWS CDK stack (infra/cdk) builds these same images at `cdk deploy`.

ARG APP=api

FROM node:22-bookworm-slim AS base
ENV CI=true
RUN npm install -g pnpm@10.34.9
WORKDIR /repo

# ── 1. prune ─────────────────────────────────────────────────────────────────
# `turbo prune` writes a mini-monorepo with just APP and the workspace packages it depends
# on (+ a trimmed lockfile). out/json has only package.json files, so the install layer below
# stays cached until dependencies actually change, not on every source edit.
FROM base AS prune
ARG APP
COPY . .
RUN npx --yes turbo@2.11.11 prune "@speakup/${APP}" --docker

# ── 2. build ─────────────────────────────────────────────────────────────────
FROM base AS build
ARG APP
COPY --from=prune /repo/out/json/ ./
COPY --from=prune /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ ./
# `turbo prune` copies workspace packages only, not root files; every package tsconfig extends this one.
COPY tsconfig.base.json ./
# Builds APP and its workspace dependencies (shared, db incl. `prisma generate`) in order.
RUN pnpm turbo run build --filter="@speakup/${APP}..."

# ── 3. production dependencies only ──────────────────────────────────────────
FROM base AS prod-deps
COPY --from=prune /repo/out/json/ ./
COPY --from=prune /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ── shared bits for the images that talk to RDS ──────────────────────────────
# RDS presents a certificate signed by Amazon's RDS CA, which is not in Node's default trust
# store. Adding the official bundle lets us connect with sslmode=verify-full (encrypted AND
# the server proven to be our database) instead of turning certificate checks off.
FROM node:22-bookworm-slim AS rds-ca
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /rds-global-bundle.pem

# ── extra binaries per app (/tools → /usr/local/bin) ─────────────────────────
# The worker decodes recordings with ffmpeg (pitch / loudness / pause analysis). A static
# build pinned by digest: one 135 MB file, vs ~630 MB for Debian's ffmpeg and its graphics
# libraries. Picking the stage by APP keeps it out of the API image.
FROM mwader/static-ffmpeg:7.1.1@sha256:11a44711684c0b9f754c047dcd64235b8b52deab251bd0e0a86f22faa160749c AS static-ffmpeg
FROM node:22-bookworm-slim AS tools-worker
COPY --from=static-ffmpeg /ffmpeg /tools/ffmpeg
FROM node:22-bookworm-slim AS tools-api
RUN mkdir /tools
FROM tools-api AS tools-db
FROM tools-${APP} AS tools

# ── 4a. runtime image for api / worker ───────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ARG APP
ENV NODE_ENV=production \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem
COPY --from=rds-ca /rds-global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
COPY --chmod=755 infra/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY --from=tools /tools/ /usr/local/bin/
WORKDIR /app
COPY --from=prod-deps /repo/ ./
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/db/dist ./packages/db/dist
COPY --from=build /repo/apps/${APP}/dist ./apps/${APP}/dist
WORKDIR /app/apps/${APP}
# Never run as root inside the container (the node image ships an unprivileged "node" user).
USER node
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/index.js"]

# ── 4b. one-off migration / seed task (build with APP=db) ────────────────────
# Keeps the Prisma CLI and tsx (dev dependencies) out of the api/worker images.
FROM build AS migrate
# Prisma's schema engine (used by `migrate deploy`) needs OpenSSL.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem
COPY --from=rds-ca /rds-global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
COPY --chmod=755 infra/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
WORKDIR /repo/packages/db
# Prisma fetches its schema engine on first use, into node_modules. Do that now, as root, so the
# unprivileged runtime user never needs to write there (it can't).
RUN pnpm exec prisma version \
    && chown -R node:node /repo/node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines
USER node
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
# Default: apply pending migrations. Seed with the command `pnpm exec prisma db seed`.
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
