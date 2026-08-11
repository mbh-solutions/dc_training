# Account lifecycle and encrypted backups

This runbook is for the single pre-authorized DC Training owner. It does not
create public signup, an administrator surface, or a browser-accessible
privileged credential.

## Account deletion and recovery

1. From the active editing device, open Account, re-enter the current password,
   acknowledge the permanent-deletion warning, and request deletion.
2. The app immediately clears its local working copy and signs out every
   session. Cloud data becomes unavailable immediately.
3. For 30 days, signing in opens only the deletion-recovery screen. Select
   **Cancel deletion** to restore access before the displayed deadline.
4. At the deadline, the database scheduler deletes the authentication user.
   Existing foreign keys cascade that deletion through the owner's cloud data.
   Cancellation is no longer accepted.

The request RPC requires a password-authenticated session created within the
previous five minutes and the current active editing-device ID. Database
triggers and restrictive RLS policies reject owner-data access and mutation
while deletion is pending. The browser deletes its IndexedDB database, local
device identifiers, and cached owner-access marker when the request succeeds.

## Daily encrypted backup

The `Daily encrypted Supabase backup` GitHub Actions workflow runs at 07:17 UTC
and can also be dispatched manually. It uses the runner's native `pg_dump`,
GnuPG, and `pg_restore` tools to:

1. create a custom-format logical dump of the owner-data `private` and `public`
   schemas;
2. encrypt it with AES-256 before upload;
3. decrypt a runner-local verification copy and parse its table of contents;
4. upload only ciphertext as an Actions artifact; and
5. retain the artifact for 30 days.

A failed credential check, dump, encryption, verification, or upload fails the
workflow and is visible as a red Actions run. No plaintext dump is uploaded.
Because every artifact expires after 30 days, the last backup containing a
deleted account expires no later than 30 additional days after final deletion.

Repository administrators configure these Actions secrets:

- `SUPABASE_DB_URL`: the direct or session-pooler Postgres connection string for
  the production project, with SSL required. It authenticates as the dedicated
  `dc_training_backup` database role. Never use the browser anon key or the
  privileged `postgres` role.
- `BACKUP_PASSPHRASE`: a randomly generated high-entropy passphrase retained in
  the owner's password manager. Losing it makes every artifact unusable.

Never print, paste into an issue, or commit either value.

After applying the migrations in a fresh project, provision the login out of
band before enabling the workflow:

1. Generate a high-entropy database password in a local operator process that
   does not print or persist it.
2. In the same process, use a privileged Supabase SQL session to run
   `alter role dc_training_backup password '<generated password>';`.
3. Build the SSL-required direct or session-pooler URI with that password. For
   the session pooler, the custom-role username is
   `dc_training_backup.<project-ref>`.
4. Prove that URI with a read-only `pg_dump` connection, then store it as
   `SUPABASE_DB_URL`. Store a separately generated encryption passphrase as
   `BACKUP_PASSPHRASE`; pass both to `gh secret set` without command-line
   arguments or terminal output.

Repeat these steps whenever the backup login is rotated. A migration creates
the role and grants only its durable privileges; it intentionally never embeds
a password.

The backup role has one permitted connection, `private`/`public` schema usage,
table/sequence read, and RLS bypass so it can capture complete app data. It has
no Auth-schema access, write, role-management, database-creation, superuser, or
replication privilege. Its generated password is stored only in the Actions
connection-string secret.

Supabase owns and restricts the managed `auth` schema, so this least-privilege
logical dump does not copy password hashes, sessions, or identities. In a real
recovery, recreate the pre-authorized owner through Supabase Auth, then perform
an operator-controlled source-owner-to-recovery-owner UUID remap before
validating the restored foreign keys. Built-in password recovery remains the
normal authentication-recovery path; this artifact restores authoritative app
data.

## Operator-led restore proof

Restore only into an owner-confirmed, isolated recovery Supabase project. Never
use the production database as the proof target.

```powershell
gh run download <run-id> --repo mbh-solutions/dc_training --name <artifact-name> --dir .recovery
gpg --batch --pinentry-mode loopback --decrypt --output .recovery\dc-training.dump .recovery\dc-training-<run-id>.dump.gpg
pg_restore --list .recovery\dc-training.dump
pg_restore --clean --if-exists --no-owner --no-privileges --section=pre-data --dbname "$env:RECOVERY_DATABASE_URL" .recovery\dc-training.dump
pg_restore --no-owner --no-privileges --section=data --dbname "$env:RECOVERY_DATABASE_URL" .recovery\dc-training.dump
# Run the privileged source-owner-to-recovery-owner UUID remap here.
pg_restore --no-owner --no-privileges --section=post-data --dbname "$env:RECOVERY_DATABASE_URL" .recovery\dc-training.dump
```

The restore is deliberately split. After data and before post-data constraints,
use privileged recovery-only SQL to map the source owner UUID found in every
restored app-owned identifier/reference to the recreated Supabase Auth owner
UUID. Only then restore the foreign keys and other post-data objects. Prove
representative row counts and foreign-key integrity in `private` and `public`;
destroy the isolated recovery project and securely remove the local plaintext
dump. Record only the Actions run URL, artifact name/size/expiry,
restore-target identifier, tool versions, assertions, and pass/fail result. Do
not record owner data or secret values.

## Release operations

- A production release is blocked if the built-in password-reset email does not
  arrive for the pre-authorized owner. Custom SMTP remains deferred while that
  delivery succeeds.
- A red daily-backup run requires investigation before relying on the next
  artifact. Retry only after identifying and repairing the root cause.
- If password recovery is needed during the deletion window, complete password
  recovery first, then sign in and explicitly cancel deletion before the
  deadline.
