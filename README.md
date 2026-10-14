# DC Training Log

A private, phone-oriented workout logbook for a pre-authorized owner following a Doggcrapp (DC) rotation. Assign exercises, record weights and reps, follow the logbook, and keep training history across devices.

**[Open the app](https://dc-training.vercel.app)** · **[Read the wiki](https://github.com/mbh-solutions/dc_training/wiki)**

## Start training

Sign in with the provisioned owner account, assign the required exercises in **ROTATION**, then return to **HOME** and start the displayed workout. There is no public signup or guest mode.

Follow [Getting started](https://github.com/mbh-solutions/dc_training/wiki/Getting-started) for the complete first-workout walkthrough.

- Fixed A1 → B1 → A2 → B2 → A3 → B3 rotation, with user-controlled blast and cruise phases.
- Rest-pause entries labeled RP1/RP2/RP3, straight sets, timed holds, and visible target ranges.
- Numeric weights or Body weight, Bar, and Band load labels; LB/KG display conversion.
- Exercise history shared across slots, estimated-one-rep-max scoring, mulligan decisions, and corrections.
- Device-local workout drafts, offline saved operations, cloud sync, and explicit conflict recovery.

Offline access requires a cached app and a valid verified session. Unsynced work and unfinished drafts remain on their device. Read [Offline and account](https://github.com/mbh-solutions/dc_training/wiki/Offline-and-account) before clearing browser data or switching devices.

## Maintain the app

The client uses React, TypeScript and Vite; Vercel serves the PWA and Supabase provides authentication and PostgreSQL.

| Task                                     | Guide                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Configure and run a development checkout | [Local development](https://github.com/mbh-solutions/dc_training/wiki/Local-development)                 |
| Understand components and data flow      | [Architecture](https://github.com/mbh-solutions/dc_training/wiki/Architecture)                           |
| Test, deploy, migrate, and recover       | [Operations](https://github.com/mbh-solutions/dc_training/wiki/Operations)                               |
| Understand scoring and exercise history  | [Logbook and history](https://github.com/mbh-solutions/dc_training/wiki/Logbook-and-history)             |
| Edit and publish documentation           | [Documentation maintenance](https://github.com/mbh-solutions/dc_training/wiki/Documentation-maintenance) |

Use Node.js 24 and `npm ci`. Local checks are `npm test`, `npm run test:db`, `npm run lint`, and `npm run build`. Interactive use needs all four public settings in [.env.example](.env.example) and a provisioned development Supabase project; no demo account or turnkey local backend is bundled.

Wiki source lives in [docs/wiki](docs/wiki). The [backup runbook](docs/operations/ACCOUNT_LIFECYCLE_AND_BACKUPS.md) contains the detailed recovery procedure. [Design assets](docs/design) and [training research](docs/research) provide product context; use the wiki for operating instructions.
