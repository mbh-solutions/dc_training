alter table public.workouts add column progression_order bigint;

with ranked as (
  select
    workout.workout_id,
    row_number() over (
      partition by workout.user_id
      order by coalesce(operation.applied_at, workout.started_at), workout.workout_id
    ) as progression_order
  from public.workouts workout
  left join private.offline_operations operation
    on operation.operation_id = workout.start_operation_id
    and operation.user_id = workout.user_id
    and operation.kind = 'start_workout'
)
update public.workouts workout
set progression_order = ranked.progression_order
from ranked
where ranked.workout_id = workout.workout_id;

alter table public.workouts alter column progression_order set not null;

create unique index workouts_owner_progression_order
on public.workouts (user_id, progression_order);

create or replace function public.prepare_workout_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lifecycle public.training_lifecycle_state;
begin
  insert into public.training_lifecycle_state (user_id)
  values (new.user_id)
  on conflict (user_id) do nothing;

  select * into lifecycle
  from public.training_lifecycle_state
  where user_id = new.user_id
  for update;

  if lifecycle.phase = 'cruise' then
    raise exception 'Start a new blast before logging a DC workout';
  end if;

  new.blast_id := lifecycle.blast_id;
  select coalesce(max(workout.progression_order), 0) + 1
  into new.progression_order
  from public.workouts workout
  where workout.user_id = new.user_id;
  return new;
end;
$$;

revoke all on function public.prepare_workout_lifecycle()
from public, anon, authenticated;

create or replace function public.prepare_workout_step_baseline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_assignment public.rotation_assignment_versions;
  current_blast_id uuid;
  previous_step public.workout_steps;
begin
  if new.kind <> 'exercise' or new.assignment_id is null then return new; end if;

  select workout.blast_id into current_blast_id
  from public.workouts workout
  where workout.workout_id = new.workout_id and workout.user_id = new.user_id;
  if current_blast_id is null then raise exception 'Workout blast is missing'; end if;

  select step.* into previous_step
  from public.workout_steps step
  join public.workouts workout on workout.workout_id = step.workout_id
  where step.user_id = new.user_id
    and step.assignment_id = new.assignment_id
    and step.status = 'completed'
    and workout.blast_id = current_blast_id
  order by workout.progression_order desc, step.ordinal desc
  limit 1;

  if found then
    new.previous_weight_entries := previous_step.weight_entries;
    new.previous_reps := previous_step.reps;
    new.previous_duration_seconds := previous_step.duration_seconds;
    new.fresh_baseline := false;
    new.reference_history := '[]'::jsonb;
    return new;
  end if;

  select * into current_assignment
  from public.rotation_assignment_versions
  where assignment_id = new.assignment_id and user_id = new.user_id;
  if not found then raise exception 'Workout assignment is missing'; end if;

  new.previous_weight_entries := '[]'::jsonb;
  new.previous_reps := '{}';
  new.previous_duration_seconds := null;
  new.fresh_baseline := true;
  new.mulligan_used := false;
  select coalesce(
    jsonb_agg(entry order by progression_order, ordinal),
    '[]'::jsonb
  ) into new.reference_history
  from (
    select
      workout.progression_order,
      workout.started_at as performed_at,
      step.ordinal,
      jsonb_build_object(
        'assignment_id', historical_assignment.assignment_id,
        'performed_at', workout.started_at,
        'protocol', historical_assignment.protocol,
        'structure', historical_assignment.structure,
        'target_sets', historical_assignment.target_sets,
        'weight_entries', step.weight_entries,
        'reps', step.reps,
        'duration_seconds', step.duration_seconds,
        'verdict', step.verdict
      ) as entry
    from public.workout_steps step
    join public.workouts workout on workout.workout_id = step.workout_id
    join public.rotation_assignment_versions historical_assignment
      on historical_assignment.assignment_id = step.assignment_id
    where step.user_id = new.user_id
      and step.status = 'completed'
      and historical_assignment.slot = current_assignment.slot
      and historical_assignment.body_part = current_assignment.body_part
      and historical_assignment.exercise = current_assignment.exercise
  ) history;
  return new;
end;
$$;

revoke all on function public.prepare_workout_step_baseline()
from public, anon, authenticated;

create or replace function public.recalculate_assignment_logbook(
  p_assignment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_blast_id uuid;
  assignment_active boolean;
  current_blast_id uuid;
  current_step public.workout_steps;
  evaluation jsonb;
  evaluation_status text;
  first_performance boolean := true;
  last_blast_id uuid;
  lifecycle_deferred boolean := false;
  lifecycle_was_deferred boolean;
  owner_id uuid := (select auth.uid());
  previous_duration integer;
  previous_reps integer[];
  previous_weights jsonb;
  resolution_before text;
  state_before_step text;
  state_value text;
begin
  select active into assignment_active
  from public.rotation_assignment_versions
  where assignment_id = p_assignment_id and user_id = owner_id
  for update;
  if not found then raise exception 'Assignment not found'; end if;

  select blast_id into active_blast_id
  from public.training_lifecycle_state
  where user_id = owner_id;

  perform 1
  from public.workout_steps step
  where step.assignment_id = p_assignment_id
    and step.user_id = owner_id
    and step.status = 'completed'
  for update;
  delete from public.assignment_logbook_states
  where assignment_id = p_assignment_id;

  for current_step in
    select step.*
    from public.workout_steps step
    join public.workouts workout on workout.workout_id = step.workout_id
    where step.assignment_id = p_assignment_id
      and step.user_id = owner_id
      and step.status = 'completed'
    order by workout.progression_order, step.ordinal
  loop
    select blast_id into current_blast_id
    from public.workouts where workout_id = current_step.workout_id;
    if last_blast_id is distinct from current_blast_id then
      first_performance := true;
      lifecycle_deferred := false;
      previous_duration := null;
      previous_reps := '{}';
      previous_weights := '[]'::jsonb;
      state_value := null;
      last_blast_id := current_blast_id;
    end if;

    lifecycle_was_deferred := lifecycle_deferred;
    resolution_before := current_step.resolution;
    state_before_step := state_value;
    current_step.mulligan_used := coalesce(state_value = 'mulligan_used', false);
    current_step.enforcement_action := null;
    current_step.set_verdicts := '{}';

    if first_performance then
      current_step.previous_weight_entries := '[]'::jsonb;
      current_step.previous_reps := '{}';
      current_step.previous_duration_seconds := null;
      current_step.fresh_baseline := true;
      current_step.verdict := null;
      current_step.resolution := null;
      state_value := null;
    else
      current_step.fresh_baseline := false;
      current_step.previous_weight_entries := previous_weights;
      current_step.previous_reps := previous_reps;
      current_step.previous_duration_seconds := previous_duration;
      evaluation := public.evaluate_logbook_performance(
        current_step.body_part,
        current_step.protocol,
        current_step.target_sets,
        current_step.weight_entries,
        current_step.reps,
        current_step.duration_seconds,
        previous_weights,
        previous_reps,
        previous_duration
      );
      evaluation_status := evaluation ->> 'status';
      current_step.set_verdicts := array(
        select jsonb_array_elements_text(evaluation -> 'set_verdicts')
      );

      if evaluation_status = 'ambiguous' then
        if current_step.resolution = 'count_win' then
          evaluation_status := 'win';
        elsif current_step.resolution in (
          'count_failure',
          'use_mulligan',
          'replaced'
        ) then
          evaluation_status := 'failure';
        else
          current_step.verdict := null;
          current_step.enforcement_action := 'abs_choice';
        end if;
      end if;

      if evaluation_status = 'win' then
        current_step.verdict := 'win';
        current_step.enforcement_action := null;
        if current_step.resolution <> 'replaced'
          and evaluation ->> 'status' <> 'ambiguous'
        then current_step.resolution := null; end if;
        state_value := null;
      elsif evaluation_status = 'failure' then
        current_step.verdict := 'failure';
        if current_step.resolution = 'count_win' then
          current_step.resolution := null;
        end if;
        if current_step.resolution = 'replaced' then
          state_value := null;
          current_step.enforcement_action := null;
        elsif state_value in (
          'mulligan_used',
          'first_failure_pending',
          'replacement_required'
        ) then
          state_value := 'replacement_required';
          current_step.enforcement_action := 'replacement_required';
        elsif current_step.resolution = 'use_mulligan' then
          state_value := 'mulligan_used';
        else
          state_value := 'first_failure_pending';
          current_step.enforcement_action := 'first_failure';
        end if;
      end if;
    end if;

    if current_blast_id is distinct from active_blast_id
      or not assignment_active
    then
      state_value := null;
      current_step.enforcement_action := null;
    elsif lifecycle_was_deferred then
      state_value := state_before_step;
      current_step.enforcement_action := null;
      current_step.resolution := resolution_before;
    elsif current_step.enforcement_action is not null then
      lifecycle_deferred := true;
    end if;

    update public.workout_steps set
      previous_weight_entries = current_step.previous_weight_entries,
      previous_reps = current_step.previous_reps,
      previous_duration_seconds = current_step.previous_duration_seconds,
      verdict = current_step.verdict,
      set_verdicts = current_step.set_verdicts,
      enforcement_action = current_step.enforcement_action,
      fresh_baseline = current_step.fresh_baseline,
      mulligan_used = current_step.mulligan_used,
      resolution = current_step.resolution
    where step_id = current_step.step_id;

    previous_weights := current_step.weight_entries;
    previous_reps := current_step.reps;
    previous_duration := current_step.duration_seconds;
    first_performance := false;
  end loop;

  if assignment_active
    and last_blast_id = active_blast_id
    and state_value is not null
  then
    insert into public.assignment_logbook_states (
      assignment_id,
      user_id,
      state,
      updated_at
    ) values (
      p_assignment_id,
      owner_id,
      state_value,
      now()
    );
  end if;

  return coalesce((
    select jsonb_agg(
      to_jsonb(step)
      order by workout.progression_order, step.ordinal
    )
    from public.workout_steps step
    join public.workouts workout on workout.workout_id = step.workout_id
    where step.assignment_id = p_assignment_id
      and step.user_id = owner_id
      and step.status = 'completed'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.recalculate_assignment_logbook(uuid)
from public, anon, authenticated;

create or replace function private.assert_offline_rotation_predecessor(
  p_owner_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_operation_id uuid;
  intended_operation_id uuid;
begin
  if not (p_payload ? 'previous_workout_operation_id')
    or jsonb_typeof(p_payload -> 'previous_workout_operation_id')
      not in ('null', 'string')
  then
    raise exception 'Offline start predecessor is invalid';
  end if;
  begin
    intended_operation_id := (p_payload ->> 'previous_workout_operation_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'Offline start predecessor is invalid';
  end;
  select workout.start_operation_id into current_operation_id
  from public.workouts workout
  where workout.user_id = p_owner_id
    and workout.status = 'completed'
  order by workout.progression_order desc
  limit 1;
  if current_operation_id is distinct from intended_operation_id then
    raise exception 'Offline start rotation predecessor changed';
  end if;
end;
$$;

revoke all on function private.assert_offline_rotation_predecessor(uuid, jsonb)
from public, anon, authenticated;

create or replace function private.assert_offline_performance_context(
  p_owner_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_step public.workout_steps;
  expected jsonb := p_payload -> 'expected_performance';
  step_id uuid;
begin
  if jsonb_typeof(expected) <> 'object'
    or jsonb_typeof(expected -> 'weights') <> 'array'
    or jsonb_typeof(expected -> 'reps') <> 'array'
    or not (expected ? 'duration_seconds')
    or jsonb_typeof(expected -> 'duration_seconds') not in ('null', 'number')
  then
    raise exception 'Offline performance context is invalid';
  end if;
  step_id := private.offline_step_id(p_owner_id, p_payload);
  select * into current_step
  from public.workout_steps step
  where step.step_id = step_id
    and step.user_id = p_owner_id
    and step.kind = 'exercise'
    and step.status = 'completed'
  for update;
  if not found then raise exception 'Offline performance was not found'; end if;
  if current_step.weight_entries is distinct from expected -> 'weights'
    or to_jsonb(current_step.reps) is distinct from expected -> 'reps'
    or coalesce(
      to_jsonb(current_step.duration_seconds),
      'null'::jsonb
    ) is distinct from expected -> 'duration_seconds'
  then
    raise exception 'Offline performance context changed';
  end if;
end;
$$;

revoke all on function private.assert_offline_performance_context(uuid, jsonb)
from public, anon, authenticated;

alter function public.apply_offline_operation(uuid, text, jsonb)
set schema private;
alter function private.apply_offline_operation(uuid, text, jsonb)
rename to dispatch_offline_operation;
revoke all on function private.dispatch_offline_operation(uuid, text, jsonb)
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
  owner_id uuid := (select auth.uid());
  prior private.offline_operations;
begin
  if p_kind <> 'correct_history_performance' then
    return private.dispatch_offline_operation(
      p_operation_id,
      p_kind,
      p_payload
    );
  end if;
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null then raise exception 'Operation ID required'; end if;
  if jsonb_typeof(p_payload) <> 'object' then
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

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform private.assert_offline_performance_context(owner_id, p_payload);
  return private.dispatch_offline_operation(
    p_operation_id,
    p_kind,
    p_payload
  );
end;
$$;

revoke execute on function public.apply_offline_operation(uuid, text, jsonb)
from public, anon;
grant execute on function public.apply_offline_operation(uuid, text, jsonb)
to authenticated;
