-- Share consecutive-failure enforcement across compatible exercise appearances.
begin;
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
    and replace(step.exercise, 'Lying Deltech leg curl', 'Lying leg curl') = replace(new.exercise, 'Lying Deltech leg curl', 'Lying leg curl')
    and step.protocol = new.protocol
    and (step.protocol <> 'straight_set' or greatest(jsonb_array_length(step.target_sets), 1) = greatest(jsonb_array_length(new.target_sets), 1))
    and step.status = 'completed'
    and workout.blast_id = current_blast_id
  order by workout.progression_order desc, step.ordinal desc
  limit 1;

  if found then
    new.mulligan_used := coalesce(previous_step.resolution = 'use_mulligan', false);
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
      and replace(historical_assignment.exercise, 'Lying Deltech leg curl', 'Lying leg curl') = replace(current_assignment.exercise, 'Lying Deltech leg curl', 'Lying leg curl')
  ) history;
  return new;
end;
$$;

create or replace function private.recalculate_one_assignment_logbook(
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
  root_assignment public.rotation_assignment_versions;
  state_assignment_id uuid;
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
  select * into root_assignment
  from public.rotation_assignment_versions
  where assignment_id = p_assignment_id and user_id = owner_id
  for update;
  if not found then raise exception 'Assignment not found'; end if;
  select assignment.assignment_id into state_assignment_id from public.rotation_assignment_versions assignment
  where assignment.user_id = owner_id and assignment.active and replace(assignment.exercise, 'Lying Deltech leg curl', 'Lying leg curl') = replace(root_assignment.exercise, 'Lying Deltech leg curl', 'Lying leg curl')
    and assignment.protocol = root_assignment.protocol
    and (assignment.protocol <> 'straight_set' or greatest(jsonb_array_length(assignment.target_sets), 1) = greatest(jsonb_array_length(root_assignment.target_sets), 1))
  order by assignment.assignment_id limit 1;
  assignment_active := found;

  select blast_id into active_blast_id
  from public.training_lifecycle_state
  where user_id = owner_id;

  perform 1
  from public.workout_steps step
  where replace(step.exercise, 'Lying Deltech leg curl', 'Lying leg curl') = replace(root_assignment.exercise, 'Lying Deltech leg curl', 'Lying leg curl')
      and step.protocol = root_assignment.protocol
      and (step.protocol <> 'straight_set' or greatest(jsonb_array_length(step.target_sets), 1) = greatest(jsonb_array_length(root_assignment.target_sets), 1))
    and step.user_id = owner_id
    and step.status = 'completed'
  for update;
  delete from public.assignment_logbook_states state using public.rotation_assignment_versions assignment
  where state.assignment_id = assignment.assignment_id and assignment.user_id = owner_id and replace(assignment.exercise, 'Lying Deltech leg curl', 'Lying leg curl') = replace(root_assignment.exercise, 'Lying Deltech leg curl', 'Lying leg curl')
    and assignment.protocol = root_assignment.protocol
    and (assignment.protocol <> 'straight_set' or greatest(jsonb_array_length(assignment.target_sets), 1) = greatest(jsonb_array_length(root_assignment.target_sets), 1));

  for current_step in
    select step.*
    from public.workout_steps step
    join public.workouts workout on workout.workout_id = step.workout_id
    where replace(step.exercise, 'Lying Deltech leg curl', 'Lying leg curl') = replace(root_assignment.exercise, 'Lying Deltech leg curl', 'Lying leg curl')
      and step.protocol = root_assignment.protocol
      and (step.protocol <> 'straight_set' or greatest(jsonb_array_length(step.target_sets), 1) = greatest(jsonb_array_length(root_assignment.target_sets), 1))
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

    select step.weight_entries, step.reps, step.duration_seconds
      into previous_weights, previous_reps, previous_duration
    from public.workout_steps step
    join public.workouts workout on workout.workout_id = step.workout_id
    join public.workouts current_workout on current_workout.workout_id = current_step.workout_id
    where step.user_id = owner_id and step.status = 'completed'
      and replace(step.exercise, 'Lying Deltech leg curl', 'Lying leg curl') = replace(current_step.exercise, 'Lying Deltech leg curl', 'Lying leg curl')
      and step.protocol = current_step.protocol
      and (step.protocol <> 'straight_set' or greatest(jsonb_array_length(step.target_sets), 1) = greatest(jsonb_array_length(current_step.target_sets), 1))
      and workout.blast_id = current_blast_id
      and (workout.progression_order < current_workout.progression_order or
        (workout.workout_id = current_workout.workout_id and step.ordinal < current_step.ordinal))
    order by workout.progression_order desc, step.ordinal desc limit 1;
    first_performance := not found;

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

      if evaluation_status = 'baseline' then
        current_step.fresh_baseline := true;
        current_step.verdict := null;
        current_step.resolution := null;
        state_value := null;
      elsif evaluation_status = 'win' then
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
      state_assignment_id,
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
    where replace(step.exercise, 'Lying Deltech leg curl', 'Lying leg curl') = replace(root_assignment.exercise, 'Lying Deltech leg curl', 'Lying leg curl')
      and step.protocol = root_assignment.protocol
      and (step.protocol <> 'straight_set' or greatest(jsonb_array_length(step.target_sets), 1) = greatest(jsonb_array_length(root_assignment.target_sets), 1))
      and step.user_id = owner_id
      and step.status = 'completed'
  ), '[]'::jsonb);
end;
$$;

revoke all on function private.recalculate_one_assignment_logbook(uuid) from public, anon, authenticated;

create or replace function public.recalculate_assignment_logbook(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare exercise_name text; item record; results jsonb := '[]'::jsonb;
begin
  select replace(exercise, 'Lying Deltech leg curl', 'Lying leg curl') into exercise_name
  from public.rotation_assignment_versions where assignment_id = p_assignment_id and user_id = auth.uid();
  if not found then raise exception 'Assignment not found'; end if;
  for item in select distinct on (protocol, case when protocol = 'straight_set' then greatest(jsonb_array_length(target_sets),1) else 1 end) assignment_id from public.rotation_assignment_versions
    where user_id = auth.uid() and replace(exercise, 'Lying Deltech leg curl', 'Lying leg curl') = exercise_name
    order by protocol, case when protocol = 'straight_set' then greatest(jsonb_array_length(target_sets),1) else 1 end, assignment_id
  loop
    results := results || private.recalculate_one_assignment_logbook(item.assignment_id);
  end loop;
  return results;
end;
$$;

-- Preserve the deployed save/undo functions and their offline guards, changing
-- only the shared-history evaluation point. Fail closed if their anchors drift.
do $migration$
declare definition text; changed text;
begin
  definition := replace(pg_get_functiondef('public.save_workout_step(uuid,uuid,text,jsonb,integer[],integer)'::regprocedure), chr(13), '');
  changed := replace(definition,
    'finish_result := public.finish_workout_if_ready(current_workout.workout_id, p_operation_id);',
    'if current_step.assignment_id is not null and current_step.status = ''completed'' then
       perform public.recalculate_assignment_logbook(current_step.assignment_id);
       select * into current_step from public.workout_steps where step_id = p_step_id;
     end if;
     finish_result := public.finish_workout_if_ready(current_workout.workout_id, p_operation_id);');
  if changed = definition then raise exception 'Shared save anchor missing'; end if;
  execute changed;
  definition := replace(pg_get_functiondef('public.undo_workout_step(uuid,uuid)'::regprocedure), chr(13), '');
  changed := replace(definition,
    replace($old$if current_step.assignment_id is not null then
    delete from public.assignment_logbook_states
    where assignment_id = current_step.assignment_id;
    if saved_operation.logbook_state_before is not null then
      insert into public.assignment_logbook_states (assignment_id, user_id, state, updated_at)
      values (
        (saved_operation.logbook_state_before ->> 'assignment_id')::uuid,
        owner_id,
        saved_operation.logbook_state_before ->> 'state',
        now()
      );
    end if;
  end if;$old$, chr(13), ''),
    $new$if current_step.assignment_id is not null then
      perform public.recalculate_assignment_logbook(current_step.assignment_id);
    end if;$new$);
  if changed = definition then raise exception 'Shared undo anchor missing'; end if;
  execute changed;
end;
$migration$;
commit;
