-- Website brief, phase 1–3: pinned pieces, multiple categories, scheduled
-- publishing, private previews, moderated comments, one-like-per-reader,
-- double opt-in newsletter with unsubscribe, and new-post emails.
--
-- Emails are queued in private.email_outbox and sent by the "mailer" Edge
-- Function (supabase/functions/mailer). Until that function is deployed and
-- its URL/secret are stored in Vault, emails simply wait in the queue.

create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- Site settings used by the database (links in emails, where to send notices)
-- ---------------------------------------------------------------------------

create table if not exists private.settings (
  key   text primary key,
  value text not null
);

insert into private.settings (key, value) values
  ('site_url', 'https://apparentlyaditiii.vercel.app'),
  ('site_title', 'Apparently, Aditiii'),
  ('owner_email', 'aditi.sharmaa333@gmail.com')
on conflict (key) do nothing;

create or replace function private.setting(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select value from private.settings where key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- Posts: pinning, extra categories, comments switch, announcements, previews
-- ---------------------------------------------------------------------------

alter table public.posts
  add column if not exists pinned_order       integer check (pinned_order > 0),
  add column if not exists extra_categories   text[] not null default '{}',
  add column if not exists comments_enabled   boolean not null default true,
  add column if not exists notify_subscribers boolean not null default true,
  add column if not exists announced_at       timestamptz,
  add column if not exists preview_token      uuid not null default gen_random_uuid();

comment on column public.posts.pinned_order is 'Pin to the top of the homepage: 1 shows first, 2 second, … Leave empty to unpin.';
comment on column public.posts.extra_categories is 'Other categories this piece also appears in, e.g. {reflections}. category_slug stays the main label.';
comment on column public.posts.comments_enabled is 'Untick to close comments on this piece.';
comment on column public.posts.notify_subscribers is 'Email confirmed subscribers when this piece goes live. Untick for back-dated or minor pieces.';
comment on column public.posts.announced_at is 'Set automatically once the piece has gone live (and subscribers were emailed). Leave empty.';
comment on column public.posts.preview_token is 'Secret for the private preview link: /preview/#<token>';
comment on column public.posts.published_at is 'Date shown on the piece. A future date schedules it: it appears (and is emailed) automatically then.';

-- "featured" (If you read only one) becomes the first pinned piece.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'posts' and column_name = 'featured') then
    update public.posts set pinned_order = 1 where featured and pinned_order is null;
    alter table public.posts drop column featured;
  end if;
end;
$$;

-- Everything already on the site has been "announced"; never email it again.
update public.posts set announced_at = coalesce(announced_at, now()) where status = 'published';

create index if not exists posts_pinned_idx on public.posts (pinned_order) where pinned_order is not null;

-- extra_categories can't use a foreign key (it's an array), so check it here.
create or replace function private.check_post_categories()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  missing text;
begin
  new.extra_categories := coalesce(
    (select array_agg(distinct c order by c) from unnest(new.extra_categories) c
      where c is not null and c <> '' and c <> new.category_slug),
    '{}');
  select c into missing from unnest(new.extra_categories) c
    where not exists (select 1 from public.categories k where k.slug = c)
    limit 1;
  if missing is not null then
    raise exception 'Unknown category "%" in extra_categories', missing using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_check_categories on public.posts;
create trigger posts_check_categories
  before insert or update of category_slug, extra_categories on public.posts
  for each row execute function private.check_post_categories();

-- Scheduled pieces stay hidden until their time comes.
drop policy if exists "Published posts are public" on public.posts;
create policy "Published posts are public"
  on public.posts for select to anon, authenticated
  using (status = 'published' and published_at <= now());

-- The preview token must never be readable by the public, so grant columns
-- explicitly (new columns added later are private until granted here).
revoke select on table public.posts from anon, authenticated;
grant select (id, slug, title, excerpt, content, content_format, category_slug, extra_categories, tags, lang,
              cover_image_url, cover_image_alt, pinned_order, comments_enabled, status, published_at,
              created_at, updated_at)
  on table public.posts to anon, authenticated;

-- Pages can carry a photograph (the About page uses it).
alter table public.pages
  add column if not exists image_url text,
  add column if not exists image_alt text;

update public.pages
set image_url = '/images/aditi.jpg',
    image_alt = 'Aditi, smiling in sunglasses, against a hillside of moss and wild grass'
where slug = 'about' and image_url is null;

-- ---------------------------------------------------------------------------
-- Private previews: /preview/#<preview_token> renders any piece, even drafts
-- ---------------------------------------------------------------------------

create or replace function public.get_post_preview(p_token uuid)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'slug', p.slug, 'title', p.title, 'excerpt', p.excerpt, 'content', p.content,
    'content_format', p.content_format, 'lang', p.lang, 'status', p.status,
    'published_at', p.published_at, 'cover_image_url', p.cover_image_url, 'cover_image_alt', p.cover_image_alt,
    'categories', (select json_agg(json_build_object('slug', c.slug, 'name', c.name, 'verse', c.verse)
                                   order by c.slug <> p.category_slug, c.sort_order)
                     from public.categories c
                    where c.slug = p.category_slug or c.slug = any (p.extra_categories)))
  from public.posts p
  where p.preview_token = p_token;
$$;

revoke execute on function public.get_post_preview(uuid) from public;
grant execute on function public.get_post_preview(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Email outbox (sent by the mailer Edge Function)
-- ---------------------------------------------------------------------------

create table if not exists private.email_outbox (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('confirm', 'new_post', 'comment')),
  to_email    text not null,
  payload     jsonb not null default '{}',
  send_after  timestamptz not null default now(),
  claimed_at  timestamptz,
  sent_at     timestamptz,
  attempts    integer not null default 0,
  last_error  text,
  created_at  timestamptz not null default now()
);

create index if not exists email_outbox_due_idx on private.email_outbox (send_after) where sent_at is null;

-- Called by the mailer with the service-role key: hands out up to p_limit due
-- emails. An email claimed but not reported back within 10 minutes is retried;
-- after 5 attempts it is left for a human to look at (last_error says why).
create or replace function public.mailer_claim(p_limit integer default 40)
returns json
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update private.email_outbox o
    set claimed_at = now(), attempts = o.attempts + 1
    where o.id in (
      select id from private.email_outbox
      where sent_at is null and send_after <= now() and attempts < 5
        and (claimed_at is null or claimed_at < now() - interval '10 minutes')
      order by send_after, id
      limit least(greatest(p_limit, 1), 100)
      for update skip locked
    )
    returning o.id, o.kind, o.to_email, o.payload
  )
  select coalesce(json_agg(claimed order by id), '[]'::json) from claimed;
$$;

create or replace function public.mailer_done(p_id bigint, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.email_outbox
  set sent_at = case when p_error is null then now() end,
      claimed_at = case when p_error is null then claimed_at end,
      send_after = case when p_error is null then send_after else now() + interval '5 minutes' end,
      last_error = left(p_error, 1000)
  where id = p_id;
$$;

revoke execute on function public.mailer_claim(integer), public.mailer_done(bigint, text) from public, anon, authenticated;
grant execute on function public.mailer_claim(integer), public.mailer_done(bigint, text) to service_role;

-- Wake the mailer if anything is due. Needs two Vault secrets:
--   mailer_url    https://<project>.supabase.co/functions/v1/mailer
--   mailer_secret the same random string set as the function's MAILER_SECRET
create or replace function private.kick_mailer()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'mailer_url' limit 1);
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'mailer_secret' limit 1);
begin
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;
  if exists (select 1 from private.email_outbox
             where sent_at is null and send_after <= now() and attempts < 5
               and (claimed_at is null or claimed_at < now() - interval '10 minutes')) then
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-mailer-secret', v_secret),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Newsletter: double opt-in, unsubscribe links
-- ---------------------------------------------------------------------------

alter table public.subscribers
  add column if not exists status            text not null default 'pending'
                                             check (status in ('pending', 'confirmed', 'unsubscribed')),
  add column if not exists confirm_token     text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  add column if not exists unsubscribe_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  add column if not exists confirm_sent_at   timestamptz,
  add column if not exists confirmed_at      timestamptz;

comment on column public.subscribers.status is 'pending = hasn’t clicked the confirmation link yet; only confirmed subscribers get emails.';

-- People who signed up before confirmation existed asked to be on the list.
update public.subscribers
set status = case when unsubscribed_at is null then 'confirmed' else 'unsubscribed' end,
    confirmed_at = case when unsubscribed_at is null then coalesce(confirmed_at, created_at) end
where status = 'pending' and confirm_sent_at is null and created_at < now();

create unique index if not exists subscribers_confirm_token_idx on public.subscribers (confirm_token);
create unique index if not exists subscribers_unsubscribe_token_idx on public.subscribers (unsubscribe_token);

create or replace function private.queue_confirmation(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscribers;
begin
  update public.subscribers set confirm_sent_at = now() where id = p_id returning * into s;
  insert into private.email_outbox (kind, to_email, payload)
  values ('confirm', s.email, jsonb_build_object(
    'confirm_url', private.setting('site_url') || '/subscribe/confirm/#' || s.confirm_token));
end;
$$;

-- Always returns nothing, whatever the email's state, so nobody can use it to
-- find out who is subscribed. A confirmation email goes out at most once an
-- hour per address, and only the inbox owner can act on it.
create or replace function public.subscribe(p_email text, p_source text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  s public.subscribers;
begin
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address' using errcode = '22023';
  end if;

  perform private.check_form_rate('subscribe', 10, 1000);

  select * into s from public.subscribers where email = v_email for update;
  if not found then
    insert into public.subscribers (email, source, status)
    values (v_email, left(p_source, 200), 'pending')
    returning * into s;
    perform private.queue_confirmation(s.id);
  elsif s.status <> 'confirmed' and (s.confirm_sent_at is null or s.confirm_sent_at < now() - interval '1 hour') then
    perform private.queue_confirmation(s.id);
  end if;

  perform private.kick_mailer();
end;
$$;

create or replace function public.confirm_subscription(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or length(p_token) <> 48 then
    return false;
  end if;
  update public.subscribers
  set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), unsubscribed_at = null
  where confirm_token = p_token;
  return found;
end;
$$;

create or replace function public.unsubscribe(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or length(p_token) <> 48 then
    return false;
  end if;
  update public.subscribers
  set status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
  where unsubscribe_token = p_token;
  -- Throw away queued emails to this address.
  delete from private.email_outbox o
  using public.subscribers s
  where s.unsubscribe_token = p_token and o.to_email = s.email and o.sent_at is null and o.kind = 'new_post';
  return found;
end;
$$;

revoke execute on function public.confirm_subscription(text), public.unsubscribe(text) from public;
grant execute on function public.confirm_subscription(text), public.unsubscribe(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Going live: scheduled pieces, rebuilds and new-post emails
-- ---------------------------------------------------------------------------

-- Runs every minute (pg_cron). Finds pieces that have just become visible,
-- marks them announced (which triggers a site rebuild), and queues one email
-- per confirmed subscriber, a few minutes later so the page exists by then.
create or replace function private.go_live()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  if not exists (select 1 from public.posts
                 where status = 'published' and published_at <= now() and announced_at is null) then
    return;
  end if;

  for p in
    update public.posts
    set announced_at = now()
    where status = 'published' and published_at <= now() and announced_at is null
    returning id, slug, title, excerpt, content, published_at, notify_subscribers
  loop
    if p.notify_subscribers then
      insert into private.email_outbox (kind, to_email, payload, send_after)
      select 'new_post', s.email, jsonb_build_object(
               'title', p.title,
               'excerpt', coalesce(nullif(trim(p.excerpt), ''),
                                   left(trim(regexp_replace(regexp_replace(p.content, '<[^>]+>', ' ', 'g'), '\s+', ' ', 'g')), 220)),
               'url', private.setting('site_url') || '/' || to_char(p.published_at at time zone 'Asia/Kolkata', 'YYYY/MM/DD') || '/' || p.slug || '/',
               'unsubscribe_url', private.setting('site_url') || '/unsubscribe/#' || s.unsubscribe_token),
             now() + interval '4 minutes'
      from public.subscribers s
      where s.status = 'confirmed';
    end if;
  end loop;
end;
$$;

create or replace function private.tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.go_live();
  perform private.kick_mailer();
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'apparently-tick') then
    perform cron.unschedule('apparently-tick');
  end if;
  perform cron.schedule('apparently-tick', '* * * * *', 'select private.tick()');
end;
$$;

-- ---------------------------------------------------------------------------
-- Likes: one per reader per piece (replaces the open ♥ counter)
-- ---------------------------------------------------------------------------

create table if not exists private.post_likes (
  post_slug    text not null references public.posts (slug) on update cascade on delete cascade,
  visitor_hash text not null,
  created_at   timestamptz not null default now(),
  primary key (post_slug, visitor_hash)
);

drop function if exists public.heart_post(text);

-- p_visitor is a random id the browser keeps for this site. It is stored only
-- as a salted hash. On top of that, one network can add at most 3 likes to a
-- piece per hour, so clearing storage in a loop doesn't inflate the count.
create or replace function private.visitor_hash(p_visitor uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.hmac(p_visitor::text,
    coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'form_rate_salt' limit 1), ''),
    'sha256'), 'hex');
$$;

create or replace function public.like_post(p_slug text, p_visitor uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := private.visitor_hash(p_visitor);
  v_count integer;
begin
  if p_visitor is null or not exists (
    select 1 from public.posts where slug = p_slug and status = 'published' and published_at <= now()) then
    raise exception 'Unknown piece' using errcode = 'P0002';
  end if;

  if not exists (select 1 from private.post_likes where post_slug = p_slug and visitor_hash = v_hash) then
    perform private.check_form_rate('heart', 60, 5000);
    perform private.check_form_rate('heart:' || p_slug, 3, 100000);
    insert into private.post_likes (post_slug, visitor_hash) values (p_slug, v_hash) on conflict do nothing;
    if found then
      insert into public.post_hearts as h (post_slug, hearts) values (p_slug, 1)
      on conflict (post_slug) do update set hearts = h.hearts + 1, updated_at = now();
    end if;
  end if;

  select hearts into v_count from public.post_hearts where post_slug = p_slug;
  return coalesce(v_count, 0);
end;
$$;

create or replace function public.unlike_post(p_slug text, p_visitor uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from private.post_likes where post_slug = p_slug and visitor_hash = private.visitor_hash(p_visitor);
  if found then
    update public.post_hearts set hearts = greatest(hearts - 1, 0), updated_at = now() where post_slug = p_slug;
  end if;
  select hearts into v_count from public.post_hearts where post_slug = p_slug;
  return coalesce(v_count, 0);
end;
$$;

revoke execute on function public.like_post(text, uuid), public.unlike_post(text, uuid) from public;
grant execute on function public.like_post(text, uuid), public.unlike_post(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Comments: held for approval, approve/reject from the notification email
-- ---------------------------------------------------------------------------

create table if not exists public.comments (
  id               bigint generated always as identity primary key,
  post_id          bigint not null references public.posts (id) on delete cascade,
  author_name      text not null check (length(author_name) between 1 and 80),
  author_email     text not null check (length(author_email) <= 254 and author_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  body             text not null check (length(body) between 1 and 3000),
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'spam')),
  moderation_token text not null default encode(extensions.gen_random_bytes(24), 'hex') unique,
  created_at       timestamptz not null default now(),
  moderated_at     timestamptz
);

comment on table public.comments is 'Reader comments. Change status to approved to show one; rejected/spam (or delete the row) to hide it.';

create index if not exists comments_post_idx on public.comments (post_id, created_at) where status = 'approved';
create index if not exists comments_pending_idx on public.comments (created_at) where status = 'pending';

alter table public.comments enable row level security;
revoke all on table public.comments from anon, authenticated;
grant select (id, post_id, author_name, body, created_at) on table public.comments to anon, authenticated;

drop policy if exists "Approved comments are public" on public.comments;
create policy "Approved comments are public"
  on public.comments for select to anon, authenticated
  using (status = 'approved' and exists (
    select 1 from public.posts p where p.id = post_id and p.status = 'published' and p.published_at <= now()));

-- Returns 'pending' (held for approval) or 'closed'. Obvious spam is accepted
-- silently and never shown, so bots learn nothing.
create or replace function public.submit_comment(
  p_post_id bigint, p_name text, p_email text, p_body text,
  p_trap text default null, p_elapsed_ms integer default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(trim(p_name), 80);
  v_email text := lower(trim(p_email));
  v_body text := trim(p_body);
  v_post public.posts;
  v_status text := 'pending';
  v_comment public.comments;
begin
  select * into v_post from public.posts
  where id = p_post_id and status = 'published' and published_at <= now();
  if not found then
    raise exception 'Unknown piece' using errcode = 'P0002';
  end if;
  if not v_post.comments_enabled then
    return 'closed';
  end if;

  if coalesce(v_name, '') = '' or v_body is null or v_body = '' or length(v_body) > 3000
     or v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please fill in your name, email and comment' using errcode = '22023';
  end if;

  perform private.check_form_rate('comment', 5, 300);

  -- Bot signals: the hidden field was filled, the form was sent implausibly
  -- fast, or the comment is mostly links.
  if coalesce(p_trap, '') <> '' or coalesce(p_elapsed_ms, 0) < 3000
     or (select count(*) from regexp_matches(v_body, 'https?://|www\.', 'gi')) > 2 then
    v_status := 'spam';
  end if;

  -- Ignore exact repeats (double clicks, resubmits).
  if exists (select 1 from public.comments
             where post_id = p_post_id and author_email = v_email and body = v_body
               and created_at > now() - interval '1 day') then
    return 'pending';
  end if;

  insert into public.comments (post_id, author_name, author_email, body, status)
  values (p_post_id, v_name, v_email, v_body, v_status)
  returning * into v_comment;

  if v_status = 'pending' then
    insert into private.email_outbox (kind, to_email, payload)
    values ('comment', private.setting('owner_email'), jsonb_build_object(
      'post_title', v_post.title,
      'post_url', private.setting('site_url') || '/' || to_char(v_post.published_at at time zone 'Asia/Kolkata', 'YYYY/MM/DD') || '/' || v_post.slug || '/',
      'author_name', v_name,
      'author_email', v_email,
      'body', v_body,
      'moderate_url', private.setting('site_url') || '/moderate/#' || v_comment.moderation_token));
    perform private.kick_mailer();
  end if;

  return 'pending';
end;
$$;

-- The moderation link in the notification email carries a secret token; the
-- page shows the comment and lets Aditi approve, reject or delete it.
create or replace function public.get_comment_for_moderation(p_token text)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object('author_name', c.author_name, 'author_email', c.author_email, 'body', c.body,
                           'status', c.status, 'created_at', c.created_at,
                           'post_title', p.title, 'post_slug', p.slug, 'post_published_at', p.published_at)
  from public.comments c join public.posts p on p.id = c.post_id
  where p_token is not null and length(p_token) = 48 and c.moderation_token = p_token;
$$;

create or replace function public.moderate_comment(p_token text, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or length(p_token) <> 48 or p_action not in ('approve', 'reject', 'spam', 'delete') then
    return 'invalid';
  end if;
  if p_action = 'delete' then
    delete from public.comments where moderation_token = p_token;
  else
    update public.comments
    set status = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'spam' end,
        moderated_at = now()
    where moderation_token = p_token;
  end if;
  return case when found then p_action else 'invalid' end;
end;
$$;

revoke execute on function public.submit_comment(bigint, text, text, text, text, integer),
                           public.get_comment_for_moderation(text),
                           public.moderate_comment(text, text) from public;
grant execute on function public.submit_comment(bigint, text, text, text, text, integer),
                          public.get_comment_for_moderation(text),
                          public.moderate_comment(text, text) to anon, authenticated;

-- A convenient queue for the Table Editor (not exposed to the public).
create or replace view public.comments_to_review
with (security_invoker = true) as
  select c.id, c.created_at, p.title as piece, c.author_name, c.author_email, c.body, c.status
  from public.comments c join public.posts p on p.id = c.post_id
  where c.status = 'pending'
  order by c.created_at;

revoke all on public.comments_to_review from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cover images uploaded from the dashboard (Storage → media)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Imported WordPress images now live on this site (/media/…), so nothing
-- depends on apparentlyaditiii.wordpress.com any more.
-- ---------------------------------------------------------------------------

update public.posts
set cover_image_url = regexp_replace(cover_image_url, '^https?://apparentlyaditiii\.wordpress\.com/wp-content/uploads/', '/media/')
where cover_image_url ~ '^https?://apparentlyaditiii\.wordpress\.com/wp-content/uploads/';

update public.posts
set content = regexp_replace(
      regexp_replace(content, 'https?://apparentlyaditiii\.wordpress\.com/wp-content/uploads/([^"?'' ]+)(\?[^"'' ]*)?', '/media/\1', 'g'),
      '\s(srcset|sizes)="[^"]*"', '', 'g')
where content ~ 'apparentlyaditiii\.wordpress\.com/wp-content/uploads/';

-- ---------------------------------------------------------------------------
-- Privacy page: describe the new reader features
-- ---------------------------------------------------------------------------

update public.pages
set content = $md$## What’s collected

- No advertising, tracking cookies or third-party analytics scripts run on this site.
- The hosting provider (Vercel) keeps standard server logs (IP address, browser, pages requested) for security and reliability.
- Your light/dark theme choice, and which pieces you’ve liked, are remembered in your own browser.

## Likes

Liking a piece adds one to its counter. To count each reader once, your browser keeps a random ID for this site; the database stores only a scrambled (hashed) version of it, which can’t identify you.

## Newsletter

If you subscribe, your email address is stored in this site’s database (hosted by Supabase) and you’ll get one email asking you to confirm. Once confirmed, you’ll get an email when a new piece is published, and nothing else. Every email has an unsubscribe link. Your address is never shared or sold.

## Comments

Comments are read before they appear. Your name and comment are shown publicly once approved; your email address is never shown and is only used if I need to reply to you.

## Contact form

If you send a message, your name, email and message are stored in the same database so I can read and reply to them. They aren’t shared with anyone, and I’ll delete them on request.

## Spam protection

To stop automated spam, a one-way hash of your IP address is kept for 24 hours when you subscribe, comment, like a piece or send a message, then deleted. It can’t be turned back into your address.

## Questions

Privacy questions, or to have your data deleted: [aditi.sharmaa333@gmail.com](mailto:aditi.sharmaa333@gmail.com).$md$
where slug = 'privacy';
