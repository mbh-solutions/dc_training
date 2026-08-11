alter table public.foundation_profiles
add column weight_unit text not null default 'lb'
check (weight_unit in ('lb', 'kg'));

create or replace function public.save_weight_unit(
  p_device_id uuid,
  p_unit text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  active_device_id uuid;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_device_id is null then raise exception 'Device ID required'; end if;
  if p_unit not in ('lb', 'kg') then raise exception 'Weight unit is invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform private.require_account_available(owner_id);

  select device.device_id into active_device_id
  from private.active_editing_devices device
  where device.user_id = owner_id;

  if active_device_id is distinct from p_device_id then
    raise exception 'This device is read only';
  end if;

  update public.foundation_profiles
  set weight_unit = p_unit
  where user_id = owner_id;
  if not found then raise exception 'Owner profile was not found'; end if;

  return p_unit;
end;
$$;

revoke all on function public.save_weight_unit(uuid, text)
from public, anon;
grant execute on function public.save_weight_unit(uuid, text)
to authenticated;
