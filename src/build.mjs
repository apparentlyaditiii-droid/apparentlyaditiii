#!/usr/bin/env node
// Static site generator: reads content from Supabase, writes HTML to dist/.
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.mjs';
import { loadContent } from './lib/content.mjs';
import { absolute, esc, shortDate } from './lib/format.mjs';
import { document } from './templates/layout.mjs';
import * as t from './templates/pages.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, '..', 'dist');

async function write(urlPath, contents) {
  const file = urlPath.endsWith('/') ? path.join(dist, urlPath, 'index.html') : path.join(dist, urlPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}

// Content-hashed asset names, so browsers can cache them forever.
async function hashedAsset(sources, name, ext) {
  const text = (await Promise.all(sources.map((s) => readFile(path.join(root, s), 'utf8')))).join('\n');
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 10);
  const urlPath = `/assets/${name}.${hash}.${ext}`;
  await write(urlPath, text);
  return urlPath;
}

const started = Date.now();
const content = await loadContent();
const { posts, categories, tags, pages, years } = content;

await rm(dist, { recursive: true, force: true });
await cp(path.join(root, 'static'), dist, { recursive: true });

const assets = {
  css: await hashedAsset(['styles/site.css', 'styles/components.css', 'styles/journal.css'], 'site', 'css'),
  js: await hashedAsset(['client/app.js'], 'app', 'js'),
  // Only the private preview page renders Markdown in the browser.
  marked: await hashedAsset(['../node_modules/marked/lib/marked.umd.js'], 'marked', 'js'),
  // The writing desk (/write/) only.
  supabase: await hashedAsset(['../node_modules/@supabase/supabase-js/dist/umd/supabase.js'], 'supabase', 'js'),
  write: await hashedAsset(['client/write.js'], 'write', 'js'),
  deskCss: await hashedAsset(['styles/desk.css'], 'desk', 'css'),
};

const render = (urlPath, opts) => write(urlPath, document({ path: urlPath, categories, assets, ...opts }));
const sitemap = [];
const emit = async (urlPath, opts) => {
  await render(urlPath, opts);
  if (!opts.noindex) sitemap.push({ path: urlPath, lastmod: opts.lastmod });
};
const newest = (list) => list.reduce((m, p) => (p.updated_at > m ? p.updated_at : m), list[0]?.updated_at);

await emit('/', {
  body: t.home(content),
  lastmod: newest(posts),
  jsonLd: { '@context': 'https://schema.org', '@type': 'Blog', name: config.title, description: config.tagline, url: absolute('/'),
    author: { '@type': 'Person', name: config.author } },
});
await emit('/archive/', { title: 'The archive', description: `Every piece on ${config.title}, by year and category.`, body: t.archive(content), lastmod: newest(posts) });
for (const y of years) {
  await emit(y.path, { title: `Written in ${y.year}`, description: `Pieces from ${y.year} on ${config.title}.`, body: t.archiveYear({ year: y, years, categories, total: posts.length }), lastmod: newest(y.posts) });
}

for (const c of categories) {
  await emit(c.path, { title: c.name, description: c.description, body: t.category({ category: c, categories, total: posts.length }), lastmod: newest(c.posts) });
}
for (const tag of tags) {
  await emit(tag.path, { title: `#${tag.name}`, description: `Pieces tagged “${tag.name}”.`, body: t.tag({ tag }), noindex: tag.posts.length < 2 });
}

for (const p of posts) {
  await emit(p.path, {
    title: p.title,
    description: p.excerpt,
    image: t.ogImage(p),
    type: 'article',
    lastmod: p.updated_at,
    body: t.post({ post: p, posts }),
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.excerpt,
      datePublished: p.published_at, dateModified: p.updated_at, url: absolute(p.path),
      image: t.ogImage(p), inLanguage: p.lang, articleSection: p.categories.map((c) => c.name),
      author: { '@type': 'Person', name: config.author, url: absolute('/about/') },
    },
  });
}

for (const slug of ['about', 'privacy', 'terms', 'disclaimer']) {
  const pg = pages[slug];
  if (!pg) { console.warn(`! pages.${slug} missing in Supabase, skipped`); continue; }
  const after = slug === 'about'
    ? `<p class="mt-12 font-sans text-[0.92rem] text-ink-2">Want to say something? <a class="text-accent-ink underline underline-offset-4" href="/contact/">Write to me</a>, or start with <a class="text-accent-ink underline underline-offset-4" href="/archive/">the archive</a>.</p>`
    : '';
  await emit(`/${slug}/`, { title: pg.title, description: pg.intro, body: t.page({ page: pg, path: `/${slug}/`, after }) });
}

await emit('/contact/', { title: 'Contact', description: 'Write to Aditi.', body: t.contact() });
await emit('/search/', { title: 'Search', body: t.search({ total: posts.length, categories }), noindex: true });
await emit('/subscribe/confirm/', { title: 'Confirm your subscription', body: t.confirmSubscription(), noindex: true });
await emit('/unsubscribe/', { title: 'Unsubscribe', body: t.unsubscribe(), noindex: true });
await emit('/moderate/', { title: 'Review a comment', body: t.moderate(), noindex: true });
await emit('/write/', { title: 'Writing desk', body: t.write({ categories }), noindex: true, styles: [assets.deskCss], scripts: [assets.marked, assets.supabase, assets.write] });
await emit('/preview/', { title: 'Preview', body: t.preview(), noindex: true, scripts: [assets.marked] });
await write('/404.html', document({ path: '/404/', title: 'Not found', body: t.notFound(), categories, assets, noindex: true }));

// Search index (read by /search/ in the browser)
await write('/search-index.json', JSON.stringify(posts.map((p) => ({
  t: p.title, tl: p.titleLang, u: p.path, e: p.excerpt, d: shortDate(p.published_at), y: p.year, l: p.lang,
  c: p.categories.map((c) => c.name), g: p.tags.map((x) => x.name), b: p.text,
}))));

// RSS (full content, newest 20)
// Feed readers need absolute links for images and internal pages.
const absolutizeHtml = (html) => html.replace(/(src|href)="\/(?!\/)/g, (m, attr) => `${attr}="${config.siteUrl}/`);
const cdata = (s) => `<![CDATA[${String(s).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
await write('/feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>${esc(config.title)}</title>
<link>${absolute('/')}</link>
<description>${esc(config.tagline)}</description>
<language>en-in</language>
<atom:link href="${absolute('/feed.xml')}" rel="self" type="application/rss+xml"/>
${posts[0] ? `<lastBuildDate>${new Date(posts[0].published_at).toUTCString()}</lastBuildDate>\n` : ''}${posts.slice(0, 20).map((p) => `<item>
<title>${esc(p.title)}</title>
<link>${absolute(p.path)}</link>
<guid isPermaLink="true">${absolute(p.path)}</guid>
<pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
${p.categories.map((c) => `<category>${esc(c.name)}</category>\n`).join('')}<description>${esc(p.excerpt)}</description>
<content:encoded>${cdata((p.cover_image_url ? `<p><img src="${esc(t.ogImage(p))}" alt=""></p>` : '') + absolutizeHtml(p.html))}</content:encoded>
</item>`).join('\n')}
</channel>
</rss>
`);

await write('/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap.map((u) => `<url><loc>${absolute(u.path)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`);
await write('/robots.txt', `User-agent: *\nAllow: /\nDisallow: /preview/\nDisallow: /moderate/\nDisallow: /write/\n\nSitemap: ${absolute('/sitemap.xml')}\n`);

console.log(`Built ${posts.length} posts, ${categories.length} categories, ${tags.length} tags, ${sitemap.length} pages for ${config.siteUrl} in ${Date.now() - started} ms`);
