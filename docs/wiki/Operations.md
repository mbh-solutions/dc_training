# Operations

## Test and review

Use the commands in [Local development](https://github.com/mbh-solutions/dc_training/wiki/Local-development). The UI audit in `tests/ux-polish.test.mjs` covers all six slots, input validation, save/retry, drafts, history corrections, dialogs, and shared mulligan behavior. `tests/workout-usability-db.mjs` exercises the SQL migration chain and corresponding database rules. These checks do not prove every browser or device configuration.

Open a pull request from a `codex/` branch. The repository uses protected Supportability checks and CodeQL. Keep `.supportability-review.toml` specific to the proposed change and maintain `.supportability-characterization.json` when behavior coverage requires it. Inspect the currently required workflow and exact PR head; a successful run does not qualify a different head or gate release. Merge normally after all required checks pass.

## Release the app

1. Confirm a clean checkout and the intended Supabase and Vercel project identities. Environment variables with familiar names can belong to another project; verify the target explicitly.
2. If SQL changes, inspect local and remote migration histories, take a verified encrypted backup, and review the pending migration list. Apply only the intended migrations; do not mark them applied merely to hide a mismatch.
3. Verify database behavior in an isolated environment. Any production smoke test must preserve owner data and use a rollback-only transaction with appropriate timeouts and concurrency checks.
4. Merge the qualified PR. Deploy its exact merged commit to the Vercel `dc-training` project with the intended production public configuration. Do not assume a Git merge itself proves deployment.
5. Confirm the deployment is **READY**, its source matches the merged commit, and `https://dc-training.vercel.app` points to it. Check the HTML, app bundle and service worker responses, then the authenticated app and sync state.
6. An already-open client can retain its cached shell until a service-worker update activates. Reload after activation and verify the loaded bundle before diagnosing a deployment mismatch.

The production database is Supabase project `dncoyllptynavobkizis`. Treat that identifier as a target check, not authorization to run destructive commands. No database migration is needed for a documentation-only release.

## Backups and recovery

The [account lifecycle and backup runbook](https://github.com/mbh-solutions/dc_training/blob/main/docs/operations/ACCOUNT_LIFECYCLE_AND_BACKUPS.md) is the primary home for provisioning, encryption, restore commands, access checks, and deletion scheduling.

The **Daily encrypted Supabase backup** workflow runs at 07:17 UTC and supports manual dispatch. It retains encrypted artifacts for 30 days. It verifies decryption and the dump table of contents; that is not a full restore test. The dump includes app-owned `private` and `public` schemas, not Supabase Auth identities or password hashes. Restoring requires an isolated recovery project, a recreated owner, and controlled UUID remapping.

A failed backup requires investigation before relying on its artifact. Use the runbook for restore proof; never use production as the restore test target. Keep database credentials and the backup passphrase out of logs, issues, and browser configuration.

## Diagnose problems

| Symptom                              | Check                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Setup screen                         | All four build-time values from `.env.example`; restart/rebuild after configuration changes                                            |
| Sign-in works but owner access fails | Correct project, owner digest, pinned signing keys, foundation profile and account status                                              |
| Pending local work or sync failure   | [Offline recovery](https://github.com/mbh-solutions/dc_training/wiki/Offline-and-account); preserve local storage before investigating |
| SQL/client disagreement              | Paired reducer/domain and migration behavior; reproduce with isolated database tests                                                   |
| Merge blocked despite green checks   | Exact head, current required workflow release, unresolved requirements; do not bypass protection                                       |
| Deployment looks stale               | Canonical alias, deployment source commit and loaded service-worker/app bundle                                                         |

Source: [backup workflow](https://github.com/mbh-solutions/dc_training/blob/main/.github/workflows/daily-encrypted-backup.yml), [tests](https://github.com/mbh-solutions/dc_training/tree/main/tests), [hosting configuration](https://github.com/mbh-solutions/dc_training/blob/main/vercel.json).
