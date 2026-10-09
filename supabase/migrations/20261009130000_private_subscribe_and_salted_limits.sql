-- Second hardening pass (follow-up security review).
--
-- 1. Sign-ups go through public.subscribe(email), which always returns the
--    same empty response. Direct INSERTs on subscribers are revoked: with
--    "Prefer: count=exact" the Content-Range header (*/1 vs */0) revealed
--    whether an email was already on the list.
-- 2. The visitor key is HMAC'd with a secret salt from Vault, so stored hashes
--    can't be brute-forced back into IPv4 addresses.
-- 3. Rate checks take a per-visitor advisory lock, so parallel requests can't
--    slip past the count.
-- 4. Hearts are rate-limited per visitor too.

-- Secret salt (generated once, never leaves the database).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'form_rate_salt') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'form_rate_salt',
      'Salt for hashing visitor IPs in private.form_hits');
  end if;
end;
$$;

-- Old unsalted hashes are useless now; drop them.
delete from private.form_hits;

create or replace function private.check_form_rate(p_kind text, p_per_visitor integer, p_overall integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text := coalesce(current_setting('request.headers', true)::json ->> 'cf-connecting-ip', 'unknown');
  v_salt text := (select decrypted_secret from vault.decrypted_secrets where name = 'form_rate_salt' limit 1);
  v_ip_hash text := encode(extensions.hmac(v_ip || ':' || p_kind, coalesce(v_salt, ''), 'sha256'), 'hex');
begin
  -- Serialise checks per visitor so concurrent requests can't all pass.
  perform pg_advisory_xact_lock(hashtextextended(v_ip_hash, 0));

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

-- The trigger now only normalises; rate limiting and de-duplication live in subscribe().
create or replace function private.before_subscriber_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

create or replace function public.subscribe(p_email text, p_source text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address' using errcode = '22023';
  end if;

  perform private.check_form_rate('subscribe', 10, 1000);

  -- Existing (or unsubscribed) emails are left untouched; the caller can't tell.
  insert into public.subscribers (email, source)
  values (v_email, left(p_source, 200))
  on conflict (email) do nothing;
end;
$$;

revoke execute on function public.subscribe(text, text) from public;
grant execute on function public.subscribe(text, text) to anon, authenticated;

revoke insert on table public.subscribers from anon, authenticated;
drop policy if exists "Anyone can subscribe" on public.subscribers;

-- Hearts: same per-visitor limiting.
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

  perform private.check_form_rate('heart', 60, 5000);

  insert into public.post_hearts as h (post_slug, hearts)
  values (p_slug, 1)
  on conflict (post_slug) do update
    set hearts = h.hearts + 1, updated_at = now()
  returning h.hearts into new_count;

  return new_count;
end;
$$;
