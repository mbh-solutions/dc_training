create or replace function private.owner_session_is_live(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
    and exists (
      select 1
      from auth.sessions session
      where session.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
        and session.user_id = p_user_id
    );
$$;

revoke all on function private.owner_session_is_live(uuid)
from public, anon, authenticated;

create or replace function private.account_is_available(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.owner_session_is_live(p_user_id)
    and not exists (
      select 1
      from private.account_deletion_requests request
      where request.user_id = p_user_id
    );
$$;

create or replace function public.cancel_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
begin
  if not private.owner_session_is_live(owner_id) then
    raise exception 'Live auth session required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
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
