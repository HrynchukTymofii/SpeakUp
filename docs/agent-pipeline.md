# Agent pipeline

`/pipeline <task>` runs one task through a team of Claude Code agents: ticket, plan, build,
verify, review, PR. The owner approves the plan and merges the PR; everything between is automated.

```
/pipeline "<task>"
   │
   ▼
GitHub issue (the ticket) ── the task's log: plan, verify and review results go here as comments
   │
   ▼
planner ──► owner approves plan
   │
   ▼
implementer(s) ── parallel when subtasks don't share files, each in its own git worktree
   │            first commit → draft PR ("Closes #<issue>"); every commit is pushed to it
   ▼
verifier ◄──► implementer   (fix loop, max 3 rounds)
   │
   ▼
reviewer ◄──► implementer   (fix loop, max 2 rounds)
   │
   ▼
PR marked ready ──► owner reviews and merges (merging closes the issue)
```

Why a ticket first: it records what was asked and why before any code exists, and keeps every
decision in one place even when agents do the work. Why a draft PR early: CI and the Vercel
preview run on each push, so problems show up while the task is still in progress.

## The pieces

| File                            | Role                                                                            | Tools                |
| ------------------------------- | ------------------------------------------------------------------------------- | -------------------- |
| `.claude/commands/pipeline.md`  | The orchestrator: runs the steps above in the main session                      | all                  |
| `.claude/agents/planner.md`     | Splits the task into subtasks with files, the test to write first, acceptance   | read-only            |
| `.claude/agents/implementer.md` | Does one subtask, test first, and commits it                                    | all                  |
| `.claude/agents/verifier.md`    | Runs format, lint, typecheck, tests and the build; reports exact failures       | Bash + read, no edit |
| `.claude/agents/reviewer.md`    | Reviews the diff against `main` for bugs, security, tests and `CLAUDE.md` rules | Bash + read, no edit |

The planner, verifier and reviewer can't edit files on purpose: a checker that can edit tends to
"fix" what it finds quietly instead of reporting it, and then nobody checks the fix.

## Rules it follows

- Everything in [`CLAUDE.md`](../CLAUDE.md): definition of done, Conventional Commits, docs in the
  same commit.
- One task = one issue = one branch = one PR, based on `main`. The task branch lives in its own
  `git worktree`, because other sessions share the main checkout.
- Parallel implementers get their own worktrees and subtask branches, which are merged into the
  task branch. The planner groups subtasks so parallel ones never touch the same file.
- The pipeline never merges, force-pushes or skips hooks.

## When to use it

Use `/pipeline` for features that span several packages (e.g. a shared contract + API route + web
screen). For a small fix in one file, a normal session is faster and cheaper: every agent starts
without the conversation's context and reads the code again.

It isn't called `/ship` because Claude Code has a built-in `/ship` (commit, push and watch a PR)
that takes precedence over a project command of the same name.

## Changing it

Edit the agent or command files and describe the change here. They are plain Markdown prompts; the
frontmatter `tools` line decides what each agent may do.
