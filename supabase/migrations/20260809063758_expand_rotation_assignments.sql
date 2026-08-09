create or replace function public.valid_rotation_targets(targets jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  target jsonb;
  minimum bigint;
  maximum bigint;
begin
  if jsonb_typeof(targets) <> 'array' or jsonb_array_length(targets) > 10 then
    return false;
  end if;
  for target in select value from jsonb_array_elements(targets)
  loop
    if jsonb_typeof(target) <> 'object'
      or jsonb_typeof(target -> 'min') <> 'number'
      or jsonb_typeof(target -> 'max') <> 'number'
      or (target ->> 'min') !~ '^[0-9]+$'
      or (target ->> 'max') !~ '^[0-9]+$'
    then
      return false;
    end if;
    minimum := (target ->> 'min')::bigint;
    maximum := (target ->> 'max')::bigint;
    if minimum < 1 or minimum > 2147483647 or maximum < minimum or maximum > 2147483647 then
      return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

revoke execute on function public.valid_rotation_targets(jsonb) from public, anon;
grant execute on function public.valid_rotation_targets(jsonb) to authenticated;

create table public.rotation_assignment_versions (
  assignment_id uuid primary key default gen_random_uuid(),
  replaced_assignment_id uuid references public.rotation_assignment_versions (assignment_id),
  user_id uuid not null references auth.users (id) on delete cascade,
  slot text not null,
  body_part text not null,
  exercise text not null,
  protocol text not null,
  structure text not null,
  target_sets jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (slot in ('A1', 'A2', 'A3') and body_part in ('chest', 'shoulders', 'triceps', 'back_width', 'back_thickness'))
    or
    (slot in ('B1', 'B2', 'B3') and body_part in ('biceps', 'forearms', 'calves', 'hamstrings', 'quadriceps', 'abs_1', 'abs_2'))
  ),
  check (public.valid_rotation_targets(target_sets)),
  check (
    (body_part = 'chest' and exercise in (
      'Incline barbell press', 'Flat barbell press', 'Decline barbell press', 'Incline football-bar press', 'Flat football-bar press', 'Decline football-bar press', 'Incline dumbbell press', 'Flat dumbbell press', 'Decline dumbbell press'
    )) or
    (body_part = 'shoulders' and exercise in (
      'Standing barbell military press', 'Seated barbell front press', 'Standing behind-neck barbell press', 'Seated behind-neck barbell press', 'Seated football-bar shoulder press', 'High-incline football-bar press', 'Standing dumbbell shoulder press', 'Seated dumbbell shoulder press', 'Wide-grip barbell upright row', 'EZ-bar upright row', 'Football-bar upright row', 'Cable upright row', 'Clean and press'
    )) or
    (body_part = 'triceps' and exercise in (
      'Close-grip barbell bench press', 'Close-grip football-bar bench press', 'Reverse-grip barbell bench press', 'Reverse-angle football-bar bench press', 'EZ-bar skullcrusher', 'Straight-bar skullcrusher', 'Football-bar skullcrusher', 'Dumbbell lying triceps extension', 'Incline skullcrusher', 'Decline skullcrusher', 'Close-grip dumbbell press', 'Upright dips, if dip attachment is available', 'PJR pullover / PJR triceps extension'
    )) or
    (body_part = 'back_width' and exercise in (
      'Front rack chins', 'Behind-neck rack chins', 'Reverse-grip close rack chins', 'Pull-ups', 'Band-assisted pull-ups', 'Chin-ups', 'Wide-grip front pulldown', 'Medium-grip front pulldown', 'Close-grip pulldown', 'Neutral-grip pulldown', 'Reverse-grip / underhand pulldown', 'Behind-neck pulldown', 'One-arm high-pulley pulldown', 'Dante pulley-row high pull'
    )) or
    (body_part = 'back_thickness' and exercise in (
      'Conventional deadlift', 'Rack deadlift', 'Trap-bar deadlift', 'Landmine T-bar row', 'Overhand barbell row', 'Underhand barbell row', 'Football-bar row', 'Close-neutral seated cable row', 'Wide-grip seated cable row', 'Underhand seated cable row', 'One-arm low-cable row', 'One-arm dumbbell row', 'Two-arm dumbbell row', 'One-arm landmine row'
    )) or
    (body_part = 'biceps' and exercise in (
      'Straight-bar curl', 'EZ-bar curl', 'Dante drag curl', 'Standing dumbbell curl', 'Alternating dumbbell curl', 'Seated dumbbell curl', 'Incline dumbbell curl', 'Low-cable curl', 'One-arm low-cable curl', 'Football-bar curl', 'Preacher-style dumbbell curl, if REP bench setup works', 'Preacher-style EZ-bar curl, if REP bench setup works'
    )) or
    (body_part = 'forearms' and exercise in (
      'Alternating hammer curl', 'Alternating pinwheel curl', 'Reverse-grip one-arm cable curl', 'Reverse EZ-bar curl', 'Reverse straight-bar curl', 'Reverse cable curl', 'Football-bar hammer-style curl', 'Barbell wrist curl', 'EZ-bar wrist curl', 'Dumbbell wrist curl', 'Cable wrist curl'
    )) or
    (body_part = 'calves' and exercise in (
      'Standing barbell calf raise', 'Standing football-bar calf raise', 'Standing dumbbell calf raise', 'Single-leg dumbbell calf raise', 'Seated dumbbell calf raise', 'Seated barbell calf raise', 'Seated football-bar calf raise', 'Belt-squat calf raise'
    )) or
    (body_part = 'hamstrings' and exercise in (
      'Lying Deltech leg curl', 'Single-leg lying leg curl', 'Standing cable leg curl, with ankle cuff', 'Barbell stiff-leg deadlift', 'Dumbbell stiff-leg deadlift', 'Football-bar stiff-leg deadlift', 'Romanian deadlift', 'Dumbbell Romanian deadlift', 'Trap-bar RDL / stiff-leg deadlift', 'Belt-squat RDL / hinge'
    )) or
    (body_part = 'quadriceps' and exercise in (
      'Barbell back squat', 'Barbell front squat', 'Belt squat', 'Narrow-stance belt squat', 'Standard-stance belt squat', 'Wide-stance belt squat', 'Wide-stance / sumo belt squat', 'Barbell hack squat', 'Leg extension'
    )) or
    (body_part in ('abs_1', 'abs_2') and exercise in (
      'High-pulley cable crunch', 'Weighted decline crunch on REP bench', 'Hanging leg raise from rack', 'Lying leg raise on bench', 'Reverse crunch', 'Pallof Press', 'Dead Bug', 'Bird Dog', 'Front Plank', 'Side Plank', 'Glute Bridge'
    ))
  ),
  check (
    (body_part in ('abs_1', 'abs_2') and protocol in ('straight_set', 'timed_hold') and structure = 'none' and target_sets = '[]'::jsonb)
    or
    (body_part not in ('abs_1', 'abs_2') and protocol = 'rest_pause' and (
      (body_part = 'triceps' and exercise ~* '(skullcrusher|extension|pullover)' and (
        (structure = '11-15' and target_sets = '[{"min": 11, "max": 15}]'::jsonb) or
        (structure = '15-30' and target_sets = '[{"min": 15, "max": 30}]'::jsonb) or
        (structure = 'custom' and jsonb_array_length(target_sets) = 1)
      )) or
      (body_part = 'hamstrings' and exercise ~* 'leg curl' and (
        (structure = '15-30' and target_sets = '[{"min": 15, "max": 30}]'::jsonb) or
        (structure = 'custom' and jsonb_array_length(target_sets) = 1)
      )) or
      (body_part = 'quadriceps' and exercise = 'Leg extension' and structure = 'custom' and jsonb_array_length(target_sets) = 1)
      or
      (not (body_part = 'triceps' and exercise ~* '(skullcrusher|extension|pullover)')
        and not (body_part = 'hamstrings' and exercise ~* 'leg curl')
        and not (body_part = 'quadriceps' and exercise = 'Leg extension')
        and (
          (structure = '11-15' and target_sets = '[{"min": 11, "max": 15}]'::jsonb) or
          (structure = '15-20' and target_sets = '[{"min": 15, "max": 20}]'::jsonb) or
          (structure = 'custom' and jsonb_array_length(target_sets) = 1)
        )
      )
    ))
    or
    (protocol = 'straight_set' and (
      (body_part in ('chest', 'shoulders', 'triceps', 'back_width', 'biceps') and structure = 'none' and target_sets = '[]'::jsonb)
      or
      (body_part = 'back_thickness' and exercise ~* 'deadlift' and (
        (structure = 'deadlift-6-8-10-12' and target_sets = '[{"min": 6, "max": 8}, {"min": 10, "max": 12}]'::jsonb) or
        (structure = 'custom' and jsonb_array_length(target_sets) > 0)
      ))
      or
      (body_part = 'back_thickness' and exercise !~* 'deadlift' and (
        (structure = 'single-10-12' and target_sets = '[{"min": 10, "max": 12}]'::jsonb) or
        (structure = 'custom' and jsonb_array_length(target_sets) > 0)
      ))
      or
      (body_part = 'forearms' and (
        (structure = 'single-10-20' and target_sets = '[{"min": 10, "max": 20}]'::jsonb) or
        (structure = 'custom' and jsonb_array_length(target_sets) > 0)
      ))
      or
      (body_part = 'calves' and (
        (structure = 'single-10-12' and target_sets = '[{"min": 10, "max": 12}]'::jsonb) or
        (structure = 'custom' and jsonb_array_length(target_sets) > 0)
      ))
      or
      (body_part = 'hamstrings' and exercise ~* 'leg curl' and structure = 'none' and target_sets = '[]'::jsonb)
      or
      (body_part = 'hamstrings' and exercise !~* 'leg curl' and (
        (structure = 'single-10-15' and target_sets = '[{"min": 10, "max": 15}]'::jsonb) or
        (structure = 'custom' and jsonb_array_length(target_sets) > 0)
      ))
      or
      (body_part = 'quadriceps' and exercise = 'Leg extension' and structure = 'custom' and jsonb_array_length(target_sets) > 0)
      or
      (body_part = 'quadriceps' and exercise = 'Barbell hack squat' and (
        (structure = 'widowmaker-6-10-20' and target_sets = '[{"min": 6, "max": 10}, {"min": 20, "max": 20}]'::jsonb) or
        (structure = 'custom' and jsonb_array_length(target_sets) > 0)
      ))
      or
      (body_part = 'quadriceps' and exercise not in ('Leg extension', 'Barbell hack squat') and (
        (structure = 'widowmaker-4-6-20' and target_sets = '[{"min": 4, "max": 6}, {"min": 20, "max": 20}]'::jsonb) or
        (structure = 'custom' and jsonb_array_length(target_sets) > 0)
      ))
    ))
  ));

alter table public.rotation_assignment_versions enable row level security;

revoke all on table public.rotation_assignment_versions from anon, authenticated;
grant select, insert, update on table public.rotation_assignment_versions to authenticated;

create policy "Users can read only their rotation assignment versions"
on public.rotation_assignment_versions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create only their rotation assignment versions"
on public.rotation_assignment_versions for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update only their rotation assignment versions"
on public.rotation_assignment_versions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

insert into public.rotation_assignment_versions (
  user_id, slot, body_part, exercise, protocol, structure, target_sets
)
select
  user_id,
  slot,
  body_part,
  exercise,
  protocol,
  case
    when protocol = 'straight_set' then 'none'
    when target_min = 11 and target_max = 15 then '11-15'
    when target_min = 15 and target_max = 20 then '15-20'
    else 'custom'
  end,
  case
    when protocol = 'straight_set' then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object('min', target_min, 'max', target_max))
  end
from public.rotation_assignments;

create unique index rotation_assignment_versions_one_active
on public.rotation_assignment_versions (user_id, slot, body_part)
where active;

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

revoke execute on function public.save_rotation_assignment(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_rotation_assignment(text, text, text, text, text, jsonb) to authenticated;
