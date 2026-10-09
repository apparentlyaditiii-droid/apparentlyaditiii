-- Apparently, Aditiii — initial schema
--
-- Content (categories, posts, pages) is read at build time by the static site
-- generator using the publishable key, so the public can only ever see rows
-- that are published. Reader-submitted data (subscribers, messages) is
-- insert-only for the public: nobody can read it back through the API.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Categories ("Poems", "Reflections", "Unsent Notes", …)
-- ---------------------------------------------------------------------------

create table public.categories (
  slug        text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (length(name) between 1 and 60),
  description text,
  verse       boolean not null default false, -- render pieces with the centred verse layout
  sort_order  integer not null default 0
);

comment on table public.categories is 'Kinds of writing. verse = true uses the poem layout.';

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------

create table public.posts (
  id              bigint generated always as identity primary key,
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title           text not null check (length(title) between 1 and 200),
  excerpt         text,
  content         text not null default '',
  content_format  text not null default 'markdown' check (content_format in ('markdown', 'html')),
  category_slug   text not null default 'reflections' references public.categories (slug) on update cascade,
  tags            text[] not null default '{}',
  lang            text not null default 'en' check (lang in ('en', 'hi')),
  cover_image_url text,
  cover_image_alt text,
  featured        boolean not null default false, -- shown under "If you read only one"
  status          text not null default 'draft' check (status in ('draft', 'published')),
  published_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.posts is 'Pieces of writing. Set status = published to put one on the site.';
comment on column public.posts.content is 'Markdown by default (single line breaks are kept, good for poems). Imported WordPress posts use html.';

create index posts_published_idx on public.posts (published_at desc) where status = 'published';
create index posts_category_slug_idx on public.posts (category_slug);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Pages (about, privacy, terms, disclaimer)
-- ---------------------------------------------------------------------------

create table public.pages (
  slug           text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title          text not null,
  kicker         text,
  intro          text,
  content        text not null default '',
  content_format text not null default 'markdown' check (content_format in ('markdown', 'html')),
  updated_at     timestamptz not null default now()
);

create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Hearts (♥ counter per piece)
-- ---------------------------------------------------------------------------

create table public.post_hearts (
  post_slug  text primary key references public.posts (slug) on update cascade on delete cascade,
  hearts     integer not null default 0 check (hearts >= 0),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Newsletter subscribers
-- ---------------------------------------------------------------------------

create table public.subscribers (
  id              bigint generated always as identity primary key,
  email           text not null unique
                  check (length(email) <= 254 and email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source          text check (length(source) <= 200),
  created_at      timestamptz not null default now(),
  unsubscribed_at timestamptz
);

create index subscribers_created_at_idx on public.subscribers (created_at);

-- ---------------------------------------------------------------------------
-- Contact messages
-- ---------------------------------------------------------------------------

create table public.messages (
  id         bigint generated always as identity primary key,
  name       text not null check (length(trim(name)) between 1 and 100),
  email      text not null check (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  body       text not null check (length(trim(body)) between 1 and 5000),
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_created_at_idx on public.messages (created_at);

-- Normalise and throttle reader submissions. SECURITY DEFINER so the count
-- queries can see rows the anon role can't; the functions live in the
-- unexposed "private" schema, so they aren't callable through the API.

create or replace function private.before_subscriber_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  if (select count(*) from public.subscribers where created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many sign-ups right now, please try again later' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger subscribers_before_insert
  before insert on public.subscribers
  for each row execute function private.before_subscriber_insert();

create or replace function private.before_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  new.name := trim(new.name);
  if (select count(*) from public.messages
        where created_at > now() - interval '1 hour' and email = new.email) >= 3
     or (select count(*) from public.messages
        where created_at > now() - interval '1 hour') >= 50 then
    raise exception 'Too many messages right now, please try again later' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function private.before_message_insert();

-- ---------------------------------------------------------------------------
-- Row Level Security + explicit grants
-- ---------------------------------------------------------------------------

alter table public.categories  enable row level security;
alter table public.posts       enable row level security;
alter table public.pages       enable row level security;
alter table public.post_hearts enable row level security;
alter table public.subscribers enable row level security;
alter table public.messages    enable row level security;

-- Start from nothing, then grant only what the site needs.
revoke all on table public.categories, public.posts, public.pages, public.post_hearts,
                    public.subscribers, public.messages
  from anon, authenticated;

grant select on table public.categories, public.posts, public.pages, public.post_hearts
  to anon, authenticated;
grant insert (email, source) on table public.subscribers to anon, authenticated;
grant insert (name, email, body) on table public.messages to anon, authenticated;

create policy "Categories are public"
  on public.categories for select to anon, authenticated
  using (true);

create policy "Published posts are public"
  on public.posts for select to anon, authenticated
  using (status = 'published');

create policy "Pages are public"
  on public.pages for select to anon, authenticated
  using (true);

create policy "Heart counts are public"
  on public.post_hearts for select to anon, authenticated
  using (true);

create policy "Anyone can subscribe"
  on public.subscribers for insert to anon, authenticated
  with check (unsubscribed_at is null);

create policy "Anyone can send a message"
  on public.messages for insert to anon, authenticated
  with check (is_read = false);

-- ---------------------------------------------------------------------------
-- heart_post(p_slug): the one write path for hearts. Public by design; it can
-- only add 1 to a published post's counter.
-- ---------------------------------------------------------------------------

create or replace function public.heart_post(p_slug text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_count integer;
begin
  if not exists (select 1 from public.posts where slug = p_slug and status = 'published') then
    raise exception 'Unknown piece' using errcode = 'P0002';
  end if;

  insert into public.post_hearts as h (post_slug, hearts)
  values (p_slug, 1)
  on conflict (post_slug) do update
    set hearts = h.hearts + 1, updated_at = now()
  returning h.hearts into new_count;

  return new_count;
end;
$$;

revoke execute on function public.heart_post(text) from public;
grant execute on function public.heart_post(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rebuild the site when content changes.
-- Calls the Vercel deploy hook stored in Vault as "vercel_deploy_hook".
-- If no hook is stored, this is a no-op.
-- ---------------------------------------------------------------------------

create or replace function private.request_site_rebuild()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hook text;
begin
  select decrypted_secret into hook
  from vault.decrypted_secrets
  where name = 'vercel_deploy_hook'
  limit 1;

  if hook is not null and hook <> '' then
    perform net.http_post(url := hook, body := '{}'::jsonb);
  end if;
  return null;
end;
$$;

create trigger posts_request_rebuild
  after insert or update or delete on public.posts
  for each statement execute function private.request_site_rebuild();

create trigger pages_request_rebuild
  after insert or update or delete on public.pages
  for each statement execute function private.request_site_rebuild();

create trigger categories_request_rebuild
  after insert or update or delete on public.categories
  for each statement execute function private.request_site_rebuild();
