insert into public.training_lifecycle_state (user_id)
select profile.user_id
from public.foundation_profiles profile
on conflict (user_id) do nothing;

create or replace function public.ensure_training_lifecycle_for_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.training_lifecycle_state (user_id)
  values (new.user_id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_training_lifecycle_for_profile()
from public, anon, authenticated;

create trigger ensure_training_lifecycle_after_profile_insert
after insert on public.foundation_profiles
for each row execute function public.ensure_training_lifecycle_for_profile();

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

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  insert into public.training_lifecycle_state (user_id)
  values (owner_id)
  on conflict (user_id) do nothing;
  if not exists (
    select 1 from public.training_lifecycle_state
    where user_id = owner_id and phase = 'blast'
  ) then
    raise exception 'Rotation changes require an active blast';
  end if;

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

  if found and exists (
    select 1 from public.workout_steps
    where assignment_id = current_assignment.assignment_id
      and enforcement_action is not null
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

  if found and exists (
    select 1
    from public.workout_steps step
    join public.workouts workout on workout.workout_id = step.workout_id
    where step.assignment_id = current_assignment.assignment_id
      and workout.status = 'in_progress'
  ) then
    raise exception 'Finish the active workout before changing this assignment';
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
  current_lifecycle public.training_lifecycle_state;
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

  select * into current_lifecycle
  from public.training_lifecycle_state
  where user_id = owner_id
  for update;
  if not found
    or current_lifecycle.phase <> 'blast'
    or current_workout.blast_id is distinct from current_lifecycle.blast_id
  then
    raise exception 'Workout can no longer be undone in this training lifecycle';
  end if;

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
