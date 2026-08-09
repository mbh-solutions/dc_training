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
security invoker
set search_path = ''
as $$
declare
  current_assignment public.rotation_assignment_versions;
  saved_assignment public.rotation_assignment_versions;
  owner_id uuid := (select auth.uid());
begin
  if owner_id is null then
    raise exception 'Authentication required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(owner_id::text),
    pg_catalog.hashtext(p_slot || ':' || p_body_part)
  );

  select * into current_assignment
  from public.rotation_assignment_versions
  where user_id = owner_id and slot = p_slot and body_part = p_body_part and active
  for update;

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
