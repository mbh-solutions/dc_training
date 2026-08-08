create table public.foundation_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'ready' check (status = 'ready'),
  created_at timestamptz not null default now()
);

alter table public.foundation_profiles enable row level security;

revoke all on table public.foundation_profiles from anon, authenticated;
grant select on table public.foundation_profiles to authenticated;

create policy "Users can read only their foundation profile"
on public.foundation_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);
