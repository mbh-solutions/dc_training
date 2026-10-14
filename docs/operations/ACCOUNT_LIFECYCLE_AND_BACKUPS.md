# Account lifecycle and encrypted backups

This runbook is for the single pre-authorized DC Training owner. It does not
create public signup, an administrator surface, or a browser-accessible
privileged credential.

## Account lifecycle enforcement

Owner-facing sign-in, deletion, recovery, and sync instructions are in the
[Offline and account guide](https://github.com/mbh-solutions/dc_training/wiki/Offline-and-account).

The deletion RPC requires a password-authenticated session created within five
minutes. Its database transaction records the deletion request and revokes owner
Auth sessions. Database guards reject training-data access while deletion is
pending; the client clears its owner working copy and signs out. Signing in
during the 30-day recovery window exposes only the deletion-recovery flow.
Cancellation is rejected at the finalization deadline.

The database scheduler invokes `private.finalize_account_deletions()` each
minute. It deletes due Auth users; foreign keys cascade through owner data.
Recovery requires both the deadline check and the deletion schedule to remain
intact. Password recovery does not cancel a pending deletion request.

## Sync recovery boundaries

The client submits its pending operations as an atomic batch against the expected
cloud state counter. Conflicting or rejected batches remain retained for explicit
review; the app does not silently merge or discard them. Successfully synced data
can restore on another device. Work that never left an unavailable device cannot
be recovered from the cloud.

Compatibility handling for single-writer clients is implemented in
`20260811171245_allow_multi_device_editing.sql`. Activation must drain or explicitly
resolve a device's pending work. `CONTINUE ON THIS DEVICE` requires the owner's
choice; it is not an operator shortcut for overwriting unsynced work. See the
[architecture guide](https://github.com/mbh-solutions/dc_training/wiki/Architecture)
for the main data flow.

## Daily encrypted backup

The `Daily encrypted Supabase backup` GitHub Actions workflow runs at 07:17 UTC
and can also be dispatched manually. It runs the native `pg_dump`/`pg_restore`
tools from an immutable PostgreSQL 17 container image and uses GnuPG to:

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
connection-string secret. Postgres default privileges give future
migration-created tables and sequences the same read-only backup access.

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
@'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dc_training_backup') then
    create role dc_training_backup nologin nosuperuser nocreatedb nocreaterole noinherit noreplication;
  end if;
end;
$$;
alter role dc_training_backup
  nologin
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit
  noreplication
  bypassrls
  connection limit 1;
'@ | psql "$env:RECOVERY_DATABASE_URL" --set ON_ERROR_STOP=1
pg_restore --clean --if-exists --no-owner --section=pre-data --dbname "$env:RECOVERY_DATABASE_URL" .recovery\dc-training.dump
pg_restore --no-owner --section=data --dbname "$env:RECOVERY_DATABASE_URL" .recovery\dc-training.dump
# Run the privileged source-owner-to-recovery-owner UUID remap here.
pg_restore --no-owner --section=post-data --dbname "$env:RECOVERY_DATABASE_URL" .recovery\dc-training.dump
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

The archive preserves schema/table/function ACLs, but PostgreSQL logical dumps
do not contain cluster-level role attributes. Before pre-data restore, a
privileged recovery operator must create or normalize the `nologin`
`dc_training_backup` role with `BYPASSRLS` and `CONNECTION LIMIT 1`; all standard
Supabase roles must also exist. The recovery database connection must have
permission to restore default privileges owned by Supabase administrative
roles. After post-data restore, verify the restored grants and revocations,
including authenticated owner-table access, anon denial, public gateway
execution only for `authenticated`, and no `authenticated` execution on their
private implementations. This query must return `true`:

```powershell
@'
select
  has_table_privilege('authenticated', 'public.foundation_profiles', 'select')
  and not has_table_privilege('anon', 'public.foundation_profiles', 'select')
  and not has_table_privilege(
    'authenticated',
    'private.account_deletion_requests',
    'select'
  )
  and has_function_privilege(
    'authenticated',
    'public.apply_offline_operation(uuid,text,jsonb,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.apply_offline_operation(uuid,text,jsonb,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.apply_offline_operation(uuid,text,jsonb,uuid)',
    'execute'
  ) as acl_hardening_restored;
'@ | psql "$env:RECOVERY_DATABASE_URL" --set ON_ERROR_STOP=1
```

The app-schema archive does not contain `pg_cron` catalog state. Recreate and
verify the finalizer schedule after every restore:

```powershell
@'
create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid)
from cron.job
where jobname = 'dc-training-finalize-account-deletions';
select cron.schedule(
  'dc-training-finalize-account-deletions',
  '* * * * *',
  'select private.finalize_account_deletions();'
);
select count(*) = 1 as finalizer_schedule_restored
from cron.job
where jobname = 'dc-training-finalize-account-deletions'
  and schedule = '* * * * *'
  and command = 'select private.finalize_account_deletions();'
  and active;
'@ | psql "$env:RECOVERY_DATABASE_URL" --set ON_ERROR_STOP=1
```

## Release operations

- A production release is blocked if the built-in password-reset email does not
  arrive for the pre-authorized owner. Check the configured email delivery before
  releasing account-recovery changes.
- A red daily-backup run requires investigation before relying on the next
  artifact. Retry only after identifying and repairing the root cause.
- If password recovery is needed during the deletion window, complete password
  recovery first, then sign in and explicitly cancel deletion before the
  deadline.
