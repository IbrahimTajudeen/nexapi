# Security

## Reporting a problem

Please do not open a public issue for a security problem. Use GitHub's private vulnerability reporting on
the repository (Security tab, "Report a vulnerability"), or contact the maintainers privately. We will
acknowledge a report within a few days and credit you if you wish.

## How the website is protected

The website is a Next.js app with a small API (`website/src/app/api`) on Supabase and Cloudinary. The
npm packages (`@nyxapi/*`) are a separate surface; this section is about the website and its backend.

**Data access.** Every database query runs with the signed-in person's own token, and Supabase
row-level security decides what they may do. The Supabase anon key is public by design, so anyone can call
Supabase directly and skip our API; the policies therefore have to hold on their own. They are tested on a
real Postgres (`supabase/tests/run.sh`) for visitors and every role. No service-role key exists anywhere in
the site. Roles: admin, editor, contributor (own profile and own images only). The last admin cannot be
removed. The activity log cannot be edited.

**API.**

- Writes are validated against one schema (unknown, read-only and wrongly typed fields are rejected).
  Links must be `https://` (site paths must start with a single `/`, with no `//` or backslash).
- Images can only be registered if they were uploaded to this site's Cloudinary account under the
  `nyxapi/` folder, and the server only deletes files in that folder. Uploads are signed by the server
  for fixed formats and folder; the Cloudinary secret never reaches the browser.
- Writes from another origin are refused (403). Bodies must be JSON and at most 1 MB (also when sent in
  chunks). Tokens over 4 KB are ignored.
- Rate limits per client address: reads 240/min, writes 60/min, invites and upload signing 12/min,
  and requests with bad tokens 20/min. They return 429 with `Retry-After`.
- Shared caches vary on `Authorization`, so a visitor's cached answer is never served to an editor.
- Database errors that are not understood are replaced with a generic message.

**Browser.** Content-Security-Policy (no framing, no plugins, `connect-src` limited to the site, Supabase
and Cloudinary), HSTS, `nosniff`, `X-Frame-Options: DENY`, a strict referrer and permissions policy, and
cross-origin opener isolation. The admin panel additionally forbids `eval`, is never cached and is marked
`noindex`. Markdown from the admin never renders raw HTML, and unsafe link schemes are dropped.

**Accounts.** Sign-in is by emailed one-time link. Invites are required before anyone gets a role.
`NEXT_PUBLIC_BACKEND=demo` is ignored whenever Supabase is configured, so a leftover flag cannot replace
a live site with the fake admin.

## Known limits and what to do about them

- **Playground code shares the site's origin.** The docs examples and the playground run code with
  `new Function`, so those pages need `unsafe-eval`, and code you paste into the playground could read
  the admin session stored in the same browser origin. Do not run code you do not trust while signed in
  to the admin panel; for a hard guarantee, serve the playground from a separate origin
  (for example `play.your-site`).
- **Scripts allow `unsafe-inline`.** Next.js inlines small bootstrap scripts. Avoiding that needs a
  per-request nonce, which makes every page render on demand.
- **Rate limits are per server instance.** On Vercel each instance counts separately, so this slows abuse
  but is not a global cap. Add Vercel Firewall rate limiting for a hard limit.
- **Cloudinary size limit.** A signed upload fixes folder and formats but Cloudinary does not enforce a
  size limit from the signature. Set a maximum file size on the account (or an upload preset) if you
  need one; the browser also checks 5 MB.
- **Sign-in spam.** Anyone can request a sign-in link for any address (this avoids revealing which
  addresses exist). It creates an account with no role and no access. Turn on Supabase's CAPTCHA and keep
  its built-in rate limits.
- **Role changes take up to 10 seconds** to reach a server instance that cached a person's role. Row-level
  security still applies to every query at once.
- Not tested live: a real Supabase project and a real Cloudinary account (see `docs/BACKEND.md`).
