# Local development

This page is for maintainers. To use the hosted product, start with [Getting started](https://github.com/mbh-solutions/dc_training/wiki/Getting-started).

## Prerequisites

Install Git and Node.js 24 with npm. The repository's test loader uses Node's module hooks; use Node 24 rather than assuming an older runtime works. You also need repository access and an operator-provided **development** Supabase configuration. There is no bundled demo account, database seed, or one-command local backend.

In PowerShell, choose the parent folder for the checkout and run:

```powershell
git clone https://github.com/mbh-solutions/dc_training.git
cd dc_training
npm ci
Copy-Item .env.example .env.local
```

Run the copy command only when creating a new local configuration; do not overwrite an existing `.env.local`. Open that file in a text editor and fill in all four values:

| Variable                         | Required value                                                         |
| -------------------------------- | ---------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`              | URL of the intended Supabase project                                   |
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | That project's browser publishable key                                 |
| `VITE_SUPABASE_AUTH_JWKS`        | Compact JSON containing the project's pinned public ES256 signing keys |
| `VITE_SUPABASE_OWNER_SUB_SHA256` | Lowercase SHA-256 digest of the authorized Auth user's UUID string     |

The pinned key format must satisfy `isPinnedJwk` in [offline-owner-session.ts](https://github.com/mbh-solutions/dc_training/blob/main/src/lib/offline-owner-session.ts): EC/P-256, ES256, a key ID, signature use, and verification permission. The issuer, audience, expiration, role, and owner digest are checked. Obtain matching public configuration from the operator; do not substitute another project's settings or relax validation to get past an error.

All `VITE_` values are embedded in the browser build. Never put a service-role key, database password, backup passphrase, or private signing key there. `.env.local` is ignored by Git.

```powershell
npm run dev -- --host 127.0.0.1
```

Open the localhost URL printed by Vite. With complete configuration and a provisioned development owner, the sign-in form opens. Missing configuration shows a setup screen. Restart Vite after changing environment values.

## Backend prerequisites

A dedicated Supabase project needs the SQL migrations in `supabase/migrations` applied in filename order, an Auth owner account, and a matching `public.foundation_profiles` row. Public signup is not an app feature. Configure approved site and password-recovery redirect URLs, including `/account/update-password`, for each intended environment.

This repository contains migrations but no `supabase/config.toml`; `supabase start` is not a documented turnkey setup. An operator must confirm the target project and migration history before applying SQL. [Operations](https://github.com/mbh-solutions/dc_training/wiki/Operations) describes the release checks.

## Local checks

Run from the repository root:

```powershell
npm test
npm run test:db
npm run lint
npm run build
npm run preview -- --host 127.0.0.1
```

`npm test` exercises source modules and isolated UI/reducer workflows. `test:db` uses PGlite to exercise the migration chain and database rules without production credentials. Build emits `dist`; preview prints the URL for that built app. Stop a running dev or preview server with Ctrl+C. Preview is local inspection, not production deployment.

A local server connected to production still uses production data. Use an isolated development backend for interactive saves. Static build checks and isolated tests do not require a production account.
