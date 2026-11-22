# Agent pipeline

`/ship <task>` runs one task through a team of Claude Code agents: plan, build, verify, review,
open a PR. The owner approves the plan and merges the PR; everything between is automated.

```
/ship "<task>"
   │
   ▼
planner ──► owner approves plan
   │
   ▼
implementer(s) ── parallel when subtasks don't share files, each in its own git worktree
   │
   ▼
verifier ◄──► implementer   (fix loop, max 3 rounds)
   │
   ▼
reviewer ◄──► implementer   (fix loop, max 2 rounds)
   │
   ▼
push + PR against main ──► owner reviews and merges
```

## The pieces

| File                            | Role                                                                            | Tools                |
| ------------------------------- | ------------------------------------------------------------------------------- | -------------------- |
| `.claude/commands/ship.md`      | The orchestrator: runs the steps above in the main session                      | all                  |
| `.claude/agents/planner.md`     | Splits the task into subtasks with files, the test to write first, acceptance   | read-only            |
| `.claude/agents/implementer.md` | Does one subtask, test first, and commits it                                    | all                  |
| `.claude/agents/verifier.md`    | Runs format, lint, typecheck, tests and the build; reports exact failures       | Bash + read, no edit |
| `.claude/agents/reviewer.md`    | Reviews the diff against `main` for bugs, security, tests and `CLAUDE.md` rules | Bash + read, no edit |

The planner, verifier and reviewer can't edit files on purpose: a checker that can edit tends to
"fix" what it finds quietly instead of reporting it, and then nobody checks the fix.

## Rules it follows

- Everything in [`CLAUDE.md`](../CLAUDE.md): definition of done, Conventional Commits, docs in the
  same commit.
- One task = one branch = one PR, based on `main`. The task branch lives in its own
  `git worktree`, because other sessions share the main checkout.
- Parallel implementers get their own worktrees and subtask branches, which are merged into the
  task branch. The planner groups subtasks so parallel ones never touch the same file.
- The pipeline never merges, force-pushes or skips hooks.

## When to use it

Use `/ship` for features that span several packages (e.g. a shared contract + API route + web
screen). For a small fix in one file, a normal session is faster and cheaper: every agent starts
without the conversation's context and reads the code again.

## Changing it

Edit the agent or command files and describe the change here. They are plain Markdown prompts; the
frontmatter `tools` line decides what each agent may do.
