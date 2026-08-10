create table public.assignment_logbook_states (
  assignment_id uuid primary key references public.rotation_assignment_versions (assignment_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  state text not null check (state in ('first_failure_pending', 'mulligan_used', 'replacement_required')),
  updated_at timestamptz not null default now()
);

create table public.logbook_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  step_id uuid not null references public.workout_steps (step_id) on delete cascade,
  action text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.assignment_logbook_states enable row level security;
alter table public.logbook_operations enable row level security;

revoke all on table public.assignment_logbook_states, public.logbook_operations from anon, authenticated;
grant select on table public.assignment_logbook_states, public.logbook_operations to authenticated;

create policy "Users can view their assignment logbook states"
on public.assignment_logbook_states for select to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.rotation_assignment_versions assignment
    where assignment.assignment_id = assignment_logbook_states.assignment_id
      and assignment.user_id = (select auth.uid())
  )
);

create policy "Users can view their logbook operations"
on public.logbook_operations for select to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.workout_steps step
    where step.step_id = logbook_operations.step_id
      and step.user_id = (select auth.uid())
  )
);

revoke all on table
  public.rotation_assignment_versions,
  public.workout_rotation_state,
  public.workouts,
  public.workout_steps,
  public.workout_step_operations
from anon, authenticated;

grant select on table
  public.rotation_assignment_versions,
  public.workout_rotation_state,
  public.workouts,
  public.workout_steps,
  public.workout_step_operations
to authenticated;

drop policy if exists "Users can create only their rotation assignment versions"
on public.rotation_assignment_versions;
drop policy if exists "Users can update only their rotation assignment versions"
on public.rotation_assignment_versions;

drop policy if exists "Users own their workout rotation state"
on public.workout_rotation_state;
drop policy if exists "Users own their workouts"
on public.workouts;
drop policy if exists "Users own their workout steps"
on public.workout_steps;
drop policy if exists "Users own their workout step operations"
on public.workout_step_operations;

create policy "Users can read only their workout rotation state"
on public.workout_rotation_state for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read only their workouts"
on public.workouts for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read only their workout steps"
on public.workout_steps for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read only their workout step operations"
on public.workout_step_operations for select to authenticated
using ((select auth.uid()) = user_id);

alter table public.workout_steps
  add column verdict text check (verdict is null or verdict in ('win', 'failure')),
  add column set_verdicts text[] not null default '{}',
  add column enforcement_action text check (
    enforcement_action is null
    or enforcement_action in ('abs_choice', 'first_failure', 'replacement_required')
  ),
  add column fresh_baseline boolean not null default false,
  add column mulligan_used boolean not null default false,
  add column reference_history jsonb not null default '[]'::jsonb,
  add column resolution text check (
    resolution is null
    or resolution in ('count_win', 'count_failure', 'use_mulligan', 'replaced')
  );

alter table public.workout_step_operations
  add column logbook_state_before jsonb;

create index assignment_logbook_states_owner
on public.assignment_logbook_states (user_id, state);

create index rotation_assignment_versions_exercise_history
on public.rotation_assignment_versions (user_id, slot, body_part, exercise);

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
    if weight_amount is null or weight_unit not in ('lb', 'kg') then
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
    where state.user_id = owner_id
      and state.state in ('first_failure_pending', 'replacement_required')
  ) then
    raise exception 'Resolve required exercise replacement first';
  end if;

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
    ('B', 'abs_1', 9),
    ('B', 'abs_2', 10)
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
security definer
set search_path = ''
as $$
declare
  before_value jsonb;
  current_step public.workout_steps;
  current_workout public.workouts;
  evaluation jsonb;
  finish_result jsonb;
  normalized jsonb;
  owner_id uuid := (select auth.uid());
  prior_operation public.workout_step_operations;
  state_before jsonb;
  state_value text;
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
    return jsonb_build_object(
      'step', to_jsonb(current_step),
      'workout', to_jsonb(current_workout),
      'next_slot', (select next_slot from public.workout_rotation_state where user_id = owner_id),
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
      and enforcement_action is not null
  ) then raise exception 'Resolve the logbook decision first'; end if;
  if exists (
    select 1 from public.workout_steps
    where workout_id = current_workout.workout_id
      and ordinal < current_step.ordinal
      and status = 'pending'
  ) then raise exception 'Complete the first unfinished step'; end if;

  if current_step.assignment_id is not null then
    select to_jsonb(state), state.state into state_before, state_value
    from public.assignment_logbook_states state
    where state.assignment_id = current_step.assignment_id
    for update;
  end if;

  before_value := jsonb_build_object(
    'status', current_step.status,
    'weight_entries', current_step.weight_entries,
    'reps', current_step.reps,
    'duration_seconds', current_step.duration_seconds,
    'verdict', current_step.verdict,
    'set_verdicts', current_step.set_verdicts,
    'enforcement_action', current_step.enforcement_action,
    'resolution', current_step.resolution
  );

  if p_status = 'completed' and current_step.kind = 'exercise' then
    normalized := public.normalize_workout_performance(
      current_step.protocol,
      current_step.target_sets,
      p_weights,
      p_reps,
      p_duration_seconds
    );
    current_step.weight_entries := normalized -> 'weight_entries';
    current_step.reps := array(
      select jsonb_array_elements_text(normalized -> 'reps')::integer
    );
    current_step.duration_seconds := (normalized ->> 'duration_seconds')::integer;

    evaluation := public.evaluate_logbook_performance(
      current_step.body_part,
      current_step.protocol,
      current_step.target_sets,
      current_step.weight_entries,
      current_step.reps,
      current_step.duration_seconds,
      current_step.previous_weight_entries,
      current_step.previous_reps,
      current_step.previous_duration_seconds
    );
    current_step.set_verdicts := array(
      select jsonb_array_elements_text(evaluation -> 'set_verdicts')
    );

    if evaluation ->> 'status' = 'baseline' then
      current_step.verdict := null;
      current_step.enforcement_action := null;
      delete from public.assignment_logbook_states
      where assignment_id = current_step.assignment_id;
    elsif evaluation ->> 'status' = 'win' then
      current_step.verdict := 'win';
      current_step.enforcement_action := null;
      delete from public.assignment_logbook_states
      where assignment_id = current_step.assignment_id;
    elsif evaluation ->> 'status' = 'ambiguous' then
      current_step.verdict := null;
      current_step.enforcement_action := 'abs_choice';
    else
      current_step.verdict := 'failure';
      current_step.enforcement_action := case
        when state_value = 'mulligan_used' then 'replacement_required'
        else 'first_failure'
      end;
      insert into public.assignment_logbook_states (assignment_id, user_id, state, updated_at)
      values (
        current_step.assignment_id,
        owner_id,
        case when state_value = 'mulligan_used' then 'replacement_required' else 'first_failure_pending' end,
        now()
      )
      on conflict (assignment_id) do update set
        state = excluded.state,
        updated_at = excluded.updated_at;
    end if;
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
    verdict = current_step.verdict,
    set_verdicts = current_step.set_verdicts,
    enforcement_action = current_step.enforcement_action,
    resolution = null,
    last_operation_id = p_operation_id,
    updated_at = now()
  where step_id = current_step.step_id
  returning * into current_step;

  insert into public.workout_step_operations (
    operation_id,
    user_id,
    step_id,
    before_state,
    after_state,
    logbook_state_before
  ) values (
    p_operation_id,
    owner_id,
    current_step.step_id,
    before_value,
    to_jsonb(current_step),
    state_before
  );

  finish_result := public.finish_workout_if_ready(current_workout.workout_id, p_operation_id);
  return finish_result || jsonb_build_object('step', to_jsonb(current_step));
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
  current_metric integer;
  current_reps integer;
  current_weight numeric;
  has_win boolean := false;
  previous_metric integer;
  previous_reps integer;
  previous_weight numeric;
  set_index integer;
  set_result text;
  set_results text[] := '{}';
  target_max integer;
  target_min integer;
begin
  if jsonb_array_length(p_previous_weights) = 0 then
    return jsonb_build_object('status', 'baseline', 'set_verdicts', '[]'::jsonb);
  end if;

  if p_body_part in ('abs_1', 'abs_2') then
    current_weight := (p_weights -> 0 ->> 'micrograms')::numeric;
    previous_weight := (p_previous_weights -> 0 ->> 'micrograms')::numeric;
    current_metric := case when p_protocol = 'timed_hold' then p_duration_seconds else p_reps[1] end;
    previous_metric := case when p_protocol = 'timed_hold' then p_previous_duration_seconds else p_previous_reps[1] end;

    if (current_weight = previous_weight and current_metric > previous_metric)
      or (current_weight > previous_weight and current_metric >= previous_metric)
    then
      return jsonb_build_object('status', 'win', 'set_verdicts', '[]'::jsonb);
    end if;
    if (current_weight = previous_weight and current_metric <= previous_metric)
      or (current_weight < previous_weight and current_metric <= previous_metric)
    then
      return jsonb_build_object('status', 'failure', 'set_verdicts', '[]'::jsonb);
    end if;
    return jsonb_build_object('status', 'ambiguous', 'set_verdicts', '[]'::jsonb);
  end if;

  if p_protocol = 'rest_pause' then
    current_weight := (p_weights -> 0 ->> 'micrograms')::numeric;
    previous_weight := (p_previous_weights -> 0 ->> 'micrograms')::numeric;
    select coalesce(sum(value), 0) into current_reps from unnest(p_reps) value;
    select coalesce(sum(value), 0) into previous_reps from unnest(p_previous_reps) value;
    target_min := (p_target_sets -> 0 ->> 'min')::integer;
    target_max := (p_target_sets -> 0 ->> 'max')::integer;
    if (current_weight > previous_weight and current_reps between target_min and target_max)
      or (current_weight = previous_weight and current_reps > previous_reps)
    then
      return jsonb_build_object('status', 'win', 'set_verdicts', '[]'::jsonb);
    end if;
    return jsonb_build_object('status', 'failure', 'set_verdicts', '[]'::jsonb);
  end if;

  for set_index in 1..jsonb_array_length(p_weights)
  loop
    current_weight := (p_weights -> (set_index - 1) ->> 'micrograms')::numeric;
    previous_weight := (p_previous_weights -> (set_index - 1) ->> 'micrograms')::numeric;
    current_reps := p_reps[set_index];
    previous_reps := p_previous_reps[set_index];
    if set_index <= jsonb_array_length(p_target_sets) then
      target_min := (p_target_sets -> (set_index - 1) ->> 'min')::integer;
      target_max := (p_target_sets -> (set_index - 1) ->> 'max')::integer;
    else
      target_min := 1;
      target_max := 2147483647;
    end if;

    if (current_weight > previous_weight and current_reps between target_min and target_max)
      or (current_weight = previous_weight and current_reps > previous_reps)
    then
      set_result := 'win';
      has_win := true;
    elsif current_weight = previous_weight and current_reps = previous_reps then
      set_result := 'tie';
    else
      set_result := 'failure';
    end if;
    set_results := array_append(set_results, set_result);
  end loop;

  return jsonb_build_object(
    'status', case when has_win then 'win' else 'failure' end,
    'set_verdicts', to_jsonb(set_results)
  );
end;
$$;

create or replace function public.finish_workout_if_ready(
  p_workout_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_now boolean := false;
  current_state public.workout_rotation_state;
  current_workout public.workouts;
  owner_id uuid := (select auth.uid());
begin
  if owner_id is null then raise exception 'Authentication required'; end if;

  select * into current_workout
  from public.workouts
  where workout_id = p_workout_id and user_id = owner_id
  for update;
  if not found then raise exception 'Workout not found'; end if;

  if current_workout.status = 'in_progress'
    and not exists (
      select 1 from public.workout_steps
      where workout_id = current_workout.workout_id
        and (status = 'pending' or enforcement_action is not null)
    )
  then
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
    'workout', to_jsonb(current_workout),
    'next_slot', current_state.next_slot,
    'completed_now', completed_now
  );
end;
$$;

create or replace function public.resolve_logbook_action(
  p_step_id uuid,
  p_operation_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_step public.workout_steps;
  finish_result jsonb;
  owner_id uuid := (select auth.uid());
  prior_operation public.logbook_operations;
  result jsonb;
  state_value text;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null then raise exception 'Operation ID required'; end if;
  if p_action not in ('count_win', 'count_failure', 'use_mulligan') then
    raise exception 'Invalid logbook action';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select * into prior_operation
  from public.logbook_operations
  where operation_id = p_operation_id and user_id = owner_id;
  if found then return prior_operation.result; end if;

  select * into current_step
  from public.workout_steps
  where step_id = p_step_id and user_id = owner_id
  for update;
  if not found or current_step.status <> 'completed' then
    raise exception 'Completed workout step not found';
  end if;

  select state into state_value
  from public.assignment_logbook_states
  where assignment_id = current_step.assignment_id
  for update;

  if p_action in ('count_win', 'count_failure') then
    if current_step.enforcement_action <> 'abs_choice' then
      raise exception 'Abs verdict choice is not pending';
    end if;
    if p_action = 'count_win' then
      current_step.verdict := 'win';
      current_step.enforcement_action := null;
      delete from public.assignment_logbook_states
      where assignment_id = current_step.assignment_id;
    else
      current_step.verdict := 'failure';
      current_step.enforcement_action := case
        when state_value = 'mulligan_used' then 'replacement_required'
        else 'first_failure'
      end;
      insert into public.assignment_logbook_states (assignment_id, user_id, state, updated_at)
      values (
        current_step.assignment_id,
        owner_id,
        case when state_value = 'mulligan_used' then 'replacement_required' else 'first_failure_pending' end,
        now()
      )
      on conflict (assignment_id) do update set
        state = excluded.state,
        updated_at = excluded.updated_at;
    end if;
  else
    if current_step.enforcement_action <> 'first_failure'
      or state_value <> 'first_failure_pending'
    then
      raise exception 'Mulligan is not available';
    end if;
    current_step.enforcement_action := null;
    insert into public.assignment_logbook_states (assignment_id, user_id, state, updated_at)
    values (current_step.assignment_id, owner_id, 'mulligan_used', now())
    on conflict (assignment_id) do update set
      state = excluded.state,
      updated_at = excluded.updated_at;
  end if;

  update public.workout_steps set
    verdict = current_step.verdict,
    enforcement_action = current_step.enforcement_action,
    resolution = p_action,
    last_operation_id = case
      when current_step.enforcement_action is not null then current_step.last_operation_id
      else null
    end,
    updated_at = now()
  where step_id = current_step.step_id
  returning * into current_step;

  finish_result := public.finish_workout_if_ready(current_step.workout_id, p_operation_id);
  result := finish_result || jsonb_build_object('step', to_jsonb(current_step));
  insert into public.logbook_operations (operation_id, user_id, step_id, action, result)
  values (p_operation_id, owner_id, current_step.step_id, p_action, result);
  return result;
end;
$$;

create or replace function public.replace_failed_assignment(
  p_step_id uuid,
  p_operation_id uuid,
  p_exercise text,
  p_protocol text,
  p_structure text,
  p_target_sets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_assignment public.rotation_assignment_versions;
  current_step public.workout_steps;
  finish_result jsonb;
  owner_id uuid := (select auth.uid());
  prior_operation public.logbook_operations;
  result jsonb;
  saved_assignment public.rotation_assignment_versions;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null then raise exception 'Operation ID required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select * into prior_operation
  from public.logbook_operations
  where operation_id = p_operation_id and user_id = owner_id;
  if found then return prior_operation.result; end if;

  select * into current_step
  from public.workout_steps
  where step_id = p_step_id and user_id = owner_id
  for update;
  if not found
    or current_step.status <> 'completed'
    or current_step.enforcement_action not in ('first_failure', 'replacement_required')
  then
    raise exception 'Exercise replacement is not pending';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(owner_id::text),
    hashtext((select slot from public.workouts where workout_id = current_step.workout_id) || ':' || current_step.body_part)
  );
  select * into current_assignment
  from public.rotation_assignment_versions
  where assignment_id = current_step.assignment_id
    and user_id = owner_id
    and active
  for update;
  if not found then raise exception 'Active failed assignment not found'; end if;
  if current_assignment.exercise = p_exercise then
    raise exception 'Replacement exercise must be different';
  end if;

  update public.rotation_assignment_versions
  set active = false, updated_at = now()
  where assignment_id = current_assignment.assignment_id;

  insert into public.rotation_assignment_versions (
    user_id,
    slot,
    body_part,
    exercise,
    protocol,
    structure,
    target_sets,
    replaced_assignment_id
  ) values (
    owner_id,
    current_assignment.slot,
    current_assignment.body_part,
    p_exercise,
    p_protocol,
    p_structure,
    p_target_sets,
    current_assignment.assignment_id
  )
  returning * into saved_assignment;

  delete from public.assignment_logbook_states
  where assignment_id = current_assignment.assignment_id;

  update public.workout_steps set
    enforcement_action = null,
    resolution = 'replaced',
    last_operation_id = null,
    updated_at = now()
  where step_id = current_step.step_id
  returning * into current_step;

  finish_result := public.finish_workout_if_ready(current_step.workout_id, p_operation_id);
  result := finish_result || jsonb_build_object(
    'step', to_jsonb(current_step),
    'assignment', to_jsonb(saved_assignment)
  );
  insert into public.logbook_operations (operation_id, user_id, step_id, action, result)
  values (p_operation_id, owner_id, current_step.step_id, 'replaced', result);
  return result;
end;
$$;

create or replace function public.save_rotation_assignment(
  p_slot text,
  p_body_part text,
  p_exercise text,
  p_protocol text,
  p_structure text,
  p_target_sets jsonb
)
returns public.rotation_assignment_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_assignment public.rotation_assignment_versions;
  owner_id uuid := (select auth.uid());
  saved_assignment public.rotation_assignment_versions;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;

  perform pg_advisory_xact_lock(
    hashtext(owner_id::text),
    hashtext(p_slot || ':' || p_body_part)
  );
  select * into current_assignment
  from public.rotation_assignment_versions
  where user_id = owner_id and slot = p_slot and body_part = p_body_part and active
  for update;

  if found and exists (
    select 1 from public.assignment_logbook_states
    where assignment_id = current_assignment.assignment_id
      and state in ('first_failure_pending', 'mulligan_used', 'replacement_required')
  ) then
    raise exception 'Resolve the active logbook lifecycle first';
  end if;

  if found
    and current_assignment.exercise = p_exercise
    and current_assignment.protocol = p_protocol
    and current_assignment.structure = p_structure
    and current_assignment.target_sets = p_target_sets
  then
    return current_assignment;
  end if;

  if found then
    update public.rotation_assignment_versions
    set active = false, updated_at = now()
    where assignment_id = current_assignment.assignment_id;
  end if;

  insert into public.rotation_assignment_versions (
    user_id, slot, body_part, exercise, protocol, structure, target_sets, replaced_assignment_id
  ) values (
    owner_id, p_slot, p_body_part, p_exercise, p_protocol, p_structure, p_target_sets,
    current_assignment.assignment_id
  )
  returning * into saved_assignment;
  return saved_assignment;
end;
$$;

create or replace function public.recalculate_assignment_logbook(p_assignment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment_active boolean;
  current_step public.workout_steps;
  evaluation jsonb;
  evaluation_status text;
  first_performance boolean := true;
  owner_id uuid := (select auth.uid());
  previous_duration integer;
  previous_reps integer[];
  previous_weights jsonb;
  state_value text;
begin
  select active into assignment_active
  from public.rotation_assignment_versions
  where assignment_id = p_assignment_id and user_id = owner_id
  for update;
  if not found then raise exception 'Assignment not found'; end if;

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
    order by workout.started_at, step.ordinal
  loop
    current_step.mulligan_used := coalesce(state_value = 'mulligan_used', false);
    current_step.enforcement_action := null;
    current_step.set_verdicts := '{}';

    if first_performance then
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
        elsif current_step.resolution in ('count_failure', 'use_mulligan', 'replaced') then
          evaluation_status := 'failure';
        else
          current_step.verdict := null;
          current_step.enforcement_action := 'abs_choice';
        end if;
      end if;

      if evaluation_status = 'win' then
        current_step.verdict := 'win';
        current_step.enforcement_action := null;
        if current_step.resolution <> 'replaced' then
          current_step.resolution := null;
        end if;
        state_value := null;
      elsif evaluation_status = 'failure' then
        current_step.verdict := 'failure';
        if current_step.resolution = 'count_win' then
          current_step.resolution := null;
        end if;
        if current_step.resolution = 'replaced' then
          state_value := null;
          current_step.enforcement_action := null;
        elsif state_value in ('mulligan_used', 'first_failure_pending', 'replacement_required') then
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

    if not assignment_active then
      state_value := null;
      current_step.enforcement_action := null;
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

  if assignment_active and state_value is not null then
    insert into public.assignment_logbook_states (assignment_id, user_id, state, updated_at)
    values (p_assignment_id, owner_id, state_value, now());
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(step) order by workout.started_at, step.ordinal)
    from public.workout_steps step
    join public.workouts workout on workout.workout_id = step.workout_id
    where step.assignment_id = p_assignment_id
      and step.user_id = owner_id
      and step.status = 'completed'
  ), '[]'::jsonb);
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

create or replace function public.undo_workout_step(
  p_operation_id uuid,
  p_undo_operation_id uuid
)
returns public.workout_steps
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state public.workout_rotation_state;
  current_step public.workout_steps;
  current_workout public.workouts;
  owner_id uuid := (select auth.uid());
  prior_completed_slot text;
  saved_operation public.workout_step_operations;
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
    reps = array(select jsonb_array_elements_text(saved_operation.before_state -> 'reps')::integer),
    duration_seconds = (saved_operation.before_state ->> 'duration_seconds')::integer,
    verdict = saved_operation.before_state ->> 'verdict',
    set_verdicts = array(
      select jsonb_array_elements_text(saved_operation.before_state -> 'set_verdicts')
    ),
    enforcement_action = saved_operation.before_state ->> 'enforcement_action',
    resolution = saved_operation.before_state ->> 'resolution',
    last_operation_id = null,
    updated_at = now()
  where step_id = current_step.step_id
  returning * into current_step;

  if current_step.assignment_id is not null then
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
  end if;

  update public.workout_step_operations set
    undo_operation_id = p_undo_operation_id,
    undone_at = now()
  where operation_id = p_operation_id;
  return current_step;
end;
$$;

revoke execute on function public.normalize_workout_performance(text, jsonb, jsonb, integer[], integer) from public, anon;
revoke execute on function public.evaluate_logbook_performance(text, text, jsonb, jsonb, integer[], integer, jsonb, integer[], integer) from public, anon;
revoke execute on function public.finish_workout_if_ready(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.start_workout(uuid) from public, anon;
revoke execute on function public.save_workout_step(uuid, uuid, text, jsonb, integer[], integer) from public, anon;
revoke execute on function public.resolve_logbook_action(uuid, uuid, text) from public, anon;
revoke execute on function public.replace_failed_assignment(uuid, uuid, text, text, text, jsonb) from public, anon;
revoke execute on function public.save_rotation_assignment(text, text, text, text, text, jsonb) from public, anon;
revoke execute on function public.recalculate_assignment_logbook(uuid) from public, anon, authenticated;
revoke execute on function public.correct_workout_performance(uuid, uuid, jsonb, integer[], integer) from public, anon;
revoke execute on function public.undo_workout_step(uuid, uuid) from public, anon;

grant execute on function public.normalize_workout_performance(text, jsonb, jsonb, integer[], integer) to authenticated;
grant execute on function public.evaluate_logbook_performance(text, text, jsonb, jsonb, integer[], integer, jsonb, integer[], integer) to authenticated;
grant execute on function public.start_workout(uuid) to authenticated;
grant execute on function public.save_workout_step(uuid, uuid, text, jsonb, integer[], integer) to authenticated;
grant execute on function public.resolve_logbook_action(uuid, uuid, text) to authenticated;
grant execute on function public.replace_failed_assignment(uuid, uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.save_rotation_assignment(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.correct_workout_performance(uuid, uuid, jsonb, integer[], integer) to authenticated;
grant execute on function public.undo_workout_step(uuid, uuid) to authenticated;
