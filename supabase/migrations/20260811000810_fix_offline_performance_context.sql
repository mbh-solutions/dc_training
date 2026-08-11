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
  resolved_step_id uuid;
begin
  if jsonb_typeof(expected) <> 'object'
    or jsonb_typeof(expected -> 'weights') <> 'array'
    or jsonb_typeof(expected -> 'reps') <> 'array'
    or not (expected ? 'duration_seconds')
    or jsonb_typeof(expected -> 'duration_seconds') not in ('null', 'number')
  then
    raise exception 'Offline performance context is invalid';
  end if;
  resolved_step_id := private.offline_step_id(p_owner_id, p_payload);
  select * into current_step
  from public.workout_steps step
  where step.step_id = resolved_step_id
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
