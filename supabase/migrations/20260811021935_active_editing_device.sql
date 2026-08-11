create table private.active_editing_devices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id uuid not null,
  transferred_at timestamptz not null default now()
);

alter table private.active_editing_devices enable row level security;
revoke all on table private.active_editing_devices
from public, anon, authenticated;

create or replace function public.register_editing_device(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  current_device private.active_editing_devices;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_device_id is null then raise exception 'Device ID required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  insert into private.active_editing_devices (user_id, device_id)
  values (owner_id, p_device_id)
  on conflict (user_id) do nothing;

  select * into strict current_device
  from private.active_editing_devices device
  where device.user_id = owner_id;

  return jsonb_build_object(
    'active', current_device.device_id = p_device_id,
    'device_id', current_device.device_id,
    'transferred_at', current_device.transferred_at
  );
end;
$$;

revoke execute on function public.register_editing_device(uuid)
from public, anon;
grant execute on function public.register_editing_device(uuid)
to authenticated;

create or replace function public.transfer_editing_device(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  current_device private.active_editing_devices;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_device_id is null then raise exception 'Device ID required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  insert into private.active_editing_devices (user_id, device_id)
  values (owner_id, p_device_id)
  on conflict (user_id) do update
  set device_id = excluded.device_id,
      transferred_at = case
        when active_editing_devices.device_id = excluded.device_id
          then active_editing_devices.transferred_at
        else now()
      end
  returning * into current_device;

  return jsonb_build_object(
    'active', true,
    'device_id', current_device.device_id,
    'transferred_at', current_device.transferred_at
  );
end;
$$;

revoke execute on function public.transfer_editing_device(uuid)
from public, anon;
grant execute on function public.transfer_editing_device(uuid)
to authenticated;

alter function public.apply_offline_operation(uuid, text, jsonb)
set schema private;
alter function private.apply_offline_operation(uuid, text, jsonb)
rename to apply_owner_offline_operation;
revoke all on function private.apply_owner_offline_operation(uuid, text, jsonb)
from public, anon, authenticated;

create or replace function public.apply_offline_operation(
  p_operation_id uuid,
  p_kind text,
  p_payload jsonb,
  p_device_id uuid
)
returns jsonb
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

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select device.device_id into active_device_id
  from private.active_editing_devices device
  where device.user_id = owner_id;

  if active_device_id is distinct from p_device_id then
    raise exception 'This device is read only';
  end if;

  return private.apply_owner_offline_operation(
    p_operation_id,
    p_kind,
    p_payload
  );
end;
$$;

revoke execute on function public.apply_offline_operation(uuid, text, jsonb, uuid)
from public, anon;
grant execute on function public.apply_offline_operation(uuid, text, jsonb, uuid)
to authenticated;

revoke insert, update, delete on table public.rotation_assignments
from authenticated;
drop policy if exists "Users can create only their rotation assignments"
on public.rotation_assignments;
drop policy if exists "Users can update only their rotation assignments"
on public.rotation_assignments;

revoke execute on function public.correct_workout_performance(uuid, uuid, jsonb, integer[], integer)
from authenticated;
revoke execute on function public.replace_failed_assignment(uuid, uuid, text, text, text, jsonb)
from authenticated;
revoke execute on function public.resolve_logbook_action(uuid, uuid, text)
from authenticated;
revoke execute on function public.save_a1_workout_step(uuid, uuid, text, jsonb, integer[])
from authenticated;
revoke execute on function public.save_a1_workout_step(uuid, uuid, text, jsonb, integer[], integer)
from authenticated;
revoke execute on function public.save_rotation_assignment(text, text, text, text, text, jsonb)
from authenticated;
revoke execute on function public.save_workout_step(uuid, uuid, text, jsonb, integer[], integer)
from authenticated;
revoke execute on function public.start_a1_workout(uuid)
from authenticated;
revoke execute on function public.start_workout(uuid)
from authenticated;
revoke execute on function public.transition_training_lifecycle(text, uuid)
from authenticated;
revoke execute on function public.undo_a1_workout_step(uuid, uuid)
from authenticated;
revoke execute on function public.undo_workout_step(uuid, uuid)
from authenticated;
