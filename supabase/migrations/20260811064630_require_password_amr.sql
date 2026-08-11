create or replace function public.request_account_deletion(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  recent_authentication jsonb := auth.jwt() -> 'amr' -> 0;
  requested timestamptz := clock_timestamp();
  result jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if recent_authentication ->> 'method' is distinct from 'password'
    or coalesce((recent_authentication ->> 'timestamp')::bigint, 0)
      < extract(epoch from requested - interval '5 minutes')::bigint
    or not exists (
      select 1
      from auth.sessions session
      where session.id = session_id
        and session.user_id = owner_id
        and session.created_at >= requested - interval '5 minutes'
    )
  then
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
