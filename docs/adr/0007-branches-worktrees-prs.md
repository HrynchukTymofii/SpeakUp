# 0007. Branch + PR per task, one worktree per agent session

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

The repo is developed by AI coding agents directed by the owner, often several sessions at once
(e.g. one deploying infrastructure while another restyles the web app). Work was committed straight
to `main`. When one session switched the shared folder to a new branch, it silently moved the other
session too, and that session's commit landed on the wrong branch. Pushes to `main` also deploy the
web app (Vercel).

## Decision

- Every task happens on its own branch and reaches `main` through a pull request with green CI;
  only the owner merges.
- Each agent session works in its **own `git worktree`** (a separate folder per branch) and never
  switches the branch of the shared checkout.
- The definition of done (tests, checks, docs in the same commit, a report) is written in
  [`CLAUDE.md`](../../CLAUDE.md), which every agent session reads automatically.

## Consequences

- `main` stays deployable and every change is reviewable on its own.
- Sessions can't move each other's branches.
- Slightly more ceremony for tiny changes (a branch and PR each).
- Worktrees need their own `pnpm install` and should be removed after merge
  (`git worktree remove <path>`).
