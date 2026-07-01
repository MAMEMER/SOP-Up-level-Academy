insert into storage.buckets (id, name, public)
values ('sop-attachments', 'sop-attachments', false)
on conflict (id) do nothing;

create policy "authenticated users read sop attachments"
on storage.objects for select
to authenticated
using (bucket_id = 'sop-attachments');

create policy "leaders and admins upload sop attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'sop-attachments'
  and public.current_profile_role() in ('leader', 'admin')
);

create policy "admins delete sop attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'sop-attachments'
  and public.current_profile_role() = 'admin'
);
