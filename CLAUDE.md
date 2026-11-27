# Working rules for this repo

These rules apply to every change, however small. They extend `SPEC.md` §0 (ground rules) —
read that too. Docs index: [`docs/README.md`](./docs/README.md).

## Definition of done

A task is done only when all of these are true:

1. **Scoped.** One feature or fix per task. If the request is ambiguous, ask before coding.
   Respect any area the owner marks off-limits for the task (e.g. `infra/` while a deploy runs).
2. **Tested.** New behavior has a test in the same commit. A bug fix starts with a test that fails
   because of the bug. Every new test has been seen failing once. See [`docs/testing.md`](./docs/testing.md).
3. **Green.** These pass, run for real (never assumed) for every touched package:
   `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the build of the touched
   app (e.g. `pnpm turbo run build --filter=@speakup/web`).
4. **Documented in the same commit:**
   - new env var → `.env.example` (with a comment) + README "Environment variables"
   - changed setup/scripts/deploy → `README.md`
   - changed behavior or UI conventions → the matching file in `docs/`
   - changed product scope → `SPEC.md`
   - a significant technical choice → a row in `SPEC.md` §14 (decision log)
   - docs describe the system as it is now: rewrite the affected text when behavior changes
     (don't append "done" notes under a plan), and list unbuilt work only in `SPEC.md` §12
5. **Committed in small logical commits** (see Git below).
6. **Reported:** what changed, how it was verified (real command output), what was skipped and why,
   risks and follow-ups. UI changes include screenshots at 375 px.

## Git

Every task, however small, goes in this order:

1. **Ticket first.** Open a GitHub issue (`gh issue create`) with what changes and why, before any
   code. The issue is the task's log: post the plan, check results and decisions on it as comments.
2. **Branch.** Never work directly on `main`. One branch per task: `feat/…`, `fix/…`, `chore/…`,
   `docs/…`, `test/…`. Parallel agent sessions each use their own branch (or `git worktree`) so
   they never interleave commits.
3. **Draft PR after the first commit.** Push and open a draft PR whose body says
   `Closes #<issue>`, so CI and the Vercel preview run on every push.
4. **Commit and push** each logical step to that PR.
5. **Ready for review** once all checks pass (`gh pr ready`); CI must be green. **Merge only when
   the owner says so.** `main` must always be deployable (pushes to `main` can deploy the web app
   via Vercel).

- Commit messages: Conventional Commits, `type(scope): summary` (scopes: `web`, `api`, `worker`,
  `db`, `shared`, `infra`, `docs`…). The body explains **why**.
- Never commit secrets (`.env*` except `.env.example`) or tool output (`.playwright-mcp/`, screenshots).
- Never force-push, rewrite published history, or skip hooks.

## Code

- TypeScript strict; validate every boundary with Zod (env, HTTP input, webhooks, queue, LLM output).
- Pin dependency versions exactly; prefer releases at least two weeks old.
- Database changes go through Prisma migrations and stay backward compatible with the running
  version (expand → migrate → contract).
- Readable over clever; comments explain why, not what (`SPEC.md` §0.2).

## UI (`apps/web`)

- Follow [`docs/design-system.md`](./docs/design-system.md): color tokens only (no hex, no
  `slate-*`), `btn` + variant classes, Manrope, the `Mascot` for emotional beats, line icons from
  `components/icons.tsx` — never emoji.
- Check every changed screen at 375 px: no horizontal scroll, contrast ≥ 4.5:1 for text, visible
  focus, works with reduced motion.

## Commands

```bash
pnpm dev                                   # web :3000, api :4000, worker
pnpm infra:up                              # local Postgres, Redis, S3 (Docker)
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
pnpm turbo run build --filter=@speakup/web
```
