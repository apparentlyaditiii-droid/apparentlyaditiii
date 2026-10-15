import { config } from '../config.mjs';
import { absolute, esc, longDate, shortDate } from '../lib/format.mjs';
import { img, shareImage } from '../lib/images.mjs';
import { breadcrumb, newsletter } from './layout.mjs';

// --- small pieces ----------------------------------------------------------

const icons = {
  pin: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4-1-6Z"/><path d="M12 13v8"/></svg>',
  heart: '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4Z"/></svg>',
  comment: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/></svg>',
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const ogImage = (post) => shareImage(post.cover_image_url);

const firstLetter = (title) => [...String(title).trim()][0] ?? '❦';

function cardMedia(post, { pinned, eager }) {
  const inner = post.cover_image_url
    ? img(post.cover_image_url, { widths: [480, 640, 828], sizes: '(min-width: 64rem) 22rem, (min-width: 40rem) 45vw, 100vw', alt: post.cover_image_alt ?? '', eager })
    : `<span class="card-placeholder"><span class="ph-mark">❦</span><span class="ph-letter" lang="${post.titleLang}">${esc(firstLetter(post.title))}</span></span>`;
  return `<a class="card-media" href="${post.path}" tabindex="-1" aria-hidden="true">${inner}${pinned ? `<span class="pin-badge">${icons.pin}Pinned</span>` : ''}</a>`;
}

export function card(post, { headingLevel = 3, pinned = false, eager = false } = {}) {
  const h = `h${headingLevel}`;
  return `<article class="card">${cardMedia(post, { pinned, eager })}<div class="card-body"><p class="card-meta">${post.category ? `<a class="card-cat" href="${post.category.path}">${esc(post.category.name)}</a><span class="sep" aria-hidden="true">/</span>` : ''}<time datetime="${post.published_at}">${shortDate(post.published_at)}</time></p><${h} lang="${post.titleLang}" class="card-title"><a href="${post.path}">${esc(post.title)}</a></${h}><p lang="${post.lang}" class="card-excerpt">${esc(post.excerpt)}</p><p class="card-foot">${post.minutes} min read</p></div></article>`;
}

const grid = (posts, opts) => `<div class="card-grid">${posts.map((p, i) => card(p, { ...opts, eager: opts?.eager && i < 3 })).join('')}</div>`;

function chips(categories, active, total, label = 'Browse by category') {
  const chip = (href, text, count, on) =>
    `<a class="chip" href="${href}"${on ? ' aria-current="page"' : ''}>${esc(text)}${count !== undefined ? ` <span class="count">${count}</span>` : ''}</a>`;
  return `<nav aria-label="${label}" class="chips">${chip('/archive/', 'All writing', total, active === null)}${categories.map((c) => chip(c.path, c.name, c.posts.length, active === c.slug)).join('')}</nav>`;
}

function yearNav(years, active) {
  if (years.length < 2) return '';
  return `<nav aria-label="Browse by year" class="year-nav"><span>By year:</span>${years.map((y) => `<a href="${y.path}"${active === y.year ? ' aria-current="page"' : ''}>${y.year}</a>`).join('')}</nav>`;
}

function aboutStrip(pages) {
  const about = pages.about;
  const photo = about?.image_url || config.authorPhoto;
  return `<section aria-labelledby="about-strip-title" class="about-strip"><div class="wrap about-inner"><a href="/about/" class="portrait" tabindex="-1" aria-hidden="true">${img(photo, { widths: [480, 640], sizes: '17rem', alt: '' })}</a><div><p class="kicker kicker-accent">The person behind the words</p><h2 id="about-strip-title" class="about-title mt-3">Hello, I’m <em>Aditi.</em></h2><p class="about-text">${esc(config.authorBio)} ${esc(about?.intro && about.intro !== config.tagline ? about.intro : 'If something here stayed with you, I’d love to hear about it.')}</p><div class="about-links"><a class="btn" href="/about/">More about me</a><a href="/contact/">Write to me</a><a href="mailto:${config.email}">${config.email}</a></div></div></div></section>`;
}

// --- home ------------------------------------------------------------------

const HOME_GRID = 9;

export function home({ posts, pinned, categories, pages }) {
  const pinnedSet = new Set(pinned);
  const latest = posts.filter((p) => !pinnedSet.has(p)).slice(0, HOME_GRID);
  const shown = latest.length + pinned.length;

  const intro = `<section class="wrap hero"><h1 class="hero-title">Some thoughts don’t fade. <em>They wait.</em></h1><p class="hero-sub">${esc(config.tagline)}</p></section>`;

  if (!posts.length) {
    return `${intro}<section class="wrap block"><p class="empty-note">The first piece is on its way.</p></section>${aboutStrip(pages)}${newsletter()}`;
  }

  const pinnedSection = pinned.length
    ? `<section aria-labelledby="pinned-title" class="pinned-band"><div class="wrap"><div class="section-head"><h2 id="pinned-title" class="section-title">${icons.pin}Pinned</h2><p class="section-note">If you’re new here, start with ${pinned.length === 1 ? 'this one' : 'these'}.</p></div>${grid(pinned, { pinned: true, eager: true })}</div></section>`
    : '';

  const latestSection = latest.length
    ? `<section aria-labelledby="latest-title" class="wrap block"><div class="section-head"><h2 id="latest-title" class="section-title">Latest writing</h2>${chips(categories, undefined, posts.length)}</div>${grid(latest, { eager: !pinned.length })}${posts.length > shown ? `<a class="more-link" href="/archive/">See all ${plural(posts.length, 'piece')} in the archive →</a>` : `<a class="more-link" href="/archive/">Browse the archive by category and year →</a>`}</section>`
    : '';

  return `${intro}${pinned.length ? pinnedSection : '<div class="hero-rule wrap" aria-hidden="true"></div>'}${latestSection}${aboutStrip(pages)}${newsletter()}`;
}

// --- archive / year / category / tag --------------------------------------

function listHeader(crumbs, kicker, title, lede) {
  return `<header class="wrap page-head">${breadcrumb(crumbs)}<p class="kicker kicker-accent mt-10">${esc(kicker)}</p><h1 class="page-title" style="margin-top:.75rem">${esc(title)}</h1>${lede ? `<p class="page-lede">${lede}</p>` : ''}</header>`;
}

export function archive({ posts, categories, years }) {
  const names = categories.map((c) => c.name.toLowerCase());
  const kinds = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join('');
  return `${listHeader([['/archive/', 'Writing']], 'The archive', 'Everything, so far', `${plural(posts.length, 'piece')}${kinds ? `: ${esc(kinds)}` : ''}, newest first.`)}
<div class="wrap" style="margin-top:2rem;display:grid;gap:1rem">${chips(categories, null, posts.length)}${yearNav(years)}</div>
<div class="wrap block">${posts.length ? years.map((y) => `<section class="year-block" aria-labelledby="y${y.year}"><div class="year-head"><h2 id="y${y.year}"><a href="${y.path}">${y.year}</a></h2><p>${plural(y.posts.length, 'piece')}</p></div>${grid(y.posts)}</section>`).join('') : '<p class="empty-note">Nothing here yet.</p>'}</div>`;
}

export function archiveYear({ year: y, years, categories, total }) {
  return `${listHeader([['/archive/', 'Writing'], [y.path, y.year]], 'The archive', `Written in ${y.year}`, `${plural(y.posts.length, 'piece')}, newest first.`)}
<div class="wrap" style="margin-top:2rem;display:grid;gap:1rem">${chips(categories, undefined, total)}${yearNav(years, y.year)}</div>
<div class="wrap block">${grid(y.posts)}</div>`;
}

export function category({ category: c, categories, total }) {
  return `${listHeader([['/archive/', 'Writing'], [c.path, c.name]], 'Category', c.name, c.description ? esc(c.description) : '')}
<div class="wrap" style="margin-top:2rem">${chips(categories, c.slug, total)}</div>
<div class="wrap block">${c.posts.length ? grid(c.posts) : '<p class="empty-note">Nothing here yet.</p>'}</div>`;
}

export function tag({ tag: t }) {
  return `${listHeader([['/archive/', 'Writing'], [t.path, `#${t.name}`]], 'Tag', `#${t.name}`, `${plural(t.posts.length, 'piece')} tagged “${esc(t.name)}”.`)}
<div class="wrap block">${grid(t.posts)}</div>`;
}

// --- a single piece --------------------------------------------------------

function comments(p) {
  const form = `<form class="comment-form" data-comment-form novalidate><p class="kicker">Leave a comment</p><div class="row"><div class="field-group"><label for="cm-name">Name</label><input id="cm-name" class="field" name="name" required maxlength="80" autocomplete="name"></div><div class="field-group"><label for="cm-email">Email <span class="text-ink-3">(never shown)</span></label><input id="cm-email" class="field" type="email" name="email" required maxlength="254" autocomplete="email" inputmode="email"></div></div><div class="field-group"><label for="cm-body">Comment</label><textarea id="cm-body" class="field" name="body" required maxlength="3000" rows="5"></textarea></div><div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div><div class="form-actions"><button class="btn" type="submit">Post comment</button><p class="form-status" role="status" aria-live="polite"></p></div><p class="hint">Comments are read before they appear here. Your email is only for me, in case I want to reply.</p></form>`;
  return `<section id="comments" class="comments no-print" aria-labelledby="comments-title" data-comments="${p.id}"><h2 id="comments-title">Comments <span data-comment-count></span></h2><div class="comment-list" data-comment-list><p class="comments-empty">${p.comments_enabled ? 'No comments yet.' : ''}</p></div>${p.comments_enabled ? form : '<p class="comments-empty">Comments are closed for this piece.</p>'}</section>`;
}

export function post({ post: p, posts }) {
  const i = posts.indexOf(p);
  const newer = posts[i - 1];
  const older = posts[i + 1];
  const shares = (o) => o.categories.some((c) => p.categories.includes(c));
  const related = [
    ...posts.filter((o) => o !== p && shares(o)),
    ...posts.filter((o) => o !== p && !shares(o)),
  ].slice(0, 3);
  const url = absolute(p.path);
  const shareText = encodeURIComponent(p.title);
  const shareUrl = encodeURIComponent(url);
  const verse = p.category?.verse ? ' verse' : '';
  const crumbs = [['/archive/', 'Writing'], ...(p.category ? [[p.category.path, p.category.name]] : []), [p.path, p.title]];
  const catList = p.categories.map((c) => `<a href="${c.path}">${esc(c.name)}</a>`).join('<span class="sep" aria-hidden="true"> · </span>');

  const cover = p.cover_image_url
    ? `<figure class="cover mx-auto mt-10 max-w-[44rem]">${img(p.cover_image_url, { widths: [640, 1080, 1600], sizes: '(min-width: 44rem) 44rem, 100vw', alt: p.cover_image_alt ?? '', eager: true })}</figure>`
    : '';

  const navLink = (o, label, right) => o
    ? `<a class="group bg-paper p-5 hover:bg-card${right ? ' sm:text-right' : ''}" href="${o.path}"><p class="kicker">${label}</p><p lang="${o.titleLang}" class="mt-2 font-serif text-lg leading-snug group-hover:text-accent">${esc(o.title)}</p></a>`
    : '<span class="hidden bg-paper sm:block"></span>';

  const back = p.category
    ? `<a class="back-link" href="${p.category.path}">← More ${esc(p.category.name.toLowerCase())}</a><a class="back-link" href="/archive/">The full archive</a>`
    : '<a class="back-link" href="/archive/">← The full archive</a>';

  return `<div class="progress fixed inset-x-0 top-0 z-40 h-[2px] bg-accent" aria-hidden="true" style="--p: 0;"></div><article class="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12"><div class="mx-auto max-w-[44rem]">${breadcrumb(crumbs)}<header class="mt-10 text-center"><p class="kicker cat-list">${catList}</p><h1 lang="${p.titleLang}" class="mt-4 font-serif text-[clamp(2.4rem,7vw,4.25rem)] leading-[1] tracking-[-0.02em] text-balance">${esc(p.title)}</h1><div class="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-rule py-4 font-sans text-[0.82rem] text-ink-2 justify-center"><span>By <a class="font-medium text-ink hover:text-accent" href="/about/">${esc(config.author)}</a></span><span aria-hidden="true" class="text-ink-3">·</span><time datetime="${p.published_at}">${longDate(p.published_at)}</time><span aria-hidden="true" class="text-ink-3">·</span><span>${p.minutes} min read</span></div></header></div>${cover}<div class="mx-auto mt-12 max-w-[40rem]"><div id="article-body" lang="${p.lang}" class="prose-article${verse}">${p.html}</div><p class="mt-12 text-center font-serif text-xl text-accent" aria-hidden="true">❦</p>${p.tags.length ? `<ul class="mt-10 flex flex-wrap gap-2 font-sans text-[0.8rem]" aria-label="Tags">${p.tags.map((t) => `<li><a class="inline-block rounded-full bg-paper-2 px-3 py-1.5 text-ink-2 hover:bg-accent-soft hover:text-accent-ink" href="/tag/${t.slug}/">#${esc(t.name)}</a></li>`).join('')}</ul>` : ''}<div class="mt-8 border-t border-rule pt-6"><div class="no-print reader-actions"><button type="button" class="heart-btn" data-like="${esc(p.slug)}" aria-pressed="false">${icons.heart}<span data-like-label>Like</span></button><a class="pill" href="#comments">${icons.comment}<span data-comment-pill>Comment</span></a><span class="sep" aria-hidden="true"></span><span class="kicker mr-1">Share</span><button type="button" class="pill" data-native-share hidden>Share…</button><a href="https://wa.me/?text=${shareText}%20${shareUrl}" target="_blank" rel="noopener noreferrer" class="pill">WhatsApp</a><a href="https://x.com/intent/post?text=${shareText}&amp;url=${shareUrl}" target="_blank" rel="noopener noreferrer" class="pill">X</a><a href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}" target="_blank" rel="noopener noreferrer" class="pill">Facebook</a><button type="button" class="pill" aria-live="polite" data-copy-link>Copy link</button></div></div>${comments(p)}<aside class="mt-14 flex items-center gap-5 rounded-sm border border-rule bg-card p-6" aria-label="About the author">${img(config.authorPhoto, { widths: [320], sizes: '4.5rem', alt: '', cls: 'author-thumb' })}<div><p class="kicker">Written by</p><p class="mt-1 font-serif text-xl">${esc(config.author)}</p><p class="mt-1.5 font-sans text-[0.88rem] leading-relaxed text-ink-2">${esc(config.authorBio)}</p><a class="mt-3 inline-block font-sans text-[0.82rem] text-accent-ink hover:underline" href="/about/">More about me →</a></div></aside><nav aria-label="More pieces" class="mt-14 grid gap-px overflow-hidden rounded-sm border border-rule bg-rule sm:grid-cols-2">${navLink(older, '← Previous')}${navLink(newer, 'Next →', true)}</nav><p class="mt-8 flex flex-wrap justify-between gap-4">${back}</p></div></article>
${related.length ? `<section aria-labelledby="related" class="wrap" style="margin-top:5rem;padding-bottom:5rem"><div class="section-head" style="border-top:1px solid var(--ink);padding-top:1rem"><h2 id="related" class="section-title">Keep reading</h2></div>${grid(related)}</section>` : ''}
${newsletter()}`;
}

// --- simple pages ------------------------------------------------------------

export function page({ page: pg, path, after = '' }) {
  const photo = pg.slug === 'about' ? (pg.image_url || config.authorPhoto) : pg.image_url;
  const figure = photo
    ? `<figure class="about-page-photo portrait">${img(photo, { widths: [480, 640], sizes: '15rem', alt: pg.image_alt || (pg.slug === 'about' ? config.authorPhotoAlt : ''), eager: true })}</figure>`
    : '';
  return `<article class="mx-auto max-w-[44rem] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">${breadcrumb([[path, pg.title]])}${pg.kicker ? `<p class="kicker kicker-accent mt-10">${esc(pg.kicker)}</p>` : ''}<h1 class="mt-3 font-serif text-[clamp(2.6rem,7vw,4.5rem)] leading-[0.98] tracking-[-0.02em]">${esc(pg.title)}</h1>${pg.intro ? `<p class="mt-6 font-serif text-[1.3rem] italic leading-snug text-ink-2">${esc(pg.intro)}</p>` : ''}<div class="mt-10 border-t border-rule pt-10">${figure}<div class="prose-article">${pg.html}</div><div style="clear:both"></div></div>${after}</article>`;
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

export function search({ total, categories }) {
  return `<div class="mx-auto max-w-3xl px-4 pb-24 pt-12 sm:px-6 sm:pt-20"><h1 class="kicker kicker-accent mb-6">Search</h1><form role="search" action="/search/" data-search><label for="q" class="sr-only">Search titles and full text</label><input id="q" name="q" placeholder="A word, a feeling, a title…" class="w-full border-0 border-b-2 border-ink bg-transparent pb-3 font-serif text-[clamp(1.8rem,5vw,3rem)] italic tracking-tight text-ink placeholder:text-ink-3 focus:outline-none" type="search" autocomplete="off"></form><p class="mt-4 font-sans text-[0.82rem] text-ink-3" aria-live="polite" data-search-status>Searching titles and full text of ${plural(total, 'piece')}, in English and हिंदी.</p><ul class="mt-6" data-search-results></ul><div class="search-empty" data-search-empty hidden><p><strong>Nothing matched “<span data-search-term></span>”.</strong> Try a single word, a shorter phrase, or another spelling (Hinglish words are often spelt more than one way).</p><p class="mt-3">Or browse instead: <a href="/archive/">the full archive</a>${categories.map((c) => `, <a href="${c.path}">${esc(c.name)}</a>`).join('')}.</p></div><noscript><p class="search-empty">Search needs JavaScript. You can still browse <a href="/archive/">the full archive</a>.</p></noscript></div>`;
}

export function notFound() {
  return `<div class="mx-auto max-w-3xl px-4 py-28 text-center sm:px-6"><p class="kicker kicker-accent">404</p><h1 class="mt-4 font-serif text-[clamp(2.4rem,7vw,4.5rem)] leading-none tracking-tight">Apparently, <em>this page wandered off.</em></h1><p class="mx-auto mt-6 max-w-md font-sans text-[0.95rem] text-ink-2">It may have moved, or never existed. Everything that does exist is in the archive.</p><div class="mt-8 flex justify-center gap-3 font-sans text-[0.9rem]"><a class="inline-flex h-11 items-center rounded-sm bg-ink px-5 text-paper hover:bg-accent" href="/archive/">Browse the archive</a><a class="inline-flex h-11 items-center rounded-sm border border-rule px-5 hover:border-ink" href="/search/">Search</a></div></div>`;
}

// --- pages driven by a link in an email (filled in by app.js) --------------

const statusPage = (attr, kicker, title, text, actions = '<a class="btn" href="/">Back to the writing</a>') =>
  `<div class="wrap"><div class="status-card" ${attr}><p class="kicker kicker-accent">${kicker}</p><h1 class="mt-4" data-status-title>${title}</h1><p data-status-text>${text}</p><div data-status-extra></div><div class="actions" data-status-actions>${actions}</div></div></div>`;

export const confirmSubscription = () =>
  statusPage('data-confirm', 'Newsletter', 'Confirming…', 'One moment.');

export const unsubscribe = () =>
  statusPage('data-unsubscribe', 'Newsletter', 'Unsubscribing…', 'One moment.');

export const moderate = () =>
  statusPage('data-moderate', 'Comment', 'Loading the comment…', 'One moment.', '');

export const preview = () =>
  `<div class="preview-banner" data-preview-banner>Private preview. This page isn’t public and isn’t indexed.</div><div data-preview><div class="wrap"><div class="status-card"><h1>Loading preview…</h1></div></div></div>`;

// --- the writing desk (/write/), driven by client/write.js -----------------

export function write({ categories }) {
  const catOptions = categories.map((c) => `<option value="${c.slug}">${esc(c.name)}</option>`).join('');
  const catChecks = categories.map((c) => `<label class="check"><input type="checkbox" name="extra" value="${c.slug}"> ${esc(c.name)}</label>`).join('');
  return `<div class="wrap desk" data-desk>
<section data-view="loading"><p class="desk-note">Opening your desk…</p></section>

<section data-view="login" hidden>
  <form class="login" data-login novalidate>
    <div><p class="kicker kicker-accent">Your writing desk</p><h1 class="mt-3">Welcome back.</h1><p class="desk-note">Sign in to write, edit and publish.</p></div>
    <div class="field-group"><label for="w-email">Email</label><input id="w-email" class="field" type="email" name="email" autocomplete="username" required></div>
    <div class="field-group"><label for="w-pass">Password</label><input id="w-pass" class="field" type="password" name="password" autocomplete="current-password" required></div>
    <button class="btn" type="submit">Sign in</button>
    <p class="form-status" role="status" aria-live="polite"></p>
  </form>
</section>

<section data-view="home" hidden>
  <div class="desk-bar"><div><p class="kicker kicker-accent">Your writing desk</p><h1 class="mt-3">Hello, Aditi.</h1></div><div class="desk-actions"><button class="btn" type="button" data-new>New piece</button><a class="btn btn-quiet" href="/" target="_blank" rel="noopener">View site</a><button class="link-btn" type="button" data-signout>Sign out</button></div></div>
  <div class="tabs" role="tablist"><button class="tab" role="tab" aria-selected="true" data-tab="pieces">Pieces</button><button class="tab" role="tab" aria-selected="false" data-tab="comments">Comments<span class="badge" data-pending-count hidden></span></button></div>
  <div data-panel="pieces"><div class="piece-list" data-pieces></div></div>
  <div data-panel="comments" hidden>
    <div class="mod-filter" data-mod-filter><button class="chip" aria-current="page" data-status="pending">Waiting</button><button class="chip" data-status="approved">Approved</button><button class="chip" data-status="spam">Spam</button><button class="chip" data-status="rejected">Rejected</button></div>
    <div data-mod-list></div>
  </div>
</section>

<section data-view="editor" hidden>
  <form data-editor novalidate>
    <div class="desk-bar"><button class="link-btn" type="button" data-back>← All pieces</button><div class="desk-actions"><span class="chip-status" data-status-chip>Draft</span><button class="btn btn-quiet" type="button" data-preview-link hidden>Copy preview link</button></div></div>
    <div class="restore" data-restore hidden><span>You have unsaved writing from earlier on this device.</span><span class="desk-actions"><button class="btn" type="button" data-restore-yes>Bring it back</button><button class="link-btn" type="button" data-restore-no>Discard</button></span></div>
    <div class="editor">
      <div>
        <label class="sr-only" for="e-title">Title</label>
        <input id="e-title" class="title-input" name="title" placeholder="Title" autocomplete="off">
        <div class="write-tabs"><div class="seg" role="group" aria-label="Mode"><button type="button" aria-pressed="true" data-mode="write">Write</button><button type="button" aria-pressed="false" data-mode="preview">Preview</button></div><button class="btn btn-quiet" type="button" data-insert-image>Insert image</button></div>
        <label class="sr-only" for="e-content">The piece</label>
        <textarea id="e-content" class="content-input" name="content" placeholder="Start writing… Line breaks stay exactly as you type them. Leave an empty line between stanzas."></textarea>
        <div class="preview-pane" data-preview-pane hidden><div class="prose-article" data-preview-body></div></div>
        <p class="help">Line breaks are kept as typed. <code>*italic*</code> · <code>**bold**</code> · <code>&gt; quote</code> · <code>---</code> section break. Drag a photo into the box, or use <em>Insert image</em>.</p>
        <p class="help" data-html-note hidden>This piece came from WordPress, so it’s written in HTML. Edit the words between the tags.</p>
      </div>
      <aside class="panel" aria-label="Piece settings">
        <div class="save-row"><button class="btn" type="button" data-primary>Publish</button><button class="btn btn-quiet" type="button" data-secondary>Save draft</button><p class="save-hint" data-save-hint></p></div>
        <div><h2>Category</h2><div class="mt-3"><label for="e-cat">Main category</label><select id="e-cat" class="field" name="category">${catOptions}</select></div><div class="mt-3"><span class="lbl">Also show it in</span><div class="checks" data-extra>${catChecks}</div></div></div>
        <div><label for="e-excerpt">Excerpt <span class="counter" data-excerpt-count></span></label><textarea id="e-excerpt" class="field" name="excerpt" maxlength="300" placeholder="A line or two to draw readers in. Leave empty to use the opening lines."></textarea></div>
        <div><span class="lbl">Cover image</span><div class="cover-drop" data-cover-drop tabindex="0" role="button" aria-label="Choose a cover image"><span data-cover-empty>Drop an image here<br>or click to choose</span><img data-cover-img alt="" hidden></div><div class="cover-tools" data-cover-tools hidden><button class="link-btn" type="button" data-cover-change>Change</button><button class="link-btn" type="button" data-cover-remove>Remove</button></div><label class="mt-3" for="e-alt" style="margin-top:.75rem">Describe the image <small class="text-ink-3">(for screen readers)</small></label><input id="e-alt" class="field" name="cover_alt" maxlength="200"></div>
        <div><label for="e-date">Publication date</label><input id="e-date" class="field" type="datetime-local" name="date"><p class="help" data-date-hint></p></div>
        <div class="checks">
          <label class="check"><input type="checkbox" name="pinned"> <span>Pin to the top of the homepage</span></label>
          <div class="inline" data-pin-pos hidden><label for="e-pin" style="margin:0">Position</label><input id="e-pin" class="field" type="number" name="pin_order" min="1" step="1" value="1"></div>
          <label class="check"><input type="checkbox" name="comments" checked> <span>Allow comments</span></label>
          <label class="check"><input type="checkbox" name="notify" checked> <span>Email subscribers when it goes live</span></label>
        </div>
        <div><label for="e-slug">Web address</label><input id="e-slug" class="field" name="slug" autocomplete="off" spellcheck="false"><p class="help" data-url-hint></p><p class="warn" data-url-warn hidden>This piece is already live. Changing its date or web address changes its link, and links people have already shared will stop working.</p></div>
        <div><button class="btn btn-danger" type="button" data-delete>Delete this piece</button></div>
      </aside>
    </div>
  </form>
</section>
<input type="file" accept="image/*" data-file hidden>
<div class="toast" role="status" aria-live="polite" data-toast hidden></div>
</div>`;
}
