create or replace function private.resolve_offline_blast_reference(
  p_owner_id uuid,
  p_reference text
)
returns uuid
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  reference_operation_id uuid;
  resolved_blast_id uuid;
begin
  if p_reference like 'local:%' then
    begin
      reference_operation_id := substring(p_reference from 7)::uuid;
    exception when invalid_text_representation then
      raise exception 'Offline lifecycle blast is invalid';
    end;
    select (operation.result ->> 'blast_id')::uuid into resolved_blast_id
    from private.offline_operations operation
    where operation.operation_id = reference_operation_id
      and operation.user_id = p_owner_id
      and operation.kind = 'transition_training_lifecycle'
      and operation.payload ->> 'action' = 'start_new_blast';
    if resolved_blast_id is null then
      raise exception 'Offline lifecycle blast is not synchronized';
    end if;
    return resolved_blast_id;
  end if;
  begin
    return p_reference::uuid;
  exception when invalid_text_representation then
    raise exception 'Offline lifecycle blast is invalid';
  end;
end;
$$;

revoke all on function private.resolve_offline_blast_reference(uuid, text)
from public, anon, authenticated;

create or replace function private.assert_offline_lifecycle_context(
  p_owner_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_blast_id uuid;
  current_phase text;
  intended_blast_id uuid;
begin
  if coalesce(jsonb_typeof(p_payload -> 'blast_id') <> 'string', true)
    or coalesce(jsonb_typeof(p_payload -> 'phase') <> 'string', true)
  then
    raise exception 'Offline lifecycle context is invalid';
  end if;
  intended_blast_id := private.resolve_offline_blast_reference(
    p_owner_id,
    p_payload ->> 'blast_id'
  );
  select phase, blast_id into current_phase, current_blast_id
  from public.training_lifecycle_state
  where user_id = p_owner_id
  for update;
  if not found
    or current_phase <> p_payload ->> 'phase'
    or current_blast_id is distinct from intended_blast_id
  then
    raise exception 'Offline lifecycle context changed';
  end if;
end;
$$;

revoke all on function private.assert_offline_lifecycle_context(uuid, jsonb)
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
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
    perform private.assert_offline_lifecycle_context(owner_id, p_payload);
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
