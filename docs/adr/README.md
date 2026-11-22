# Architecture decision records

One file per significant technical decision: the situation, what we chose, and what it costs us.
Records are never edited after the fact — a changed decision gets a new record that _supersedes_
the old one. The high-level stack choices (Fastify, Prisma, BullMQ, Clerk, Paddle, ECS…) are in the
decision table in `SPEC.md` §14; these records cover the decisions made while building.

| #                                               | Decision                                                   | Status                     |
| ----------------------------------------------- | ---------------------------------------------------------- | -------------------------- |
| [0001](./0001-direct-to-s3-uploads.md)          | Upload recordings straight to S3 with pre-signed POSTs     | Accepted                   |
| [0002](./0002-anonymous-funnel-guest-tokens.md) | Anonymous funnel with guest tokens, claimed at sign-up     | Accepted                   |
| [0003](./0003-entitlements-from-webhooks.md)    | The plan changes only through payment webhooks             | Accepted                   |
| [0004](./0004-deepgram-nova-2.md)               | Deepgram nova-2, not nova-3, to keep filler words          | Accepted                   |
| [0005](./0005-llm-structured-output.md)         | Claude structured output, validated, with one repair round | Accepted                   |
| [0006](./0006-design-system-tokens.md)          | One design system on true black, colors as tokens          | Superseded in part by 0008 |
| [0007](./0007-branches-worktrees-prs.md)        | Branch + PR per task, one worktree per agent session       | Accepted                   |
| [0008](./0008-app-theme-sat-learner.md)         | The app gets its own light theme; the site stays dark      | Superseded by 0009, 0010   |
| [0009](./0009-marketing-site-glow-theme.md)     | The marketing site moves to a light "Glow" theme           | Accepted                   |
| [0010](./0010-app-glow-theme.md)                | The app joins the Glow theme, light only, no emoji         | Accepted                   |

## Template

```markdown
# NNNN. Title (a decision, not a topic)

- **Status:** Proposed | Accepted | Superseded by NNNN
- **Date:** YYYY-MM-DD

## Context

What forces are at play: the problem, constraints, what we knew.

## Decision

What we do, stated plainly.

## Consequences

What gets easier, what gets harder, what we must watch. When we'd revisit.
```
