alter table public.foundation_profiles
add column account_revision bigint
check (account_revision is null or account_revision >= 0);

create table private.offline_batches (
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  device_id uuid not null,
  base_revision bigint not null check (base_revision >= 0),
  operations jsonb not null check (jsonb_typeof(operations) = 'array'),
  status text not null check (status in ('applied', 'stale', 'rejected')),
  revision bigint not null check (revision >= 0),
  operation_results jsonb check (
    operation_results is null or jsonb_typeof(operation_results) = 'array'
  ),
  error_code text,
  error_message text,
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  resolution text check (resolution = 'use_cloud'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (user_id, batch_id),
  check ((resolution is null) = (resolved_at is null))
);

alter table private.offline_batches enable row level security;
revoke all on table private.offline_batches from public, anon, authenticated;

create trigger guard_account_availability
before insert or update or delete on private.offline_batches
for each row execute function private.guard_account_availability();

create or replace function private.apply_weight_unit_operation(
  p_operation_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  operation_payload jsonb;
  prior private.offline_operations;
  unit text;
  result jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null then raise exception 'Operation ID required'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Offline operation is invalid';
  end if;

  unit := p_payload ->> 'unit';
  if unit is null or unit not in ('lb', 'kg') then
    raise exception 'Weight unit is invalid';
  end if;
  operation_payload := jsonb_build_object('unit', unit);
  if p_payload <> operation_payload then
    raise exception 'Offline operation is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform private.require_account_available(owner_id);
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

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
    return prior.result;
  end if;

  update public.foundation_profiles
  set weight_unit = unit
  where user_id = owner_id;
  if not found then raise exception 'Owner profile was not found'; end if;

  result := jsonb_build_object('weight_unit', unit);
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
    result
  );

  return result;
end;
$$;

revoke all on function private.apply_weight_unit_operation(uuid, jsonb)
from public, anon, authenticated;

create or replace function private.register_editing_device(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  current_device private.active_editing_devices;
  owner_revision bigint;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if current_session_id is null then raise exception 'Auth session required'; end if;
  if p_device_id is null then raise exception 'Device ID required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform private.require_account_available(owner_id);

  select profile.account_revision into strict owner_revision
  from public.foundation_profiles profile
  where profile.user_id = owner_id;

  if owner_revision is not null then
    select * into strict current_device
    from private.active_editing_devices device
    where device.user_id = owner_id;
    return jsonb_build_object(
      'active', false,
      'device_id', p_device_id,
      'transferred_at', current_device.transferred_at,
      'mode', 'revision_multi',
      'revision', owner_revision
    );
  end if;

  insert into private.active_editing_devices (
    user_id,
    device_id,
    legacy_session_id
  ) values (owner_id, p_device_id, current_session_id)
  on conflict (user_id) do nothing;

  select * into strict current_device
  from private.active_editing_devices device
  where device.user_id = owner_id;

  if current_device.device_id = p_device_id
    or current_device.device_id = current_session_id
  then
    update private.active_editing_devices device
    set device_id = p_device_id,
        legacy_session_id = current_session_id
    where device.user_id = owner_id
    returning * into current_device;
  end if;

  return jsonb_build_object(
    'active', current_device.device_id = p_device_id,
    'device_id', p_device_id,
    'transferred_at', current_device.transferred_at,
    'mode', 'legacy_single',
    'revision', 0
  );
end;
$$;

create or replace function private.transfer_editing_device(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  current_device private.active_editing_devices;
  owner_revision bigint;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if current_session_id is null then raise exception 'Auth session required'; end if;
  if p_device_id is null then raise exception 'Device ID required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform private.require_account_available(owner_id);
  select profile.account_revision into strict owner_revision
  from public.foundation_profiles profile
  where profile.user_id = owner_id;

  if owner_revision is not null then
    raise exception 'App update required';
  end if;

  insert into private.active_editing_devices (
    user_id,
    device_id,
    legacy_session_id
  ) values (owner_id, p_device_id, current_session_id)
  on conflict (user_id) do update
  set device_id = excluded.device_id,
      legacy_session_id = excluded.legacy_session_id,
      transferred_at = case
        when active_editing_devices.device_id = excluded.device_id
          then active_editing_devices.transferred_at
        else now()
      end
  returning * into current_device;

  return jsonb_build_object(
    'active', true,
    'device_id', current_device.device_id,
    'transferred_at', current_device.transferred_at,
    'mode', 'legacy_single',
    'revision', 0
  );
end;
$$;

revoke all on function private.transfer_editing_device(uuid)
from public, anon, authenticated;

create or replace function public.transfer_editing_device(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_account_available((select auth.uid()));
  return private.transfer_editing_device(p_device_id);
end;
$$;

revoke all on function public.transfer_editing_device(uuid) from public, anon;
grant execute on function public.transfer_editing_device(uuid) to authenticated;

create or replace function public.activate_multi_device_sync(
  p_device_id uuid,
  p_takeover boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  active_device_id uuid;
  owner_revision bigint;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if current_session_id is null then raise exception 'Auth session required'; end if;
  if p_device_id is null then raise exception 'Device ID required'; end if;
  if p_takeover is null then raise exception 'Takeover choice required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform private.require_account_available(owner_id);
  select profile.account_revision into strict owner_revision
  from public.foundation_profiles profile
  where profile.user_id = owner_id
  for update;

  if owner_revision is not null then
    return jsonb_build_object(
      'status', 'activated',
      'revision', owner_revision
    );
  end if;

  select device.device_id into active_device_id
  from private.active_editing_devices device
  where device.user_id = owner_id;
  if active_device_id is distinct from p_device_id and not p_takeover then
    return jsonb_build_object(
      'status', 'upgrade_required',
      'revision', 0
    );
  end if;

  if p_takeover then
    insert into private.active_editing_devices (
      user_id,
      device_id,
      legacy_session_id
    ) values (owner_id, p_device_id, current_session_id)
    on conflict (user_id) do update
    set device_id = excluded.device_id,
        legacy_session_id = excluded.legacy_session_id,
        transferred_at = case
          when active_editing_devices.device_id = excluded.device_id
            then active_editing_devices.transferred_at
          else now()
        end;
  end if;

  update public.foundation_profiles profile
  set account_revision = 0
  where profile.user_id = owner_id and profile.account_revision is null
  returning profile.account_revision into owner_revision;
  if not found then raise exception 'Account revision changed'; end if;
  return jsonb_build_object(
    'status', 'activated',
    'revision', owner_revision
  );
end;
$$;

revoke all on function public.activate_multi_device_sync(uuid, boolean)
from public, anon;
grant execute on function public.activate_multi_device_sync(uuid, boolean)
to authenticated;

create or replace function private.apply_offline_operation(
  p_operation_id uuid,
  p_kind text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  current_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  active_legacy_session_id uuid;
  owner_revision bigint;
  prior private.offline_operations;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if current_session_id is null then raise exception 'App update required'; end if;
  if p_operation_id is null then raise exception 'Operation ID required'; end if;
  if p_kind is null
    or p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception 'Offline operation is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform private.require_account_available(owner_id);
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  select * into prior
  from private.offline_operations operation
  where operation.operation_id = p_operation_id;
  if found then
    if prior.user_id <> owner_id
      or prior.kind <> p_kind
      or prior.payload <> p_payload
    then
      raise exception 'Operation ID payload mismatch';
    end if;
    return prior.result;
  end if;

  select profile.account_revision into strict owner_revision
  from public.foundation_profiles profile
  where profile.user_id = owner_id;
  if owner_revision is not null then raise exception 'Atomic sync required'; end if;

  insert into private.active_editing_devices (
    user_id,
    device_id,
    legacy_session_id
  ) values (owner_id, current_session_id, current_session_id)
  on conflict (user_id) do nothing;

  select device.legacy_session_id into strict active_legacy_session_id
  from private.active_editing_devices device
  where device.user_id = owner_id;
  if active_legacy_session_id <> current_session_id then
    raise exception 'This device is read only';
  end if;

  return private.apply_owner_offline_operation(
    p_operation_id,
    p_kind,
    p_payload
  );
end;
$$;

create or replace function private.apply_offline_operation(
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
  owner_revision bigint;
  prior private.offline_operations;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_device_id is null then raise exception 'Device ID required'; end if;
  if p_operation_id is null then raise exception 'Operation ID required'; end if;
  if p_kind is null
    or p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception 'Offline operation is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform private.require_account_available(owner_id);
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  select * into prior
  from private.offline_operations operation
  where operation.operation_id = p_operation_id;
  if found then
    if prior.user_id <> owner_id
      or prior.kind <> p_kind
      or prior.payload <> p_payload
    then
      raise exception 'Operation ID payload mismatch';
    end if;
    return prior.result;
  end if;

  select profile.account_revision into strict owner_revision
  from public.foundation_profiles profile
  where profile.user_id = owner_id;
  if owner_revision is not null then raise exception 'Atomic sync required'; end if;

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
  owner_revision bigint;
  prior private.offline_operations;
  result jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_device_id is null then raise exception 'Device ID required'; end if;
  if p_operation_id is null then raise exception 'Operation ID required'; end if;
  if p_unit is null or p_unit not in ('lb', 'kg') then
    raise exception 'Weight unit is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform private.require_account_available(owner_id);
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

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

  select profile.account_revision into strict owner_revision
  from public.foundation_profiles profile
  where profile.user_id = owner_id;
  if owner_revision is not null then raise exception 'Atomic sync required'; end if;

  select device.device_id into active_device_id
  from private.active_editing_devices device
  where device.user_id = owner_id;
  if active_device_id is distinct from p_device_id then
    raise exception 'This device is read only';
  end if;

  result := private.apply_weight_unit_operation(p_operation_id, operation_payload);
  return result ->> 'weight_unit';
end;
$$;

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
  owner_revision bigint;
  requested timestamptz;
  result jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_device_id is null then raise exception 'Device ID required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  requested := clock_timestamp();
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

  select profile.account_revision into strict owner_revision
  from public.foundation_profiles profile
  where profile.user_id = owner_id
  for update;

  if owner_revision is null and not exists (
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
  ) into result
  from private.account_deletion_requests request
  where request.user_id = owner_id;

  delete from auth.sessions session where session.user_id = owner_id;
  return result;
end;
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
  if owner_id is null then raise exception 'Authentication required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if not private.owner_session_is_live(owner_id) then
    raise exception 'Live auth session required';
  end if;
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

create or replace function public.account_deletion_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  result jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if not private.owner_session_is_live(owner_id) then
    raise exception 'Live auth session required';
  end if;
  select jsonb_build_object(
    'requested_at', request.requested_at,
    'finalize_at', request.finalize_at
  ) into result
  from private.account_deletion_requests request
  where request.user_id = owner_id;
  return result;
end;
$$;

revoke all on function public.account_deletion_status() from public, anon;
grant execute on function public.account_deletion_status() to authenticated;

create or replace function public.account_sync_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  owner_revision bigint;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform private.require_account_available(owner_id);
  select profile.account_revision into strict owner_revision
  from public.foundation_profiles profile
  where profile.user_id = owner_id;

  return jsonb_build_object(
    'mode', case
      when owner_revision is null then 'legacy_single'
      else 'revision_multi'
    end,
    'revision', coalesce(owner_revision, 0)
  );
end;
$$;

create or replace function public.apply_offline_batch(
  p_batch_id uuid,
  p_device_id uuid,
  p_base_revision bigint,
  p_operations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  owner_revision bigint;
  prior_batch private.offline_batches;
  prior_operation private.offline_operations;
  operation_item record;
  operation_id uuid;
  operation_kind text;
  operation_payload jsonb;
  operation_result jsonb;
  operation_results jsonb := '[]'::jsonb;
  operation_count integer;
  new_operation_count integer := 0;
  attempt_status text;
  error_code text;
  error_message text;
  response jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_batch_id is null then raise exception 'Batch ID required'; end if;
  if p_device_id is null then raise exception 'Device ID required'; end if;
  if p_base_revision is null or p_base_revision < 0 then
    raise exception 'Base revision is invalid';
  end if;
  if p_operations is null or jsonb_typeof(p_operations) <> 'array' then
    raise exception 'Offline batch is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform private.require_account_available(owner_id);

  select * into prior_batch
  from private.offline_batches batch
  where batch.user_id = owner_id and batch.batch_id = p_batch_id
  for update;
  if found then
    if prior_batch.base_revision <> p_base_revision
      or prior_batch.operations <> p_operations
    then
      raise exception 'Batch ID payload mismatch';
    end if;
    return prior_batch.response;
  end if;

  select profile.account_revision into strict owner_revision
  from public.foundation_profiles profile
  where profile.user_id = owner_id
  for update;
  operation_count := jsonb_array_length(p_operations);
  if owner_revision is null then
    raise exception 'Multi-device sync activation required';
  end if;
  if operation_count = 0 then
    return jsonb_build_object(
      'status', 'applied',
      'revision', owner_revision
    );
  end if;

  begin
    for operation_item in
      select item.value, item.ordinality
      from jsonb_array_elements(p_operations) with ordinality as item(value, ordinality)
      order by item.ordinality
    loop
      if jsonb_typeof(operation_item.value) <> 'object' then
        raise exception 'Offline batch operation is invalid';
      end if;
      operation_id := nullif(operation_item.value ->> 'operation_id', '')::uuid;
      operation_kind := nullif(operation_item.value ->> 'kind', '');
      operation_payload := operation_item.value -> 'payload';
      if operation_id is null
        or operation_kind is null
        or operation_payload is null
        or jsonb_typeof(operation_payload) <> 'object'
      then
        raise exception 'Offline batch operation is invalid';
      end if;
      if operation_kind not in (
        'start_workout',
        'save_workout_step',
        'undo_workout_step',
        'resolve_logbook_action',
        'replace_failed_assignment',
        'save_rotation_assignment',
        'correct_history_performance',
        'transition_training_lifecycle',
        'set_weight_unit'
      ) then
        raise exception 'Offline operation kind is invalid';
      end if;
    end loop;

    if exists (
      select 1
      from jsonb_array_elements(p_operations) item(value)
      group by (item.value ->> 'operation_id')::uuid
      having count(*) > 1
    ) then
      raise exception 'Duplicate operation ID in batch';
    end if;

    for operation_id in
      select (item.value ->> 'operation_id')::uuid
      from jsonb_array_elements(p_operations) item(value)
      order by (item.value ->> 'operation_id')::uuid
    loop
      perform pg_advisory_xact_lock(hashtextextended(operation_id::text, 0));
    end loop;

    for operation_item in
      select item.value, item.ordinality
      from jsonb_array_elements(p_operations) with ordinality as item(value, ordinality)
      order by item.ordinality
    loop
      operation_id := (operation_item.value ->> 'operation_id')::uuid;
      operation_kind := operation_item.value ->> 'kind';
      operation_payload := operation_item.value -> 'payload';
      select * into prior_operation
      from private.offline_operations operation
      where operation.operation_id =
        (operation_item.value ->> 'operation_id')::uuid;
      if found then
        if prior_operation.user_id is distinct from owner_id
          or prior_operation.kind is distinct from operation_kind
          or prior_operation.payload is distinct from operation_payload
        then
          raise exception 'Operation ID payload mismatch';
        end if;
      else
        new_operation_count := new_operation_count + 1;
      end if;
    end loop;

    if new_operation_count > 0 and p_base_revision <> owner_revision then
      attempt_status := 'stale';
      error_code := 'revision_stale';
      error_message := 'Account revision changed';
    else
      for operation_item in
        select item.value, item.ordinality
        from jsonb_array_elements(p_operations) with ordinality as item(value, ordinality)
        order by item.ordinality
      loop
        operation_id := (operation_item.value ->> 'operation_id')::uuid;
        operation_kind := operation_item.value ->> 'kind';
        operation_payload := operation_item.value -> 'payload';
        select * into prior_operation
        from private.offline_operations operation
        where operation.operation_id =
          (operation_item.value ->> 'operation_id')::uuid;
        if found then
          operation_result := prior_operation.result;
        else
          begin
            if operation_kind = 'set_weight_unit' then
              operation_result := private.apply_weight_unit_operation(
                operation_id,
                operation_payload
              );
            else
              operation_result := private.apply_owner_offline_operation(
                operation_id,
                operation_kind,
                operation_payload
              );
            end if;
          exception
            when invalid_text_representation
              or invalid_datetime_format
              or numeric_value_out_of_range
            then
              raise exception 'Offline operation payload is invalid';
          end;
        end if;
        operation_results := operation_results || jsonb_build_array(
          jsonb_build_object(
            'operation_id', operation_id,
            'result', operation_result
          )
        );
      end loop;

      if new_operation_count > 0 then
        update public.foundation_profiles profile
        set account_revision = profile.account_revision + 1
        where profile.user_id = owner_id
          and profile.account_revision = owner_revision
        returning profile.account_revision into owner_revision;
        if not found then raise exception 'Account revision changed'; end if;
      end if;
      attempt_status := 'applied';
    end if;
  exception
    when others then
      get stacked diagnostics
        error_code = returned_sqlstate,
        error_message = message_text;
      if error_code <> 'P0001' then raise; end if;
      select profile.account_revision into strict owner_revision
      from public.foundation_profiles profile
      where profile.user_id = owner_id;
      attempt_status := 'rejected';
      operation_results := null;
  end;

  if attempt_status = 'applied' then
    response := jsonb_build_object(
      'status', 'applied',
      'revision', coalesce(owner_revision, 0)
    );
  elsif attempt_status = 'stale' then
    response := jsonb_build_object(
      'status', 'stale',
      'revision', coalesce(owner_revision, 0),
      'error_code', error_code,
      'error_message', error_message
    );
  else
    response := jsonb_build_object(
      'status', 'rejected',
      'revision', coalesce(owner_revision, 0),
      'error_code', error_code,
      'error_message', error_message
    );
  end if;

  insert into private.offline_batches (
    user_id,
    batch_id,
    device_id,
    base_revision,
    operations,
    status,
    revision,
    operation_results,
    error_code,
    error_message,
    response
  ) values (
    owner_id,
    p_batch_id,
    p_device_id,
    p_base_revision,
    p_operations,
    attempt_status,
    coalesce(owner_revision, 0),
    operation_results,
    error_code,
    error_message,
    response
  );

  return response;
end;
$$;

create or replace function public.resolve_offline_batch(
  p_batch_id uuid,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  owner_revision bigint;
  conflict_batch private.offline_batches;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_batch_id is null then raise exception 'Batch ID required'; end if;
  if p_resolution is null or p_resolution <> 'use_cloud' then
    raise exception 'Offline conflict resolution is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform private.require_account_available(owner_id);
  select * into conflict_batch
  from private.offline_batches batch
  where batch.user_id = owner_id and batch.batch_id = p_batch_id
  for update;
  if not found then raise exception 'Offline conflict was not found'; end if;

  select profile.account_revision into strict owner_revision
  from public.foundation_profiles profile
  where profile.user_id = owner_id;
  if conflict_batch.resolution = 'use_cloud' then
    return jsonb_build_object(
      'status', 'resolved',
      'revision', coalesce(owner_revision, 0)
    );
  end if;
  if conflict_batch.status not in ('stale', 'rejected') then
    raise exception 'Offline conflict cannot be resolved';
  end if;
  if conflict_batch.resolution is not null then
    raise exception 'Offline conflict resolution is incompatible';
  end if;

  update private.offline_batches batch
  set resolution = p_resolution,
      resolved_at = clock_timestamp()
  where batch.user_id = owner_id and batch.batch_id = p_batch_id;

  return jsonb_build_object(
    'status', 'resolved',
    'revision', coalesce(owner_revision, 0)
  );
end;
$$;

revoke all on function public.account_sync_status() from public, anon;
grant execute on function public.account_sync_status() to authenticated;
revoke all on function public.apply_offline_batch(uuid, uuid, bigint, jsonb)
from public, anon;
grant execute on function public.apply_offline_batch(uuid, uuid, bigint, jsonb)
to authenticated;
revoke all on function public.resolve_offline_batch(uuid, text) from public, anon;
grant execute on function public.resolve_offline_batch(uuid, text) to authenticated;

do $$
declare
  allowed_rpc_oids oid[] := array[
    'public.activate_multi_device_sync(uuid, boolean)'::regprocedure::oid,
    'public.account_deletion_status()'::regprocedure::oid,
    'public.account_is_available()'::regprocedure::oid,
    'public.account_sync_status()'::regprocedure::oid,
    'public.apply_offline_batch(uuid, uuid, bigint, jsonb)'::regprocedure::oid,
    'public.apply_offline_operation(uuid, text, jsonb)'::regprocedure::oid,
    'public.apply_offline_operation(uuid, text, jsonb, uuid)'::regprocedure::oid,
    'public.cancel_account_deletion()'::regprocedure::oid,
    'public.register_editing_device(uuid)'::regprocedure::oid,
    'public.request_account_deletion(uuid)'::regprocedure::oid,
    'public.resolve_offline_batch(uuid, text)'::regprocedure::oid,
    'public.save_weight_unit(uuid, uuid, text)'::regprocedure::oid,
    'public.transfer_editing_device(uuid)'::regprocedure::oid
  ];
  candidate_oid oid;
begin
  foreach candidate_oid in array allowed_rpc_oids
  loop
    execute format(
      'revoke all on function %s from public, anon',
      candidate_oid::regprocedure
    );
    execute format(
      'grant execute on function %s to authenticated',
      candidate_oid::regprocedure
    );
  end loop;

  for candidate_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.oid <> all (allowed_rpc_oids)
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      candidate_oid::regprocedure
    );
  end loop;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.oid <> all (allowed_rpc_oids)
      and has_function_privilege('authenticated', p.oid, 'execute')
  ) then
    raise exception 'Unexpected authenticated security-definer RPC';
  end if;

  if exists (
    select 1
    from unnest(allowed_rpc_oids) allowed(oid)
    where not has_function_privilege('authenticated', allowed.oid, 'execute')
  ) then
    raise exception 'Required authenticated security-definer RPC is unavailable';
  end if;
end;
$$;
