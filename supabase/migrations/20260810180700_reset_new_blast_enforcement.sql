create or replace function public.reset_logbook_for_new_blast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.assignment_logbook_states
  where user_id = new.user_id;

  update public.workout_steps step
  set enforcement_action = null,
      updated_at = now()
  where step.user_id = new.user_id
    and step.enforcement_action is not null;

  return new;
end;
$$;

revoke all on function public.reset_logbook_for_new_blast()
from public, anon, authenticated;

create trigger reset_logbook_for_new_blast
after update of phase, blast_id on public.training_lifecycle_state
for each row
when (
  old.phase = 'cruise'
  and new.phase = 'blast'
  and new.blast_id is distinct from old.blast_id
)
execute function public.reset_logbook_for_new_blast();
