-- Harden the reader-facing forms (follow-up to the security review).
--
-- 1. Newsletter sign-ups no longer reveal whether an email is already on the
--    list: a repeat sign-up is silently accepted (201) instead of failing with
--    a unique-violation (409).
-- 2. Rate limits are per visitor (hashed IP, kept 24 hours) instead of only
--    global, so one person can't use up everyone's quota. Much higher global
--    ceilings remain as a backstop against a distributed flood.

create table if not exists private.form_hits (
  kind       text not null,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);

create index if not exists form_hits_lookup_idx on private.form_hits (kind, ip_hash, created_at);
create index if not exists form_hits_created_at_idx on private.form_hits (created_at);

-- Raises P0001 when the caller is over a limit; otherwise records the hit.
-- The IP comes from Cloudflare's cf-connecting-ip header (set by Supabase's
-- edge and not spoofable by the client, unlike the first X-Forwarded-For entry).
drop function if exists private.check_form_rate(text, integer, integer);

create or replace function private.check_form_rate(p_kind text, p_per_visitor integer, p_overall integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text := coalesce(current_setting('request.headers', true)::json ->> 'cf-connecting-ip', 'unknown');
  v_ip_hash text := encode(extensions.digest(v_ip || ':' || p_kind, 'sha256'), 'hex');
begin
  delete from private.form_hits where created_at < now() - interval '24 hours';

  if (select count(*) from private.form_hits h
        where h.kind = p_kind and h.ip_hash = v_ip_hash and h.created_at > now() - interval '1 hour') >= p_per_visitor
     or (select count(*) from private.form_hits h
        where h.kind = p_kind and h.created_at > now() - interval '1 hour') >= p_overall then
    raise exception 'Too many submissions right now, please try again later' using errcode = 'P0001';
  end if;

  insert into private.form_hits (kind, ip_hash) values (p_kind, v_ip_hash);
end;
$$;

create or replace function private.before_subscriber_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  perform private.check_form_rate('subscribe', 10, 1000);

  -- Already on the list (or unsubscribed): skip the insert. Returning NULL
  -- makes the request succeed without revealing whether the email exists, and
  -- an anonymous request can never re-subscribe someone who opted out.
  if exists (select 1 from public.subscribers where email = new.email) then
    return null;
  end if;
  return new;
end;
$$;

create or replace function private.before_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  new.name := trim(new.name);
  perform private.check_form_rate('message', 5, 500);
  return new;
end;
$$;

-- Mention the short-lived hashed IP on the privacy page.
update public.pages
set content = replace(
  content,
  E'## Contact form\n',
  E'## Spam protection\n\nTo stop automated spam, a one-way hash of your IP address is kept for 24 hours when you subscribe or send a message, then deleted. It can’t be turned back into your address.\n\n## Contact form\n'
)
where slug = 'privacy' and content not like '%## Spam protection%';
