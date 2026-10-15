-- Follow-up to 20261015140000 for databases that ran its first version,
-- where editors were matched by email address and signed-in users had
-- table-wide SELECT on posts (exposing preview tokens). Safe to re-run.

-- Editors are account ids: signing up with an editor's email grants nothing.
drop table if exists private.editors;
create table private.editors (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

insert into private.editors (user_id)
select id from auth.users where email = 'aditi.sharmaa333@gmail.com' and email_confirmed_at is not null
on conflict do nothing;

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

-- Signed-in users read posts column by column, never the preview token.
revoke select on table public.posts from authenticated;
grant select (id, slug, title, excerpt, content, content_format, category_slug, extra_categories, tags, lang,
              cover_image_url, cover_image_alt, pinned_order, comments_enabled, notify_subscribers, announced_at,
              status, published_at, created_at, updated_at)
  on table public.posts to authenticated;
grant insert, update, delete on table public.posts to authenticated;

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
