# Website backend: route API, Supabase and Cloudinary

The website is a Next.js app deployed on Vercel. Its backend is a small REST API served by route
handlers (`website/src/app/api/[...path]/route.ts`) on top of Supabase (data and sign-in) and
Cloudinary (images). The front end, public pages and admin panel alike, calls that API through a
NyxAPI client that is **generated from the API's own OpenAPI document**. The site is therefore a
real-world use of NyxAPI: generated types, queries, mutations, caching, invalidation and optimistic
updates.

```
browser ── NyxAPI client (generated, cached) ──► /api/*  (Next.js route handlers, Vercel)
                                                    │  one router: src/server/api.ts
                                                    ├──► Supabase (as the signed-in user, RLS still applies)
                                                    └──► Cloudinary (signed uploads, deletes)
```

How it fits together:

- **One router.** `handleApi` in `src/server/api.ts` is framework-agnostic. The Vercel route handler
  and the in-browser demo transport both call it, and the unit tests call it directly.
- **One table spec.** `src/server/spec.ts` drives request validation, the OpenAPI document
  (`website/openapi/site-api.json`) and a test that compares it with the SQL migration column by column.
- **Generated client.** `nyx generate` (config in `website/nyx.config.json`) writes `website/src/api`.
  After changing the spec run `pnpm --filter @nyxapi/website generate:api`; `generate:api:check` (part of
  `pnpm check`) fails if the committed files are stale.
- **No service-role key.** The server builds a Supabase client per request with the caller's access
  token, so row-level security (RLS) still decides what each person can do. Policies live in
  `supabase/migrations/` and are tested against a real Postgres by `supabase/tests/run.sh`.
  The API adds validation, clear errors and caching headers on top; it is not the only line of defence.
- **Sign-in** still happens in the browser with Supabase magic links. The client sends the access token
  with each API call; `GET /api/me` resolves the role (accepting a pending invite on first sign-in).

Without these settings the site still builds and shows its built-in content (docs, 30 tutorial
episodes, releases, roadmap). The API answers `503 not_configured` and the admin panel explains that it is
not connected. Browse the API description at `/api/openapi.json` and its health at `/api/status`.

## What is managed

| Section                                                              | Who                                               | Shown on                                  |
| -------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------- |
| People (contributors, tutors, maintainers)                           | editors; contributors edit only their own profile | `/community/`, home page, episode pages   |
| Tutorials and modules                                                | editors                                           | `/tutorials/`                             |
| Releases                                                             | editors                                           | `/releases/`                              |
| Roadmap milestones, planned releases, limitations, good first issues | editors                                           | `/roadmap/`                               |
| Guides (Markdown)                                                    | editors                                           | `/guides/`                                |
| Announcements (scheduled banner)                                     | editors                                           | top of every page                         |
| Media library, settings                                              | editors                                           | everywhere an image or intro text is used |
| Team and invites, activity log                                       | admins                                            | admin panel only                          |

Anything the database holds replaces the built-in content for that section. If a table is empty, the
built-in content is shown, so a fresh project never produces a blank site.

## 1. Create the Supabase project

1. Create a project at supabase.com.
2. SQL editor: run `supabase/migrations/0001_init.sql`, then `0002_media_hardening.sql`, then `supabase/seed.sql`
   (episodes, modules, releases and roadmap, so the admin panel starts with today's content;
   safe to run twice).
3. Authentication, Providers: keep **Email** on and **Confirm email** on. The invite system relies
   on a confirmed address.
4. Authentication, URL configuration: set **Site URL** to your site and add
   `https://your-site/admin/` (and `http://localhost:3000/admin/` for development) to
   **Redirect URLs**.
5. Settings, API: copy the project URL and the `anon` public key.

Supabase's built-in email sender is rate limited. For real use, add your own SMTP provider under
Authentication, SMTP settings.

## 2. Get your Cloudinary credentials

Uploads are **signed by the server**, so no unsigned preset is needed. From the Cloudinary dashboard copy
the cloud name, API key and API secret. The server signs each upload for a fixed folder and image
formats (`png, jpg, webp, gif, avif`); the browser then uploads straight to Cloudinary. Removing an item
from the media library also deletes the file in Cloudinary. If that deletion fails the entry is still
removed and the admin panel tells you the file is still there.

## 3. Configure Vercel

The site is no longer a static export, so it needs a Node runtime: Vercel provides this for Next.js
with no extra settings (framework preset **Next.js**, root directory `website`). Add these environment
variables in Vercel, Project Settings, Environment Variables, then redeploy:

| Variable                        | Where used      | Secret  |
| ------------------------------- | --------------- | ------- |
| `SUPABASE_URL`                  | server          | no      |
| `SUPABASE_ANON_KEY`             | server          | no      |
| `NEXT_PUBLIC_SUPABASE_URL`      | browser sign-in | no      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser sign-in | no      |
| `CLOUDINARY_CLOUD_NAME`         | server          | no      |
| `CLOUDINARY_API_KEY`            | server          | no      |
| `CLOUDINARY_API_SECRET`         | server          | **yes** |

The server variables fall back to their `NEXT_PUBLIC_` twins, so you may set only those if you prefer.
Keep `CLOUDINARY_API_SECRET` without the `NEXT_PUBLIC_` prefix, or it would be shipped to browsers. Never
put the Supabase `service_role` key anywhere in this site. Copy `website/.env.example` to
`website/.env.local` for development (`pnpm --filter @nyxapi/website dev`).

## 4. Make yourself the first admin

In the SQL editor (this runs as the project owner, so it bypasses RLS):

```sql
insert into staff_invites (email, role) values ('you@example.com', 'admin');
```

Open `https://your-site/admin/`, enter that address, and open the emailed link. Your first sign-in
claims the invite and makes you an admin. The database refuses to remove or demote the last admin.

## 5. Invite helpers and contributors

Admin panel, **Team and invites**. Choose a role:

- **Admin**: everything, including inviting people.
- **Editor**: all site content, media and settings.
- **Contributor**: only their own Community profile (photo, bio, social links). They cannot publish
  or feature themselves; an editor does that.

To recognise a contributor on the Community page, first create their profile under **People**, then
invite them as a contributor and pick that profile. When they sign in with the invited address, the
profile is linked to their account.

Creating an invite also emails the person a sign-in link (Supabase Auth sends it; add your own SMTP
provider for real use). The admin panel says whether the email went out. If it did not, the invite is
still saved: tell them to open `/admin/` and sign in with the invited address.

## Roles at a glance

| Action                                     | admin | editor | contributor |
| ------------------------------------------ | ----- | ------ | ----------- |
| Read published content                     | yes   | yes    | yes         |
| Edit site content                          | yes   | yes    | no          |
| Edit own profile (limited fields)          | yes   | yes    | yes         |
| Manage team and invites, read activity log | yes   | no     | no          |

## Trying it without accounts

Build with `NEXT_PUBLIC_BACKEND=demo`. The admin panel shows its sign-in form, but no email is sent and any address
works. Sample data is kept in this browser's local storage. An address containing `editor` or `contributor` gives that
role, which is how the role views are checked. Never deploy this.

## Tests

- `supabase/tests/run.sh` applies the migration and seed to a local Postgres and checks the RLS
  policies for anonymous visitors and every role, invite claiming, last-admin protection, the
  activity log and the input constraints.
- `pnpm check` runs the website's unit tests: the API router (roles, validation, caching headers,
  invites, media), the generated client with cache invalidation, the spec-versus-migration comparison,
  Cloudinary signing, the form logic and the demo backend. It also checks that the OpenAPI document and
  the generated client are up to date.
- What has not been tested here: a live Supabase project (token verification, `claim_invite` through a
  real JWT, invite email delivery), live Cloudinary upload and delete, and a deployed Vercel run. Check
  those once with your own accounts before launch.

## Security

See [SECURITY.md](../SECURITY.md) for the full model. In short: every query runs as the signed-in user so
row-level security is the real gate (the anon key is public by design, so anyone can call Supabase
directly; the policies must hold on their own, and `supabase/tests/run.sh` proves they do). The API adds
validation, upload ownership checks, an Origin check on writes, body and token size limits, rate limiting,
and security headers. **Already deployed? Run `supabase/migrations/0002_media_hardening.sql` in the SQL
editor once**: it makes the media registry staff-only and stops contributors changing other people's
entries.

## Known limits

- No rate limiting on `/api`. Use Vercel's firewall rules or Supabase's own limits if the site gets abuse.
- Each server instance caches a token's role for 10 seconds, so a removed member may keep access for up
  to that long on an instance that has already seen their token. RLS still applies to every query.
- The demo mode runs the same router in the browser with sample data in local storage. It is for previews,
  not security.
