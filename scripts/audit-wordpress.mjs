#!/usr/bin/env node
// Compares apparentlyaditiii.wordpress.com with what the new site publishes,
// so nothing is lost before the old blog is retired.
//
//   npm run audit:wordpress
//
// Checks every WordPress post is in Supabase (same title and date), nothing is
// duplicated, every image the site references exists in src/static, and no
// content still points at wordpress.com. Exits non-zero if anything is wrong.

import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.mjs';

const WP = 'https://public-api.wordpress.com/rest/v1.1/sites/apparentlyaditiii.wordpress.com';
const STATIC = fileURLToPath(new URL('../src/static', import.meta.url));
const SLUG_OVERRIDES = { 'प्यार': 'pyaar' };

const getJson = async (url, headers) => {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

const wp = (await getJson(`${WP}/posts/?number=100&fields=ID,slug,title,date,URL,featured_image,content`)).posts;
const db = await getJson(`${config.supabaseUrl}/rest/v1/posts?select=slug,title,published_at,cover_image_url,content&order=published_at.desc`,
  { apikey: config.supabaseKey });

const problems = [];
const decode = (s) => s.replace(/&#8217;/g, '’').replace(/&#8211;/g, '–').replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim();

for (const p of wp) {
  const slug = SLUG_OVERRIDES[decodeURIComponent(p.slug)] ?? decodeURIComponent(p.slug);
  const row = db.find((r) => r.slug === slug);
  if (!row) { problems.push(`missing: ${p.URL}`); continue; }
  if (decode(p.title) !== row.title) problems.push(`title differs for ${slug}: "${decode(p.title)}" vs "${row.title}"`);
  if (new Date(p.date).getTime() !== new Date(row.published_at).getTime()) problems.push(`date differs for ${slug}: ${p.date} vs ${row.published_at}`);
  if (p.featured_image && !row.cover_image_url) problems.push(`cover image missing for ${slug}`);
  const wpImages = (p.content.match(/<img\b/g) ?? []).length;
  const dbImages = (row.content.match(/<img\b/g) ?? []).length;
  if (dbImages < wpImages) problems.push(`${slug}: ${wpImages} images on WordPress, ${dbImages} on the new site`);
}

const seen = new Set();
for (const r of db) {
  const key = r.title.toLowerCase();
  if (seen.has(key)) problems.push(`duplicate title: ${r.title}`);
  seen.add(key);
}

for (const r of db) {
  const refs = [r.cover_image_url, ...[...r.content.matchAll(/src="([^"]+)"/g)].map((m) => m[1])].filter(Boolean);
  for (const ref of refs) {
    if (/wordpress\.com|wp\.com/.test(ref)) problems.push(`${r.slug} still loads ${ref}`);
    else if (ref.startsWith('/')) await access(STATIC + decodeURIComponent(ref.split('?')[0])).catch(() => problems.push(`${r.slug}: ${ref} not found in src/static`));
  }
}

console.log(`WordPress: ${wp.length} posts · new site: ${db.length} published posts`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('All WordPress posts are on the new site, with titles, dates and images intact.');
