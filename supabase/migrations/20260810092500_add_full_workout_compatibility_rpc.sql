create or replace function public.save_a1_workout_step(
  p_step_id uuid,
  p_operation_id uuid,
  p_status text,
  p_weights jsonb,
  p_reps integer[],
  p_duration_seconds integer
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
    p_duration_seconds
  );
$$;

revoke execute on function public.save_a1_workout_step(uuid, uuid, text, jsonb, integer[], integer) from public, anon;
grant execute on function public.save_a1_workout_step(uuid, uuid, text, jsonb, integer[], integer) to authenticated;
