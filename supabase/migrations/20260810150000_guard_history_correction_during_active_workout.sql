create or replace function public.correct_workout_performance(
  p_step_id uuid,
  p_operation_id uuid,
  p_weights jsonb,
  p_reps integer[],
  p_duration_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_step public.workout_steps;
  normalized jsonb;
  owner_id uuid := (select auth.uid());
  prior_operation public.logbook_operations;
  recalculated jsonb;
  result jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null then raise exception 'Operation ID required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select * into prior_operation
  from public.logbook_operations
  where operation_id = p_operation_id and user_id = owner_id;
  if found then return prior_operation.result; end if;

  select * into current_step
  from public.workout_steps
  where step_id = p_step_id
    and user_id = owner_id
    and kind = 'exercise'
    and status = 'completed'
  for update;
  if not found then raise exception 'Completed exercise performance not found'; end if;

  if exists (
    select 1
    from public.workouts active_workout
    join public.workout_steps active_step
      on active_step.workout_id = active_workout.workout_id
      and active_step.user_id = owner_id
    where active_workout.user_id = owner_id
      and active_workout.status = 'in_progress'
      and active_step.assignment_id = current_step.assignment_id
  ) then
    raise exception 'Finish active workout before correcting this exercise';
  end if;

  normalized := public.normalize_workout_performance(
    current_step.protocol,
    current_step.target_sets,
    p_weights,
    p_reps,
    p_duration_seconds
  );
  update public.workout_steps set
    weight_entries = normalized -> 'weight_entries',
    reps = array(select jsonb_array_elements_text(normalized -> 'reps')::integer),
    duration_seconds = (normalized ->> 'duration_seconds')::integer,
    resolution = case when current_step.resolution = 'replaced' then 'replaced' else null end,
    last_operation_id = null,
    updated_at = now()
  where step_id = current_step.step_id;

  recalculated := public.recalculate_assignment_logbook(current_step.assignment_id);
  select * into current_step
  from public.workout_steps
  where step_id = p_step_id;
  result := jsonb_build_object(
    'step', to_jsonb(current_step),
    'recalculated_steps', recalculated,
    'state', (
      select to_jsonb(state)
      from public.assignment_logbook_states state
      where state.assignment_id = current_step.assignment_id
    )
  );
  insert into public.logbook_operations (operation_id, user_id, step_id, action, result)
  values (p_operation_id, owner_id, current_step.step_id, 'correct', result);
  return result;
end;
$$;

revoke execute on function public.correct_workout_performance(uuid, uuid, jsonb, integer[], integer) from public, anon;
grant execute on function public.correct_workout_performance(uuid, uuid, jsonb, integer[], integer) to authenticated;
