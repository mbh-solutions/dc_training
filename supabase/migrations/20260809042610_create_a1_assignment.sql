create table public.rotation_assignments (
  user_id uuid not null references auth.users (id) on delete cascade,
  slot text not null check (slot = 'A1'),
  body_part text not null check (body_part = 'chest'),
  exercise text not null check (exercise in (
    'Incline barbell press',
    'Flat barbell press',
    'Decline barbell press',
    'Incline football-bar press',
    'Flat football-bar press',
    'Decline football-bar press',
    'Incline dumbbell press',
    'Flat dumbbell press',
    'Decline dumbbell press'
  )),
  protocol text not null check (protocol in ('rest_pause', 'straight_set')),
  target_min integer,
  target_max integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot),
  check (
    (protocol = 'straight_set' and target_min is null and target_max is null)
    or
    (protocol = 'rest_pause' and target_min > 0 and target_max >= target_min)
  )
);

alter table public.rotation_assignments enable row level security;

revoke all on table public.rotation_assignments from anon, authenticated;
grant select, insert, update on table public.rotation_assignments to authenticated;

create policy "Users can read only their rotation assignments"
on public.rotation_assignments
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create only their rotation assignments"
on public.rotation_assignments
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update only their rotation assignments"
on public.rotation_assignments
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
