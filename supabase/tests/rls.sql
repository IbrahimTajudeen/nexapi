-- Security tests for supabase/migrations/0001_init.sql. Each check raises an exception on failure.
\set ON_ERROR_STOP on

create function pg_temp.act_as(uid uuid, mail text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'email', mail, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.act_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;
create function pg_temp.back() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.check(name text, ok boolean) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', name; end if;
  raise notice 'ok   %', name;
end $$;
create function pg_temp.affected(sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end $$;
-- run a statement and report whether it was refused
create function pg_temp.refused(sql text) returns boolean language plpgsql as $$
begin
  execute sql;
  return false;
exception when others then
  return true;
end $$;

-- fixtures (as superuser)
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test', now()),
  ('00000000-0000-0000-0000-0000000000b1', 'editor@example.test', now()),
  ('00000000-0000-0000-0000-0000000000c1', 'contrib@example.test', now()),
  ('00000000-0000-0000-0000-0000000000d1', 'unconfirmed@example.test', null),
  ('00000000-0000-0000-0000-0000000000e1', 'stranger@example.test', now());
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@example.test', 'admin'),
  ('00000000-0000-0000-0000-0000000000b1', 'editor@example.test', 'editor');
insert into public.people (id, slug, name, roles, published, user_id) values
  ('10000000-0000-0000-0000-000000000001', 'pub-person', 'Public Person', '{contributor}', true, null),
  ('10000000-0000-0000-0000-000000000002', 'draft-person', 'Draft Person', '{tutor}', false, null),
  ('10000000-0000-0000-0000-000000000003', 'self-person', 'Self Person', '{contributor}', false, null);
insert into public.staff_invites (email, role, person_id) values
  ('contrib@example.test', 'contributor', '10000000-0000-0000-0000-000000000003'),
  ('unconfirmed@example.test', 'editor', null);
insert into public.tutorial_modules (id, title, level) values ('start', 'Start', 'beginner') on conflict (id) do nothing;

begin;
  select pg_temp.act_anon();
  select pg_temp.check('anon sees only published people',
    (select count(*) from public.people) = 1);
  select pg_temp.check('anon cannot insert people',
    pg_temp.refused($$insert into public.people (slug, name) values ('x', 'X')$$));
  select pg_temp.check('anon cannot read staff', pg_temp.refused('select * from public.staff'));
  select pg_temp.check('anon cannot read invites', pg_temp.refused('select * from public.staff_invites'));
  select pg_temp.check('anon cannot read audit log', pg_temp.refused('select * from public.audit_log'));
  select pg_temp.check('anon cannot call claim_invite', pg_temp.refused('select public.claim_invite()'));
  select pg_temp.back();
rollback;

begin;
  select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1', 'editor@example.test');
  select pg_temp.check('editor sees drafts', (select count(*) from public.people) = 3);
  insert into public.people (slug, name, published) values ('new-person', 'New Person', true);
  select pg_temp.check('editor can create people', (select count(*) from public.people) = 4);
  select pg_temp.check('editor cannot read invites', (select count(*) from public.staff_invites) = 0);
  select pg_temp.check('editor cannot invite',
    pg_temp.refused($$insert into public.staff_invites (email, role) values ('a@example.test', 'admin')$$));
  select pg_temp.check('editor cannot promote themselves',
    pg_temp.affected($$update public.staff set role = 'admin' where email = 'editor@example.test'$$) = 0);
  select pg_temp.back();
rollback;

begin;
  select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1', 'admin@example.test');
  select pg_temp.check('admin reads invites', (select count(*) from public.staff_invites) = 2);
  select pg_temp.check('admin reads staff', (select count(*) from public.staff) = 2);
  insert into public.staff_invites (email, role) values ('new@example.test', 'editor');
  select pg_temp.check('admin can invite', (select count(*) from public.staff_invites) = 3);
  select pg_temp.check('last admin cannot be demoted',
    pg_temp.refused($$update public.staff set role = 'editor' where email = 'admin@example.test'$$));
  select pg_temp.check('last admin cannot be removed',
    pg_temp.refused($$delete from public.staff where email = 'admin@example.test'$$));
  select pg_temp.back();
rollback;

begin;
  -- invites: an unconfirmed email cannot claim; a stranger gets nothing; a confirmed invitee does
  select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1', 'unconfirmed@example.test');
  select pg_temp.check('unconfirmed email cannot claim', public.claim_invite() is null);
  select pg_temp.back();
  select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1', 'stranger@example.test');
  select pg_temp.check('uninvited user gets no role', public.claim_invite() is null);
  select pg_temp.check('uninvited user cannot write', pg_temp.refused($$insert into public.releases (version, title) values ('9.9.9', 'x')$$));
  select pg_temp.back();
  select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1', 'contrib@example.test');
  select pg_temp.check('invited contributor claims their role', public.claim_invite() = 'contributor');
  select pg_temp.check('claim is idempotent', public.claim_invite() = 'contributor');
  select pg_temp.check('claim linked their person', (select user_id from public.people where slug = 'self-person') = '00000000-0000-0000-0000-0000000000c1');
  select pg_temp.back();
rollback;

begin;
  select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1', 'contrib@example.test');
  select public.claim_invite();
  update public.people set bio = 'Hello from me', published = true, featured = true, roles = '{maintainer}', slug = 'hacked'
    where slug = 'self-person';
  select pg_temp.back();
  select pg_temp.check('contributor edits own bio',
    (select bio from public.people where id = '10000000-0000-0000-0000-000000000003') = 'Hello from me');
  select pg_temp.check('contributor cannot publish, feature, re-role or rename themselves',
    (select published = false and featured = false and roles = '{contributor}' and slug = 'self-person'
       from public.people where id = '10000000-0000-0000-0000-000000000003'));
  select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1', 'contrib@example.test');
  select pg_temp.check('contributor cannot edit others',
    pg_temp.affected($$update public.people set name = 'Pwned' where slug = 'pub-person'$$) = 0);
  select pg_temp.check('contributor cannot create people',
    pg_temp.refused($$insert into public.people (slug, name) values ('mine', 'Mine')$$));
  select pg_temp.check('contributor cannot create releases',
    pg_temp.refused($$insert into public.releases (version, title) values ('1.2.3', 'x')$$));
  select pg_temp.back();
rollback;

begin;
  -- data validation
  select pg_temp.check('http social link rejected',
    pg_temp.refused($$insert into public.people (slug, name, socials) values ('s1', 'S', '{"x":"http://x.com/a"}')$$));
  select pg_temp.check('javascript: social link rejected',
    pg_temp.refused($$insert into public.people (slug, name, socials) values ('s2', 'S', '{"x":"javascript:alert(1)"}')$$));
  select pg_temp.check('https social link accepted',
    not pg_temp.refused($$insert into public.people (slug, name, socials) values ('s3', 'S', '{"github":"https://github.com/a"}')$$));
  select pg_temp.check('bad slug rejected',
    pg_temp.refused($$insert into public.people (slug, name) values ('Bad Slug', 'S')$$));
  select pg_temp.check('unknown role rejected',
    pg_temp.refused($$insert into public.people (slug, name, roles) values ('s4', 'S', '{owner}')$$));
  select pg_temp.check('published tutorial needs a video',
    pg_temp.refused($$insert into public.tutorials (slug, number, module, level, minutes, title, status) values ('t1', 9001, 'start', 'beginner', 5, 'T', 'published')$$));
  select pg_temp.check('tutorial with video accepted',
    not pg_temp.refused($$insert into public.tutorials (slug, number, module, level, minutes, title, status, video_url) values ('t2', 9002, 'start', 'beginner', 5, 'T', 'published', 'https://youtu.be/x')$$));
  select pg_temp.check('bad release version rejected',
    pg_temp.refused($$insert into public.releases (version, title) values ('v1', 'x')$$));
rollback;

begin;
  -- announcements are only visible while live; releases only once published
  insert into public.announcements (title, active, ends_at) values ('expired', true, now() - interval '1 day');
  insert into public.announcements (title, active) values ('live', true);
  insert into public.announcements (title, active) values ('off', false);
  insert into public.announcements (title, active, starts_at) values ('future', true, now() + interval '1 day');
  insert into public.releases (version, title, published) values ('1.0.0', 'one', true), ('2.0.0', 'two', false);
  select pg_temp.act_anon();
  select pg_temp.check('anon sees only live announcements',
    (select array_agg(title order by title) from public.announcements) = array['live']);
  select pg_temp.check('anon sees only published releases',
    exists (select 1 from public.releases where version = '1.0.0')
    and not exists (select 1 from public.releases where version = '2.0.0'));
  select pg_temp.back();
rollback;

begin;
  -- audit log
  select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1', 'editor@example.test');
  insert into public.releases (version, title) values ('3.0.0', 'three');
  update public.releases set title = 'THREE', published = true where version = '3.0.0';
  select pg_temp.check('editor cannot read the audit log', (select count(*) from public.audit_log) = 0);
  select pg_temp.back();
  select pg_temp.check('inserts and updates are audited',
    (select count(*) from public.audit_log where table_name = 'releases' and email = 'editor@example.test') = 2);
  select pg_temp.check('updates list which columns changed',
    (select changed from public.audit_log where op = 'UPDATE' and table_name = 'releases') = array['published', 'title']);
  select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1', 'admin@example.test');
  select pg_temp.check('admin reads the audit log', (select count(*) from public.audit_log) >= 2);
  select pg_temp.back();
rollback;

begin;
  select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1', 'editor@example.test');
  select pg_temp.check('editor updates settings',
    not pg_temp.refused($$insert into public.site_settings (key, value) values ('hero.title', '"Hi"')$$));
  select pg_temp.back();
  select pg_temp.act_anon();
  select pg_temp.check('anon reads settings', exists (select 1 from public.site_settings where key = 'hero.title'));
  select pg_temp.check('anon cannot change settings',
    pg_temp.refused($$update public.site_settings set value = '"x"'$$));
  select pg_temp.back();
rollback;

begin;
  -- the media registry: staff only to read; contributors only touch what they uploaded
  insert into public.media (id, public_id, url, created_by) values
    ('20000000-0000-0000-0000-000000000001', 'nyxapi/a', 'https://res.cloudinary.com/x/image/upload/a.png', '00000000-0000-0000-0000-0000000000c1'),
    ('20000000-0000-0000-0000-000000000002', 'nyxapi/b', 'https://res.cloudinary.com/x/image/upload/b.png', '00000000-0000-0000-0000-0000000000b1');
  select pg_temp.act_anon();
  select pg_temp.check('anon cannot read the media registry', pg_temp.refused($$select count(*) from public.media$$));
  select pg_temp.back();
  select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1', 'contrib@example.test');
  select public.claim_invite();
  select pg_temp.check('contributor reads media', (select count(*) from public.media) = 2);
  select pg_temp.check('contributor registers their own upload',
    not pg_temp.refused($$insert into public.media (public_id, url, created_by) values ('nyxapi/c', 'https://res.cloudinary.com/x/image/upload/c.png', '00000000-0000-0000-0000-0000000000c1')$$));
  select pg_temp.check('contributor cannot register an upload as someone else',
    pg_temp.refused($$insert into public.media (public_id, url, created_by) values ('nyxapi/d', 'https://res.cloudinary.com/x/image/upload/d.png', '00000000-0000-0000-0000-0000000000b1')$$));
  select pg_temp.check('contributor cannot change others media',
    pg_temp.affected($$update public.media set alt = 'x' where id = '20000000-0000-0000-0000-000000000002'$$) = 0);
  select pg_temp.check('contributor cannot delete others media',
    pg_temp.affected($$delete from public.media where id = '20000000-0000-0000-0000-000000000002'$$) = 0);
  select pg_temp.check('contributor can delete their own media',
    pg_temp.affected($$delete from public.media where id = '20000000-0000-0000-0000-000000000001'$$) = 1);
  select pg_temp.back();
  select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1', 'editor@example.test');
  select pg_temp.check('editor manages any media',
    pg_temp.affected($$delete from public.media where id = '20000000-0000-0000-0000-000000000002'$$) = 1);
  select pg_temp.back();
rollback;

\echo ALL SECURITY CHECKS PASSED
