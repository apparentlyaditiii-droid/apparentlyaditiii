import { config } from '../config.mjs';
import { absolute, esc, longDate, shortDate, yearOf } from '../lib/format.mjs';
import { breadcrumb, newsletter } from './layout.mjs';

// --- small pieces ----------------------------------------------------------

const meta = (post, extra = '') =>
  `<p class="font-sans text-[0.78rem] text-ink-3${extra}"><time datetime="${post.published_at}">${longDate(post.published_at)}</time><span aria-hidden="true"> · </span>${post.minutes} min read</p>`;

const numberArt = (post, aspect = 'aspect-[4/3]') =>
  `<div class="relative flex flex-col justify-between overflow-hidden bg-accent-soft p-5 sm:p-7 ${aspect} rounded-sm" aria-hidden="true"><span class="kicker text-accent-ink/70">${esc(post.category?.name)}</span><span class="self-end font-serif italic leading-[0.8] tracking-[-0.04em] text-accent/80 select-none" style="font-size:clamp(5rem, 16vw, 11rem);font-variation-settings:&quot;opsz&quot; 72">${post.number}</span></div>`;

// Resized variants for images hosted on WordPress.com (it supports ?w=).
function imgSrc(url, width) {
  if (!url) return url;
  return /wordpress\.com|wp\.com/.test(url) ? `${url.split('?')[0]}?w=${width}` : url;
}
function imgSrcset(url, widths) {
  if (!/wordpress\.com|wp\.com/.test(url ?? '')) return '';
  return ` srcset="${widths.map((w) => `${imgSrc(url, w)} ${w}w`).join(', ')}"`;
}
export const ogImage = (post) => (post.cover_image_url ? imgSrc(post.cover_image_url, 1200) : undefined);

export function card(post, { headingLevel = 3 } = {}) {
  const h = `h${headingLevel}`;
  return `<article class="group flex flex-col"><a class="block" tabindex="-1" aria-hidden="true" href="${post.path}">${numberArt(post)}</a><div class="mt-4 flex items-baseline gap-3"><span class="kicker">No. ${post.number}</span>${post.category ? `<a class="kicker kicker-accent hover:underline" href="${post.category.path}">${esc(post.category.name)}</a>` : ''}</div><${h} lang="${post.titleLang}" class="mt-2 font-serif text-[1.45rem] leading-[1.15] tracking-tight"><a class="link-underline" href="${post.path}">${esc(post.title)}</a></${h}><p lang="${post.lang}" class="mt-2 line-clamp-3 font-serif text-[1.02rem] leading-relaxed text-ink-2">${esc(post.excerpt)}</p>${meta(post, ' mt-3')}</article>`;
}

function row(post) {
  return `<article class="group grid grid-cols-[auto_1fr] gap-x-4 border-t border-rule py-6 sm:grid-cols-[5.5rem_1fr_10rem] sm:gap-x-8 sm:py-8"><div class="pt-1.5"><span class="kicker block">No. ${post.number}</span></div><div class="min-w-0">${post.category ? `<a class="kicker kicker-accent hover:underline" href="${post.category.path}">${esc(post.category.name)}</a>` : ''}<h3 lang="${post.titleLang}" class="mt-1.5 font-serif text-[1.55rem] leading-[1.15] tracking-tight sm:text-[1.9rem]"><a class="link-underline" href="${post.path}">${esc(post.title)}</a></h3><p lang="${post.lang}" class="mt-2 line-clamp-2 max-w-2xl font-serif text-[1.05rem] leading-relaxed text-ink-2">${esc(post.excerpt)}</p>${meta(post, ' mt-3 sm:hidden')}</div><div class="hidden pt-2 text-right font-sans text-[0.78rem] leading-relaxed text-ink-3 sm:block"><time datetime="${post.published_at}" class="block">${longDate(post.published_at)}</time>${post.minutes} min read</div></article>`;
}

const grid = (posts) =>
  `<div class="mx-auto grid max-w-6xl gap-x-8 gap-y-14 px-4 pt-10 pb-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">${posts.map((p) => card(p)).join('')}</div>`;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// --- home ------------------------------------------------------------------

export function home({ posts, categories }) {
  const [lead, ...rest] = posts;
  const recent = rest.slice(0, 5);
  const picks = posts.filter((p) => p.featured).slice(0, 2);
  const start = posts.find((p) => p.tags.some((t) => t.slug === 'start-here')) ?? posts.at(-1);
  const since = posts.length ? yearOf(posts.at(-1).published_at) : new Date().getFullYear();

  const leadArt = lead?.cover_image_url
    ? `<div class="cover-lead aspect-[4/3] rounded-sm md:aspect-[5/6]"><img src="${imgSrc(lead.cover_image_url, 900)}"${imgSrcset(lead.cover_image_url, [600, 900, 1300])} sizes="(min-width: 768px) 32rem, 100vw" alt="${esc(lead.cover_image_alt ?? '')}" fetchpriority="high"><span class="cover-number" aria-hidden="true">${lead.number}</span></div>`
    : lead && numberArt(lead, 'aspect-[4/3] md:aspect-[5/6]');

  return `<section class="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-16"><div class="flex items-end justify-between gap-6 border-b border-ink pb-5"><h1 class="max-w-3xl font-serif text-[clamp(1.6rem,4.2vw,2.75rem)] leading-[1.1] tracking-tight" style="font-weight:400">Some thoughts don’t fade. <em class="text-accent">They wait.</em></h1><p class="kicker hidden shrink-0 text-right md:block">${plural(posts.length, 'piece')}<br>since ${since}</p></div><p class="mt-4 max-w-2xl font-sans text-[0.95rem] leading-relaxed text-ink-2">${esc(config.tagline)}</p></section>
${lead ? `<section aria-labelledby="lead-title" class="mx-auto max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14"><article class="group grid gap-8 md:grid-cols-[1.15fr_1fr] md:gap-12"><a tabindex="-1" aria-hidden="true" class="order-1 md:order-2" href="${lead.path}">${leadArt}</a><div class="order-2 flex flex-col justify-center md:order-1"><p class="kicker"><span class="kicker-accent">Latest</span> · No. ${lead.number} · ${shortDate(lead.published_at)}</p><h2 id="lead-title" lang="${lead.titleLang}" class="mt-4 font-serif text-[clamp(2.4rem,6vw,4.4rem)] leading-[0.98] tracking-[-0.02em]"><a class="link-underline" href="${lead.path}">${esc(lead.title)}</a></h2><p lang="${lead.lang}" class="mt-6 max-w-lg font-serif text-[1.3rem] italic leading-snug text-ink-2">“${esc(lead.excerpt)}”</p><div class="mt-7 flex items-center gap-5"><a class="inline-flex h-11 items-center rounded-sm bg-ink px-5 font-sans text-[0.88rem] font-medium text-paper transition-colors hover:bg-accent" href="${lead.path}">Read the piece</a>${meta(lead)}</div></div></article></section>` : '<section class="mx-auto max-w-6xl px-4 pt-14 sm:px-6"><p class="font-serif text-[1.3rem] italic text-ink-2">The first piece is on its way.</p></section>'}
${recent.length ? `<section aria-labelledby="latest" class="mx-auto max-w-6xl px-4 pt-20 sm:px-6"><div class="flex items-baseline justify-between"><h2 id="latest" class="kicker text-ink">Recent pieces</h2><a class="font-sans text-[0.85rem] text-ink-2 hover:text-accent" href="/archive/">The full archive →</a></div><div class="mt-4 border-b border-rule">${recent.map(row).join('')}</div></section>` : ''}
${picks.length ? `<section aria-labelledby="picks" class="mx-auto max-w-6xl px-4 pt-20 sm:px-6"><h2 id="picks" class="kicker text-ink">If you read only one</h2><div class="mt-6 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:max-w-3xl">${picks.map((p) => card(p)).join('')}</div></section>` : ''}
<section aria-labelledby="themes" class="mx-auto max-w-6xl px-4 py-20 sm:px-6"><h2 id="themes" class="kicker text-ink">Read by kind</h2><ul class="mt-6 grid gap-px overflow-hidden rounded-sm border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">${categories.map((c) => `<li class="bg-paper"><a class="group flex h-full flex-col justify-between gap-6 p-6 transition-colors hover:bg-card sm:p-8" href="${c.path}"><div><p class="font-serif text-[1.9rem] leading-none tracking-tight group-hover:text-accent">${esc(c.name)}</p>${c.description ? `<p class="mt-3 font-sans text-[0.88rem] leading-relaxed text-ink-2">${esc(c.description)}</p>` : ''}</div><p class="kicker">${plural(c.posts.length, 'piece')} →</p></a></li>`).join('')}</ul>${start ? `<p class="mt-8 font-sans text-[0.92rem] text-ink-2">New here? Start with <a class="font-serif text-[1.1rem] italic text-accent-ink underline decoration-accent/40 underline-offset-4 hover:decoration-accent" href="${start.path}">${esc(start.title)}</a></p>` : ''}</section>
${newsletter()}`;
}

// --- archive / category / tag ---------------------------------------------

function filters(categories, active, total) {
  const pill = (href, label, count, on) =>
    `<li class="shrink-0"><a class="inline-flex h-9 items-center rounded-full border px-4 transition-colors ${on ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-2 hover:border-ink'}" href="${href}"${on ? ' aria-current="page"' : ''}>${esc(label)}${count !== undefined ? ` <span class="ml-1.5 opacity-60">${count}</span>` : ''}</a></li>`;
  return `<nav aria-label="Filter by kind" class="mx-auto mt-10 max-w-6xl px-4 sm:px-6"><ul class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 font-sans text-[0.85rem] sm:mx-0 sm:flex-wrap sm:px-0">${pill('/archive/', 'Everything', total, active === null)}${categories.map((c) => pill(c.path, c.name, c.posts.length, active === c.slug)).join('')}${pill('/search/', 'Search…')}</ul></nav>`;
}

export function archive({ posts, categories }) {
  const names = categories.map((c) => c.name.toLowerCase());
  const kinds = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join('');
  return `<header class="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">${breadcrumb([['/archive/', 'Writing']])}<p class="kicker kicker-accent mt-10">The archive</p><h1 class="mt-3 font-serif text-[clamp(2.6rem,7vw,5rem)] leading-[0.95] tracking-[-0.02em]">Everything, so far</h1><p class="mt-5 max-w-2xl font-serif text-[1.2rem] leading-relaxed text-ink-2">${plural(posts.length, 'piece')}${kinds ? `: ${esc(kinds)}` : ''}, newest first.</p></header>
${filters(categories, null, posts.length)}
${grid(posts)}`;
}

export function category({ category: c, categories, total }) {
  return `<header class="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">${breadcrumb([['/archive/', 'Writing'], [c.path, c.name]])}<p class="kicker kicker-accent mt-10">Kind</p><h1 class="mt-3 font-serif text-[clamp(2.6rem,7vw,5rem)] leading-[0.95] tracking-[-0.02em]">${esc(c.name)}</h1>${c.description ? `<p class="mt-5 max-w-2xl font-serif text-[1.2rem] leading-relaxed text-ink-2">${esc(c.description)}</p>` : ''}</header>
${filters(categories, c.slug, total)}
${c.posts.length ? grid(c.posts) : '<p class="mx-auto max-w-6xl px-4 pt-10 pb-6 font-serif text-[1.2rem] italic text-ink-2 sm:px-6">Nothing here yet.</p>'}`;
}

export function tag({ tag: t }) {
  return `<header class="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">${breadcrumb([['/archive/', 'Writing'], [t.path, `#${t.name}`]])}<p class="kicker kicker-accent mt-10">Tag</p><h1 class="mt-3 font-serif text-[clamp(2.6rem,7vw,5rem)] leading-[0.95] tracking-[-0.02em]">#${esc(t.name)}</h1><p class="mt-5 max-w-2xl font-serif text-[1.2rem] leading-relaxed text-ink-2">${plural(t.posts.length, 'piece')} tagged “${esc(t.name)}”.</p></header>
${grid(t.posts)}`;
}

// --- a single piece --------------------------------------------------------

export function post({ post: p, posts }) {
  const i = posts.indexOf(p);
  const newer = posts[i - 1];
  const older = posts[i + 1];
  const related = [
    ...posts.filter((o) => o !== p && o.category === p.category),
    ...posts.filter((o) => o !== p && o.category !== p.category),
  ].slice(0, 3);
  const url = absolute(p.path);
  const shareText = encodeURIComponent(p.title);
  const shareUrl = encodeURIComponent(url);
  const pillCls = 'rounded-full border border-rule px-3 py-1.5 text-ink-2 transition-colors hover:border-ink hover:text-ink';
  const verse = p.category?.verse ? ' verse' : '';
  const crumbs = [['/archive/', 'Writing'], ...(p.category ? [[p.category.path, p.category.name]] : []), [p.path, p.title]];

  const cover = p.cover_image_url
    ? `<figure class="cover mx-auto mt-10 max-w-[44rem]"><img src="${imgSrc(p.cover_image_url, 1200)}"${imgSrcset(p.cover_image_url, [700, 1200, 1600])} sizes="(min-width: 44rem) 44rem, 100vw" alt="${esc(p.cover_image_alt ?? '')}" fetchpriority="high"></figure>`
    : '';

  const navLink = (o, label, right) => o
    ? `<a class="group bg-paper p-5 hover:bg-card${right ? ' sm:text-right' : ''}" href="${o.path}"><p class="kicker">${label}</p><p lang="${o.titleLang}" class="mt-2 font-serif text-lg leading-snug group-hover:text-accent">${esc(o.title)}</p></a>`
    : '<span class="hidden bg-paper sm:block"></span>';

  return `<div class="progress fixed inset-x-0 top-0 z-40 h-[2px] bg-accent" aria-hidden="true" style="--p: 0;"></div><article class="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12"><div class="mx-auto max-w-[44rem]">${breadcrumb(crumbs)}<header class="mt-10 text-center"><p class="kicker">${p.category ? `<a class="kicker-accent hover:underline" href="${p.category.path}">${esc(p.category.name)}</a> · ` : ''}No. ${p.number}</p><h1 lang="${p.titleLang}" class="mt-4 font-serif text-[clamp(2.4rem,7vw,4.25rem)] leading-[1] tracking-[-0.02em] text-balance">${esc(p.title)}</h1><div class="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-rule py-4 font-sans text-[0.82rem] text-ink-2 justify-center"><span>By <a class="font-medium text-ink hover:text-accent" href="/about/">${esc(config.author)}</a></span><span aria-hidden="true" class="text-ink-3">·</span><time datetime="${p.published_at}">${longDate(p.published_at)}</time><span aria-hidden="true" class="text-ink-3">·</span><span>${p.minutes} min read</span></div></header></div>${cover}<div class="mx-auto mt-12 max-w-[40rem]"><div id="article-body" lang="${p.lang}" class="prose-article${verse}">${p.html}</div><p class="mt-12 text-center font-serif text-xl text-accent" aria-hidden="true">❦</p>${p.tags.length ? `<ul class="mt-10 flex flex-wrap gap-2 font-sans text-[0.8rem]" aria-label="Tags">${p.tags.map((t) => `<li><a class="inline-block rounded-full bg-paper-2 px-3 py-1.5 text-ink-2 hover:bg-accent-soft hover:text-accent-ink" href="/tag/${t.slug}/">#${esc(t.name)}</a></li>`).join('')}</ul>` : ''}<div class="mt-8 border-t border-rule pt-6"><div class="no-print flex flex-wrap items-center gap-2 font-sans text-[0.8rem]"><button type="button" class="heart-btn" data-heart="${esc(p.slug)}" aria-pressed="false"><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4Z"/></svg><span data-heart-label>Heart this</span></button><span class="kicker ml-2 mr-1">Share</span><a href="https://wa.me/?text=${shareText}%20${shareUrl}" target="_blank" rel="noopener noreferrer" class="${pillCls}">WhatsApp</a><a href="https://x.com/intent/post?text=${shareText}&amp;url=${shareUrl}" target="_blank" rel="noopener noreferrer" class="${pillCls}">X</a><a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener noreferrer" class="${pillCls}">Facebook</a><a href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" target="_blank" rel="noopener noreferrer" class="${pillCls}">LinkedIn</a><button type="button" class="${pillCls}" aria-live="polite" data-copy-link>Copy link</button></div></div><aside class="mt-10 flex gap-5 rounded-sm border border-rule bg-card p-6" aria-label="About the author"><div><p class="kicker">Written by</p><p class="mt-1 font-serif text-xl">${esc(config.author)}</p><p class="mt-1.5 font-sans text-[0.88rem] leading-relaxed text-ink-2">${esc(config.authorBio)}</p><a class="mt-3 inline-block font-sans text-[0.82rem] text-accent-ink hover:underline" href="/about/">More about me →</a></div></aside><nav aria-label="More pieces" class="mt-14 grid gap-px overflow-hidden rounded-sm border border-rule bg-rule sm:grid-cols-2">${navLink(older, '← Previous')}${navLink(newer, 'Next →', true)}</nav></div></article>
${related.length ? `<section aria-labelledby="related" class="mx-auto mt-20 max-w-6xl px-4 pb-20 sm:px-6"><h2 id="related" class="kicker border-t border-ink pt-4 text-ink">Keep reading</h2><div class="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">${related.map((o) => card(o)).join('')}</div></section>` : ''}
${newsletter()}`;
}

// --- simple pages ------------------------------------------------------------

export function page({ page: pg, path, after = '' }) {
  return `<article class="mx-auto max-w-[44rem] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">${breadcrumb([[path, pg.title]])}${pg.kicker ? `<p class="kicker kicker-accent mt-10">${esc(pg.kicker)}</p>` : ''}<h1 class="mt-3 font-serif text-[clamp(2.6rem,7vw,4.5rem)] leading-[0.98] tracking-[-0.02em]">${esc(pg.title)}</h1>${pg.intro ? `<p class="mt-6 font-serif text-[1.3rem] italic leading-snug text-ink-2">${esc(pg.intro)}</p>` : ''}<div class="mt-10 border-t border-rule pt-10"><div class="prose-article">${pg.html}</div></div>${after}</article>`;
}

export function contact() {
  return `<article class="mx-auto max-w-[44rem] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">${breadcrumb([['/contact/', 'Write to me.']])}<p class="kicker kicker-accent mt-10">Contact</p><h1 class="mt-3 font-serif text-[clamp(2.6rem,7vw,4.5rem)] leading-[0.98] tracking-[-0.02em]">Write to me.</h1><p class="mt-6 font-serif text-[1.3rem] italic leading-snug text-ink-2">If something here stayed with you, I’d like to hear about it.</p><div class="mt-10 border-t border-rule pt-10">
<form class="contact-form font-sans" data-contact novalidate>
<div class="field-group"><label for="c-name">Your name</label><input id="c-name" class="field" name="name" required maxlength="100" autocomplete="name"></div>
<div class="field-group"><label for="c-email">Your email <span class="text-ink-3">(so I can reply)</span></label><input id="c-email" class="field" type="email" name="email" required maxlength="254" autocomplete="email" inputmode="email"></div>
<div class="field-group"><label for="c-body">Message</label><textarea id="c-body" class="field" name="body" required maxlength="5000" rows="7"></textarea></div>
<div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="form-actions"><button class="btn" type="submit">Send message</button><p class="form-status" role="status" aria-live="polite"></p></div>
</form>
<div class="prose-article mt-12 text-[1.05rem]"><p>Prefer email? Write to <a href="mailto:${config.email}">${config.email}</a>. I read everything, even if replies take a while.</p><p>For collaborations, features or permission to reproduce a piece, mention it in the subject line so it doesn’t get lost.</p></div></div></article>`;
}

export function search({ total }) {
  return `<div class="mx-auto max-w-3xl px-4 pb-24 pt-12 sm:px-6 sm:pt-20"><h1 class="kicker kicker-accent mb-6">Search</h1><form role="search" action="/search/" data-search><label for="q" class="sr-only">Search the archive</label><input id="q" name="q" placeholder="A word, a feeling, a title…" class="w-full border-0 border-b-2 border-ink bg-transparent pb-3 font-serif text-[clamp(1.8rem,5vw,3rem)] italic tracking-tight text-ink placeholder:text-ink-3 focus:outline-none" type="search" autocomplete="off"></form><p class="mt-4 font-sans text-[0.82rem] text-ink-3" aria-live="polite" data-search-status>Searching ${plural(total, 'piece')}, in English and हिंदी.</p><ul class="mt-6" data-search-results></ul></div>`;
}

export function notFound() {
  return `<div class="mx-auto max-w-3xl px-4 py-28 text-center sm:px-6"><p class="kicker kicker-accent">404</p><h1 class="mt-4 font-serif text-[clamp(2.4rem,7vw,4.5rem)] leading-none tracking-tight">Apparently, <em>this page wandered off.</em></h1><p class="mx-auto mt-6 max-w-md font-sans text-[0.95rem] text-ink-2">It may have moved, or never existed. Everything that does exist is in the archive.</p><div class="mt-8 flex justify-center gap-3 font-sans text-[0.9rem]"><a class="inline-flex h-11 items-center rounded-sm bg-ink px-5 text-paper hover:bg-accent" href="/archive/">Browse the archive</a><a class="inline-flex h-11 items-center rounded-sm border border-rule px-5 hover:border-ink" href="/search/">Search</a></div></div>`;
}
