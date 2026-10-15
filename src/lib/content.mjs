import { config } from '../config.mjs';
import {
  categoryPath, langOf, plainText, postPath, readingMinutes, renderContent, slugify, truncate, yearOf,
} from './format.mjs';

async function select(table, query) {
  const url = `${config.supabaseUrl}/rest/v1/${table}?${query}`;
  const res = await fetch(url, { headers: { apikey: config.supabaseKey } });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

// The public can only read these post columns (preview_token stays private).
const POST_COLUMNS = [
  'id', 'slug', 'title', 'excerpt', 'content', 'content_format', 'category_slug', 'extra_categories', 'tags', 'lang',
  'cover_image_url', 'cover_image_alt', 'pinned_order', 'comments_enabled', 'published_at', 'updated_at',
].join(',');

// Until the 20261015100000 migration is applied, the new columns don't exist;
// read the old shape so a deploy never breaks while the database catches up.
async function selectPosts() {
  try {
    return await select('posts', `select=${POST_COLUMNS}&order=published_at.desc`);
  } catch (err) {
    if (!/42703|does not exist/.test(err.message)) throw err;
    console.warn('! posts table is on the old schema; run `supabase db push` to enable pinning, comments and more');
    const rows = await select('posts', 'select=*&order=published_at.desc');
    return rows.map(({ featured, ...r }) => ({ ...r, extra_categories: [], pinned_order: featured ? 1 : null, comments_enabled: true }));
  }
}

// Loads everything the site needs and derives the fields templates use.
export async function loadContent() {
  const [categoryRows, postRows, pageRows] = await Promise.all([
    select('categories', 'select=*&order=sort_order.asc,name.asc'),
    // RLS only returns published posts whose date has arrived (scheduled ones stay hidden).
    selectPosts(),
    select('pages', 'select=*'),
  ]);

  const categories = categoryRows.map((c) => ({ ...c, path: categoryPath(c.slug), posts: [] }));
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  const posts = postRows.map((row) => {
    const html = renderContent(row.content, row.content_format);
    const text = plainText(html);
    const category = categoryBySlug.get(row.category_slug);
    // Main category first, then any extra ones, in the site's category order.
    const extra = categories.filter((c) => c !== category && (row.extra_categories ?? []).includes(c.slug));
    return {
      ...row,
      path: postPath(row),
      html,
      text,
      excerpt: row.excerpt?.trim() || truncate(text),
      minutes: readingMinutes(text),
      year: yearOf(row.published_at),
      category,
      categories: [category, ...extra].filter(Boolean),
      titleLang: langOf(row.title, row.lang),
      tags: (row.tags ?? []).map((name) => ({ name, slug: slugify(name) })).filter((t) => t.slug),
    };
  });

  for (const post of posts) for (const c of post.categories) c.posts.push(post);

  const pinned = posts.filter((p) => p.pinned_order != null)
    .sort((a, b) => a.pinned_order - b.pinned_order || b.published_at.localeCompare(a.published_at));

  const years = [];
  for (const post of posts) {
    if (years.at(-1)?.year !== post.year) years.push({ year: post.year, path: `/archive/${post.year}/`, posts: [] });
    years.at(-1).posts.push(post);
  }

  const tags = new Map();
  for (const post of posts) {
    for (const tag of post.tags) {
      if (!tags.has(tag.slug)) tags.set(tag.slug, { ...tag, path: `/tag/${tag.slug}/`, posts: [] });
      tags.get(tag.slug).posts.push(post);
    }
  }

  const pages = Object.fromEntries(pageRows.map((p) => [p.slug, { ...p, html: renderContent(p.content, p.content_format) }]));

  return { categories, posts, pinned, years, tags: [...tags.values()], pages };
}
