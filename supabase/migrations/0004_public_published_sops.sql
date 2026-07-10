create policy "public read departments"
on public.departments for select
to anon
using (true);

create policy "public read published sops"
on public.sops for select
to anon
using (status = 'published');

create policy "public read published sop steps"
on public.sop_steps for select
to anon
using (
  exists (
    select 1 from public.sops
    where sops.id = sop_steps.sop_id
    and sops.status = 'published'
  )
);
