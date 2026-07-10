update public.profiles
set
  name = 'Champ Master',
  role = 'admin',
  active = true,
  updated_at = now()
where lower(email) = 'champ.championest@gmail.com';
