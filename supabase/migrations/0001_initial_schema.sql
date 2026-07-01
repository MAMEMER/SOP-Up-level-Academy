create extension if not exists "pgcrypto";

create type public.user_role as enum ('employee', 'leader', 'admin');
create type public.sop_status as enum ('draft', 'pending_approval', 'published', 'needs_revision');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role public.user_role not null default 'employee',
  department_id uuid references public.departments(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, name)
);

create table public.sops (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department_id uuid not null references public.departments(id),
  category_id uuid references public.categories(id),
  status public.sop_status not null default 'draft',
  purpose text not null default '',
  when_to_use text not null default '',
  responsible_role text not null default '',
  required_tools text not null default '',
  precautions text not null default '',
  faq text not null default '',
  tags text[] not null default '{}',
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sop_steps (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.sops(id) on delete cascade,
  step_order integer not null,
  title text not null default '',
  body text not null default '',
  checklist_items text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sop_id, step_order)
);

create table public.approval_comments (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.sops(id) on delete cascade,
  comment text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.sops(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  file_type text not null,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
