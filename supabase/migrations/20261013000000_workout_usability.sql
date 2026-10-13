-- Workout usability update. Historical rows and legacy assignments remain readable.
begin;

do $$
declare item record; definition text;
begin
  for item in select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint where conrelid = 'public.rotation_assignment_versions'::regclass and contype = 'c'
  loop
    definition := item.definition;
    if definition like '%Lying Deltech leg curl%' then
      definition := replace(definition, '''Lying Deltech leg curl''::text', '''Lying Deltech leg curl''::text, ''Lying leg curl''::text');
    end if;
    if definition like '%Leg extension%' and definition like '%rest_pause%' then
      definition := '(' || substring(definition from 7) || ') OR (
        body_part = ''quadriceps'' AND exercise = ''Leg extension'' AND (
          (protocol = ''rest_pause'' AND (
            (structure = ''11-15'' AND target_sets = ''[{"min":11,"max":15}]''::jsonb) OR
            (structure = ''15-20'' AND target_sets = ''[{"min":15,"max":20}]''::jsonb))) OR
          (protocol = ''straight_set'' AND (
            (structure = ''single-10-15'' AND target_sets = ''[{"min":10,"max":15}]''::jsonb) OR
            (structure = ''single-15-20'' AND target_sets = ''[{"min":15,"max":20}]''::jsonb)))
        ))';
      definition := 'CHECK (' || definition || ')';
    end if;
    if definition <> item.definition then
      execute format('ALTER TABLE public.rotation_assignment_versions DROP CONSTRAINT %I', item.conname);
      execute format('ALTER TABLE public.rotation_assignment_versions ADD CONSTRAINT %I %s', item.conname, definition);
    end if;
  end loop;
end;
$$;

create or replace function public.start_workout(p_operation_id uuid)
returns public.workouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_slot text;
  existing_workout public.workouts;
  owner_id uuid := (select auth.uid());
  required_assignments integer;
  started_workout public.workouts;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null then raise exception 'Operation ID required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));

  select * into existing_workout
  from public.workouts
  where user_id = owner_id and start_operation_id = p_operation_id;
  if found then return existing_workout; end if;

  select * into existing_workout
  from public.workouts
  where user_id = owner_id and status = 'in_progress'
  for update;
  if found then return existing_workout; end if;

  if exists (
    select 1
    from public.assignment_logbook_states state
    join public.rotation_assignment_versions assignment using (assignment_id)
    where assignment.body_part <> 'abs_2' and state.user_id = owner_id
      and state.state in ('first_failure_pending', 'replacement_required')
  ) then
    raise exception 'Resolve required exercise replacement first';
  end if;

  if exists (
    select 1
    from public.workout_steps step
    join public.rotation_assignment_versions assignment
      on assignment.assignment_id = step.assignment_id
    where step.user_id = owner_id
      and assignment.active
      and assignment.body_part <> 'abs_2'
      and step.enforcement_action is not null
  ) then
    raise exception 'Resolve pending logbook decision first';
  end if;

  insert into public.workout_rotation_state (user_id)
  values (owner_id)
  on conflict (user_id) do nothing;

  select next_slot into current_slot
  from public.workout_rotation_state
  where user_id = owner_id
  for update;

  required_assignments := case when current_slot like 'A%' then 5 else 6 end;
  if (
    select count(*)
    from public.rotation_assignment_versions
    where user_id = owner_id and slot = current_slot and active and body_part <> 'abs_2'
  ) <> required_assignments then
    raise exception '% requires % saved assignments', current_slot, required_assignments;
  end if;

  insert into public.workouts (user_id, slot, start_operation_id)
  values (owner_id, current_slot, p_operation_id)
  returning * into started_workout;

  insert into public.workout_steps (
    workout_id,
    user_id,
    ordinal,
    kind,
    body_part,
    assignment_id,
    exercise,
    protocol,
    structure,
    target_sets,
    previous_weight_entries,
    previous_reps,
    previous_duration_seconds,
    fresh_baseline,
    mulligan_used,
    reference_history
  )
  select
    started_workout.workout_id,
    owner_id,
    ordering.ordinal,
    'exercise',
    assignment.body_part,
    assignment.assignment_id,
    assignment.exercise,
    assignment.protocol,
    assignment.structure,
    assignment.target_sets,
    coalesce(previous.weight_entries, '[]'::jsonb),
    coalesce(previous.reps, '{}'),
    previous.duration_seconds,
    previous.step_id is null,
    coalesce(logbook.state = 'mulligan_used', false),
    case
      when previous.step_id is null then coalesce(history.entries, '[]'::jsonb)
      else '[]'::jsonb
    end
  from public.rotation_assignment_versions assignment
  join (values
    ('A', 'chest', 1),
    ('A', 'shoulders', 3),
    ('A', 'triceps', 5),
    ('A', 'back_width', 7),
    ('A', 'back_thickness', 8),
    ('B', 'biceps', 1),
    ('B', 'forearms', 3),
    ('B', 'calves', 4),
    ('B', 'hamstrings', 5),
    ('B', 'quadriceps', 7),
    ('B', 'abs_1', 9)
  ) as ordering(day, body_part, ordinal)
    on ordering.day = left(current_slot, 1)
    and ordering.body_part = assignment.body_part
  left join public.assignment_logbook_states logbook
    on logbook.assignment_id = assignment.assignment_id
  left join lateral (
    select step.step_id, step.weight_entries, step.reps, step.duration_seconds
    from public.workout_steps step
    join public.workouts workout on workout.workout_id = step.workout_id
    where step.user_id = owner_id
      and step.assignment_id = assignment.assignment_id
      and step.status = 'completed'
    order by workout.started_at desc, step.ordinal desc
    limit 1
  ) previous on true
  left join lateral (
    select jsonb_agg(
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
      ) order by workout.started_at, step.ordinal
    ) as entries
    from public.workout_steps step
    join public.workouts workout on workout.workout_id = step.workout_id
    join public.rotation_assignment_versions historical_assignment
      on historical_assignment.assignment_id = step.assignment_id
    where step.user_id = owner_id
      and step.status = 'completed'
      and historical_assignment.assignment_id <> assignment.assignment_id
      and historical_assignment.slot = assignment.slot
      and historical_assignment.body_part = assignment.body_part
      and historical_assignment.exercise = assignment.exercise
  ) history on true
  where assignment.user_id = owner_id
    and assignment.slot = current_slot
    and assignment.active;

  if current_slot like 'A%' then
    insert into public.workout_steps (workout_id, user_id, ordinal, kind, body_part)
    values
      (started_workout.workout_id, owner_id, 2, 'stretch', 'chest'),
      (started_workout.workout_id, owner_id, 4, 'stretch', 'shoulders'),
      (started_workout.workout_id, owner_id, 6, 'stretch', 'triceps'),
      (started_workout.workout_id, owner_id, 9, 'stretch', 'back');
  else
    insert into public.workout_steps (workout_id, user_id, ordinal, kind, body_part)
    values
      (started_workout.workout_id, owner_id, 2, 'stretch', 'biceps'),
      (started_workout.workout_id, owner_id, 6, 'stretch', 'hamstrings'),
      (started_workout.workout_id, owner_id, 8, 'stretch', 'quadriceps');
  end if;

  return started_workout;
end;
$$;

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
    and assignment.active
    and assignment.body_part <> 'abs_2';
  if active_assignments is distinct from (intended_assignments - 'abs_2') then
    raise exception 'Offline start assignments changed';
  end if;
end;
$$;

create or replace function public.normalize_workout_performance(
  p_protocol text,
  p_target_sets jsonb,
  p_weights jsonb,
  p_reps integer[],
  p_duration_seconds integer
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  expected_reps integer := 0;
  expected_weights integer := 0;
  normalized_weights jsonb := '[]'::jsonb;
  weight_amount text;
  weight_item jsonb;
  weight_steps bigint;
  weight_unit text;
  weight_value numeric(12, 2);
begin
  if p_protocol = 'rest_pause' then
    expected_reps := 3;
    expected_weights := 1;
  elsif p_protocol = 'timed_hold' then
    expected_weights := 1;
    if cardinality(p_reps) <> 0 or p_duration_seconds is null or p_duration_seconds < 1 then
      raise exception 'Invalid duration for configured protocol';
    end if;
  elsif p_protocol = 'straight_set' then
    expected_reps := greatest(jsonb_array_length(p_target_sets), 1);
    expected_weights := expected_reps;
  else
    raise exception 'Invalid configured protocol';
  end if;

  if p_protocol <> 'timed_hold' and p_duration_seconds is not null then
    raise exception 'Duration is only valid for timed holds';
  end if;
  if jsonb_typeof(p_weights) <> 'array' or jsonb_array_length(p_weights) <> expected_weights then
    raise exception 'Invalid weights for configured protocol';
  end if;

  for weight_item in select value from jsonb_array_elements(p_weights)
  loop
    weight_amount := weight_item ->> 'amount';
    weight_unit := weight_item ->> 'unit';
    if weight_item ? 'kind' and coalesce(weight_item ->> 'kind', '') not in ('weight', 'body_weight', 'bar', 'band') then
      raise exception 'Invalid load type';
    end if;
    if weight_item ->> 'kind' in ('body_weight', 'bar', 'band') then
      if weight_amount is distinct from '0' or weight_unit is null or weight_unit not in ('lb', 'kg') then
        raise exception 'Labelled loads require zero numeric weight and a unit';
      end if;
      normalized_weights := normalized_weights || jsonb_build_array(jsonb_build_object(
        'amount', '0', 'unit', weight_unit, 'kind', weight_item ->> 'kind', 'micrograms', '0'
      ));
      continue;
    end if;
    if weight_amount is null or weight_unit is null or weight_unit not in ('lb', 'kg') then
      raise exception 'Weight and unit required';
    end if;
    if weight_amount !~ '^[0-9]+([.][0-9]{1,2})?$' then
      raise exception 'Invalid weight';
    end if;
    weight_value := weight_amount::numeric(12, 2);
    if weight_value <= 0 then raise exception 'Weight must be positive'; end if;

    if weight_unit = 'lb' then
      if weight_value * 2 <> trunc(weight_value * 2) then
        raise exception 'Weight must use 0.5 lb increments';
      end if;
      weight_steps := (weight_value * 2)::bigint;
      normalized_weights := normalized_weights || jsonb_build_array(jsonb_build_object(
        'amount', weight_amount,
        'unit', weight_unit,
        'micrograms', (weight_steps * 226796185)::text
      ));
    else
      if weight_value * 4 <> trunc(weight_value * 4) then
        raise exception 'Weight must use 0.25 kg increments';
      end if;
      weight_steps := (weight_value * 4)::bigint;
      normalized_weights := normalized_weights || jsonb_build_array(jsonb_build_object(
        'amount', weight_amount,
        'unit', weight_unit,
        'micrograms', (weight_steps * 250000000)::text
      ));
    end if;
    if weight_item ->> 'kind' = 'weight' then
      normalized_weights := jsonb_set(normalized_weights, array[(jsonb_array_length(normalized_weights)-1)::text, 'kind'], '"weight"'::jsonb);
    end if;
  end loop;

  if cardinality(p_reps) <> expected_reps
    or exists (select 1 from unnest(p_reps) rep where rep < 1)
  then
    raise exception 'Invalid reps for configured protocol';
  end if;

  return jsonb_build_object(
    'weight_entries', normalized_weights,
    'reps', p_reps,
    'duration_seconds', p_duration_seconds
  );
end;
$$;

create or replace function public.evaluate_logbook_performance(
  p_body_part text,
  p_protocol text,
  p_target_sets jsonb,
  p_weights jsonb,
  p_reps integer[],
  p_duration_seconds integer,
  p_previous_weights jsonb,
  p_previous_reps integer[],
  p_previous_duration_seconds integer
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  current_score numeric;
  previous_score numeric;
  current_metric integer;
  previous_metric integer;
  current_kind text;
  previous_kind text;
  set_index integer;
  result text;
  results text[] := '{}';
begin
  if jsonb_array_length(p_previous_weights) = 0 or jsonb_array_length(p_previous_weights) <> jsonb_array_length(p_weights) then
    return jsonb_build_object('status', 'baseline', 'set_verdicts', '[]'::jsonb);
  end if;
  for set_index in 0..jsonb_array_length(p_weights)-1 loop
    current_kind := coalesce(p_weights -> set_index ->> 'kind', 'weight');
    previous_kind := coalesce(p_previous_weights -> set_index ->> 'kind', 'weight');
    if current_kind <> previous_kind then
      return jsonb_build_object('status', 'baseline', 'set_verdicts', '[]'::jsonb);
    end if;
  end loop;
  if p_protocol = 'timed_hold' then
    current_score := (p_weights -> 0 ->> 'micrograms')::numeric;
    previous_score := (p_previous_weights -> 0 ->> 'micrograms')::numeric;
    if (current_score = previous_score and p_duration_seconds > p_previous_duration_seconds)
      or (current_score > previous_score and p_duration_seconds >= p_previous_duration_seconds) then result := 'win';
    elsif (current_score = previous_score and p_duration_seconds <= p_previous_duration_seconds)
      or (current_score < previous_score and p_duration_seconds <= p_previous_duration_seconds) then result := 'failure';
    else result := 'ambiguous'; end if;
    return jsonb_build_object('status', result, 'set_verdicts', '[]'::jsonb);
  end if;
  for set_index in 0..jsonb_array_length(p_weights)-1 loop
    if p_protocol = 'rest_pause' then
      select sum(value) into current_metric from unnest(p_reps) value;
      select sum(value) into previous_metric from unnest(p_previous_reps) value;
    else
      current_metric := p_reps[set_index+1];
      previous_metric := p_previous_reps[set_index+1];
    end if;
    if coalesce(p_weights -> set_index ->> 'kind', 'weight') = 'weight' then
      -- Epley estimate multiplied by 30. Canonical micrograms avoid unit rounding.
      current_score := (p_weights -> set_index ->> 'micrograms')::numeric * (30::numeric + current_metric);
      previous_score := (p_previous_weights -> set_index ->> 'micrograms')::numeric * (30::numeric + previous_metric);
    else
      current_score := current_metric;
      previous_score := previous_metric;
    end if;
    result := case when current_score > previous_score then 'win' when current_score = previous_score then 'tie' else 'failure' end;
    results := array_append(results, result);
  end loop;
  return jsonb_build_object('status', case when 'win' = any(results) then 'win' else 'failure' end,
    'set_verdicts', case when p_protocol = 'rest_pause' then '[]'::jsonb else to_jsonb(results) end);
end;
$$;

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

revoke all on function private.recalculate_one_assignment_logbook(uuid) from public, anon, authenticated;

create or replace function public.recalculate_assignment_logbook(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare exercise_name text; item record; results jsonb := '[]'::jsonb;
begin
  select replace(exercise, 'Lying Deltech leg curl', 'Lying leg curl') into exercise_name
  from public.rotation_assignment_versions where assignment_id = p_assignment_id and user_id = auth.uid();
  if not found then raise exception 'Assignment not found'; end if;
  for item in select assignment_id from public.rotation_assignment_versions
    where user_id = auth.uid() and replace(exercise, 'Lying Deltech leg curl', 'Lying leg curl') = exercise_name
    order by assignment_id
  loop
    results := results || private.recalculate_one_assignment_logbook(item.assignment_id);
  end loop;
  return results;
end;
$$;
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
      and active_workout.workout_id <> current_step.workout_id
      and replace(active_step.exercise, 'Lying Deltech leg curl', 'Lying leg curl') = replace(current_step.exercise, 'Lying Deltech leg curl', 'Lying leg curl')
  ) then
    raise exception 'Finish active workout before correcting this exercise';
  end if;

  if exists (select 1 from public.workout_steps step join public.workouts workout using (workout_id)
    where step.user_id = owner_id and workout.status = 'in_progress' and step.enforcement_action is not null)
  then raise exception 'Resolve the logbook decision first'; end if;

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
commit;
