# Website backend: Supabase and Cloudinary

The website is a static export. There is no server of ours: the browser talks straight to Supabase
(data and sign-in) and Cloudinary (images). Security therefore lives in the database, as row-level
security (RLS) policies in `supabase/migrations/0001_init.sql`. They are tested against a real
Postgres by `supabase/tests/run.sh`.

Without these settings the site still builds and shows its built-in content (docs, 30 tutorial
episodes, releases, roadmap). The admin panel then explains that it is not connected.

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
2. SQL editor: run `supabase/migrations/0001_init.sql`, then `supabase/seed.sql`
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

## 2. Create the Cloudinary upload preset

1. Settings, Upload, Upload presets: add a preset with **Signing mode: Unsigned**.
2. Set a folder (for example `nyxapi`), allowed formats `png, jpg, webp, gif, avif`, and a maximum
   file size (5 MB matches the site's own check).
3. Copy the cloud name and the preset name.

Honest limits of this setup: an unsigned preset can be used by anyone who reads the page source, so
keep its formats, size and folder tight and watch your usage. Signed uploads and deleting the
Cloudinary file when a library entry is removed need a server-side function and are not built yet
(see Milestone 9 in `ROADMAP.md`). Removing an item from the media library does not delete the file in
Cloudinary.

## 3. Configure the site

Copy `website/.env.example` to `website/.env.local` and fill it in. On a host, set the same four
variables in the build settings. They are inlined at build time, so redeploy after changing them.

```bash
cd website
pnpm build   # writes the static site to website/out
```

Never put the `service_role` key in the site. The `anon` key is meant to be public; RLS is what
protects the data.

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

An invite is a record, not an email: tell the person to open `/admin/` and sign in with the invited
address. Automatic invite emails are on the roadmap.

## Roles at a glance

| Action                                     | admin | editor | contributor |
| ------------------------------------------ | ----- | ------ | ----------- |
| Read published content                     | yes   | yes    | yes         |
| Edit site content                          | yes   | yes    | no          |
| Edit own profile (limited fields)          | yes   | yes    | yes         |
| Manage team and invites, read activity log | yes   | no     | no          |

## Trying it without accounts

Build with `NEXT_PUBLIC_BACKEND=demo`. The admin panel signs you in as an admin at once, with sample
data kept in this browser's local storage. An address containing `editor` or `contributor` gives that
role, which is how the role views are checked. Never deploy this.

## Tests

- `supabase/tests/run.sh` applies the migration and seed to a local Postgres and checks the RLS
  policies for anonymous visitors and every role, invite claiming, last-admin protection, the
  activity log and the input constraints.
- `pnpm check` runs the website's unit tests for the form logic, the demo backend, the content
  mappers and the Cloudinary helpers.
- What has not been tested here: a live Supabase project (hosted Auth, email delivery) and live
  Cloudinary uploads. Check those once with your own accounts before launch.
