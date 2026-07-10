create type public.task_run_status as enum ('not_started', 'in_progress', 'completed');

create table public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.sops(id) on delete cascade,
  assigned_to uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  work_date date not null default current_date,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sop_id, assigned_to, work_date)
);

create table public.task_runs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.task_assignments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.task_run_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  due_seconds integer not null default 0 check (due_seconds >= 0),
  completed_checklist integer not null default 0 check (completed_checklist >= 0),
  total_checklist integer not null default 0 check (total_checklist >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.task_runs(id) on delete cascade,
  step_id uuid references public.sop_steps(id) on delete set null,
  item_index integer not null,
  label text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, step_id, item_index)
);

alter table public.task_assignments enable row level security;
alter table public.task_runs enable row level security;
alter table public.task_run_items enable row level security;

create policy "admins read all task assignments"
on public.task_assignments for select
to authenticated
using (public.current_profile_role() = 'admin');

create policy "users read own task assignments"
on public.task_assignments for select
to authenticated
using (assigned_to = auth.uid());

create policy "admins manage task assignments"
on public.task_assignments for all
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

create policy "admins read all task runs"
on public.task_runs for select
to authenticated
using (public.current_profile_role() = 'admin');

create policy "users manage own task runs"
on public.task_runs for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "admins read all task run items"
on public.task_run_items for select
to authenticated
using (public.current_profile_role() = 'admin');

create policy "users manage own task run items"
on public.task_run_items for all
to authenticated
using (
  exists (
    select 1 from public.task_runs
    where task_runs.id = task_run_items.run_id
    and task_runs.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.task_runs
    where task_runs.id = task_run_items.run_id
    and task_runs.user_id = auth.uid()
  )
);
