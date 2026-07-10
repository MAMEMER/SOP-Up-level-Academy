alter table public.sop_steps
add column if not exists duration_minutes integer not null default 10
check (duration_minutes > 0);
