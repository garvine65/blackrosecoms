-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles Table
create table public.profiles (
  id text primary key, -- matches 'diane-marie', 'greg', etc.
  name text not null,
  details text,
  image_url text,
  pin_hash text, -- SHA-256 hash of the 4-digit PIN
  email text unique, -- links to Supabase auth.users.email
  phone text, -- WhatsApp phone number
  approved boolean default false,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;
create policy "Allow authenticated users to read profiles" on public.profiles for select to authenticated using (true);
create policy "Allow authenticated users to update any profile" on public.profiles for update to authenticated using (true);

-- Seed default profiles (change emails to match actual user accounts later)
insert into public.profiles (id, name, details, image_url, email, approved) values
('diane-marie', 'Diane Meria', 'Black Rose team member', null, 'diane.meria@blackrose.co.ke', true),
('greg', 'Gregory Nyataige', 'Black Rose team member', null, 'gregory.nyataige@blackrose.co.ke', true),
('mercy', 'Mercy Waweru', 'Black Rose team member', null, 'mercy.waweru@blackrose.co.ke', true),
('wangui-muchiri', 'Wangui Muchiri', 'Black Rose team member', null, 'wangui.muchiri@blackrose.co.ke', true),
('shadrack', 'Shadrack Kojack', 'Black Rose team member', null, 'shadrack.kojack@blackrose.co.ke', true),
('carol-nduta', 'Profile 6', 'Vacant Profile', null, null, false)
on conflict (id) do update set name = excluded.name, email = excluded.email, approved = excluded.approved;

-- 2. Clients Table
create table public.clients (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz default now()
);

alter table public.clients enable row level security;
create policy "All access to authenticated users" on public.clients for all to authenticated using (true);

-- Seed default clients
insert into public.clients (name) values
('AMM Law'),
('BRC Consultancy'),
('Briq Consultancy'),
('Multiplier'),
('Ultimate'),
('ADH')
on conflict (name) do nothing;

-- 3. Tasks Table
create table public.tasks (
  id uuid primary key default uuid_generate_v4(),
  client text not null,
  title text not null,
  details text,
  assigned_by text references public.profiles(id),
  assigned_to text references public.profiles(id),
  due_date date not null,
  due_time time not null,
  priority text default 'normal',
  repeat text,
  status text default 'open',
  checklist jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table public.tasks enable row level security;
create policy "All access to authenticated users" on public.tasks for all to authenticated using (true);

-- 4. Task Comments Table
create table public.task_comments (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid references public.tasks(id) on delete cascade,
  author_id text references public.profiles(id),
  text text not null,
  created_at timestamptz default now()
);

alter table public.task_comments enable row level security;
create policy "All access to authenticated users" on public.task_comments for all to authenticated using (true);

-- 5. Meetings Table
create table public.meetings (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  date date not null,
  time time not null,
  link text,
  organizer_id text references public.profiles(id),
  participants jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table public.meetings enable row level security;
create policy "All access to authenticated users" on public.meetings for all to authenticated using (true);

-- 6. Passwords Table
create table public.passwords (
  id uuid primary key default uuid_generate_v4(),
  category text not null,
  client text not null,
  username text not null,
  password text not null, -- Encrypted text
  created_at timestamptz default now()
);

alter table public.passwords enable row level security;
create policy "All access to authenticated users" on public.passwords for all to authenticated using (true);

-- 7. Chat Messages Table
create table public.chat_messages (
  id uuid primary key default uuid_generate_v4(),
  author_id text references public.profiles(id),
  type text not null,
  content text not null,
  reactions jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.chat_messages enable row level security;
create policy "All access to authenticated users" on public.chat_messages for all to authenticated using (true);

-- 8. Vibe Votes Table
create table public.vibe_votes (
  profile_id text primary key references public.profiles(id) on delete cascade,
  vibe text not null,
  updated_at timestamptz default now()
);

alter table public.vibe_votes enable row level security;
create policy "All access to authenticated users" on public.vibe_votes for all to authenticated using (true);
