# App Foundation Implementation Roadmap

Status: planning complete; implementation not started.

Authoritative product behavior remains in `docs/design/README.md`. This roadmap defines the shortest safe path from documentation-only repository to a live, installable foundation. It does not reopen approved product or visual decisions.

## Outcome

The owner can open a live DC Training PWA on an iPhone, sign in with the pre-authorized account, remain signed in on return, see a minimal Home shell in the approved visual language, install it to the Home Screen, and reopen that shell temporarily offline. A protected Supabase record proves authentication and per-user cloud isolation work end to end.

This milestone ends before workout feature implementation.

## Locked implementation choices

- **Frontend:** React with TypeScript.
- **Build tool:** Vite. This app is primarily a client-side PWA, so Next.js server rendering and routing are unnecessary foundation complexity.
- **Hosting:** Vercel Hobby for the personal, non-commercial deployment.
- **Authentication and database:** Supabase Auth and Postgres.
- **PWA shell:** `vite-plugin-pwa` for the manifest, service worker, and app-shell caching.
- **Styling:** plain CSS using the approved black, white, gray, and restrained-red language. No component library or design-system dependency.
- **Package manager:** npm with the lockfile committed.
- **Routing:** none in the first runnable slice. One application shell selects signed-out or signed-in state.
- **Cloud access:** the browser receives only the Supabase project URL and publishable key. Privileged credentials never use Vite's public environment-variable prefix.
- **Data protection:** Row Level Security is enabled on every exposed table before browser access is granted.

## Why this is the smallest foundation that holds

- React is sufficient for the already-approved interactive screens.
- Vite produces the static client app Vercel needs without adding a server framework.
- Supabase already supplies authentication, database access, and account ownership enforcement.
- One PWA plugin avoids hand-writing service-worker lifecycle and cache plumbing.
- The first slice proves the risky integrations—live authentication, RLS, deployment, installation, and offline launch—before workout code exists.

## Required order

### 0. Protect the approved planning baseline

- Do not scaffold into the intentionally dirty branch.
- With explicit owner authorization, stage every approved design/research artifact, commit it, push it, and integrate it into the repository's main line.
- Confirm local and GitHub content match.
- Create a fresh `codex/app-foundation` branch from that synchronized baseline.

Hard stop: no application files are created until this checkpoint is complete.

### 1. Scaffold the minimal app

- Create the official Vite React TypeScript starter in the repository root.
- Keep only the standard build, development, lint, and preview commands.
- Add Supabase JavaScript and the Vite PWA plugin; add no other application dependencies.
- Replace starter visuals with a minimal black DC Training shell based on the approved Home language.
- Add an environment template containing names only.
- Ignore all local environment files and Vercel linkage metadata.

### 2. Link hosting and cloud resources

- Link the repository to one Vercel project.
- Connect the existing Supabase project rather than provisioning another database.
- Map the Supabase project URL and publishable key into local, preview, and production environments.
- Verify required environment-variable names without printing values.
- Do not run database or development commands until linkage and environment checks pass.

### 3. Prove authentication and isolation

- Configure email-and-password sign-in with no guest mode and no public sign-up screen.
- Use the pre-authorized owner account.
- Add one minimal owner-bound foundation record in Supabase.
- Enable RLS and allow the authenticated owner to read only that owner's row.
- Prove signed-out access is rejected and signed-in access succeeds.
- Returning use restores the valid session and opens Home.
- Sign-out returns to the sign-in screen.

### 4. Prove the PWA shell

- Add the web-app manifest, approved theme colors, and required install icons.
- Cache only the application shell and static assets.
- Use the approved `OFFLINE · SAVED ON DEVICE` status treatment when disconnected.
- Do not implement workout-data caching or the durable sync queue in this slice.
- Install the deployed app to an iPhone Home Screen after one successful online sign-in.
- Confirm the installed shell reopens without connectivity and reconnects cleanly.

### 5. Verify the live foundation

- Production build succeeds.
- The Vercel deployment loads over HTTPS.
- Wrong credentials fail without revealing whether an account exists.
- Correct credentials open the signed-in shell.
- A page reload and app relaunch retain the session.
- A signed-out browser cannot read the protected foundation record.
- The installed iPhone app opens its cached shell offline.
- Only public Supabase values appear in browser-delivered assets.
- Existing design and research documents remain unchanged except for intentional planning additions.

### 6. Add the Supportability Gate

- Add the Supportability Gate immediately after the live foundation passes.
- Require it before workout feature code begins.
- Keep the Gate limited to the new runnable app and its real build, authentication, deployment, and PWA proof paths.
- Do not claim gate coverage from documentation alone.

Hard stop: the next milestone does not begin until the Gate is enforced and passing.

## Deferred until after the Gate

- Workout, rotation, history, cruise, mulligan, replacement, stretch, and completion flows.
- Full workout database schema.
- IndexedDB workout working copy and durable change queue.
- Active-editing-device transfer.
- Daily encrypted backup workflow.
- Account-deletion recovery scheduler.
- Complete offline workout behavior.
- Analytics, social features, coaching tools, admin dashboards, payments, and multi-user expansion.

## Current local readiness

- Node.js `v24.16.0` and npm `11.13.0` are installed and satisfy current Vite requirements.
- Vercel CLI is not installed and the repository is not linked to a Vercel project.
- Supabase CLI is not installed; it is not required to choose the architecture.
- Public Supabase URL/key variable names and a Vercel token variable name exist in the Windows environment; values were not read or printed.
- No privileged Supabase database/admin credential name was found in the current environment audit. A protected authenticated integration path must be established before schema work.
- The repository still has approved local documentation and image changes that are not on GitHub.

## Official implementation references

- [Vite getting started](https://vite.dev/guide/)
- [Vite PWA guide](https://vite-pwa-org.netlify.app/guide/)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase API key guidance](https://supabase.com/docs/guides/api/api-keys)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Vercel Vite deployment](https://vercel.com/docs/frameworks/frontend/vite)

## Definition of done

- [ ] Approved planning artifacts are safely synchronized with GitHub.
- [ ] A clean foundation branch exists.
- [ ] The live Vercel PWA supports owner-only email/password sign-in.
- [ ] RLS protection is proven against signed-out and signed-in access.
- [ ] Returning sessions and sign-out work.
- [ ] The app installs and reopens its shell offline on the owner's iPhone.
- [ ] No privileged credential reaches the browser.
- [ ] The Supportability Gate is enforced and passing.
- [ ] No workout feature implementation has begun.

