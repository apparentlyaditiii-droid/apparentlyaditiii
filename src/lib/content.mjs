import { config } from '../config.mjs';
import {
  categoryPath, langOf, plainText, postPath, readingMinutes, renderContent, slugify, truncate,
} from './format.mjs';

async function select(table, query) {
  const url = `${config.supabaseUrl}/rest/v1/${table}?${query}`;
  const res = await fetch(url, { headers: { apikey: config.supabaseKey } });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

// Loads everything the site needs and derives the fields templates use.
export async function loadContent() {
  const [categoryRows, postRows, pageRows] = await Promise.all([
    select('categories', 'select=*&order=sort_order.asc,name.asc'),
    // RLS only returns published posts to the publishable key.
    select('posts', 'select=*&order=published_at.desc'),
    select('pages', 'select=*'),
  ]);

  const categories = categoryRows.map((c) => ({ ...c, path: categoryPath(c.slug), posts: [] }));
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  const total = postRows.length;
  const posts = postRows.map((row, i) => {
    const html = renderContent(row.content, row.content_format);
    const text = plainText(html);
    const category = categoryBySlug.get(row.category_slug);
    return {
      ...row,
      number: String(total - i).padStart(2, '0'), // oldest piece is No. 01
      path: postPath(row),
      html,
      text,
      excerpt: row.excerpt?.trim() || truncate(text),
      minutes: readingMinutes(text),
      category,
      titleLang: langOf(row.title, row.lang),
      tags: (row.tags ?? []).map((name) => ({ name, slug: slugify(name) })).filter((t) => t.slug),
    };
  });

  for (const post of posts) post.category?.posts.push(post);

  const tags = new Map();
  for (const post of posts) {
    for (const tag of post.tags) {
      if (!tags.has(tag.slug)) tags.set(tag.slug, { ...tag, path: `/tag/${tag.slug}/`, posts: [] });
      tags.get(tag.slug).posts.push(post);
    }
  }

  const pages = Object.fromEntries(pageRows.map((p) => [p.slug, { ...p, html: renderContent(p.content, p.content_format) }]));

  return { categories, posts, tags: [...tags.values()], pages };
}
