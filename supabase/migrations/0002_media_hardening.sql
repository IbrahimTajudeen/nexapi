-- Run after 0001_init.sql. Safe to run once; it replaces the media policies.
--
-- Why: 0001 let anyone (including anonymous visitors using the public anon key directly) list every
-- uploaded image, and let any contributor change or delete any media row. Public pages never need
-- the media registry (they store the image link on the row that uses it), so it becomes staff-only,
-- and contributors may only touch the entries they uploaded themselves.

-- staff_role_of() is not executable by signed-in users, so 0001's media policy that called it
-- failed with "permission denied" for contributors. This helper is, like is_staff(), safe to call.
create function public.is_contributor() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.staff_role_of(auth.uid()) = 'contributor', false) $$;
revoke execute on function public.is_contributor() from public, anon;
grant execute on function public.is_contributor() to authenticated;

drop policy media_read on public.media;
drop policy media_write on public.media;
revoke select on public.media from anon;

create policy media_read on public.media for select to authenticated
  using (public.is_staff() or public.is_contributor());

create policy media_insert on public.media for insert to authenticated
  with check (
    public.is_staff()
    or (public.is_contributor() and created_by = auth.uid())
  );

create policy media_update on public.media for update to authenticated
  using (
    public.is_staff()
    or (public.is_contributor() and created_by = auth.uid())
  )
  with check (
    public.is_staff()
    or (public.is_contributor() and created_by = auth.uid())
  );

create policy media_delete on public.media for delete to authenticated
  using (
    public.is_staff()
    or (public.is_contributor() and created_by = auth.uid())
  );
