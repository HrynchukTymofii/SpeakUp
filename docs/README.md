# SpeakUp documentation

Start here. Each document has one job; link to it instead of repeating it.

**Understand the product and the system**

| Document                               | What's in it                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`features.md`](./features.md)         | What the product does today, page by page; plans and limits; what's not built yet              |
| [`architecture.md`](./architecture.md) | How web, API, worker, database, queue and storage fit together; the main flows (with diagrams) |
| [`api.md`](./api.md)                   | Every endpoint: auth, request/response shapes, error codes, rate limits                        |
| [`adr/`](./adr/README.md)              | Decision records: why things are built the way they are                                        |
| [`../SPEC.md`](../SPEC.md)             | The original product and build spec: scope, milestones, decision table                         |

**Build and operate**

| Document                                       | What's in it                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| [`../README.md`](../README.md)                 | Repo layout, local setup, scripts, environment variables, first-time deploy       |
| [`runbook.md`](./runbook.md)                   | Production: deploy, migrations, rollback, logs, rotating secrets, common problems |
| [`../CLAUDE.md`](../CLAUDE.md)                 | Working rules: definition of done, git workflow, code and UI rules                |
| [`testing.md`](./testing.md)                   | How each package is tested, component tests, testing rules                        |
| [`load-testing.md`](./load-testing.md)         | How we load-test (k6, fake AI providers, throwaway AWS stack) and the raw results |
| [`scaling.md`](./scaling.md)                   | Where the system breaks under load, why, and the fixes in order                   |
| [`design-system.md`](./design-system.md)       | Web UI: color tokens, fonts, components, the mascot, third-party theming          |
| [`funnel-reference.md`](./funnel-reference.md) | How the reference (Holy Hush) funnel works and what SpeakUp does differently      |

**Kept outside the repo**

Some project material lives in a `SpeakUp Project/` folder next to the repo on the owner's machine,
not in git: it is too heavy, not ours to publish, or personal.

| Folder              | What's in it                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `videos/`           | Remotion project for marketing videos (e.g. the funnel filler-words video, served from S3)     |
| `resources/photos/` | Photos of a published workbook used as direction for lesson content; copyrighted, never commit |
| `logs/`             | Scratch logs from local dev runs; safe to delete                                               |
| `interview-prep/`   | The owner's interview notes (formerly `LEARNING_NOTES.md`); personal, so not in the repo       |
