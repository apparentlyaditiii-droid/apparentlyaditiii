# Apparently, Aditiii

A personal archive of thoughts, feelings, and moments that didn't always ask to be shared.

- **Content** lives in Supabase (posts, pages, categories).
- **The site** is plain static HTML generated from that content (`src/build.mjs`) and hosted on Vercel.
- **Reader features** (newsletter, likes, comments, contact form) talk to Supabase straight from the browser using the public *publishable* key. Row Level Security makes sure the public can only do exactly those things, never read emails, messages or unapproved comments.
- **Emails** (subscription confirmations, new-piece announcements, comment notices) are queued in the database and sent by a small Supabase Edge Function (`supabase/functions/mailer`).

Whenever a post, page or category changes in Supabase, a database trigger calls a Vercel deploy hook and the site rebuilds by itself, usually within a minute.

---

## Writing a new piece

**The easy way: the writing desk.** Aditi goes to <https://apparentlyaditiii.vercel.app/write/> and signs in. From there she can:
- write and edit pieces, with a live preview
- drop in a cover image, or images inside the piece (big phone photos are shrunk automatically)
- pick categories, write the excerpt, pin pieces, set or schedule the date
- save drafts, publish, unpublish, copy a private preview link
- approve, reject or delete comments (Comments tab)

Writing is also kept on her device as she types, so nothing is lost if the tab closes before saving.

Setting up her login (once): Supabase dashboard → **Authentication → Users → Add user → Create new user**, with her email (`aditi.sharmaa333@gmail.com`), a password, and **Auto Confirm User** ticked. Only emails listed in `private.editors` can change anything. Also turn off **Authentication → Sign In / Providers → Allow new users to sign up**, since nobody else needs an account.

**By hand, in the dashboard** (what the desk does under the hood):

1. Open the Supabase dashboard → **Table Editor** → **posts** → **Insert row**.
2. Fill in:
   | Column | What to put |
   |---|---|
   | `slug` | The URL name, lowercase with hyphens, e.g. `monsoon-letters` |
   | `title` | The title (Hindi is fine) |
   | `content` | The piece, in Markdown. A single line break stays a line break, which suits poems. Leave a blank line between stanzas or paragraphs. |
   | `category_slug` | The main category, shown on cards: `poems`, `reflections` or `unsent-notes` |
   | `extra_categories` | Other categories it should also appear in, e.g. `{reflections}` (optional) |
   | `excerpt` | The teaser shown on cards and in emails. Write it yourself; if empty, the first lines of the piece are used. |
   | `tags` | e.g. `{love,hindi}` (optional) |
   | `cover_image_url` | The cover image (optional, see below) |
   | `cover_image_alt` | A short description of the image, for screen readers |
   | `pinned_order` | `1`, `2`, `3`… to pin it to the top of the homepage in that order. Empty = not pinned. |
   | `published_at` | The date shown on the piece (defaults to now). **A future date schedules it.** |
   | `comments_enabled` | Untick to close comments on this piece |
   | `notify_subscribers` | Untick to go live without emailing subscribers (e.g. back-dated pieces) |
   | `status` | `draft` while writing, **`published`** to put it on the site |
3. Save. The site rebuilds automatically.

Markdown quick reference: `*italic*`, `**bold**`, `> a quote`, `---` for a section break, `[link text](https://…)`.

**Cover images.** Dashboard → **Storage** → **media** → upload. Click the file → **Get URL** and paste it into `cover_image_url`. The site resizes and compresses it automatically for each screen.

**Preview before publishing.** Every post has a secret `preview_token`. Open `https://apparentlyaditiii.vercel.app/preview/#<preview_token>` to see the piece (draft or not) as it will look, including the excerpt used on cards. Anyone with the link can see it, so share it only with Aditi.

**Scheduling.** Set `status` to `published` and `published_at` to a future date and time. The piece stays hidden until then; within a minute of that time the site rebuilds and subscribers are emailed.

**Pinning and rearranging.** Set `pinned_order` on the pieces you want pinned; the lowest number shows first. Clear it to unpin. Pinned pieces stay in the archive and their categories, and aren't repeated in the homepage's latest-writing grid.

To edit **About / Privacy / Terms / Disclaimer**, change the row in the **pages** table. The About photo is `pages.image_url` (currently `/images/aditi.jpg`, in `src/static/images`).

## Comments

New comments are hidden until approved. Aditi gets an email for each one with a **Review this comment** button that opens a page to approve, reject, mark as spam or delete it.

Or in the dashboard: **Table Editor → comments_to_review** lists what's waiting; change `status` in **comments** to `approved`, `rejected` or `spam` (or delete the row).

Spam protection: a hidden honeypot field, a minimum time on the page, a cap on links, duplicate detection, and per-visitor rate limits. Obvious spam is saved with `status = spam` and never shown or emailed.

## Likes

Each reader can like a piece once (and undo it). The browser keeps a random ID for the site; the database stores a salted hash of it per piece, and one network can add at most 3 likes to a piece per hour, so clearing storage in a loop doesn't inflate counts. Counts are in **post_hearts**.

## Subscribers

**Table Editor → subscribers.** `status` is `pending` (hasn't clicked the confirmation link), `confirmed` (gets emails) or `unsubscribed`. Every email has a personal unsubscribe link. To remove someone by hand, set `status` to `unsubscribed` (or delete the row).

**Moving subscribers from WordPress.com.** In the WordPress.com dashboard → **Subscribers** → **Download** (CSV). They agreed to receive new posts from this blog, so they can come across as confirmed: make a CSV with the header `email,source,status` and rows like `reader@example.com,wordpress,confirmed`, then **Table Editor → subscribers → Insert → Import data from CSV**. Every email they receive has an unsubscribe link. To ask for fresh consent instead, import them with `status` `pending` and run in the SQL Editor:

```sql
select private.queue_confirmation(id) from public.subscribers where source = 'wordpress' and status = 'pending';
```

## Messages

**Table Editor → messages**: everything sent through the contact form. Tick `is_read` once you've replied.

---

## One-time setup for emails

Emails wait in a queue until the mailer is set up. It sends from an ordinary Gmail account (no domain needed; Gmail allows about 500 emails a day).

1. On the Gmail account that should send (e.g. aditi.sharmaa333@gmail.com): turn on 2-Step Verification, then create an **App password** at <https://myaccount.google.com/apppasswords>.
2. Deploy the function and give it its secrets (pick any long random string for `MAILER_SECRET`):
   ```bash
   supabase functions deploy mailer --no-verify-jwt
   supabase secrets set MAILER_SECRET=<random> SMTP_HOST=smtp.gmail.com SMTP_PORT=465 \
     SMTP_USER=aditi.sharmaa333@gmail.com SMTP_PASS=<app password>
   ```
3. Tell the database how to reach it (SQL Editor):
   ```sql
   select vault.create_secret('https://kpawyicwisdgthdpwooz.supabase.co/functions/v1/mailer', 'mailer_url');
   select vault.create_secret('<the same random MAILER_SECRET>', 'mailer_secret');
   ```
4. Subscribe with your own address on the site and check the confirmation arrives. If not: `select id, kind, attempts, last_error from private.email_outbox order by id desc limit 10;`

Once there's a custom domain, update the links used in emails:
`update private.settings set value = 'https://your-domain' where key = 'site_url';`

## Moving off WordPress

`npm run audit:wordpress` compares the WordPress blog with the new site (every post, title, date and image) and lists anything missing or duplicated. All 9 posts are migrated; their images now live in `src/static/media`, so the site no longer depends on wordpress.com.

Post URLs keep WordPress's shape (`/2026/10/05/lost-but-found/`), so old links work as soon as the address points here. `vercel.json` redirects the other WordPress-style URLs (the Hindi slug of प्यार, `/2026/`, `/category/uncategorized/`, `/feed/`, `/wp-content/uploads/…`). To send visitors of `apparentlyaditiii.wordpress.com` itself to the new site, WordPress.com's paid **Site Redirect** upgrade is needed, or connect a custom domain to Vercel and point readers there.

## Development

Requires Node 20+.

```bash
npm install
npm run dev        # build from Supabase and serve at http://localhost:4321
npm run build      # just build into dist/
npm run audit:wordpress   # check nothing from WordPress is missing
```

The Supabase URL and publishable key are in `src/config.mjs` (safe to commit: the publishable key is designed to be public). Override them with `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`, and set `SITE_URL` once there's a custom domain (Vercel provides the production URL automatically).

### Project layout

```
src/
  build.mjs            static site generator (Supabase → dist/)
  config.mjs           site name, author, Supabase URL + publishable key
  lib/                 content loading and formatting helpers
  templates/           HTML templates for every page type
  client/app.js        browser code: theme, search, forms, likes, comments, email-link pages, previews
  styles/              site.css (base + typography), components.css (forms), journal.css (lavender identity, grids)
  static/              fonts, favicon, photo and migrated WordPress images, copied as-is
supabase/migrations/   database schema, security policies, WordPress import
supabase/functions/    the mailer Edge Function
scripts/               WordPress importer and audit, local preview server
design/                the original single-file preview the site was built from
```

### Database changes

Migrations live in `supabase/migrations`. To apply them to the hosted project:

```bash
supabase login
supabase link --project-ref kpawyicwisdgthdpwooz
supabase db push
```

(Without CLI access to the project, `supabase db push --db-url "<session pooler connection string>"` works too. Find it under **Connect** in the dashboard. The direct `db.*.supabase.co` host is IPv6-only.)

### Automatic rebuilds

The trigger reads the Vercel deploy hook URL from Supabase Vault. To set or change it (SQL Editor):

```sql
select vault.create_secret('https://api.vercel.com/v1/integrations/deploy/…', 'vercel_deploy_hook');
-- or, to replace an existing one:
select vault.update_secret((select id from vault.secrets where name = 'vercel_deploy_hook'), 'https://…');
```

### Security model

| Table | Public (publishable key) can… |
|---|---|
| `posts` | read published rows whose date has arrived, without `preview_token` |
| `pages`, `categories`, `post_hearts` | read |
| `comments` | read `id, post_id, author_name, body, created_at` of approved comments only; add via `submit_comment()` |
| `subscribers` | nothing directly; `subscribe()`, `confirm_subscription(token)`, `unsubscribe(token)`. Responses never reveal who's subscribed |
| `messages` | insert `name`, `email`, `body` only (rate-limited); cannot read |
| `like_post` / `unlike_post` | one like per reader per piece |
| `get_post_preview(token)`, `get_comment_for_moderation(token)`, `moderate_comment(token, action)` | only with the secret token from the preview link or notification email |
| `mailer_claim`, `mailer_done` | service role only (the mailer) |

All write paths are rate-limited per visitor using a salted hash of the visitor's IP, kept for 24 hours in the unexposed `private` schema.

Never put the Supabase **secret** / `service_role` key in this repo or in Vercel env vars. The site doesn't need it.
