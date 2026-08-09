create table public.workout_rotation_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  next_slot text not null default 'A1' check (next_slot in ('A1', 'B1', 'A2', 'B2', 'A3', 'B3')),
  last_completed_slot text check (last_completed_slot is null or last_completed_slot in ('A1', 'B1', 'A2', 'B2', 'A3', 'B3')),
  updated_at timestamptz not null default now()
);

create table public.workouts (
  workout_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slot text not null check (slot in ('A1', 'B1', 'A2', 'B2', 'A3', 'B3')),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  start_operation_id uuid not null unique,
  completion_operation_id uuid unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'completed') = (completed_at is not null))
);

create unique index workouts_one_in_progress
on public.workouts (user_id)
where status = 'in_progress';

create table public.workout_steps (
  step_id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (workout_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  ordinal smallint not null check (ordinal between 1 and 9),
  kind text not null check (kind in ('exercise', 'stretch')),
  body_part text not null,
  assignment_id uuid references public.rotation_assignment_versions (assignment_id),
  exercise text,
  protocol text,
  structure text,
  target_sets jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  weight_entries jsonb not null default '[]'::jsonb,
  reps integer[] not null default '{}',
  last_operation_id uuid,
  updated_at timestamptz not null default now(),
  unique (workout_id, ordinal),
  check (
    (kind = 'exercise' and assignment_id is not null and exercise is not null and protocol is not null and structure is not null)
    or
    (kind = 'stretch' and assignment_id is null and exercise is null and protocol is null and structure is null and target_sets = '[]'::jsonb)
  ),
  check (
    status <> 'completed'
    or kind = 'stretch'
    or (jsonb_array_length(weight_entries) > 0 and cardinality(reps) > 0)
  )
);

create table public.workout_step_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  step_id uuid not null references public.workout_steps (step_id) on delete cascade,
  before_state jsonb not null,
  after_state jsonb not null,
  undo_operation_id uuid unique,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.workout_rotation_state enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_steps enable row level security;
alter table public.workout_step_operations enable row level security;

revoke all on table public.workout_rotation_state, public.workouts, public.workout_steps, public.workout_step_operations from anon, authenticated;
grant select, insert, update on table public.workout_rotation_state, public.workouts, public.workout_steps, public.workout_step_operations to authenticated;

create policy "Users own their workout rotation state"
on public.workout_rotation_state for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users own their workouts"
on public.workouts for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users own their workout steps"
on public.workout_steps for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users own their workout step operations"
on public.workout_step_operations for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.start_a1_workout(p_operation_id uuid)
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

  if current_slot <> 'A1' then raise exception 'Only A1 workout tracing is available'; end if;
  if (
    select count(*)
    from public.rotation_assignment_versions
    where user_id = owner_id and slot = 'A1' and active
  ) <> 5 then
    raise exception 'A1 requires five saved assignments';
  end if;

  insert into public.workouts (user_id, slot, start_operation_id)
  values (owner_id, 'A1', p_operation_id)
  returning * into started_workout;

  insert into public.workout_steps (
    workout_id, user_id, ordinal, kind, body_part, assignment_id, exercise, protocol, structure, target_sets
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
    assignment.target_sets
  from public.rotation_assignment_versions assignment
  join (values
    ('chest', 1), ('shoulders', 3), ('triceps', 5), ('back_width', 7), ('back_thickness', 8)
  ) as ordering(body_part, ordinal) on ordering.body_part = assignment.body_part
  where assignment.user_id = owner_id and assignment.slot = 'A1' and assignment.active;

  insert into public.workout_steps (workout_id, user_id, ordinal, kind, body_part)
  values
    (started_workout.workout_id, owner_id, 2, 'stretch', 'chest'),
    (started_workout.workout_id, owner_id, 4, 'stretch', 'shoulders'),
    (started_workout.workout_id, owner_id, 6, 'stretch', 'triceps'),
    (started_workout.workout_id, owner_id, 9, 'stretch', 'back');

  return started_workout;
end;
$$;

create or replace function public.save_a1_workout_step(
  p_step_id uuid,
  p_operation_id uuid,
  p_status text,
  p_weights jsonb default '[]'::jsonb,
  p_reps integer[] default '{}'
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
  expected_reps integer;
  expected_weights integer;
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
    return jsonb_build_object('step', to_jsonb(current_step), 'workout', to_jsonb(current_workout), 'next_slot', current_state.next_slot);
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
  if not found or current_workout.status <> 'in_progress' then raise exception 'Workout is not in progress'; end if;

  before_value := jsonb_build_object(
    'status', current_step.status,
    'weight_entries', current_step.weight_entries,
    'reps', current_step.reps
  );

  if p_status = 'completed' and current_step.kind = 'exercise' then
    expected_reps := case
      when current_step.protocol = 'rest_pause' then 3
      else greatest(jsonb_array_length(current_step.target_sets), 1)
    end;
    expected_weights := case when current_step.protocol = 'rest_pause' then 1 else expected_reps end;
    if jsonb_typeof(p_weights) <> 'array' or jsonb_array_length(p_weights) <> expected_weights then
      raise exception 'Invalid weights for configured protocol';
    end if;
    for weight_item in select value from jsonb_array_elements(p_weights)
    loop
      weight_amount := weight_item ->> 'amount';
      weight_unit := weight_item ->> 'unit';
      if weight_amount is null or weight_unit not in ('lb', 'kg') then raise exception 'Weight and unit required'; end if;
      if weight_amount !~ '^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Invalid weight'; end if;
      weight_value := weight_amount::numeric(12, 2);
      if weight_value <= 0 then raise exception 'Weight must be positive'; end if;
      if weight_unit = 'lb' then
        if weight_value * 2 <> trunc(weight_value * 2) then raise exception 'Weight must use 0.5 lb increments'; end if;
        weight_steps := (weight_value * 2)::bigint;
        normalized_weights := normalized_weights || jsonb_build_array(jsonb_build_object(
          'amount', weight_amount, 'unit', weight_unit, 'micrograms', (weight_steps * 226796185)::text
        ));
      else
        if weight_value * 4 <> trunc(weight_value * 4) then raise exception 'Weight must use 0.25 kg increments'; end if;
        weight_steps := (weight_value * 4)::bigint;
        normalized_weights := normalized_weights || jsonb_build_array(jsonb_build_object(
          'amount', weight_amount, 'unit', weight_unit, 'micrograms', (weight_steps * 250000000)::text
        ));
      end if;
    end loop;
    if cardinality(p_reps) <> expected_reps or exists (select 1 from unnest(p_reps) rep where rep < 1) then
      raise exception 'Invalid reps for configured protocol';
    end if;
    current_step.weight_entries := normalized_weights;
    current_step.reps := p_reps;
  elsif p_status = 'completed' and current_step.kind = 'stretch' then
    current_step.weight_entries := '[]'::jsonb;
    current_step.reps := '{}';
  elsif p_status = 'skipped' then
    current_step.weight_entries := '[]'::jsonb;
    current_step.reps := '{}';
  end if;

  update public.workout_steps set
    status = p_status,
    weight_entries = current_step.weight_entries,
    reps = current_step.reps,
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
    if current_state.next_slot <> current_workout.slot then raise exception 'Rotation state mismatch'; end if;

    update public.workouts set
      status = 'completed',
      completion_operation_id = p_operation_id,
      completed_at = now()
    where workout_id = current_workout.workout_id
    returning * into current_workout;

    update public.workout_rotation_state set
      next_slot = 'B1',
      last_completed_slot = 'A1',
      updated_at = now()
    where user_id = owner_id
    returning * into current_state;
    completed_now := true;
  else
    select * into current_state from public.workout_rotation_state where user_id = owner_id;
  end if;

  return jsonb_build_object(
    'step', to_jsonb(current_step),
    'workout', to_jsonb(current_workout),
    'next_slot', current_state.next_slot,
    'completed_now', completed_now
  );
end;
$$;

create or replace function public.undo_a1_workout_step(p_operation_id uuid, p_undo_operation_id uuid)
returns public.workout_steps
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  saved_operation public.workout_step_operations;
  current_step public.workout_steps;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null or p_undo_operation_id is null then raise exception 'Operation IDs required'; end if;

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
  if current_step.last_operation_id <> p_operation_id then raise exception 'Only the latest save can be undone'; end if;
  if exists (
    select 1 from public.workouts
    where workout_id = current_step.workout_id and status = 'completed'
  ) then raise exception 'Completed workout cannot be undone'; end if;

  update public.workout_steps set
    status = saved_operation.before_state ->> 'status',
    weight_entries = saved_operation.before_state -> 'weight_entries',
    reps = array(select jsonb_array_elements_text(saved_operation.before_state -> 'reps')::integer),
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

revoke execute on function public.start_a1_workout(uuid) from public, anon;
revoke execute on function public.save_a1_workout_step(uuid, uuid, text, jsonb, integer[]) from public, anon;
revoke execute on function public.undo_a1_workout_step(uuid, uuid) from public, anon;
grant execute on function public.start_a1_workout(uuid) to authenticated;
grant execute on function public.save_a1_workout_step(uuid, uuid, text, jsonb, integer[]) to authenticated;
grant execute on function public.undo_a1_workout_step(uuid, uuid) to authenticated;
