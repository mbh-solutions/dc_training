create table public.training_lifecycle_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phase text not null default 'blast' check (phase in ('blast', 'cruise')),
  blast_id uuid not null default gen_random_uuid(),
  blast_started_at timestamptz not null default now(),
  blast_ended_at timestamptz,
  cruise_started_at timestamptz,
  suggestion_due boolean not null default false,
  suggestion_dismissed boolean not null default false,
  updated_at timestamptz not null default now(),
  check (
    (phase = 'blast' and blast_ended_at is null and cruise_started_at is null)
    or
    (phase = 'cruise' and blast_ended_at is not null and cruise_started_at is not null)
  )
);

create table public.training_lifecycle_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('start_cruise', 'start_new_blast', 'dismiss_suggestion')),
  created_at timestamptz not null default now()
);

alter table public.training_lifecycle_state enable row level security;
alter table public.training_lifecycle_operations enable row level security;

revoke all on table public.training_lifecycle_state, public.training_lifecycle_operations
from public, anon, authenticated;
grant select on table public.training_lifecycle_state to authenticated;

create policy "Users can read only their training lifecycle"
on public.training_lifecycle_state for select to authenticated
using ((select auth.uid()) = user_id);

insert into public.training_lifecycle_state (user_id, blast_started_at)
select
  owner.user_id,
  coalesce((
    select min(workout.started_at)
    from public.workouts workout
    where workout.user_id = owner.user_id
  ), now())
from (
  select profile.user_id from public.foundation_profiles profile
  union
  select workout.user_id from public.workouts workout
) owner
on conflict (user_id) do nothing;

alter table public.workouts add column blast_id uuid;

update public.workouts workout
set blast_id = lifecycle.blast_id
from public.training_lifecycle_state lifecycle
where lifecycle.user_id = workout.user_id;

alter table public.workouts alter column blast_id set not null;

create index workouts_owner_blast_completed
on public.workouts (user_id, blast_id, completed_at desc);

create or replace function public.blast_has_elapsed_seven_weeks(
  p_started_at timestamptz,
  p_as_of timestamptz
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select p_as_of >= p_started_at + interval '7 weeks';
$$;

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
  return new;
end;
$$;

create trigger prepare_workout_lifecycle_before_insert
before insert on public.workouts
for each row execute function public.prepare_workout_lifecycle();

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
  order by workout.started_at desc, step.ordinal desc
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
  select coalesce(jsonb_agg(entry order by performed_at, ordinal), '[]'::jsonb)
  into new.reference_history
  from (
    select
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

create trigger prepare_workout_step_baseline_before_insert
before insert on public.workout_steps
for each row execute function public.prepare_workout_step_baseline();

create or replace function public.update_cruise_suggestion_after_workout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status = 'in_progress' then
    update public.training_lifecycle_state lifecycle
    set
      suggestion_due = lifecycle.suggestion_due or (
        not lifecycle.suggestion_dismissed
        and public.blast_has_elapsed_seven_weeks(
          lifecycle.blast_started_at,
          new.completed_at
        )
      ),
      updated_at = now()
    where lifecycle.user_id = new.user_id
      and lifecycle.phase = 'blast'
      and lifecycle.blast_id = new.blast_id;
  elsif new.status = 'in_progress' and old.status = 'completed' then
    update public.training_lifecycle_state lifecycle
    set
      suggestion_due = not lifecycle.suggestion_dismissed and exists (
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
    where lifecycle.user_id = new.user_id
      and lifecycle.phase = 'blast'
      and lifecycle.blast_id = new.blast_id;
  end if;
  return new;
end;
$$;

create trigger update_cruise_suggestion_after_workout_status
after update of status on public.workouts
for each row
when (old.status is distinct from new.status)
execute function public.update_cruise_suggestion_after_workout();

create or replace function public.transition_training_lifecycle(
  p_action text,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_state public.training_lifecycle_state;
  owner_id uuid := (select auth.uid());
  prior_action text;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null then raise exception 'Operation ID required'; end if;
  if p_action not in ('start_cruise', 'start_new_blast', 'dismiss_suggestion') then
    raise exception 'Invalid training lifecycle action';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  insert into public.training_lifecycle_state (user_id)
  values (owner_id)
  on conflict (user_id) do nothing;
  select * into current_state
  from public.training_lifecycle_state
  where user_id = owner_id
  for update;

  select action into prior_action
  from public.training_lifecycle_operations
  where operation_id = p_operation_id and user_id = owner_id;
  if found then
    if prior_action <> p_action then raise exception 'Operation ID action mismatch'; end if;
    return to_jsonb(current_state);
  end if;

  if p_action = 'start_cruise' then
    if exists (
      select 1 from public.workouts
      where user_id = owner_id and status = 'in_progress'
    ) then raise exception 'Finish the active workout before starting cruise'; end if;
    if current_state.phase = 'blast' then
      update public.training_lifecycle_state set
        phase = 'cruise',
        blast_ended_at = now(),
        cruise_started_at = now(),
        suggestion_due = false,
        updated_at = now()
      where user_id = owner_id
      returning * into current_state;
    end if;
  elsif p_action = 'start_new_blast' then
    if current_state.phase <> 'cruise' then raise exception 'Cruise is not active'; end if;
    if exists (
      select 1 from public.workouts
      where user_id = owner_id and status = 'in_progress'
    ) then raise exception 'Active workout conflicts with cruise'; end if;
    update public.training_lifecycle_state set
      phase = 'blast',
      blast_id = gen_random_uuid(),
      blast_started_at = now(),
      blast_ended_at = null,
      cruise_started_at = null,
      suggestion_due = false,
      suggestion_dismissed = false,
      updated_at = now()
    where user_id = owner_id
    returning * into current_state;
    delete from public.assignment_logbook_states where user_id = owner_id;
  else
    if current_state.phase <> 'blast' then raise exception 'Cruise suggestion is unavailable'; end if;
    if not current_state.suggestion_due and not current_state.suggestion_dismissed then
      raise exception 'Cruise suggestion is unavailable';
    end if;
    update public.training_lifecycle_state set
      suggestion_due = false,
      suggestion_dismissed = true,
      updated_at = now()
    where user_id = owner_id
    returning * into current_state;
  end if;

  insert into public.training_lifecycle_operations (operation_id, user_id, action)
  values (p_operation_id, owner_id, p_action);
  return to_jsonb(current_state);
end;
$$;

create or replace function public.recalculate_assignment_logbook(p_assignment_id uuid)
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
    order by workout.started_at, step.ordinal
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
        if current_step.resolution <> 'replaced'
          and evaluation ->> 'status' <> 'ambiguous'
        then current_step.resolution := null; end if;
        state_value := null;
      elsif evaluation_status = 'failure' then
        current_step.verdict := 'failure';
        if current_step.resolution = 'count_win' then current_step.resolution := null; end if;
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

    if current_blast_id is distinct from active_blast_id or not assignment_active then
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

revoke execute on function public.blast_has_elapsed_seven_weeks(timestamptz, timestamptz)
from public, anon, authenticated;
revoke execute on function public.prepare_workout_lifecycle() from public, anon, authenticated;
revoke execute on function public.prepare_workout_step_baseline() from public, anon, authenticated;
revoke execute on function public.update_cruise_suggestion_after_workout() from public, anon, authenticated;
revoke execute on function public.transition_training_lifecycle(text, uuid) from public, anon;
revoke execute on function public.recalculate_assignment_logbook(uuid) from public, anon, authenticated;
grant execute on function public.transition_training_lifecycle(text, uuid) to authenticated;
