create or replace function private.assert_offline_start_context(
  p_owner_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_assignments jsonb;
  current_blast_id uuid;
  current_phase text;
  current_slot text;
  intended_assignments jsonb := '{}'::jsonb;
  intended_blast_id uuid;
  item record;
  reference_id text;
  reference_operation_id uuid;
begin
  if coalesce(jsonb_typeof(p_payload -> 'assignments') <> 'object', true)
    or coalesce(jsonb_typeof(p_payload -> 'blast_id') <> 'string', true)
    or coalesce(jsonb_typeof(p_payload -> 'slot') <> 'string', true)
  then
    raise exception 'Offline start context is invalid';
  end if;
  if exists (
    select 1
    from jsonb_each(p_payload -> 'assignments') assignment
    where jsonb_typeof(assignment.value) <> 'string'
  ) then
    raise exception 'Offline start assignments are invalid';
  end if;

  if p_payload ->> 'blast_id' like 'local:%' then
    begin
      reference_operation_id := substring((p_payload ->> 'blast_id') from 7)::uuid;
    exception when invalid_text_representation then
      raise exception 'Offline start blast is invalid';
    end;
    select (operation.result ->> 'blast_id')::uuid into intended_blast_id
    from private.offline_operations operation
    where operation.operation_id = reference_operation_id
      and operation.user_id = p_owner_id
      and operation.kind = 'transition_training_lifecycle'
      and operation.payload ->> 'action' = 'start_new_blast';
    if intended_blast_id is null then
      raise exception 'Offline start blast is not synchronized';
    end if;
  else
    begin
      intended_blast_id := (p_payload ->> 'blast_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Offline start blast is invalid';
    end;
  end if;

  select phase, blast_id into current_phase, current_blast_id
  from public.training_lifecycle_state
  where user_id = p_owner_id
  for update;
  if not found
    or current_phase <> 'blast'
    or current_blast_id <> intended_blast_id
  then
    raise exception 'Offline start blast changed';
  end if;
  if exists (
    select 1
    from public.workouts
    where user_id = p_owner_id and status = 'in_progress'
  ) then
    raise exception 'Offline start conflicts with an active workout';
  end if;

  select next_slot into current_slot
  from public.workout_rotation_state
  where user_id = p_owner_id
  for update;
  if not found then
    if p_payload ->> 'slot' <> 'A1'
      or exists (
        select 1 from public.workouts where user_id = p_owner_id
      )
    then
      raise exception 'Offline start rotation changed';
    end if;
    current_slot := 'A1';
  elsif current_slot <> p_payload ->> 'slot' then
    raise exception 'Offline start rotation changed';
  end if;

  for item in
    select key, value
    from jsonb_each_text(p_payload -> 'assignments')
  loop
    reference_id := null;
    reference_operation_id := null;
    if item.value like 'local:%' then
      begin
        reference_operation_id := substring(item.value from 7)::uuid;
      exception when invalid_text_representation then
        raise exception 'Offline start assignment reference is invalid';
      end;
      select coalesce(
        operation.result #>> '{assignment,assignment_id}',
        operation.result ->> 'assignment_id'
      ) into reference_id
      from private.offline_operations operation
      where operation.operation_id = reference_operation_id
        and operation.user_id = p_owner_id
        and operation.kind in (
          'replace_failed_assignment',
          'save_rotation_assignment'
        );
      if reference_id is null then
        raise exception 'Offline start assignment is not synchronized';
      end if;
    else
      begin
        reference_id := (item.value::uuid)::text;
      exception when invalid_text_representation then
        raise exception 'Offline start assignment reference is invalid';
      end;
    end if;
    intended_assignments := intended_assignments
      || jsonb_build_object(item.key, reference_id);
  end loop;

  select coalesce(
    jsonb_object_agg(assignment.body_part, assignment.assignment_id::text),
    '{}'::jsonb
  ) into active_assignments
  from public.rotation_assignment_versions assignment
  where assignment.user_id = p_owner_id
    and assignment.slot = current_slot
    and assignment.active;
  if active_assignments is distinct from intended_assignments then
    raise exception 'Offline start assignments changed';
  end if;
end;
$$;

revoke all on function private.assert_offline_start_context(uuid, jsonb)
from public, anon, authenticated;
