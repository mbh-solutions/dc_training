alter table public.workout_steps
  add column duration_seconds integer,
  add column previous_weight_entries jsonb not null default '[]'::jsonb,
  add column previous_reps integer[] not null default '{}',
  add column previous_duration_seconds integer;

alter table public.workout_steps
  drop constraint workout_steps_check,
  drop constraint workout_steps_check1,
  drop constraint workout_steps_ordinal_check,
  add constraint workout_steps_ordinal_check check (ordinal between 1 and 10),
  add constraint workout_steps_shape_check check (
    (
      kind = 'exercise'
      and assignment_id is not null
      and exercise is not null
      and structure is not null
      and (
        (body_part in ('abs_1', 'abs_2') and protocol in ('straight_set', 'timed_hold'))
        or
        (body_part not in ('abs_1', 'abs_2') and protocol in ('rest_pause', 'straight_set'))
      )
    )
    or
    (
      kind = 'stretch'
      and body_part in ('chest', 'shoulders', 'triceps', 'biceps', 'back', 'hamstrings', 'quadriceps')
      and assignment_id is null
      and exercise is null
      and protocol is null
      and structure is null
      and target_sets = '[]'::jsonb
    )
  ),
  add constraint workout_steps_performance_check check (
    (
      status <> 'completed'
      and weight_entries = '[]'::jsonb
      and cardinality(reps) = 0
      and duration_seconds is null
    )
    or
    (
      status = 'completed'
      and kind = 'stretch'
      and weight_entries = '[]'::jsonb
      and cardinality(reps) = 0
      and duration_seconds is null
    )
    or
    (
      status = 'completed'
      and kind = 'exercise'
      and jsonb_array_length(weight_entries) > 0
      and (
        (protocol = 'timed_hold' and cardinality(reps) = 0 and duration_seconds > 0)
        or
        (protocol <> 'timed_hold' and cardinality(reps) > 0 and duration_seconds is null)
      )
    )
  );

create index workout_steps_previous_performance
on public.workout_steps (user_id, assignment_id, updated_at desc)
where status = 'completed';

create or replace function public.start_workout(p_operation_id uuid)
returns public.workouts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  current_slot text;
  existing_workout public.workouts;
  started_workout public.workouts;
  required_assignments integer;
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

  insert into public.workout_rotation_state (user_id)
  values (owner_id)
  on conflict (user_id) do nothing;

  select next_slot into current_slot
  from public.workout_rotation_state
  where user_id = owner_id
  for update;

  required_assignments := case when current_slot like 'A%' then 5 else 7 end;
  if (
    select count(*)
    from public.rotation_assignment_versions
    where user_id = owner_id and slot = current_slot and active
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
    previous_duration_seconds
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
    previous.duration_seconds
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
    ('B', 'abs_1', 9),
    ('B', 'abs_2', 10)
  ) as ordering(day, body_part, ordinal)
    on ordering.day = left(current_slot, 1)
    and ordering.body_part = assignment.body_part
  left join lateral (
    select step.weight_entries, step.reps, step.duration_seconds
    from public.workout_steps step
    where step.user_id = owner_id
      and step.assignment_id = assignment.assignment_id
      and step.status = 'completed'
    order by step.updated_at desc
    limit 1
  ) previous on true
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

create or replace function public.save_workout_step(
  p_step_id uuid,
  p_operation_id uuid,
  p_status text,
  p_weights jsonb default '[]'::jsonb,
  p_reps integer[] default '{}',
  p_duration_seconds integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  current_step public.workout_steps;
  current_workout public.workouts;
  current_state public.workout_rotation_state;
  prior_operation public.workout_step_operations;
  weight_item jsonb;
  weight_value numeric(12, 2);
  weight_amount text;
  weight_unit text;
  weight_steps bigint;
  expected_reps integer := 0;
  expected_weights integer := 0;
  normalized_weights jsonb := '[]'::jsonb;
  before_value jsonb;
  completed_now boolean := false;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null then raise exception 'Operation ID required'; end if;
  if p_status not in ('completed', 'skipped') then raise exception 'Invalid step status'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  select * into prior_operation
  from public.workout_step_operations
  where operation_id = p_operation_id and user_id = owner_id;
  if found then
    select * into current_step from public.workout_steps where step_id = prior_operation.step_id;
    select * into current_workout from public.workouts where workout_id = current_step.workout_id;
    select * into current_state from public.workout_rotation_state where user_id = owner_id;
    return jsonb_build_object(
      'step', to_jsonb(current_step),
      'workout', to_jsonb(current_workout),
      'next_slot', current_state.next_slot,
      'completed_now', false
    );
  end if;

  select * into current_step
  from public.workout_steps
  where step_id = p_step_id and user_id = owner_id
  for update;
  if not found then raise exception 'Workout step not found'; end if;

  select * into current_workout
  from public.workouts
  where workout_id = current_step.workout_id and user_id = owner_id
  for update;
  if not found or current_workout.status <> 'in_progress' then
    raise exception 'Workout is not in progress';
  end if;
  if current_step.status <> 'pending' then raise exception 'Workout step is already satisfied'; end if;
  if exists (
    select 1 from public.workout_steps
    where workout_id = current_workout.workout_id
      and ordinal < current_step.ordinal
      and status = 'pending'
  ) then raise exception 'Complete the first unfinished step'; end if;

  before_value := jsonb_build_object(
    'status', current_step.status,
    'weight_entries', current_step.weight_entries,
    'reps', current_step.reps,
    'duration_seconds', current_step.duration_seconds
  );

  if p_status = 'completed' and current_step.kind = 'exercise' then
    if current_step.protocol = 'rest_pause' then
      expected_reps := 3;
      expected_weights := 1;
    elsif current_step.protocol = 'timed_hold' then
      expected_weights := 1;
      if cardinality(p_reps) <> 0 or p_duration_seconds is null or p_duration_seconds < 1 then
        raise exception 'Invalid duration for configured protocol';
      end if;
    else
      expected_reps := greatest(jsonb_array_length(current_step.target_sets), 1);
      expected_weights := expected_reps;
    end if;

    if current_step.protocol <> 'timed_hold' and p_duration_seconds is not null then
      raise exception 'Duration is only valid for timed holds';
    end if;
    if jsonb_typeof(p_weights) <> 'array' or jsonb_array_length(p_weights) <> expected_weights then
      raise exception 'Invalid weights for configured protocol';
    end if;
    for weight_item in select value from jsonb_array_elements(p_weights)
    loop
      weight_amount := weight_item ->> 'amount';
      weight_unit := weight_item ->> 'unit';
      if weight_amount is null or weight_unit not in ('lb', 'kg') then
        raise exception 'Weight and unit required';
      end if;
      if weight_amount !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Invalid weight'; end if;
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
    end loop;
    if cardinality(p_reps) <> expected_reps
      or exists (select 1 from unnest(p_reps) rep where rep < 1)
    then raise exception 'Invalid reps for configured protocol'; end if;

    current_step.weight_entries := normalized_weights;
    current_step.reps := p_reps;
    current_step.duration_seconds := p_duration_seconds;
  elsif p_status = 'completed' and current_step.kind = 'stretch' then
    if p_weights <> '[]'::jsonb or cardinality(p_reps) <> 0 or p_duration_seconds is not null then
      raise exception 'Stretch performance data is not allowed';
    end if;
  elsif p_status = 'skipped' then
    if p_weights <> '[]'::jsonb or cardinality(p_reps) <> 0 or p_duration_seconds is not null then
      raise exception 'Skipped steps cannot contain performance data';
    end if;
  end if;

  update public.workout_steps set
    status = p_status,
    weight_entries = current_step.weight_entries,
    reps = current_step.reps,
    duration_seconds = current_step.duration_seconds,
    last_operation_id = p_operation_id,
    updated_at = now()
  where step_id = current_step.step_id
  returning * into current_step;

  insert into public.workout_step_operations (operation_id, user_id, step_id, before_state, after_state)
  values (p_operation_id, owner_id, current_step.step_id, before_value, to_jsonb(current_step));

  if not exists (
    select 1 from public.workout_steps
    where workout_id = current_workout.workout_id and status = 'pending'
  ) then
    select * into current_state
    from public.workout_rotation_state
    where user_id = owner_id
    for update;
    if current_state.next_slot <> current_workout.slot then
      raise exception 'Rotation state mismatch';
    end if;

    update public.workouts set
      status = 'completed',
      completion_operation_id = p_operation_id,
      completed_at = now()
    where workout_id = current_workout.workout_id
    returning * into current_workout;

    update public.workout_rotation_state set
      next_slot = case current_workout.slot
        when 'A1' then 'B1'
        when 'B1' then 'A2'
        when 'A2' then 'B2'
        when 'B2' then 'A3'
        when 'A3' then 'B3'
        else 'A1'
      end,
      last_completed_slot = current_workout.slot,
      updated_at = now()
    where user_id = owner_id
    returning * into current_state;
    completed_now := true;
  else
    select * into current_state
    from public.workout_rotation_state
    where user_id = owner_id;
  end if;

  return jsonb_build_object(
    'step', to_jsonb(current_step),
    'workout', to_jsonb(current_workout),
    'next_slot', current_state.next_slot,
    'completed_now', completed_now
  );
end;
$$;

create or replace function public.undo_workout_step(
  p_operation_id uuid,
  p_undo_operation_id uuid
)
returns public.workout_steps
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  saved_operation public.workout_step_operations;
  current_step public.workout_steps;
  current_workout public.workouts;
  current_state public.workout_rotation_state;
  prior_completed_slot text;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null or p_undo_operation_id is null then
    raise exception 'Operation IDs required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select * into saved_operation
  from public.workout_step_operations
  where operation_id = p_operation_id and user_id = owner_id
  for update;
  if not found then raise exception 'Saved operation not found'; end if;

  select * into current_step
  from public.workout_steps
  where step_id = saved_operation.step_id and user_id = owner_id
  for update;

  if saved_operation.undone_at is not null then return current_step; end if;
  if current_step.last_operation_id <> p_operation_id then
    raise exception 'Only the latest save can be undone';
  end if;

  select * into current_workout
  from public.workouts
  where workout_id = current_step.workout_id and user_id = owner_id
  for update;

  if current_workout.status = 'completed' then
    if current_workout.completion_operation_id <> p_operation_id
      or exists (
        select 1 from public.workouts
        where user_id = owner_id and status = 'in_progress'
      )
      or exists (
        select 1 from public.workouts
        where user_id = owner_id
          and status = 'completed'
          and completed_at > current_workout.completed_at
      )
    then raise exception 'Completed workout can no longer be undone'; end if;

    select * into current_state
    from public.workout_rotation_state
    where user_id = owner_id
    for update;
    if current_state.last_completed_slot <> current_workout.slot
      or current_state.next_slot <> (case current_workout.slot
        when 'A1' then 'B1'
        when 'B1' then 'A2'
        when 'A2' then 'B2'
        when 'B2' then 'A3'
        when 'A3' then 'B3'
        else 'A1'
      end)
    then raise exception 'Rotation has moved beyond this workout'; end if;

    select slot into prior_completed_slot
    from public.workouts
    where user_id = owner_id
      and status = 'completed'
      and workout_id <> current_workout.workout_id
    order by completed_at desc
    limit 1;

    update public.workouts set
      status = 'in_progress',
      completion_operation_id = null,
      completed_at = null
    where workout_id = current_workout.workout_id;

    update public.workout_rotation_state set
      next_slot = current_workout.slot,
      last_completed_slot = prior_completed_slot,
      updated_at = now()
    where user_id = owner_id;
  elsif exists (
    select 1 from public.workout_steps
    where workout_id = current_step.workout_id
      and ordinal > current_step.ordinal
      and status <> 'pending'
  ) then
    raise exception 'Only the latest workout action can be undone';
  end if;

  update public.workout_steps set
    status = saved_operation.before_state ->> 'status',
    weight_entries = saved_operation.before_state -> 'weight_entries',
    reps = array(
      select jsonb_array_elements_text(saved_operation.before_state -> 'reps')::integer
    ),
    duration_seconds = (saved_operation.before_state ->> 'duration_seconds')::integer,
    last_operation_id = null,
    updated_at = now()
  where step_id = current_step.step_id
  returning * into current_step;

  update public.workout_step_operations set
    undo_operation_id = p_undo_operation_id,
    undone_at = now()
  where operation_id = p_operation_id;

  return current_step;
end;
$$;

create or replace function public.start_a1_workout(p_operation_id uuid)
returns public.workouts
language sql
security invoker
set search_path = ''
as $$
  select public.start_workout(p_operation_id);
$$;

create or replace function public.save_a1_workout_step(
  p_step_id uuid,
  p_operation_id uuid,
  p_status text,
  p_weights jsonb default '[]'::jsonb,
  p_reps integer[] default '{}'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select public.save_workout_step(
    p_step_id,
    p_operation_id,
    p_status,
    p_weights,
    p_reps,
    null
  );
$$;

create or replace function public.undo_a1_workout_step(
  p_operation_id uuid,
  p_undo_operation_id uuid
)
returns public.workout_steps
language sql
security invoker
set search_path = ''
as $$
  select public.undo_workout_step(p_operation_id, p_undo_operation_id);
$$;

revoke execute on function public.start_workout(uuid) from public, anon;
revoke execute on function public.save_workout_step(uuid, uuid, text, jsonb, integer[], integer) from public, anon;
revoke execute on function public.undo_workout_step(uuid, uuid) from public, anon;
revoke execute on function public.start_a1_workout(uuid) from public, anon;
revoke execute on function public.save_a1_workout_step(uuid, uuid, text, jsonb, integer[]) from public, anon;
revoke execute on function public.undo_a1_workout_step(uuid, uuid) from public, anon;

grant execute on function public.start_workout(uuid) to authenticated;
grant execute on function public.save_workout_step(uuid, uuid, text, jsonb, integer[], integer) to authenticated;
grant execute on function public.undo_workout_step(uuid, uuid) to authenticated;
grant execute on function public.start_a1_workout(uuid) to authenticated;
grant execute on function public.save_a1_workout_step(uuid, uuid, text, jsonb, integer[]) to authenticated;
grant execute on function public.undo_a1_workout_step(uuid, uuid) to authenticated;
