import { config } from '../config.mjs';
import { absolute, esc } from '../lib/format.mjs';

const icons = {
  search: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path></svg>',
  moon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"></path></svg>',
  menu: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 8h16M4 16h16"></path></svg>',
};

const NAV = [
  ['/archive/', 'Writing'],
  ['/about/', 'About'],
  ['/contact/', 'Contact'],
];

function header(current) {
  const link = ([href, label], cls) =>
    `<a class="${cls}" href="${href}"${current?.startsWith(href) ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75"><div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6"><a class="group inline-block" aria-label="${esc(config.title)} — home" href="/"><span class="font-serif italic tracking-tight text-ink text-[1.45rem] leading-none" style="font-weight:400">Apparently<span class="text-accent not-italic">,</span> <span class="not-italic font-[500]">Aditiii</span></span></a><nav aria-label="Primary" class="flex items-center gap-1 font-sans text-[0.9rem]">${NAV.map((n) => link(n, `${n[0] === '/about/' ? 'inline-block' : 'hidden sm:inline-block'} rounded-full px-3 py-1.5 text-ink-2 transition-colors hover:text-ink`)).join('')}<a class="grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-paper-2 hover:text-ink" aria-label="Search" href="/search/">${icons.search}</a><button type="button" class="grid h-9 w-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink" aria-label="Toggle dark theme" title="Toggle theme" data-theme-toggle>${icons.moon}</button><details class="relative sm:hidden"><summary class="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full text-ink-2 hover:bg-paper-2 [&amp;::-webkit-details-marker]:hidden" aria-label="Menu">${icons.menu}</summary><div class="absolute right-0 top-11 w-48 rounded-md border border-rule bg-card p-2 shadow-lg">${NAV.map((n) => link(n, 'block rounded px-3 py-2 font-sans text-[0.95rem] hover:bg-paper-2')).join('')}</div></details></nav></div></header>`;
}

function footer(categories) {
  const year = new Date().getFullYear();
  return `<footer class="mt-auto border-t border-rule"><div class="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]"><div><p class="font-serif text-2xl italic">Apparently<span class="not-italic text-accent">,</span> <span class="not-italic">Aditiii</span></p><p class="mt-3 max-w-xs font-sans text-[0.88rem] leading-relaxed text-ink-2">${esc(config.tagline)}</p></div><div><p class="kicker">Read</p><ul class="mt-4 space-y-2.5 font-sans text-[0.9rem]"><li><a class="text-ink-2 hover:text-ink" href="/archive/">Writing</a></li><li><a class="text-ink-2 hover:text-ink" href="/about/">About</a></li><li><a class="text-ink-2 hover:text-ink" href="/contact/">Contact</a></li><li><a class="text-ink-2 hover:text-ink" href="/search/">Search</a></li><li><a class="text-ink-2 hover:text-ink" href="/#subscribe">Subscribe</a></li></ul></div><div><p class="kicker">Themes</p><ul class="mt-4 space-y-2.5 font-sans text-[0.9rem]">${categories.map((c) => `<li><a class="text-ink-2 hover:text-ink" href="${c.path}">${esc(c.name)}</a></li>`).join('')}</ul></div><div><p class="kicker">Elsewhere</p><ul class="mt-4 space-y-2.5 font-sans text-[0.9rem]"><li><a href="mailto:${config.email}" class="text-ink-2 hover:text-ink">Email</a></li><li><a href="/feed.xml" class="text-ink-2 hover:text-ink">RSS feed</a></li></ul></div></div><div class="border-t border-rule"><div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 font-sans text-[0.78rem] text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p>© ${year} ${esc(config.author)}. Words and images are the author’s own unless noted.</p><nav aria-label="Legal" class="flex gap-5"><a class="hover:text-ink" href="/privacy/">Privacy</a><a class="hover:text-ink" href="/terms/">Terms</a><a class="hover:text-ink" href="/disclaimer/">Disclaimer</a></nav></div></div></footer>`;
}

export function newsletter() {
  return `<section id="subscribe" aria-labelledby="nl-title" class="no-print border-y border-rule bg-paper-2"><div class="mx-auto grid gap-6 md:grid-cols-[1.1fr_1fr] md:items-end max-w-6xl px-4 py-14 sm:px-6 md:py-20"><div><p class="kicker kicker-accent">Letters, occasionally</p><h2 id="nl-title" class="mt-3 font-serif tracking-tight text-3xl leading-tight sm:text-4xl">When something new gets written, <em>you’ll be the first to read it.</em></h2><p class="mt-3 max-w-md font-sans text-[0.9rem] leading-relaxed text-ink-2">No schedule, no noise. Just the new piece, in your inbox. You’ll get one email to confirm, and every email has an unsubscribe link.</p></div><form class="nl-form font-sans text-[0.9rem]" data-newsletter novalidate><label for="nl-email" class="sr-only">Your email address</label><div class="nl-row"><input id="nl-email" class="field" type="email" name="email" required autocomplete="email" inputmode="email" placeholder="you@example.com"><button class="btn" type="submit">Subscribe</button></div><div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div><p class="form-status" role="status" aria-live="polite"></p><p class="mt-1 text-ink-3 text-[0.8rem]">Or <a class="underline underline-offset-4 hover:text-ink" href="/feed.xml">follow via RSS</a>.</p></form></div></section>`;
}

export function breadcrumb(items) {
  const parts = [['/', 'Home'], ...items];
  return `<nav aria-label="Breadcrumb" class="font-sans text-[0.78rem] text-ink-3"><ol class="flex flex-wrap items-center gap-1.5">${parts.map(([href, label], i) => {
    const last = i === parts.length - 1;
    const inner = last
      ? `<span aria-current="page" class="line-clamp-1 text-ink-2">${esc(label)}</span>`
      : `<a class="hover:text-ink" href="${href}">${esc(label)}</a>`;
    return `<li class="flex items-center gap-1.5">${i ? '<span aria-hidden="true">/</span>' : ''}${inner}</li>`;
  }).join('')}</ol></nav>`;
}

export function document({ path, title, description, body, categories, assets, image, type = 'website', jsonLd, noindex, scripts = [] }) {
  const fullTitle = title ? `${title} — ${config.title}` : `${config.title} — ${config.tagline}`;
  const desc = description || config.tagline;
  const url = absolute(path);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<meta property="og:site_name" content="${esc(config.title)}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title || config.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="en_IN">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:card" content="summary_large_image">\n` : `<meta property="og:image" content="${absolute(config.authorPhoto)}">\n<meta name="twitter:card" content="summary">\n`}<meta name="theme-color" content="#faf7f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#16131b" media="(prefers-color-scheme: dark)">
<meta name="supabase-url" content="${config.supabaseUrl}">
<meta name="supabase-key" content="${config.supabaseKey}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(config.title)}" href="/feed.xml">
<link rel="stylesheet" href="${assets.css}">
<script>try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>
${scripts.map((src) => `<script src="${src}" defer></script>\n`).join('')}<script src="${assets.js}" defer></script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>\n` : ''}</head>
<body class="flex min-h-dvh flex-col">
${header(path)}
<main id="main" class="flex-1">
${body}
</main>
${footer(categories)}
</body>
</html>
`;
}
