alter table public.foundation_profiles
add column weight_unit text not null default 'lb'
check (weight_unit in ('lb', 'kg'));

create or replace function public.save_weight_unit(
  p_device_id uuid,
  p_operation_id uuid,
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
  operation_payload jsonb := jsonb_build_object('unit', p_unit);
  prior private.offline_operations;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_device_id is null then raise exception 'Device ID required'; end if;
  if p_operation_id is null then raise exception 'Operation ID required'; end if;
  if p_unit not in ('lb', 'kg') then raise exception 'Weight unit is invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform private.require_account_available(owner_id);

  select device.device_id into active_device_id
  from private.active_editing_devices device
  where device.user_id = owner_id;

  if active_device_id is distinct from p_device_id then
    raise exception 'This device is read only';
  end if;

  select * into prior
  from private.offline_operations operation
  where operation.operation_id = p_operation_id;

  if found then
    if prior.user_id <> owner_id
      or prior.kind <> 'set_weight_unit'
      or prior.payload <> operation_payload
    then
      raise exception 'Operation ID payload mismatch';
    end if;
    return prior.result ->> 'weight_unit';
  end if;

  update public.foundation_profiles
  set weight_unit = p_unit
  where user_id = owner_id;
  if not found then raise exception 'Owner profile was not found'; end if;

  insert into private.offline_operations (
    operation_id,
    user_id,
    kind,
    payload,
    result
  ) values (
    p_operation_id,
    owner_id,
    'set_weight_unit',
    operation_payload,
    jsonb_build_object('weight_unit', p_unit)
  );

  return p_unit;
end;
$$;

revoke all on function public.save_weight_unit(uuid, uuid, text)
from public, anon;
grant execute on function public.save_weight_unit(uuid, uuid, text)
to authenticated;
