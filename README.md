# Apparently, Aditiii

A personal archive of thoughts, feelings, and moments that didn't always ask to be shared.

- **Content** lives in Supabase (posts, pages, categories).
- **The site** is plain static HTML generated from that content (`src/build.mjs`) and hosted on Vercel.
- **Reader features** (newsletter sign-up, contact form, ♥ hearts) talk to Supabase straight from the browser using the public *publishable* key. Row Level Security makes sure the public can only add rows, never read emails or messages back.

Whenever a post, page or category changes in Supabase, a database trigger calls a Vercel deploy hook and the site rebuilds by itself, usually within a minute.

---

## Writing a new piece

1. Open the Supabase dashboard → **Table Editor** → **posts** → **Insert row**.
2. Fill in:
   | Column | What to put |
   |---|---|
   | `slug` | The URL name, lowercase with hyphens, e.g. `monsoon-letters` |
   | `title` | The title (Hindi is fine) |
   | `content` | The piece, in Markdown. A single line break stays a line break, which suits poems. Leave a blank line between stanzas or paragraphs. |
   | `category_slug` | `poems`, `reflections` or `unsent-notes` |
   | `excerpt` | One or two lines shown on cards (optional; taken from the text if empty) |
   | `tags` | e.g. `{love,hindi}` (optional) |
   | `cover_image_url` | A link to an image (optional) |
   | `featured` | `true` to show it under “If you read only one” |
   | `published_at` | The date shown on the piece (defaults to now) |
   | `status` | `draft` while writing, **`published`** to put it on the site |
3. Save. The site rebuilds automatically.

Markdown quick reference: `*italic*`, `**bold**`, `> a quote`, `---` for a section break, `[link text](https://…)`.

To edit **About / Privacy / Terms / Disclaimer**, change the row in the **pages** table.

## Reading messages and subscribers

In the Supabase dashboard → **Table Editor**:
- **messages**: everything sent through the contact form. Tick `is_read` once you've replied.
- **subscribers**: newsletter emails. Export as CSV to send an update (BCC everyone). To unsubscribe someone, delete their row.

---

## Development

Requires Node 20+.

```bash
npm install
npm run dev        # build from Supabase and serve at http://localhost:4321
npm run build      # just build into dist/
```

The Supabase URL and publishable key are in `src/config.mjs` (safe to commit: the publishable key is designed to be public). Override them with `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`, and set `SITE_URL` once there's a custom domain (Vercel provides the production URL automatically).

### Project layout

```
src/
  build.mjs            static site generator (Supabase → dist/)
  config.mjs           site name, author, Supabase URL + publishable key
  lib/                 content loading and formatting helpers
  templates/           HTML templates for every page type
  client/app.js        browser code: theme, search, forms, hearts
  styles/              site.css (original design) + components.css (forms, hearts, covers)
  static/              fonts and favicon, copied as-is
supabase/migrations/   database schema, security policies, WordPress import
scripts/               WordPress importer, local preview server
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
| `posts` | read rows where `status = 'published'` |
| `pages`, `categories`, `post_hearts` | read |
| `subscribers` | insert `email` only (rate-limited); cannot read |
| `messages` | insert `name`, `email`, `body` only (rate-limited); cannot read |
| `heart_post(p_slug)` | add 1 to a published piece's heart count |

Never put the Supabase **secret** / `service_role` key in this repo or in Vercel env vars. The site doesn't need it.
