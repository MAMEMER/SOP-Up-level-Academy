insert into public.departments (name, display_name) values
  ('front_store', 'หน้าร้าน'),
  ('stock', 'Stock'),
  ('admin', 'แอดมิน'),
  ('accounting', 'บัญชี')
on conflict (name) do nothing;

insert into public.categories (department_id, name)
select id, 'งานประจำวัน' from public.departments
on conflict (department_id, name) do nothing;

insert into public.categories (department_id, name)
select id, 'ปัญหาที่พบบ่อย' from public.departments
on conflict (department_id, name) do nothing;
