# Testing

Every package uses **Vitest**. `pnpm test` at the repo root runs all of them (through Turborepo);
CI runs the same command on every push and pull request.

```bash
pnpm test                               # everything
pnpm --filter @speakup/api test         # one package
pnpm --filter @speakup/web exec vitest  # watch mode in one package
```

## What is tested where

| Package           | Style                                                                                                                                                                                    | Examples                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `packages/shared` | pure unit tests of the Zod contracts                                                                                                                                                     | `queue.test.ts`, `funnel.test.ts`, `api/me.test.ts`                                                                  |
| `packages/db`     | seed data stays valid                                                                                                                                                                    | `seed-data.test.ts`                                                                                                  |
| `apps/api`        | HTTP-level tests: `buildTestServer()` + Fastify `app.inject()` with in-memory fakes for the DB, queue, S3, auth, payments and bot check (`src/testing/fakes.ts`) — no network, no Docker | `routes/attempts.test.ts`, `routes/billing.test.ts` (webhook idempotency), `hardening.test.ts` (rate limits, errors) |
| `apps/worker`     | unit tests of the analysis pipeline with fake providers                                                                                                                                  | `metrics/metrics.test.ts`, `feedback/feedback.test.ts` (LLM output parsing), `pipeline.test.ts`                      |
| `apps/web`        | funnel engine logic (Node) and UI components (jsdom + React Testing Library)                                                                                                             | `funnel/funnel.test.ts`, `funnel/ui.test.tsx`, `components/mascot.test.tsx`                                          |
| `infra/cdk`       | CDK assertions on the synthesized CloudFormation template                                                                                                                                | `test/stack.test.ts`                                                                                                 |

Env validation (`apps/api/src/env.test.ts`, `apps/worker/src/env.test.ts`) is tested in both
services: bad config must stop the process at boot.

## Web: component tests

- Logic tests are `*.test.ts` and run in plain Node (fast).
- Component tests are `*.test.tsx` and start with `// @vitest-environment jsdom`.
- `apps/web/vitest.setup.ts` adds the DOM matchers (`toBeInTheDocument`, `toHaveAttribute`,
  `toBeDisabled`…) and unmounts components after each test.
- Query the way a user (or screen reader) finds things: `getByRole("button", { name: "Continue" })`
  before `getByText`, and test-ids only as a last resort.
- Drive interactions with `@testing-library/user-event` (real click/keyboard sequences), not
  `fireEvent`.
- Not covered yet: full pages that need Clerk or the API. Visual checks (375 px screenshots) are
  done by hand or by the agent with Playwright; see [`design-system.md`](./design-system.md) §8.

## Rules

1. New behavior → a test in the same commit.
2. Bug fix → first a test that fails because of the bug, then the fix (the test guards against the
   bug coming back). Example: the `Card` background regression in `funnel/ui.test.tsx`.
3. A new test should be seen failing once (break the code on purpose, run, restore) — a test that
   can't fail proves nothing.
4. Test behavior and contracts (what users and other services see), not implementation details.
5. No network in unit tests: inject fakes (the API's `buildTestServer`) instead of calling real
   Clerk, Deepgram, Anthropic, Paddle or AWS.
