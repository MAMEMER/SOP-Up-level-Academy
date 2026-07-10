create table public.employee_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null default current_date,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, work_date)
);

alter table public.employee_login_events enable row level security;

create policy "users insert own login events"
on public.employee_login_events for insert
to authenticated
with check (user_id = auth.uid());

create policy "users update own login events"
on public.employee_login_events for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "admins read login events"
on public.employee_login_events for select
to authenticated
using (public.current_profile_role() = 'admin');
