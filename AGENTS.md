<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on this repository

The block above is maintained by `next dev`. Everything below is about this project and stays when `next dev` refreshes the block.

## Commands

- `npm test` runs the unit tests. They need no database and run with an empty `DATABASE_URL`, so a unit test that reaches for the database fails at once.
- `npm run test:integration` runs every `*.int.test.ts` against a real Postgres, Redis and Mailpit. It needs `docker compose up -d` and uses the `jobtracker_test` database, which it creates and migrates by itself, and Redis database 15. Mails go to fresh addresses only, so nothing has to be deleted in Mailpit. It refuses any database whose name does not end in `_test` and any Redis database but 15, because every test empties what it uses.
- `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm run build` are the rest of what CI runs on every pull request.
- `npx prisma db seed` wipes every table before it writes. Never run it against a database whose data matters.
- `npm run user:role -- <email> <ADMIN|USER>` gives an account a role, against the database in `DATABASE_URL`.
- Mailpit from `docker compose up -d` shows every mail the app sends locally at http://localhost:8025. The reminder job runs with `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders`.
- The reader for job postings is off unless `OLLAMA_URL`, `OLLAMA_MODEL` and `REDIS_URL` are set. No test ever calls a model. `vitest.config.mts` empties both Ollama variables, the tests of the action answer in the model's place, and each reader is tested against a fake `fetch`.

## Rules the code relies on

- Every read and write of an application carries the user id in its `where` clause. There is no function that loads an application without it, keep it that way.
- Pages and Server Actions get the signed-in user from `requireUser()` in `src/lib/auth/guard.ts`, never from `getSession()` directly. The token only proves who someone is. Whether the account still exists, whether the session still counts and what the account may do comes from the database. `src/app/(app)/pages.int.test.ts` fails for any page under `(app)` that skips the guard.
- Every session token carries the account's `sessionVersion`, and `sessionAccount()` in the guard only accepts the current one. Whatever signs a session passes the account's current version, and whatever has to sign out every device raises it, the way the password reset does. `src/app/api/auth/session-ended/route.ts` asks through the same `sessionAccount()`, because two different answers to that question are what caused the redirect loop.
- Admin pages start with `requireAdmin()`. `src/lib/admin` hands out counts and statuses only, never an email, a role title, a company, a note or a link, and the admin role never widens a query for applications.
- Roles change only in `src/lib/admin/roles.ts`, run through `npm run user:role`. Do not add a page or a Server Action that writes a role.
- The reminder job claims due follow-ups by setting `reminderSentAt` in one `UPDATE` that only matches empty ones, and sends afterwards. Never send first and mark after, `src/lib/reminders/job.int.test.ts` holds a second run open to catch exactly that.
- Tokens in mail links come from `src/lib/link-token.ts`, are stored only as SHA-256 hashes and work once, and a new link replaces the older ones of the account. Confirmation links last a day, reset links an hour. Opening a link never changes anything, only the button or the form on its page does, see `src/app/confirm-email/page.int.test.ts` and `src/app/(auth)/reset-password/page.int.test.ts`.
- The password reset answers the same for every address, and the mail goes out through `after()` once the answer is sent. Never await the mail in the action, `src/lib/password-reset/actions.int.test.ts` checks that nothing is written or sent before the answer.
- Mail only goes to users with `emailVerifiedAt` set. A changed follow-up date clears `reminderSentAt`, and an edit writes cleared optional fields as null, never as undefined.
- A write that depends on a status puts that status into its `where` clause as well, so two requests cannot both pass a check against the same old state.
- Every Server Action that writes an application calls `invalidateCache(userId)` from `src/lib/cache.ts` once the write has committed, never before. The analytics are read through that cache, and a write that skips it leaves the page showing old numbers for up to five minutes.
- Legal status moves live only in `src/lib/pipeline/transitions.ts`. The UI asks it what to offer, and the Server Actions ask it again before they write.
- Everything that reaches a Server Action is client input, bound arguments included. Parse it with the Zod schemas in `src/lib/validation/` before it touches Prisma.
- A redirect target that came from the browser goes through `safeRedirectPath` in `src/lib/auth/redirect.ts`.
- GitHub sign-in only links onto accounts without a password, see `canLinkByEmail` in `src/lib/auth/oauth/link.ts`.
- Dates from `<input type="date">` are stored as midnight UTC and shown in UTC, moments are shown in Europe/Berlin. Both formatters live in `src/lib/format.ts`.
- The answer of a model is input. `suggestFromPosting` in `src/lib/posting/actions.ts` parses it with `extractionSchema` before anything reads it, and `suggestionFrom` checks every field on its own and leaves out what makes no sense. The action saves nothing. A suggestion only fills the form, and the save goes through `createApplication` like one typed by hand.
- What the model is told and the shape of its answer live together in `src/lib/posting/extraction.ts`, under `EXTRACTION_VERSION`. The rule of a field goes into its `describe()`, and the instructions are built from there, because a local model never sees the schema's descriptions. Change the wording and `extraction.test.ts` fails until the version and the fingerprint in that test are raised.
- The limits on reading postings go through `hitStrict`, which answers null when Redis cannot be asked, and the action refuses then. Never swap it for `hit`, which would let every read through while Redis is down. The account is counted before the installation, so an account over its limit does not use up what everyone shares.
- A reader in `src/lib/posting/` returns parsed JSON and throws errors that carry neither the posting nor the answer, because both end up in the log otherwise. The same holds for what the action logs about an answer it threw away, field names and error codes only.

## Conventions

- Tests sit next to the code they test. Helpers for the integration tests live in `src/test/`.
- `@types/node` stays on the Node major that CI and the machines run, 22 today. Dependabot ignores its majors on purpose, raise it together with the Node version.
- UI text and docs only use characters found on a keyboard. No arrows, typographic dashes or ellipsis characters, write `->` and `...` instead.
- Comments explain why, not what.
- One pull request per change, with a plain English title and a description that ends with how it was checked.
