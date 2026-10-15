-- The writing desk (/write/): Aditi signs in and writes, edits, publishes,
-- uploads images and moderates comments from the site itself.
--
-- Editors are bound to their account id, not an email address, so nobody can
-- gain access by signing up with an editor's email. After creating someone's
-- login (Authentication → Users → Add user), make them an editor with:
--   insert into private.editors (user_id)
--   select id from auth.users where email = 'aditi.sharmaa333@gmail.com';

create table if not exists private.editors (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from private.editors e where e.user_id = auth.uid());
$$;

revoke execute on function public.is_editor() from public;
grant execute on function public.is_editor() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Posts: editors see and change everything (drafts included)
-- ---------------------------------------------------------------------------

-- Writes are table-level (RLS decides who); reads stay column-level so the
-- preview token is never readable, even by signed-in non-editors.
grant insert, update, delete on table public.posts to authenticated;
grant select (notify_subscribers, announced_at) on table public.posts to authenticated;

create or replace function public.editor_preview_token(p_id bigint)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_editor() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return (select preview_token from public.posts where id = p_id);
end;
$$;

revoke execute on function public.editor_preview_token(bigint) from public, anon;
grant execute on function public.editor_preview_token(bigint) to authenticated;

drop policy if exists "Editors read all posts" on public.posts;
create policy "Editors read all posts"
  on public.posts for select to authenticated
  using (public.is_editor());

drop policy if exists "Editors add posts" on public.posts;
create policy "Editors add posts"
  on public.posts for insert to authenticated
  with check (public.is_editor());

drop policy if exists "Editors edit posts" on public.posts;
create policy "Editors edit posts"
  on public.posts for update to authenticated
  using (public.is_editor())
  with check (public.is_editor());

drop policy if exists "Editors delete posts" on public.posts;
create policy "Editors delete posts"
  on public.posts for delete to authenticated
  using (public.is_editor());

-- Saving a draft shouldn't rebuild the site; only changes that touch
-- something visible (or about to be) do.
drop trigger if exists posts_request_rebuild on public.posts;
drop trigger if exists posts_rebuild_on_insert on public.posts;
drop trigger if exists posts_rebuild_on_update on public.posts;
drop trigger if exists posts_rebuild_on_delete on public.posts;

create trigger posts_rebuild_on_insert
  after insert on public.posts
  for each row when (new.status = 'published')
  execute function private.request_site_rebuild();

create trigger posts_rebuild_on_update
  after update on public.posts
  for each row when (old.status = 'published' or new.status = 'published')
  execute function private.request_site_rebuild();

create trigger posts_rebuild_on_delete
  after delete on public.posts
  for each row when (old.status = 'published')
  execute function private.request_site_rebuild();

-- ---------------------------------------------------------------------------
-- Comments: editors moderate through these two functions (keeps commenters'
-- emails away from everyone else)
-- ---------------------------------------------------------------------------

create or replace function public.editor_comments(p_status text default 'pending')
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_editor() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return coalesce((
    select json_agg(json_build_object(
             'id', c.id, 'author_name', c.author_name, 'author_email', c.author_email, 'body', c.body,
             'status', c.status, 'created_at', c.created_at, 'post_title', p.title, 'post_id', p.id)
           order by c.created_at desc)
    from (select * from public.comments
          where p_status = 'all' or status = p_status
          order by created_at desc limit 200) c
    join public.posts p on p.id = c.post_id), '[]'::json);
end;
$$;

create or replace function public.editor_moderate(p_id bigint, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_editor() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_action = 'delete' then
    delete from public.comments where id = p_id;
  elsif p_action in ('approve', 'reject', 'spam', 'pending') then
    update public.comments
    set status = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else p_action end,
        moderated_at = now()
    where id = p_id;
  else
    return 'invalid';
  end if;
  return case when found then p_action else 'invalid' end;
end;
$$;

revoke execute on function public.editor_comments(text), public.editor_moderate(bigint, text) from public, anon;
grant execute on function public.editor_comments(text), public.editor_moderate(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Images: editors upload to the public "media" bucket
-- ---------------------------------------------------------------------------

drop policy if exists "Editors read media" on storage.objects;
create policy "Editors read media"
  on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_editor());

drop policy if exists "Editors upload media" on storage.objects;
create policy "Editors upload media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_editor());

drop policy if exists "Editors replace media" on storage.objects;
create policy "Editors replace media"
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_editor())
  with check (bucket_id = 'media' and public.is_editor());

drop policy if exists "Editors delete media" on storage.objects;
create policy "Editors delete media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_editor());
