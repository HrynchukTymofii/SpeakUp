---
description: Plan, build, verify, review and open a PR for one task using the planner, implementer, verifier and reviewer agents
argument-hint: <task description>
---

Run the agent pipeline for this task: $ARGUMENTS

You are the orchestrator. You coordinate the agents in `.claude/agents/`; you don't write feature
code yourself. Follow `CLAUDE.md` throughout. How the pipeline works and why is in
`docs/agent-pipeline.md`.

## 1. Plan

Start the **planner** agent with the task. If it returns questions, ask the owner and stop until
they answer. Otherwise show the owner the plan (subtasks, parallel groups, risks) and **wait for
their OK** before any code is written. Apply the changes they ask for.

## 2. Branch

Never work on `main`, and never switch the branch of the main checkout: other sessions share it.
Pick a branch name from the task (`feat/…`, `fix/…`, `chore/…`, `docs/…`, `test/…`) and create a
worktree for it from the latest `main`:

```bash
git fetch origin
git worktree add ../SpeakUp-<branch-slug> -b <branch> origin/main
```

This is the **task branch**. One task = one branch = one PR, always based on `main` (no stacked PRs).

## 3. Implement

Work through the plan's parallel groups in order:

- **One subtask in a group:** start one **implementer** agent and tell it to work in the task
  worktree, on the task branch.
- **Several subtasks in a group:** start one **implementer** per subtask in the same message, each
  with `isolation: "worktree"`, and tell each to create its own branch from the task branch
  (`<branch>-s1`, `<branch>-s2`, …). When they finish, merge each subtask branch into the task
  branch with a normal `git merge` (no rebase, no force). If a merge conflicts, the plan's groups
  were wrong: resolve it by re-running the conflicting subtask on the task branch, not by hand.

Give each implementer its subtask exactly as the plan wrote it, plus the branch and worktree path.
If an implementer reports `blocked`, stop and bring its reason to the owner.

## 4. Verify (loop, max 3 rounds)

Start the **verifier** on the task worktree. On `FAIL`, send the failures to an implementer
(working on the task branch) to fix, then verify again. After 3 failed rounds, stop and report to
the owner with the last verifier output.

## 5. Review (loop, max 2 rounds)

Start the **reviewer** with the plan and the task worktree. For each blocker or should-fix
finding, check it yourself against the code; send the ones that hold up to an implementer, then
run the verifier and reviewer again. Note any finding you dismissed and why.

## 6. Publish

Only after the verifier passes and the reviewer approves:

```bash
git -C ../SpeakUp-<branch-slug> push -u origin <branch>
gh pr create --base main --head <branch> --title "<type(scope): summary>" --body "<body>"
```

The PR body has: what changed and why, the plan's subtasks, the verifier's results table, review
findings and how they were handled, what was skipped and why, risks and follow-ups. For UI changes,
note that 375 px screenshots are still needed (or attach them if you took them).

**Never merge.** The owner merges when they decide to. Finish by giving the owner the PR link and a
short summary. Remove leftover subtask worktrees (`git worktree remove`) and delete their local
subtask branches once merged into the task branch.
