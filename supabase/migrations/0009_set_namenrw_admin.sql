update public.profiles
set
  role = 'admin',
  active = true,
  updated_at = now()
where lower(email) in ('namenrw@gmail.com', 'champ.championest@gmail.com');
