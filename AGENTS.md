<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on this repository

The block above is maintained by `next dev`. Everything below is about this project and stays when `next dev` refreshes the block.

## Commands

- `npm test` runs the unit tests. They need no database and run with an empty `DATABASE_URL`, so a unit test that reaches for the database fails at once.
- `npm run test:integration` runs every `*.int.test.ts` against a real Postgres and Redis. It needs `docker compose up -d` and uses the `jobtracker_test` database, which it creates and migrates by itself, and Redis database 15. It refuses any database whose name does not end in `_test` and any Redis database but 15, because every test empties what it uses.
- `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm run build` are the rest of what CI runs on every pull request.
- `npx prisma db seed` wipes every table before it writes. Never run it against a database whose data matters.

## Rules the code relies on

- Every read and write of an application carries the user id in its `where` clause. There is no function that loads an application without it, keep it that way.
- Pages and Server Actions get the signed-in user from `requireUser()` in `src/lib/auth/guard.ts`, never from `getSession()` directly. The token only proves who someone is. Whether the account still exists and what it may do comes from the database. `src/app/(app)/pages.int.test.ts` fails for any page under `(app)` that skips the guard.
- A write that depends on a status puts that status into its `where` clause as well, so two requests cannot both pass a check against the same old state.
- Every Server Action that writes an application calls `invalidateCache(userId)` from `src/lib/cache.ts` once the write has committed, never before. The analytics are read through that cache, and a write that skips it leaves the page showing old numbers for up to five minutes.
- Legal status moves live only in `src/lib/pipeline/transitions.ts`. The UI asks it what to offer, and the Server Actions ask it again before they write.
- Everything that reaches a Server Action is client input, bound arguments included. Parse it with the Zod schemas in `src/lib/validation/` before it touches Prisma.
- A redirect target that came from the browser goes through `safeRedirectPath` in `src/lib/auth/redirect.ts`.
- GitHub sign-in only links onto accounts without a password, see `canLinkByEmail` in `src/lib/auth/oauth/link.ts`.
- Dates from `<input type="date">` are stored as midnight UTC and shown in UTC, moments are shown in Europe/Berlin. Both formatters live in `src/lib/format.ts`.

## Conventions

- Tests sit next to the code they test. Helpers for the integration tests live in `src/test/`.
- UI text and docs only use characters found on a keyboard. No arrows, typographic dashes or ellipsis characters, write `->` and `...` instead.
- Comments explain why, not what.
- One pull request per change, with a plain English title and a description that ends with how it was checked.
