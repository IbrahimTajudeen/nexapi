-- NyxAPI site backend. Run once in the Supabase SQL editor (or with the Supabase CLI).
--
-- Model: the public website reads published rows with the anon key. Signed-in staff (admin, editor,
-- contributor) write through the same API; row level security decides what each role may do.
-- Nothing here needs the service-role key, and the service-role key must never be put in the site.

-- ---------------------------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------------------------
create type public.staff_role as enum ('admin', 'editor', 'contributor');

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role public.staff_role not null,
  display_name text,
  created_at timestamptz not null default now()
);

-- An invite is just an allowed email address with a role. When that person signs in with a
-- confirmed email, claim_invite() turns it into a staff row.
create table public.staff_invites (
  email text primary key check (email = lower(email)),
  role public.staff_role not null,
  person_id uuid, -- optional: the people row a contributor may edit
  note text,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create function public.staff_role_of(uid uuid)
returns public.staff_role
language sql
stable
security definer
set search_path = public
as $$ select role from public.staff where user_id = uid $$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.staff_role_of(auth.uid()) = 'admin', false) $$;

-- Admins and editors manage all content. Contributors do not.
create function public.is_staff() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.staff_role_of(auth.uid()) in ('admin', 'editor'), false) $$;

-- ---------------------------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create function public.is_https_url(v text) returns boolean
language sql immutable as $$ select v is null or v ~* '^https://[^[:space:]]+$' $$;

create function public.valid_socials(j jsonb) returns boolean
language plpgsql immutable as $$
declare e record;
begin
  if jsonb_typeof(j) is distinct from 'object' then return false; end if;
  for e in select key, value from jsonb_each(j) loop
    if jsonb_typeof(e.value) <> 'string' or (e.value #>> '{}') !~* '^https://[^[:space:]]+$' then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Content tables
-- ---------------------------------------------------------------------------------------------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  roles text[] not null default '{contributor}'
    check (cardinality(roles) > 0 and roles <@ array['contributor', 'tutor', 'maintainer']),
  headline text check (char_length(headline) <= 160),
  bio text check (char_length(bio) <= 4000),
  avatar_url text check (public.is_https_url(avatar_url)),
  avatar_public_id text,
  location text check (char_length(location) <= 120),
  website text check (public.is_https_url(website)),
  socials jsonb not null default '{}'::jsonb check (public.valid_socials(socials)),
  contributions text[] not null default '{}',
  featured boolean not null default false,
  published boolean not null default false,
  sort integer not null default 100,
  joined_on date,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.staff_invites
  add constraint staff_invites_person_fk foreign key (person_id) references public.people (id) on delete set null;

create table public.tutorial_modules (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  title text not null,
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  summary text not null default '',
  outcome text not null default '',
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tutorials (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  number integer not null unique check (number > 0),
  module text not null references public.tutorial_modules (id) on update cascade,
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  minutes integer not null check (minutes between 1 and 240),
  title text not null,
  summary text not null default '',
  -- goals, prerequisites, outline, samples, tutor notes and docs links (see website/src/tutorials.ts)
  content jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'claimed', 'published')),
  tutor_id uuid references public.people (id) on delete set null,
  video_url text check (public.is_https_url(video_url)),
  thumbnail_url text check (public.is_https_url(thumbnail_url)),
  published boolean not null default true,
  published_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or video_url is not null)
);

create table public.releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$'),
  released_on date,
  title text not null,
  summary text not null default '',
  features jsonb not null default '[]'::jsonb, -- [{label, detail}]
  fixes text[] not null default '{}',
  upgrade text[] not null default '{}',
  limits text[] not null default '{}',
  npm_url text check (public.is_https_url(npm_url)),
  github_url text check (public.is_https_url(github_url)),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roadmap_milestones (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number > 0),
  title text not null,
  summary text not null default '',
  items jsonb not null default '[]'::jsonb, -- [{text, status, area}]
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.planned_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  theme text not null,
  items text[] not null default '{}',
  sort integer not null default 100,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.limitations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text not null default '',
  workaround text not null default '',
  area text not null check (area in
    ('core', 'react', 'codegen', 'graphql', 'trpc', 'devtools', 'performance', 'docs', 'release')),
  sort integer not null default 100,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Open tasks and issues that contributors can pick up.
create table public.issues (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text not null default '',
  area text not null check (area in
    ('core', 'react', 'codegen', 'graphql', 'trpc', 'devtools', 'performance', 'docs', 'release')),
  size text not null default 'small' check (size in ('small', 'medium', 'large')),
  status text not null default 'open' check (status in ('open', 'claimed', 'closed')),
  github_url text check (public.is_https_url(github_url)),
  claimed_by uuid references public.people (id) on delete set null,
  sort integer not null default 100,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Long-form guides written in the admin panel (Markdown).
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  summary text not null default '',
  section text not null default 'Guides',
  body text not null default '',
  show_in_nav boolean not null default true,
  sort integer not null default 100,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 160),
  body text not null default '' check (char_length(body) <= 600),
  link_url text check (public.is_https_url(link_url) or link_url ~ '^/[^/]'),
  link_label text,
  level text not null default 'info' check (level in ('info', 'success', 'warning')),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_settings (
  key text primary key check (key ~ '^[a-z0-9_.-]+$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  url text not null check (public.is_https_url(url)),
  width integer,
  height integer,
  format text,
  bytes integer,
  folder text,
  alt text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  email text,
  table_name text not null,
  op text not null,
  row_id text,
  changed text[] not null default '{}'
);

-- ---------------------------------------------------------------------------------------------
-- updated_at and audit triggers
-- ---------------------------------------------------------------------------------------------
create function public.audit_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rid text;
  keys text[] := '{}';
begin
  if tg_op = 'DELETE' then
    rid := coalesce(to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'key');
  else
    rid := coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'key');
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}') into keys
    from jsonb_each(to_jsonb(new)) n
    where n.key <> 'updated_at' and n.value is distinct from (to_jsonb(old) -> n.key);
  end if;
  insert into public.audit_log (user_id, email, table_name, op, row_id, changed)
  values (auth.uid(), auth.jwt() ->> 'email', tg_table_name, tg_op, rid, keys);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'people', 'tutorial_modules', 'tutorials', 'releases', 'roadmap_milestones', 'planned_releases',
    'limitations', 'issues', 'pages', 'announcements', 'site_settings', 'media'
  ] loop
    execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_change()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------------------------
-- A contributor may edit their own profile but not publish it, feature it or change who owns it.
create function public.guard_people_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() and coalesce(current_setting('app.claiming_invite', true), '') <> 'on' then
    new.slug := old.slug;
    new.roles := old.roles;
    new.published := old.published;
    new.featured := old.featured;
    new.sort := old.sort;
    new.user_id := old.user_id;
    new.joined_on := old.joined_on;
  end if;
  return new;
end $$;
create trigger guard before update on public.people
  for each row execute function public.guard_people_update();

-- The site must always keep one admin.
create function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    if (select count(*) from public.staff where role = 'admin' and user_id <> old.user_id) = 0 then
      raise exception 'The site must keep at least one admin';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger keep_admin before update or delete on public.staff
  for each row execute function public.keep_one_admin();

-- ---------------------------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------------------------
-- Called by the signed-in user right after they sign in. Only a confirmed email can claim an invite.
create function public.claim_invite() returns public.staff_role
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text;
  inv public.staff_invites;
  existing public.staff_role;
begin
  if uid is null then return null; end if;
  existing := public.staff_role_of(uid);
  if existing is not null then return existing; end if;
  select lower(u.email) into mail from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if mail is null then return null; end if;
  select * into inv from public.staff_invites where email = mail;
  if not found then return null; end if;
  insert into public.staff (user_id, email, role) values (uid, mail, inv.role);
  update public.staff_invites set accepted_at = now() where email = mail;
  if inv.person_id is not null then
    perform set_config('app.claiming_invite', 'on', true);
    update public.people set user_id = uid where id = inv.person_id and user_id is null;
    perform set_config('app.claiming_invite', 'off', true);
  end if;
  return inv.role;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------
alter table public.staff enable row level security;
alter table public.staff_invites enable row level security;
alter table public.people enable row level security;
alter table public.tutorial_modules enable row level security;
alter table public.tutorials enable row level security;
alter table public.releases enable row level security;
alter table public.roadmap_milestones enable row level security;
alter table public.planned_releases enable row level security;
alter table public.limitations enable row level security;
alter table public.issues enable row level security;
alter table public.pages enable row level security;
alter table public.announcements enable row level security;
alter table public.site_settings enable row level security;
alter table public.media enable row level security;
alter table public.audit_log enable row level security;

-- staff: you can see yourself; admins see and manage everyone.
create policy staff_self on public.staff for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy staff_admin_write on public.staff for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy staff_admin_delete on public.staff for delete to authenticated using (public.is_admin());
create policy invites_admin on public.staff_invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- people
create policy people_read on public.people for select to anon, authenticated
  using (published or public.is_staff() or user_id = auth.uid());
create policy people_staff_write on public.people for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy people_self_update on public.people for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- publishable content: the public reads published rows, editors and admins do everything
do $$
declare t text;
begin
  foreach t in array array[
    'tutorials', 'releases', 'roadmap_milestones', 'planned_releases', 'limitations', 'issues', 'pages'
  ] loop
    execute format('create policy %I on public.%I for select to anon, authenticated using (published or public.is_staff())', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t || '_write', t);
  end loop;
end $$;

-- always-public configuration and media registry
create policy modules_read on public.tutorial_modules for select to anon, authenticated using (true);
create policy modules_write on public.tutorial_modules for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy settings_read on public.site_settings for select to anon, authenticated using (true);
create policy settings_write on public.site_settings for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy media_read on public.media for select to anon, authenticated using (true);
create policy media_write on public.media for all to authenticated
  using (public.is_staff() or public.staff_role_of(auth.uid()) = 'contributor')
  with check (public.is_staff() or public.staff_role_of(auth.uid()) = 'contributor');

-- announcements: the public sees only live ones
create policy announcements_read on public.announcements for select to anon, authenticated
  using (
    public.is_staff()
    or (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
  );
create policy announcements_write on public.announcements for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy audit_admin on public.audit_log for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------------------------
-- Privileges (RLS above is what actually limits access)
-- ---------------------------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.people, public.tutorial_modules, public.tutorials, public.releases,
  public.roadmap_milestones, public.planned_releases, public.limitations, public.issues,
  public.pages, public.announcements, public.site_settings, public.media to anon, authenticated;
grant insert, update, delete on public.people, public.tutorial_modules, public.tutorials,
  public.releases, public.roadmap_milestones, public.planned_releases, public.limitations,
  public.issues, public.pages, public.announcements, public.site_settings, public.media
  to authenticated;
grant select, update, delete on public.staff to authenticated;
grant select, insert, update, delete on public.staff_invites to authenticated;
grant select on public.audit_log to authenticated;
-- Functions are executable by everyone unless revoked.
revoke execute on function public.claim_invite() from public, anon;
grant execute on function public.claim_invite() to authenticated;
-- Looking up someone else's role would leak who is staff.
revoke execute on function public.staff_role_of(uuid) from public, anon, authenticated;
