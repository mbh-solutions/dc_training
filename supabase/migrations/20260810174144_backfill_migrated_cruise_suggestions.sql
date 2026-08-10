update public.training_lifecycle_state lifecycle
set
  suggestion_due = true,
  updated_at = now()
where lifecycle.phase = 'blast'
  and not lifecycle.suggestion_due
  and not lifecycle.suggestion_dismissed
  and exists (
    select 1
    from public.workouts workout
    where workout.user_id = lifecycle.user_id
      and workout.blast_id = lifecycle.blast_id
      and workout.status = 'completed'
      and public.blast_has_elapsed_seven_weeks(
        lifecycle.blast_started_at,
        workout.completed_at
      )
  );
