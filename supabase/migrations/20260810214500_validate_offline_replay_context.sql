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
  if not found or current_slot <> p_payload ->> 'slot' then
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

create or replace function private.offline_workout_result_at(
  p_owner_id uuid,
  p_event_at timestamptz,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_workout public.workouts;
begin
  if p_result #>> '{workout,status}' <> 'completed' then return p_result; end if;
  update public.workouts
  set completed_at = p_event_at
  where workout_id = (p_result #>> '{workout,workout_id}')::uuid
    and user_id = p_owner_id
  returning * into saved_workout;
  if not found then raise exception 'Offline completed workout was not found'; end if;

  update public.training_lifecycle_state lifecycle
  set suggestion_due = not lifecycle.suggestion_dismissed and exists (
        select 1
        from public.workouts workout
        where workout.user_id = lifecycle.user_id
          and workout.blast_id = lifecycle.blast_id
          and workout.status = 'completed'
          and public.blast_has_elapsed_seven_weeks(
            lifecycle.blast_started_at,
            workout.completed_at
          )
      ),
      updated_at = now()
  where lifecycle.user_id = p_owner_id
    and lifecycle.phase = 'blast'
    and lifecycle.blast_id = saved_workout.blast_id;

  return jsonb_set(p_result, '{workout}', to_jsonb(saved_workout), false);
end;
$$;

revoke all on function private.offline_workout_result_at(uuid, timestamptz, jsonb)
from public, anon, authenticated;

create or replace function public.apply_offline_operation(
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
  event_at timestamptz := coalesce(
    nullif(p_payload ->> 'created_at', '')::timestamptz,
    now()
  );
  owner_id uuid := (select auth.uid());
  prior private.offline_operations;
  prior_assignment_id uuid;
  response jsonb;
  saved_assignment public.rotation_assignment_versions;
  saved_lifecycle public.training_lifecycle_state;
  saved_workout public.workouts;
  step_id uuid;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null then raise exception 'Operation ID required'; end if;
  if p_kind is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Offline operation is invalid';
  end if;

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

  if p_kind = 'start_workout' then
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
    perform private.assert_offline_start_context(owner_id, p_payload);
    response := to_jsonb(public.start_a1_workout(p_operation_id));
    if response ->> 'slot' <> p_payload ->> 'slot' then
      raise exception 'Offline start result changed';
    end if;
    update public.workouts
    set started_at = event_at
    where workout_id = (response ->> 'workout_id')::uuid
      and user_id = owner_id
    returning * into saved_workout;
    if not found then raise exception 'Offline started workout was not found'; end if;
    response := to_jsonb(saved_workout);
  elsif p_kind = 'save_workout_step' then
    step_id := private.offline_step_id(owner_id, p_payload);
    response := public.save_a1_workout_step(
      step_id,
      p_operation_id,
      p_payload ->> 'status',
      coalesce(p_payload -> 'weights', '[]'::jsonb),
      array(
        select value::integer
        from jsonb_array_elements_text(
          coalesce(p_payload -> 'reps', '[]'::jsonb)
        ) with ordinality as item(value, position)
        order by position
      ),
      (p_payload ->> 'duration_seconds')::integer
    );
    response := private.offline_workout_result_at(owner_id, event_at, response);
  elsif p_kind = 'undo_workout_step' then
    response := to_jsonb(public.undo_a1_workout_step(
      (p_payload ->> 'original_operation_id')::uuid,
      p_operation_id
    ));
  elsif p_kind = 'resolve_logbook_action' then
    step_id := private.offline_step_id(owner_id, p_payload);
    response := public.resolve_logbook_action(
      step_id,
      p_operation_id,
      p_payload ->> 'action'
    );
    response := private.offline_workout_result_at(owner_id, event_at, response);
  elsif p_kind = 'replace_failed_assignment' then
    step_id := private.offline_step_id(owner_id, p_payload);
    response := public.replace_failed_assignment(
      step_id,
      p_operation_id,
      p_payload ->> 'exercise',
      p_payload ->> 'protocol',
      p_payload ->> 'structure',
      coalesce(p_payload -> 'target_sets', '[]'::jsonb)
    );
    update public.rotation_assignment_versions
    set created_at = event_at
    where assignment_id = (response #>> '{assignment,assignment_id}')::uuid
      and user_id = owner_id
    returning * into saved_assignment;
    if not found then raise exception 'Offline replacement assignment was not found'; end if;
    response := jsonb_set(
      response,
      '{assignment}',
      to_jsonb(saved_assignment),
      false
    );
    response := private.offline_workout_result_at(owner_id, event_at, response);
  elsif p_kind = 'save_rotation_assignment' then
    select assignment_id into prior_assignment_id
    from public.rotation_assignment_versions
    where user_id = owner_id
      and slot = (p_payload ->> 'slot')
      and body_part = (p_payload ->> 'body_part')
      and active;
    response := to_jsonb(public.save_rotation_assignment(
      p_payload ->> 'slot',
      p_payload ->> 'body_part',
      p_payload ->> 'exercise',
      p_payload ->> 'protocol',
      p_payload ->> 'structure',
      coalesce(p_payload -> 'target_sets', '[]'::jsonb)
    ));
    if prior_assignment_id is distinct from (response ->> 'assignment_id')::uuid then
      update public.rotation_assignment_versions
      set created_at = event_at
      where assignment_id = (response ->> 'assignment_id')::uuid
        and user_id = owner_id
      returning * into saved_assignment;
      if not found then raise exception 'Offline rotation assignment was not found'; end if;
      response := to_jsonb(saved_assignment);
    end if;
  elsif p_kind = 'correct_history_performance' then
    step_id := private.offline_step_id(owner_id, p_payload);
    response := public.correct_workout_performance(
      step_id,
      p_operation_id,
      coalesce(p_payload -> 'weights', '[]'::jsonb),
      array(
        select value::integer
        from jsonb_array_elements_text(
          coalesce(p_payload -> 'reps', '[]'::jsonb)
        ) with ordinality as item(value, position)
        order by position
      ),
      (p_payload ->> 'duration_seconds')::integer
    );
  elsif p_kind = 'transition_training_lifecycle' then
    response := public.transition_training_lifecycle(
      p_payload ->> 'action',
      p_operation_id
    );
    if p_payload ->> 'action' = 'start_cruise' then
      update public.training_lifecycle_state
      set blast_ended_at = event_at,
          cruise_started_at = event_at
      where user_id = owner_id
      returning * into saved_lifecycle;
      response := to_jsonb(saved_lifecycle);
    elsif p_payload ->> 'action' = 'start_new_blast' then
      update public.training_lifecycle_state
      set blast_started_at = event_at
      where user_id = owner_id
      returning * into saved_lifecycle;
      response := to_jsonb(saved_lifecycle);
    end if;
  else
    raise exception 'Offline operation kind is invalid';
  end if;

  if response is null then raise exception 'Offline operation returned no result'; end if;
  insert into private.offline_operations (
    operation_id,
    user_id,
    kind,
    payload,
    result
  ) values (
    p_operation_id,
    owner_id,
    p_kind,
    p_payload,
    response
  );
  return response;
end;
$$;

revoke execute on function public.apply_offline_operation(uuid, text, jsonb)
from public, anon;
grant execute on function public.apply_offline_operation(uuid, text, jsonb)
to authenticated;
