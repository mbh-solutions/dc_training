create schema if not exists private;

create table private.offline_operations (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  payload jsonb not null,
  result jsonb not null,
  applied_at timestamptz not null default now(),
  constraint offline_operations_payload_object
    check (jsonb_typeof(payload) = 'object')
);

alter table private.offline_operations enable row level security;
revoke all on schema private from public, anon, authenticated;
revoke all on table private.offline_operations from public, anon, authenticated;

create or replace function private.offline_step_id(
  p_owner_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_step_id uuid;
  resolved_workout_id uuid;
begin
  if p_payload ? 'step_id' then
    resolved_step_id := (p_payload ->> 'step_id')::uuid;
  else
    select (operation.result ->> 'workout_id')::uuid
    into resolved_workout_id
    from private.offline_operations operation
    where operation.operation_id =
        (p_payload ->> 'workout_operation_id')::uuid
      and operation.user_id = p_owner_id
      and operation.kind = 'start_workout';

    if resolved_workout_id is null then
      raise exception 'Offline workout operation was not found';
    end if;

    select step.step_id
    into resolved_step_id
    from public.workout_steps step
    where step.user_id = p_owner_id
      and step.workout_id = resolved_workout_id
      and step.ordinal = (p_payload ->> 'ordinal')::integer;
  end if;

  if resolved_step_id is null or not exists (
    select 1
    from public.workout_steps step
    where step.step_id = resolved_step_id and step.user_id = p_owner_id
  ) then
    raise exception 'Offline workout step was not found';
  end if;
  return resolved_step_id;
end;
$$;

revoke all on function private.offline_step_id(uuid, jsonb)
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
  response jsonb;
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
    response := to_jsonb(public.start_a1_workout(p_operation_id));
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
  elsif p_kind = 'save_rotation_assignment' then
    response := to_jsonb(public.save_rotation_assignment(
      p_payload ->> 'slot',
      p_payload ->> 'body_part',
      p_payload ->> 'exercise',
      p_payload ->> 'protocol',
      p_payload ->> 'structure',
      coalesce(p_payload -> 'target_sets', '[]'::jsonb)
    ));
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
    response := public.transition_training_lifecycle(
      p_payload ->> 'action',
      p_operation_id
    );
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
