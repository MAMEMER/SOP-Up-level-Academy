alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.sops enable row level security;
alter table public.sop_steps enable row level security;
alter table public.approval_comments enable row level security;
alter table public.attachments enable row level security;

create or replace function public.current_profile_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.current_profile_department_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select department_id from public.profiles where id = auth.uid() and active = true
$$;

create policy "authenticated users read departments"
on public.departments for select
to authenticated
using (true);

create policy "admins manage departments"
on public.departments for all
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

create policy "users read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.current_profile_role() = 'admin');

create policy "admins manage profiles"
on public.profiles for all
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

create policy "authenticated users read categories"
on public.categories for select
to authenticated
using (true);

create policy "admins manage categories"
on public.categories for all
to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

create policy "read published sops plus own department leader drafts"
on public.sops for select
to authenticated
using (
  status = 'published'
  or public.current_profile_role() = 'admin'
  or (
    public.current_profile_role() = 'leader'
    and department_id = public.current_profile_department_id()
  )
);

create policy "leaders insert own department sops"
on public.sops for insert
to authenticated
with check (
  public.current_profile_role() in ('leader', 'admin')
  and (
    public.current_profile_role() = 'admin'
    or department_id = public.current_profile_department_id()
  )
);

create policy "leaders update own draft or revision sops"
on public.sops for update
to authenticated
using (
  public.current_profile_role() = 'admin'
  or (
    public.current_profile_role() = 'leader'
    and department_id = public.current_profile_department_id()
    and status in ('draft', 'needs_revision')
  )
)
with check (
  public.current_profile_role() = 'admin'
  or (
    public.current_profile_role() = 'leader'
    and department_id = public.current_profile_department_id()
    and status in ('draft', 'pending_approval', 'needs_revision')
  )
);

create policy "admins delete sops"
on public.sops for delete
to authenticated
using (public.current_profile_role() = 'admin');

create policy "read steps for readable sops"
on public.sop_steps for select
to authenticated
using (
  exists (
    select 1 from public.sops
    where sops.id = sop_steps.sop_id
  )
);

create policy "write steps for editable sops"
on public.sop_steps for all
to authenticated
using (
  exists (
    select 1 from public.sops
    where sops.id = sop_steps.sop_id
    and (
      public.current_profile_role() = 'admin'
      or (
        public.current_profile_role() = 'leader'
        and sops.department_id = public.current_profile_department_id()
        and sops.status in ('draft', 'needs_revision')
      )
    )
  )
)
with check (
  exists (
    select 1 from public.sops
    where sops.id = sop_steps.sop_id
    and (
      public.current_profile_role() = 'admin'
      or (
        public.current_profile_role() = 'leader'
        and sops.department_id = public.current_profile_department_id()
        and sops.status in ('draft', 'needs_revision')
      )
    )
  )
);

create policy "read approval comments for involved users"
on public.approval_comments for select
to authenticated
using (
  public.current_profile_role() = 'admin'
  or exists (
    select 1 from public.sops
    where sops.id = approval_comments.sop_id
    and sops.department_id = public.current_profile_department_id()
  )
);

create policy "admins insert approval comments"
on public.approval_comments for insert
to authenticated
with check (public.current_profile_role() = 'admin');

create policy "read attachments for readable sops"
on public.attachments for select
to authenticated
using (
  exists (
    select 1 from public.sops
    where sops.id = attachments.sop_id
  )
);
