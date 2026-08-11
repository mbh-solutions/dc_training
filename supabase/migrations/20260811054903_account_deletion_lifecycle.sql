create extension if not exists pg_cron with schema pg_catalog;

create role dc_training_backup with
  login
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit
  noreplication
  bypassrls
  connection limit 1;

grant connect on database postgres to dc_training_backup;
grant usage on schema auth, private, public to dc_training_backup;
grant select on all tables in schema auth, private, public to dc_training_backup;
grant select on all sequences in schema auth, private, public to dc_training_backup;

create table private.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default clock_timestamp(),
  finalize_at timestamptz not null default (clock_timestamp() + interval '30 days'),
  check (finalize_at = requested_at + interval '30 days')
);

alter table private.account_deletion_requests enable row level security;
revoke all on table private.account_deletion_requests from public, anon, authenticated;
grant select on table private.account_deletion_requests to dc_training_backup;

create or replace function private.account_is_available(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and not exists (
      select 1
      from private.account_deletion_requests request
      where request.user_id = p_user_id
    );
$$;

revoke all on function private.account_is_available(uuid) from public, anon, authenticated;

create or replace function public.account_is_available()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_is_available((select auth.uid()));
$$;

revoke all on function public.account_is_available() from public, anon;
grant execute on function public.account_is_available() to authenticated;

create or replace function public.account_deletion_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'requested_at', request.requested_at,
    'finalize_at', request.finalize_at
  )
  from private.account_deletion_requests request
  where request.user_id = (select auth.uid());
$$;

revoke all on function public.account_deletion_status() from public, anon;
grant execute on function public.account_deletion_status() to authenticated;

create or replace function public.request_account_deletion(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  requested timestamptz := clock_timestamp();
  result jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1
    from auth.sessions session
    where session.id = session_id
      and session.user_id = owner_id
      and session.created_at >= requested - interval '5 minutes'
  ) then
    raise exception 'Password re-entry required';
  end if;
  if not exists (
    select 1
    from private.active_editing_devices device
    where device.user_id = owner_id and device.device_id = p_device_id
  ) then
    raise exception 'Active editing device required';
  end if;

  insert into private.account_deletion_requests (user_id, requested_at, finalize_at)
  values (owner_id, requested, requested + interval '30 days')
  on conflict (user_id) do nothing;

  select jsonb_build_object(
    'requested_at', request.requested_at,
    'finalize_at', request.finalize_at
  )
  into result
  from private.account_deletion_requests request
  where request.user_id = owner_id;
  return result;
end;
$$;

revoke all on function public.request_account_deletion(uuid) from public, anon;
grant execute on function public.request_account_deletion(uuid) to authenticated;

create or replace function public.cancel_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if exists (
    select 1
    from private.account_deletion_requests request
    where request.user_id = owner_id and request.finalize_at <= clock_timestamp()
  ) then
    raise exception 'Recovery window expired';
  end if;
  delete from private.account_deletion_requests request
  where request.user_id = owner_id;
  return found;
end;
$$;

revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

create or replace function private.guard_account_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
    and not private.account_is_available((select auth.uid()))
  then
    raise exception 'Account is unavailable during deletion recovery';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.guard_account_availability() from public, anon, authenticated;

do $$
declare
  target record;
begin
  for target in
    select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname in ('public', 'private')
      and c.relkind = 'r'
      and a.attname = 'user_id'
      and not a.attisdropped
      and c.relname <> 'account_deletion_requests'
  loop
    execute format(
      'create trigger guard_account_availability before insert or update or delete on %I.%I for each row execute function private.guard_account_availability()',
      target.schema_name,
      target.table_name
    );
    if target.schema_name = 'public' and target.relrowsecurity then
      execute format(
        'create policy "Account must be available" on %I.%I as restrictive for all to authenticated using (public.account_is_available()) with check (public.account_is_available())',
        target.schema_name,
        target.table_name
      );
    end if;
  end loop;
end;
$$;

create or replace function private.finalize_account_deletions(
  p_now timestamptz default clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  with deleted as (
    delete from auth.users owner
    using private.account_deletion_requests request
    where owner.id = request.user_id and request.finalize_at <= p_now
    returning owner.id
  )
  select count(*)::integer into deleted_count from deleted;
  return deleted_count;
end;
$$;

revoke all on function private.finalize_account_deletions(timestamptz)
from public, anon, authenticated;

select cron.schedule(
  'dc-training-finalize-account-deletions',
  '* * * * *',
  'select private.finalize_account_deletions();'
);
